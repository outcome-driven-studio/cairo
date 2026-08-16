const { Pool } = require("pg");
const logger = require("./logger");
const {
  buildPoolConfig,
  isRetryableDbError,
} = require("./dbConfig");

const rawConnectionString =
  process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error(
    "DATABASE_URL or POSTGRES_URL environment variable is required"
  );
}

const poolConfig = buildPoolConfig(rawConnectionString);
const connectionString = poolConfig.connectionString;
const pool = new Pool(poolConfig);

if (poolConfig.ssl === false) {
  logger.info("[Database] SSL disabled (local, socket, or PGSSLMODE=disable)");
} else {
  logger.info("[Database] SSL enabled for remote PostgreSQL");
}

pool.on("error", (err, client) => {
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
  });

  try {
    const Sentry = require("@sentry/node");
    Sentry.captureException(err, {
      tags: {
        component: "database_pool",
        code: err.code || "unknown",
        database_provider: "postgresql",
        severity: isRetryableDbError(err) ? "warning" : "error",
      },
      extra: {
        poolStats,
        client: client ? "connected" : "disconnected",
        connectionString: connectionString.replace(/:[^:@]*@/, ":***@"),
      },
    });
  } catch (_) {
    // Sentry optional
  }

  if (isRetryableDbError(err)) {
    logger.info("Database connection reset, pool will handle reconnection");
  }
});

pool.on("connect", () => {
  logger.debug("New database client connected");
});

pool.on("remove", () => {
  logger.debug("Database client removed from pool");
});

async function query(text, params, retries = 3) {
  const start = Date.now();
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    let client;
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

      if (isRetryableDbError(error) && attempt < retries) {
        const backoffDelay = attempt * 1000;
        logger.warn(`Database query failed on attempt ${attempt}, retrying...`, {
          error: error.message,
          code: error.code,
          duration: `${duration}ms`,
          retryIn: `${backoffDelay}ms`,
        });
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        continue;
      }

      logger.error("Database query failed", {
        error: error.message,
        code: error.code,
        duration: `${duration}ms`,
        query: String(text).substring(0, 100) + "...",
        attempt,
        poolStats: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
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

async function healthCheck() {
  try {
    const start = Date.now();
    const result = await query(
      "SELECT NOW() as timestamp, version() as version"
    );
    const duration = Date.now() - start;

    return {
      healthy: true,
      timestamp: result.rows[0].timestamp,
      version: result.rows[0].version,
      responseTime: `${duration}ms`,
      poolSize: pool.totalCount,
      idleClients: pool.idleCount,
      waitingClients: pool.waitingCount,
      database: "postgresql",
    };
  } catch (error) {
    logger.error("Database health check failed:", {
      error: error.message,
      code: error.code,
    });

    return {
      healthy: false,
      error: error.message,
      code: error.code,
      poolSize: pool.totalCount,
      idleClients: pool.idleCount,
      waitingClients: pool.waitingCount,
      database: "postgresql",
    };
  }
}

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
