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

  // Connection Pool Settings
  max: 8, // Increased for concurrent sync operations
  min: 2, // Keep minimum connections alive

  // Timeout Settings (optimized for long-running sync operations)
  connectionTimeoutMillis: 15000, // 15s connection timeout
  idleTimeoutMillis: 300000, // 5 minutes idle timeout for sync operations
  query_timeout: 120000, // 2 minutes query timeout

  // Keep-alive settings for serverless
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // Application name for debugging
  application_name: "cairo-app",
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
  logger.error("Unexpected database pool error:", {
    error: err.message,
    code: err.code,
    stack: err.stack,
    client: client ? "connected" : "disconnected",
    poolStats: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  });

  // Send to Sentry for monitoring
  const Sentry = require('@sentry/node');
  Sentry.captureException(err, {
    tags: {
      component: 'database_pool',
      code: err.code || 'unknown'
    },
    extra: {
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      client: client ? "connected" : "disconnected"
    }
  });

  // For connection-related errors, we don't need to do anything special
  // as the pool will handle reconnection automatically
  if (
    err.code === "ECONNRESET" ||
    err.message.includes("Connection terminated")
  ) {
    logger.info("Database connection reset, pool will handle reconnection");
  }
});

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

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      client = await pool.connect();
      const result = await client.query(text, params);
      const duration = Date.now() - start;

      logger.debug("Database query executed", {
        duration: `${duration}ms`,
        rows: result.rowCount,
        attempt,
      });

      return result;
    } catch (error) {
      lastError = error;
      const duration = Date.now() - start;

      // Check if it's a connection-related error that we should retry
      const isRetryableError =
        error.code === "ECONNRESET" ||
        error.code === "ENOTFOUND" ||
        error.code === "ETIMEDOUT" ||
        error.message.includes("Connection terminated") ||
        error.message.includes("Client has encountered a connection error");

      if (isRetryableError && attempt < retries) {
        logger.warn(
          `Database query failed on attempt ${attempt}, retrying...`,
          {
            error: error.message,
            duration: `${duration}ms`,
            query: text.substring(0, 100) + "...",
            retryIn: `${attempt * 1000}ms`,
          }
        );

        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      // Log final failure
      logger.error("Database query failed", {
        error: error.message,
        duration: `${duration}ms`,
        query: text.substring(0, 100) + "...",
        attempt,
        finalAttempt: true,
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

// Health check function
async function healthCheck() {
  try {
    const result = await query("SELECT NOW() as timestamp");
    return {
      healthy: true,
      timestamp: result.rows[0].timestamp,
      poolSize: pool.totalCount,
      idleClients: pool.idleCount,
      waitingClients: pool.waitingCount,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      poolSize: pool.totalCount,
      idleClients: pool.idleCount,
      waitingClients: pool.waitingCount,
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
