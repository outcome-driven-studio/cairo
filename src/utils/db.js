const { Pool } = require("pg");
const logger = require("./logger");

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL or POSTGRES_URL environment variable is required"
  );
}

// Smart SSL configuration - only use SSL for cloud databases
const isLocalDatabase = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const isCloudDatabase = connectionString.includes('.neon.tech') || connectionString.includes('.railway.app') || connectionString.includes('.supabase.co');

const poolConfig = {
  connectionString: connectionString,

  // Connection Pool Settings (optimized for Neon)
  max: isCloudDatabase ? 5 : 8, // Reduced max connections for cloud databases like Neon
  min: isCloudDatabase ? 1 : 2, // Reduced min connections for cloud databases

  // Timeout Settings (optimized for cloud databases)
  connectionTimeoutMillis: isCloudDatabase ? 10000 : 15000, // Shorter timeout for cloud
  idleTimeoutMillis: isCloudDatabase ? 60000 : 300000, // 1 minute idle for cloud, 5 minutes for local
  query_timeout: isCloudDatabase ? 30000 : 120000, // 30s query timeout for cloud

  // Keep-alive settings for serverless (important for Neon)
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // Application name for debugging
  application_name: "cairo-app",

  // Additional Neon-specific settings
  statement_timeout: isCloudDatabase ? 30000 : 120000, // Prevent hanging queries
};

// Add SSL configuration conditionally
if (isCloudDatabase) {
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
  logger.info('[Database] Using SSL for cloud database');
} else if (isLocalDatabase) {
  // Local databases typically don't use SSL
  poolConfig.ssl = false;
  logger.info('[Database] SSL disabled for local database');
} else {
  // Default to SSL for unknown hosts
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
  logger.info('[Database] Using SSL for unknown database host');
}

const pool = new Pool(poolConfig);

// Global error handling for the pool
pool.on("error", (err, client) => {
  const isNeonError = connectionString.includes('.neon.tech');
  const poolStats = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };

  logger.error("Unexpected database pool error:", {
    error: err.message,
    code: err.code,
    stack: err.stack,
    client: client ? "connected" : "disconnected",
    poolStats,
    isNeon: isNeonError,
  });

  // Send to Sentry for monitoring with Neon-specific context
  const Sentry = require('@sentry/node');
  Sentry.captureException(err, {
    tags: {
      component: 'database_pool',
      code: err.code || 'unknown',
      database_provider: isNeonError ? 'neon' : 'postgresql',
      severity: isConnectionError(err) ? 'warning' : 'error'
    },
    extra: {
      poolStats,
      client: client ? "connected" : "disconnected",
      connectionString: connectionString.replace(/:[^:]*@/, ':***@'), // Hide password
      errorDetails: {
        name: err.name,
        severity: err.severity,
        detail: err.detail,
        hint: err.hint
      }
    }
  });

  // Handle Neon-specific connection issues
  if (isNeonError && isConnectionError(err)) {
    logger.warn("Neon database connection issue detected - implementing backoff strategy");

    // For Neon, connection issues are common during scaling/sleeping
    // The pool will handle reconnection automatically
    return;
  }

  // For general connection-related errors
  if (isConnectionError(err)) {
    logger.info("Database connection reset, pool will handle reconnection");
  }
});

// Helper function to identify connection-related errors
function isConnectionError(err) {
  const connectionErrorCodes = [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EPIPE"
  ];

  const connectionErrorMessages = [
    "Connection terminated",
    "Connection ended unexpectedly",
    "Client has encountered a connection error",
    "connection is closed",
    "server closed the connection unexpectedly"
  ];

  return (
    connectionErrorCodes.includes(err.code) ||
    connectionErrorMessages.some(msg => err.message.toLowerCase().includes(msg.toLowerCase()))
  );
}

pool.on("connect", (client) => {
  logger.debug("New database client connected");
});

pool.on("remove", (client) => {
  logger.debug("Database client removed from pool");
});

