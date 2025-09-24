require("dotenv").config();
const express = require("express");
const logger = require("./utils/logger");
const monitoring = require("./utils/monitoring");
const db = require("./utils/db");
const LemlistService = require("./services/lemlistService");
const SmartleadService = require("./services/smartleadService");
const SyncRoutes = require("./routes/syncRoutes");
const CronManager = require("./config/cron");
const syncState = require("./utils/syncState");
const dedupStore = require("./utils/sourceUsersStore");
const DedupStore = require("./utils/dedupStore");
const { runMigrations } = require("./migrations/run_migrations");
const { migrationService } = require("./services/migrationService");
const { dbOptimizations } = require("./utils/dbOptimizations");
const NewSyncRoutes = require("./routes/newSyncRoutes");
const ProductEventRoutes = require("./routes/productEventRoutes");
const PeriodicSyncRoutes = require("./routes/periodicSyncRoutes");
const TestRoutes = require("./routes/testRoutes");
const ScoringRoutes = require("./routes/scoringRoutes");
const FullSyncRoutes = require("./routes/fullSyncRoutes");
const SDKRoutes = require("./routes/sdkRoutes");

// Create Express app
const app = express();
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
app.use("/", syncRoutes.setupRoutes());

const newSyncRoutes = new NewSyncRoutes(lemlistService, smartleadService);
app.use("/api/v1/sync", newSyncRoutes.setupRoutes());

// Product event tracking routes
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

// Full sync routes
const fullSyncRoutes = new FullSyncRoutes();
app.use("/api/full-sync", fullSyncRoutes.setupRoutes());

// SDK routes (v2 API for SDKs)
const sdkRoutes = new SDKRoutes();
app.use("/v2", sdkRoutes.setupRoutes());

// Initialize cron jobs
const PORT = process.env.PORT || 8080;
const cronManager = new CronManager(
  process.env.BASE_URL || `http://localhost:${PORT}`
);

// Initialize database tables, migrations, and optimizations
async function initializeDatabaseTables() {
  try {
    logger.info("🔧 Starting database initialization...");

    // Step 1: Run legacy migrations first
    logger.info("Running legacy database migrations...");
    await runMigrations();
    logger.info("✅ Legacy migrations completed.");

    // Step 2: Run new migration service for additional migrations
    logger.info("Running enhanced migrations...");
    const migrationResults = await migrationService.runPendingMigrations();
    if (migrationResults.success) {
      logger.info(
        `✅ Enhanced migrations completed: ${migrationResults.migrationsRun} new migrations`
      );
    } else {
      logger.warn(
        `⚠️ Some enhanced migrations failed: ${migrationResults.migrationsRun}/${migrationResults.totalPending} successful`
      );
    }

    // Step 3: Initialize database optimizations
    logger.info("Initializing database optimizations...");
    await dbOptimizations.initialize();
    logger.info("✅ Database optimizations initialized");

    // Step 4: Verify critical tables exist
    const tables = ["user_source", "event_source", "campaigns", "sent_events"];
    for (const table of tables) {
      try {
        await db.query(`SELECT 1 FROM ${table} LIMIT 1`);
        logger.info(`✅ Table ${table} verified.`);
      } catch (error) {
        logger.warn(`⚠️ Table ${table} verification failed:`, error.message);
      }
    }

    // Step 5: Get database optimization status
    const poolStats = await dbOptimizations.getConnectionPoolStats();
    const bulkStats = dbOptimizations.getBulkOperationStats();

    logger.info("📊 Database initialization summary:", {
      migrationsRun: migrationResults.migrationsRun,
      optimizationsEnabled: bulkStats.initialized,
      connectionPool: poolStats
        ? `${poolStats.totalCount}/${poolStats.maxPoolSize}`
        : "unknown",
      tablesVerified: tables.length,
    });

    logger.info("🎉 Database initialization completed successfully!");
  } catch (error) {
    logger.error("❌ Failed to initialize database:", error);
    throw error;
  }
}

