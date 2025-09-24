require("dotenv").config();

// Initialize Sentry FIRST before any other code
const sentry = require("./src/utils/sentry");

const express = require("express");
const logger = require("./src/utils/logger");
const monitoring = require("./src/utils/monitoring");
const db = require("./src/utils/db");
const LemlistService = require("./src/services/lemlistService");
const SmartleadService = require("./src/services/smartleadService");
const SyncRoutes = require("./src/routes/syncRoutes");
const CronManager = require("./src/config/cron");
const syncState = require("./src/utils/syncState");
const dedupStore = require("./src/utils/sourceUsersStore");
const TestRoutes = require("./src/routes/testRoutes");
const ProductEventRoutes = require("./src/routes/productEventRoutes");
const PeriodicSyncRoutes = require("./src/routes/periodicSyncRoutes");
const WebSocketService = require("./src/services/websocketService");
const NewSyncRoutes = require("./src/routes/newSyncRoutes");
const ScoringRoutes = require("./src/routes/scoringRoutes");
const ExternalProfileRoutes = require("./src/routes/externalProfileRoutes");
const NamespaceRoutes = require("./src/routes/namespaceRoutes");

// Create Express app
const app = express();

// Initialize Sentry with Express app (must be before any middleware)
sentry.initSentry(app);

// Add body parser middleware
app.use(express.json());

// Initialize error handling
process.on("uncaughtException", async (error) => {
  await monitoring.captureError(error, { type: "uncaughtException" });
  logger.error("Uncaught Exception:", error);

  // Try graceful shutdown
  try {
    await db.close();
  } catch (closeError) {
    logger.error("Error closing database during shutdown:", closeError);
  }

  process.exit(1);
});