// Wrapper function for safe query execution with retry logic
async function query(text, params, retries = 3) {
  const start = Date.now();
  let client;
  let lastError;
  const isNeonDatabase = connectionString.includes('.neon.tech');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      client = await pool.connect();

      // Set a statement timeout for cloud databases to prevent hanging
      if (isNeonDatabase) {
        await client.query('SET statement_timeout = 30000'); // 30 seconds
      }

      const result = await client.query(text, params);
      const duration = Date.now() - start;

      logger.debug("Database query executed", {
        duration: `${duration}ms`,
        rows: result.rowCount,
        attempt,
        isNeon: isNeonDatabase,
      });

      return result;
    } catch (error) {
      lastError = error;
      const duration = Date.now() - start;

      // Enhanced error classification for Neon
      const isRetryableError = isConnectionError(error) || isNeonRetryableError(error);

      if (isRetryableError && attempt < retries) {
        const backoffDelay = isNeonDatabase
          ? Math.min(attempt * 2000, 10000) // Longer backoff for Neon (2s, 4s, 6s, max 10s)
          : attempt * 1000; // Standard backoff for other databases

        logger.warn(
          `Database query failed on attempt ${attempt}, retrying...`,
          {
            error: error.message,
            code: error.code,
            duration: `${duration}ms`,
            query: text.substring(0, 100) + "...",
            retryIn: `${backoffDelay}ms`,
            isNeon: isNeonDatabase,
          }
        );

        // Wait before retrying with appropriate backoff
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        continue;
      }

      // Log final failure with enhanced context
      logger.error("Database query failed", {
        error: error.message,
        code: error.code,
        duration: `${duration}ms`,
        query: text.substring(0, 100) + "...",
        attempt,
        finalAttempt: true,
        isNeon: isNeonDatabase,
        poolStats: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        }
      });

      throw error;
    } finally {
      if (client) {
        try {
          client.release();
        } catch (releaseError) {
          logger.warn("Error releasing database client:", releaseError.message);
        }
      }
    }
  }

  throw lastError;
}

// Helper function to identify Neon-specific retryable errors
function isNeonRetryableError(error) {
  const neonRetryableCodes = [
    "53300", // too_many_connections
    "57P01", // admin_shutdown
    "08006", // connection_failure
    "08001", // sqlclient_unable_to_establish_sqlconnection
    "08000", // connection_exception
  ];

  const neonRetryableMessages = [
    "connection pool exhausted",
    "too many clients already",
    "server is not ready",
    "connection limit exceeded",
    "compute time limit exceeded",
  ];

  return (
    neonRetryableCodes.includes(error.code) ||
    neonRetryableMessages.some(msg =>
      error.message.toLowerCase().includes(msg.toLowerCase())
    )
  );
}

// Health check function
async function healthCheck() {
  const isNeonDatabase = connectionString.includes('.neon.tech');

  try {
    const start = Date.now();
    const result = await query("SELECT NOW() as timestamp, version() as version");
    const duration = Date.now() - start;

    return {
      healthy: true,
      timestamp: result.rows[0].timestamp,
      version: result.rows[0].version,
      responseTime: `${duration}ms`,
      poolSize: pool.totalCount,
      idleClients: pool.idleCount,
      waitingClients: pool.waitingCount,
      database: isNeonDatabase ? 'neon' : 'postgresql',
    };
  } catch (error) {
    logger.error("Database health check failed:", {
      error: error.message,
      code: error.code,
      isNeon: isNeonDatabase,
    });

    return {
      healthy: false,
      error: error.message,
      code: error.code,
      poolSize: pool.totalCount,
      idleClients: pool.idleCount,
      waitingClients: pool.waitingCount,
      database: isNeonDatabase ? 'neon' : 'postgresql',
    };
  }
}

// Graceful shutdown
async function close() {
  logger.info("Closing database pool...");
  await pool.end();
  logger.info("Database pool closed");
}

module.exports = {
  pool,
  query,
  healthCheck,
  close,
};