// Enhanced health check endpoint with database monitoring
app.get("/health", async (req, res) => {
  try {
    const healthStatus = monitoring.getHealthStatus();
    const dbHealth = await db.healthCheck();

    const combinedHealth = {
      ...healthStatus,
      database: dbHealth,
      status: dbHealth.healthy ? healthStatus.status : "unhealthy",
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

// Endpoint to get unique email recipients
app.get("/recipients", async (req, res) => {
  try {
    const lemlistService = new LemlistService(process.env.LEMLIST_API_KEY);
    const smartleadService = new SmartleadService(
      process.env.SMARTLEAD_API_KEY
    );

    // Get all campaigns from both services
    const [lemlistCampaigns, smartleadCampaigns] = await Promise.all([
      lemlistService.getCampaigns(),
      smartleadService.getCampaigns(),
    ]);

    // Set to store unique email addresses
    const uniqueEmails = new Set();

    // Process Lemlist campaigns
    for (const campaign of lemlistCampaigns) {
      try {
        const activities = await lemlistService.getCampaignActivities(
          campaign._id
        );
        activities.forEach((activity) => {
          if (activity.lead && activity.lead.email) {
            uniqueEmails.add(activity.lead.email.toLowerCase());
          }
        });
      } catch (error) {
        logger.error(
          `Error getting Lemlist activities for campaign ${campaign._id}: ${error.message}`
        );
      }
    }

    // Process Smartlead campaigns
    for (const campaign of smartleadCampaigns) {
      try {
        const [opened, clicked, replied] = await Promise.all([
          smartleadService.getOpenedEmails(campaign.id),
          smartleadService.getClickedEmails(campaign.id),
          smartleadService.getRepliedEmails(campaign.id),
        ]);

        // Helper function to process emails from response
        const processEmails = (response) => {
          const emails = response.data || [];
          emails.forEach((item) => {
            const email = (item.email || item.lead_email || "").toLowerCase();
            if (email) {
              uniqueEmails.add(email);
            }
          });
        };

        processEmails(opened);
        processEmails(clicked);
        processEmails(replied);
      } catch (error) {
        logger.error(
          `Error getting Smartlead data for campaign ${campaign.id}: ${error.message}`
        );
      }
    }

    // Convert Set to sorted array
    const emailList = Array.from(uniqueEmails).sort();

    res.json({
      total_unique_recipients: emailList.length,
      recipients: emailList,
    });
  } catch (error) {
    logger.error("Error getting recipients:", error);
    res.status(500).json({ error: "Failed to get recipients" });
  }
});

// Start the Express server
const server = app.listen(PORT, "::", async () => {
  console.log(`✅ Server listening on http://0.0.0.0:${PORT}`);
  logger.info(`✅ Server listening on http://0.0.0.0:${PORT}`);

  try {
    // Check database health before starting
    const dbHealth = await db.healthCheck();
    if (!dbHealth.healthy) {
      throw new Error(`Database health check failed: ${dbHealth.error}`);
    }
    logger.info("✅ Database connection healthy");

    // Initialize database tables by running migrations
    await initializeDatabaseTables();

    // Prepare Postgres sync_state table
    await syncState.init();

    // Prepare sent_events dedup table
    global.dedupStore = dedupStore;
    await dedupStore.init();

    // Initialize proper dedupStore for event deduplication
    global.eventDedupStore = new DedupStore();

    // Start monitoring health checks
    monitoring.startHealthChecks();

    // Start cron jobs after server is running
    cronManager.start();
    logger.info("Cron jobs started");

    // Send startup notification
    await monitoring.sendSlackAlert({
      type: "info",
      title: "🚀 SuperSync Started",
      message: `Server started successfully on port ${PORT}`,
      context: {
        environment: process.env.NODE_ENV || "production",
        port: PORT,
        database: dbHealth,
      },
    });
  } catch (error) {
    logger.error("Failed to initialize application:", error);
    await monitoring.captureError(error, { type: "startup" });
    process.exit(1);
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
    // Stop accepting new connections
    server.close(() => {
      logger.info("HTTP server closed");
    });

    // Flush any pending Segment events
    await segmentService.flush();
    logger.info("Successfully flushed Segment events");

    // Close database connections
    await db.close();
    logger.info("Database connections closed");

    // Send shutdown notification
    await monitoring.sendSlackAlert({
      type: "info",
      title: "🔻 SuperSync Shutdown",
      message: "Server shutdown completed gracefully",
      context: {
        environment: process.env.NODE_ENV || "production",
        uptime: process.uptime(),
      },
    });

    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    await monitoring.captureError(error, { type: "shutdown" });
    process.exit(1);
  }
}