process.on("unhandledRejection", async (reason, promise) => {
  await monitoring.captureError(new Error(reason), {
    type: "unhandledRejection",
    promise: promise.toString(),
  });
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Enable CORS for test endpoints
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Initialize services
const lemlistService = new LemlistService();
const smartleadService = new SmartleadService();

// Initialize and mount routes
const syncRoutes = new SyncRoutes(lemlistService, smartleadService);
app.use("/sync", syncRoutes.setupRoutes());

// Mount new sync routes (API v1)
const newSyncRoutes = new NewSyncRoutes(lemlistService, smartleadService);
app.use("/api/v1/sync", newSyncRoutes.setupRoutes());

// Background job routes for Attio sync (mount BEFORE dashboard to avoid conflicts)
const BackgroundJobRoutes = require("./src/routes/backgroundJobRoutes");
const backgroundJobRoutes = new BackgroundJobRoutes();
app.use("/api", backgroundJobRoutes.setupRoutes());

// External profile processing routes
const externalProfileRoutes = new ExternalProfileRoutes();
const externalProfileRouter = express.Router();
externalProfileRoutes.registerRoutes(externalProfileRouter);
app.use("/api", externalProfileRouter);

// Dashboard routes (mount AFTER specific routes to avoid catch-all conflicts)
const DashboardRoutes = require("./src/routes/dashboardRoutes");
const dashboardRoutes = new DashboardRoutes();
app.use("/", dashboardRoutes.setupRoutes());

// Product event tracking routes
let webSocketService = null;  // Will be initialized after server starts
const productEventRoutes = new ProductEventRoutes();
app.use("/api/events", productEventRoutes.setupRoutes());

// Periodic sync routes
const periodicSyncRoutes = new PeriodicSyncRoutes();
app.use("/api/periodic-sync", periodicSyncRoutes.setupRoutes());

// Test routes (for debugging and testing)
const testRoutes = new TestRoutes();
app.use("/api/test", testRoutes.setupRoutes());

// Scoring routes
const scoringRoutes = new ScoringRoutes();
app.use("/api/scoring", scoringRoutes.setupRoutes());

// Namespace routes
const namespaceRoutes = new NamespaceRoutes();
app.use("/api", namespaceRoutes.setupRoutes());

// Initialize cron jobs
const PORT = process.env.PORT || 8080;
const cronManager = new CronManager(
  process.env.BASE_URL || `http://localhost:${PORT}`
);

// Initialize database tables
async function initializeDatabaseTables() {
  try {
    logger.info("Initializing database tables...");

    // Create user_source table
    await db.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_source (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE,
        linkedin_profile TEXT,
        enrichment_profile JSONB,
        meta JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info("✅ user_source table created/verified");

    // Create event_source table
    await db.query(`
      CREATE TABLE IF NOT EXISTS event_source (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_key VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        user_id TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info("✅ event_source table created/verified");
  } catch (error) {
    logger.error("❌ Failed to initialize database tables:", error);
    throw error;
  }
}

// Simple health check endpoint (no database required - for Railway healthcheck)
app.get("/health/simple", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "cairo",
    timestamp: new Date().toISOString(),
  });
});

// Enhanced health check endpoint with database monitoring
app.get("/health", async (req, res) => {
  try {
    const healthStatus = monitoring.getHealthStatus();
    const dbHealth = await db.healthCheck();

    const combinedHealth = {
      ...healthStatus,
      database: dbHealth,
      status: dbHealth.healthy ? healthStatus.status : "healthy",
    };

    const statusCode = combinedHealth.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(combinedHealth);
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Enhanced health endpoint with detailed monitoring
app.get("/health/detailed", async (req, res) => {
  try {
    const healthStatus = monitoring.getHealthStatus();
    const dbHealth = await db.healthCheck();

    const detailedHealth = {
      ...healthStatus,
      database: dbHealth,
      status: dbHealth.healthy ? healthStatus.status : "unhealthy",
    };

    res.status(200).json(detailedHealth);
  } catch (error) {
    logger.error("Detailed health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Sentry test endpoint (for verifying Sentry is working)
app.get("/test-sentry", async (req, res) => {
  try {
    const { type = "all" } = req.query;

    if (type === "message" || type === "all") {
      sentry.captureMessage("Test message from API endpoint", "info", {
        endpoint: "/test-sentry",
        timestamp: new Date().toISOString(),
      });
    }

    if (type === "warning" || type === "all") {
      sentry.captureMessage("Test warning from API endpoint", "warning", {
        endpoint: "/test-sentry",
        level: "warning",
      });
    }

    if (type === "error" || type === "all") {
      throw new Error(
        "Test error from /test-sentry endpoint - this is intentional!"
      );
    }

    res.json({
      success: true,
      message: `Sentry test ${type} sent successfully. Check your Sentry dashboard.`,
      sentryEnabled: !!process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "production",
    });
  } catch (error) {
    // This error will be caught by Sentry error handler
    throw error;
  }
});

// Add Sentry error handler (must be after all other middleware and routes)
app.use(sentry.getErrorHandler());

// Generic error handler (after Sentry)
app.use((err, req, res, next) => {
  // Sentry has already captured the error, now send response
  logger.error(`Express error handler: ${err.message}`, {
    path: req.path,
    method: req.method,
    error: err.stack,
  });

  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});

// Start the Express server
const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`✅ Server listening on http://0.0.0.0:${PORT}`);
  logger.info(`✅ Server listening on http://0.0.0.0:${PORT}`);

  try {
    // Check database health before starting - REQUIRED!
    const dbHealth = await db.healthCheck();
    if (!dbHealth.healthy) {
      throw new Error(`Database connection REQUIRED but failed: ${dbHealth.error}. 
        Please ensure POSTGRES_URL environment variable is set correctly.
        Expected format: postgresql://user:pass@host.neon.tech/db?sslmode=require`);
    }
    logger.info("✅ Database connection healthy");

    // Initialize database tables
    await initializeDatabaseTables();
    logger.info("✅ Database tables initialized");

    // Prepare Postgres sync_state table
    await syncState.init();

    // Prepare sent_events dedup table
    global.dedupStore = dedupStore;
    await dedupStore.init();

    // Start monitoring health checks
    monitoring.startHealthChecks();

    // Initialize WebSocket service
    webSocketService = new WebSocketService(server);

    // Pass WebSocket service to product event routes for real-time event streaming
    productEventRoutes.webSocketService = webSocketService;
    logger.info("✅ WebSocket service initialized for real-time event streaming");

    // Sync configuration
    // Option 1: Use new periodic sync (recommended - every 4 hours)
    if (process.env.USE_PERIODIC_SYNC === "true") {
      logger.info("[Server] Initializing PeriodicSyncService...");
      try {
        const { getInstance } = require("./src/services/periodicSyncService");
        const periodicSync = getInstance();
        await periodicSync.start();
        logger.info(
          `[Server] Periodic sync started successfully (every ${periodicSync.syncInterval} hours)`
        );

        // Log initial status
        const stats = periodicSync.getStats();
        logger.info("[Server] Periodic sync initial status:", {
          isRunning: stats.isRunning,
          syncInterval: stats.syncInterval,
          nextSyncTime: stats.nextSyncTime,
        });
      } catch (error) {
        logger.error("[Server] Failed to start periodic sync:", error);
        throw error; // Re-throw to prevent server from starting with broken sync
      }
    }
    // Option 2: Use legacy cron jobs (every 10-15 minutes)
    else if (process.env.ENABLE_CRON_JOBS === "true") {
      cronManager.start();
      logger.info("Legacy cron jobs started (10-15 minute intervals)");
    }
    // Option 3: Manual sync only (default)
    else {
      logger.info(
        "Automatic sync disabled - use dashboard or API endpoints to trigger syncs manually"
      );
    }

    console.log(`🎉 Server is ready! Available endpoints:`);
    console.log(`  - GET  /health - Health check`);
    console.log(`  - GET  /health/detailed - Detailed health check`);

    // Show periodic sync endpoints if enabled
    if (process.env.USE_PERIODIC_SYNC === "true") {
      console.log(
        `  \n⏰ Periodic Sync APIs (auto-sync every ${
          process.env.SYNC_INTERVAL_HOURS || 4
        } hours):`
      );
      console.log(`  - GET  /api/periodic-sync/status - Check sync status`);
      console.log(`  - POST /api/periodic-sync/sync-now - Force sync now`);
      console.log(`  - GET  /api/periodic-sync/history - View sync history`);
    }

    console.log(
      `  \n📌 Background Attio Sync APIs (runs even after request closes):`
    );
    console.log(
      `  - POST /api/sync/users-background - Sync users to Attio in background`
    );
    console.log(
      `  - POST /api/sync/events-background - Sync events to Attio in background`
    );
    console.log(
      `  - POST /api/sync/full-background - Full sync (users + events) in background`
    );
    console.log(`  - GET  /api/jobs - List all background jobs`);
    console.log(
      `  - GET  /api/jobs/status/:jobName - Check specific job status`
    );
    console.log(`  - POST /api/jobs/stop/:jobName - Stop a running job`);
    console.log(`  \n📌 Other endpoints:`);
    console.log(`  - GET  /initial-sync - Run initial sync`);
    console.log(`  - GET  /delta-sync - Run delta sync`);
    console.log(`  - GET  /sync-status - Check sync status`);
    console.log(`  - GET  /initial-sync?source=smartlead - Smartlead only`);
    console.log(`  - GET  /initial-sync?source=lemlist - Lemlist only`);
    console.log(`  - GET  /delta-sync?source=smartlead - Smartlead delta only`);
    console.log(`  - GET  /delta-sync?source=lemlist - Lemlist delta only`);
  } catch (error) {
    logger.error("❌ FATAL: Failed to initialize application:", error);
    await monitoring.captureError(error, { type: "startup" });
    console.error(`
❌ APPLICATION STARTUP FAILED!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Database connection is REQUIRED. 
Please check your environment variables:

1. POSTGRES_URL must be set with your NeonDB connection string
2. Format: postgresql://user:pass@host.neon.tech/db?sslmode=require
3. Ensure ?sslmode=require is included

Error: ${error.message}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    process.exit(1); // Exit with error - database is required!
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Received SIGINT. Shutting down gracefully...");
  await gracefulShutdown();
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM. Shutting down gracefully...");
  await gracefulShutdown();
});

async function gracefulShutdown() {
  try {
    // Shutdown WebSocket service first
    if (webSocketService) {
      webSocketService.shutdown();
      logger.info("WebSocket service shut down");
    }

    // Stop accepting new connections
    server.close(() => {
      logger.info("HTTP server closed");
    });

    // Close database connections
    await db.close();
    logger.info("Database connections closed");

    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    await monitoring.captureError(error, { type: "shutdown" });
    process.exit(1);
  }
}

module.exports = app;
// Force Railway redeploy - Sat Aug  9 00:03:38 IST 2025
