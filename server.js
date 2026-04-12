// Load environment variables (prioritizes .env.local for local dev, uses Railway env vars in cloud)
const { loadEnv } = require("./src/utils/envLoader");
loadEnv();

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

// Try to load WebSocket service (graceful failure if ws module is missing)
let WebSocketService = null;
try {
  WebSocketService = require("./src/services/websocketService");
} catch (error) {
  logger.warn("WebSocket service not available (missing 'ws' dependency):", error.message);
}
const NewSyncRoutes = require("./src/routes/newSyncRoutes");
const ScoringRoutes = require("./src/routes/scoringRoutes");
const ExternalProfileRoutes = require("./src/routes/externalProfileRoutes");
const NamespaceRoutes = require("./src/routes/namespaceRoutes");
const DestinationSyncRoutes = require("./src/routes/destinationSyncRoutes");
const DashboardRoutes = require("./src/routes/dashboardRoutes");
const ConfigRoutes = require("./src/routes/configRoutes");
const SystemRoutes = require("./src/routes/systemRoutes");
const FullSyncRoutes = require("./src/routes/fullSyncRoutes");
const fullSyncJobRoutes = require("./src/routes/fullSyncJobRoutes");

// Create Express app
const app = express();

// Initialize Sentry with Express app (must be before any middleware)
sentry.initSentry(app);

// Simple health check endpoint (FIRST - no dependencies, always available)
app.get("/health/simple", (req, res) => {
  try {
    res.status(200).json({
      status: "healthy",
      service: "cairo-cdp",
      timestamp: new Date().toISOString(),
      version: "1.0.0"
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      service: "cairo-cdp",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Debug endpoint to test integrations
app.get("/debug/test-integrations", async (req, res) => {
  const results = {
    sentry: { configured: false, working: false },
    mixpanel: { configured: false, working: false },
    periodicSync: { configured: false, running: false },
    database: { configured: false, working: false },
    lemlist: { configured: false, working: false },
    smartlead: { configured: false, working: false },
    attio: { configured: false, working: false }
  };

  // Test Sentry
  if (process.env.SENTRY_DSN) {
    results.sentry.configured = true;
    try {
      sentry.captureMessage("Test message from /debug/test-integrations", 'info');
      results.sentry.working = true;
    } catch (error) {
      results.sentry.error = error.message;
    }
  }

  // Test Mixpanel
  if (process.env.MIXPANEL_PROJECT_TOKEN) {
    results.mixpanel.configured = true;
    try {
      const MixpanelService = require("./src/services/mixpanelService");
      const mixpanel = new MixpanelService(process.env.MIXPANEL_PROJECT_TOKEN);
      const trackResult = await mixpanel.track(
        "test@cairo.com",
        "Integration Test",
        { source: "debug_endpoint", timestamp: new Date().toISOString() }
      );
      results.mixpanel.working = trackResult.success;
      results.mixpanel.stats = mixpanel.stats;
      if (!trackResult.success) {
        results.mixpanel.error = trackResult.error;
      }
    } catch (error) {
      results.mixpanel.error = error.message;
    }
  }

  // Test Lemlist
  if (process.env.LEMLIST_API_KEY) {
    results.lemlist.configured = true;
    try {
      const LemlistService = require("./src/services/lemlistService");
      const lemlist = new LemlistService(process.env.LEMLIST_API_KEY);
      const campaigns = await lemlist.getCampaigns();
      results.lemlist.working = true;
      results.lemlist.campaignCount = campaigns.length;
    } catch (error) {
      results.lemlist.error = error.message;
    }
  }

  // Test Smartlead
  if (process.env.SMARTLEAD_API_KEY) {
    results.smartlead.configured = true;
    try {
      const SmartleadService = require("./src/services/smartleadService");
      const smartlead = new SmartleadService(process.env.SMARTLEAD_API_KEY);
      const campaigns = await smartlead.getCampaigns();
      results.smartlead.working = true;
      results.smartlead.campaignCount = campaigns.length;
    } catch (error) {
      results.smartlead.error = error.message;
    }
  }

  // Test Attio
  if (process.env.ATTIO_API_KEY) {
    results.attio.configured = true;
    try {
      const AttioService = require("./src/services/attioService");
      const attio = new AttioService(process.env.ATTIO_API_KEY);
      const people = await attio.listPeople(1, 0); // Just get 1 person to test
      results.attio.working = true;
      results.attio.totalPeople = people.count || 0;
    } catch (error) {
      results.attio.error = error.message;
    }
  }

  // Test Periodic Sync
  if (process.env.USE_PERIODIC_SYNC === "true") {
    results.periodicSync.configured = true;
    try {
      const { getInstance } = require("./src/services/periodicSyncService");
      const periodicSync = getInstance();
      const stats = periodicSync.getStats();
      results.periodicSync.running = stats.isRunning;
      results.periodicSync.stats = stats;
    } catch (error) {
      results.periodicSync.error = error.message;
    }
  }

  // Test Database
  if (process.env.POSTGRES_URL) {
    results.database.configured = true;
    try {
      const { query } = require("./src/utils/db");
      const result = await query("SELECT NOW() as time");
      results.database.working = true;
      results.database.time = result.rows[0].time;

      // Check if we have any events
      const eventCount = await query("SELECT COUNT(*) as count FROM event_source");
      results.database.eventCount = parseInt(eventCount.rows[0].count);

      // Check if we have any users
      const userCount = await query("SELECT COUNT(*) as count FROM playmaker_user_source");
      results.database.userCount = parseInt(userCount.rows[0].count);
    } catch (error) {
      results.database.error = error.message;
    }
  }

  logger.info("[DEBUG] Integration test completed", results);
  res.json(results);
});

// Debug endpoint to check data flow and recent activity
app.get("/debug/data-status", async (req, res) => {
  const results = {
    lastSyncData: {},
    recentEvents: [],
    recentUsers: [],
    syncTimestamps: {},
    errors: []
  };

  try {
    const { query } = require("./src/utils/db");

    // Get last sync timestamps for each platform
    const platforms = ['lemlist', 'smartlead', 'attio'];
    for (const platform of platforms) {
      try {
        const lastEvent = await query(
          `SELECT created_at, event_type, platform
           FROM event_source
           WHERE platform = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [platform]
        );
        results.syncTimestamps[platform] = lastEvent.rows[0] || null;
      } catch (error) {
        results.errors.push(`Error getting ${platform} timestamps: ${error.message}`);
      }
    }

    // Get recent events (last 10)
    try {
      const recentEvents = await query(
        `SELECT email, event_type, platform, created_at, event_key
         FROM event_source
         ORDER BY created_at DESC
         LIMIT 10`
      );
      results.recentEvents = recentEvents.rows;
    } catch (error) {
      results.errors.push(`Error getting recent events: ${error.message}`);
    }

    // Get recent users (last 10)
    try {
      const recentUsers = await query(
        `SELECT email, platform, created_at, updated_at, apollo_enriched_at, last_scored_at
         FROM playmaker_user_source
         ORDER BY created_at DESC
         LIMIT 10`
      );
      results.recentUsers = recentUsers.rows;
    } catch (error) {
      results.errors.push(`Error getting recent users: ${error.message}`);
    }

    // Get sync state data
    try {
      const syncStates = await query(
        `SELECT source_name, last_checked_at, created_at
         FROM sync_state
         ORDER BY last_checked_at DESC`
      );
      results.syncStates = syncStates.rows;
    } catch (error) {
      results.errors.push(`Error getting sync states: ${error.message}`);
    }

    // Get periodic sync stats if available
    if (process.env.USE_PERIODIC_SYNC === "true") {
      try {
        const { getInstance } = require("./src/services/periodicSyncService");
        const periodicSync = getInstance();
        results.periodicSyncStats = periodicSync.getStats();
      } catch (error) {
        results.errors.push(`Error getting periodic sync stats: ${error.message}`);
      }
    }

    logger.info("[DEBUG] Data status check completed", {
      eventCount: results.recentEvents.length,
      userCount: results.recentUsers.length,
      errorCount: results.errors.length
    });

    res.json(results);
  } catch (error) {
    logger.error("[DEBUG] Data status check failed:", error);
    res.status(500).json({
      error: error.message,
      results
    });
  }
});

// Debug endpoint to list all registered routes
app.get("/debug/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Regular routes
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods),
            router: true
          });
        }
      });
    }
  });

  logger.info(`[DEBUG] Routes endpoint accessed, found ${routes.length} routes`);
  res.json({
    totalRoutes: routes.length,
    periodicSyncEnabled: process.env.USE_PERIODIC_SYNC === 'true',
    routes: routes.sort((a, b) => a.path.localeCompare(b.path))
  });
});

// Cairo runs in headless mode - all interaction via MCP or REST API
logger.info("Cairo running in headless mode (MCP-first).");

// Serve llms.txt for agent discovery
app.get("/llms.txt", (req, res) => {
  const fs = require("fs");
  const llmsPath = require("path").join(__dirname, "llms.txt");
  if (fs.existsSync(llmsPath)) {
    res.type("text/plain").send(fs.readFileSync(llmsPath, "utf-8"));
  } else {
    res.status(404).type("text/plain").send("llms.txt not found");
  }
});

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

// Request logging middleware with Sentry breadcrumbs
app.use((req, res, next) => {
  const start = Date.now();

  // Log the incoming request
  logger.info(`[REQUEST] ${req.method} ${req.path}`, {
    query: req.query,
    body: req.body ? Object.keys(req.body) : undefined,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    }
  });

  // Add Sentry breadcrumb for API calls
  sentry.Sentry.addBreadcrumb({
    category: 'http',
    message: `${req.method} ${req.path}`,
    level: 'info',
    data: {
      method: req.method,
      url: req.url,
      query: req.query
    }
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';
    logger[logLevel](`[RESPONSE] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);

    // Capture 4xx and 5xx errors to Sentry
    if (res.statusCode >= 400) {
      sentry.captureMessage(
        `HTTP ${res.statusCode}: ${req.method} ${req.path}`,
        res.statusCode >= 500 ? 'error' : 'warning',
        {
          statusCode: res.statusCode,
          method: req.method,
          path: req.path,
          duration,
          query: req.query
        }
      );
    }
  });

  next();
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

// Dashboard routes are already defined above

// Product event tracking routes
let webSocketService = null;  // Will be initialized after server starts
const productEventRoutes = new ProductEventRoutes();
app.use("/api/events", productEventRoutes.setupRoutes());

// Event bridge: forward events to Discord (and other destinations) without persisting
const EventBridgeRoutes = require("./src/routes/eventBridgeRoutes");
const eventBridgeRoutes = new EventBridgeRoutes();
app.use("/api/bridge", eventBridgeRoutes.setupRoutes());

// Periodic sync routes
try {
  const periodicSyncRoutes = new PeriodicSyncRoutes();
  const routes = periodicSyncRoutes.setupRoutes();
  app.use("/api/periodic-sync", routes);
  logger.info("[Server] Periodic sync routes registered successfully at /api/periodic-sync");
} catch (error) {
  logger.error("[Server] Failed to register periodic sync routes:", error);
  sentry.captureError(error, {
    category: 'route_registration',
    route: 'periodic-sync'
  });
}

// Test routes (for debugging and testing)
const testRoutes = new TestRoutes();
app.use("/api/test", testRoutes.setupRoutes());

// Scoring routes
const scoringRoutes = new ScoringRoutes();
app.use("/api/scoring", scoringRoutes.setupRoutes());

// Namespace routes
const namespaceRoutes = new NamespaceRoutes();
app.use("/api", namespaceRoutes.setupRoutes());

// Full sync routes (bulk historical sync from Lemlist/Smartlead)
const fullSyncRoutes = new FullSyncRoutes();
app.use("/api/full-sync", fullSyncRoutes.setupRoutes());
app.use("/api/full-sync", fullSyncJobRoutes);

// Destination sync routes
app.use("/api", DestinationSyncRoutes);

// Dashboard routes
app.use("/api/dashboard", DashboardRoutes);

// System monitoring routes
app.use("/api/system", SystemRoutes);

// Configuration management routes
const EnvConfigRoutes = require("./src/routes/envConfigRoutes");
const envConfigRoutes = new EnvConfigRoutes();
app.use("/api/config", envConfigRoutes.setupRoutes());

// Config routes for sources and destinations (both /api and /api/config for UI compatibility)
const configRoutes = new ConfigRoutes();
const configRouter = configRoutes.setupRoutes();
app.use("/api", configRouter);
app.use("/api/config", configRouter);

// AI Query routes (natural language queries)
const AIQueryRoutes = require("./src/routes/aiQueryRoutes");
const aiQueryRoutes = new AIQueryRoutes();
app.use("/api/ai/query", aiQueryRoutes.getRouter());

// === V2 CDP Routes ===

// Identity Resolution
const IdentityRoutes = require("./src/routes/identityRoutes");
const identityRoutes = new IdentityRoutes();
app.use("/api/v2/identities", identityRoutes.setupRoutes());

// Transformations
const TransformationRoutes = require("./src/routes/transformationRoutes");
const transformationRoutes = new TransformationRoutes();
app.use("/api/v2/transformations", transformationRoutes.setupRoutes());

// Tracking Plans
const TrackingPlanRoutes = require("./src/routes/trackingPlanRoutes");
const trackingPlanRoutes = new TrackingPlanRoutes();
app.use("/api/v2/tracking-plans", trackingPlanRoutes.setupRoutes());

// GDPR Compliance (user deletion, suppression)
const GDPRRoutes = require("./src/routes/gdprRoutes");
const gdprRoutes = new GDPRRoutes();
app.use("/api/v2", gdprRoutes.setupRoutes());

// Destination Configuration (v2)
const DestinationConfigRoutes = require("./src/routes/destinationConfigRoutes");
const destinationConfigRoutes = new DestinationConfigRoutes();
app.use("/api/v2/destinations", destinationConfigRoutes.setupRoutes());

// Event Replay
const EventReplayRoutes = require("./src/routes/eventReplayRoutes");
const eventReplayRoutes = new EventReplayRoutes();
app.use("/api/v2/replay", eventReplayRoutes.setupRoutes());

// SDK Routes (Segment-compatible event ingestion)
const SDKRoutes = require("./src/routes/sdkRoutes");
const sdkRoutes = new SDKRoutes();
app.use("/api/v2", sdkRoutes.setupRoutes());

// Agent Tracking Routes (agent session management + metrics)
try {
  const AgentTrackingRoutes = require("./src/routes/agentTrackingRoutes");
  const agentTrackingRoutes = new AgentTrackingRoutes();
  app.use("/api/v2/agent", agentTrackingRoutes.setupRoutes());
} catch (e) {
  logger.warn("Agent tracking routes not available:", e.message);
}

// Error Tracking Routes (Sentry-like error capture + grouping)
const ErrorRoutes = require("./src/routes/errorRoutes");
const errorRoutes = new ErrorRoutes();
app.use("/api/v2/errors", errorRoutes.setupRoutes());

// MCP Protocol Endpoint (headless agent interface)
const McpRoutes = require("./src/routes/mcpRoutes");
const mcpRoutes = new McpRoutes();
app.use("/mcp", mcpRoutes.setupRoutes());

// Agent Tools API (OpenAI-compatible)
const AgentToolsRoutes = require("./src/routes/agentToolsRoutes");
const agentToolsRoutes = new AgentToolsRoutes();
app.use("/api/agent", agentToolsRoutes.setupRoutes());

// Agent Context API
try {
  const AgentContextRoutes = require("./src/routes/agentContextRoutes");
  const agentContextRoutes = new AgentContextRoutes();
  app.use("/api/agent/context", agentContextRoutes.setupRoutes());
} catch (e) {
  logger.warn("Agent context routes not available:", e.message);
}

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
    logger.info("user_source table created/verified");

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
    logger.info("event_source table created/verified");
  } catch (error) {
    logger.error("Failed to initialize database tables:", error);
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

// Catch-all 404 handler (must be after API routes)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  logger.warn(`[404] Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    message: 'Cairo is a headless MCP-first CDP. Use POST /mcp for MCP protocol or /api/* for REST.',
    docs: {
      mcp_discovery: 'GET /mcp',
      health: 'GET /health',
      llms_txt: 'GET /llms.txt',
    },
  });
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
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
  logger.info(`Server listening on http://0.0.0.0:${PORT}`);

  try {
    // Load GCP secrets if running on Cloud Run (before database connection)
    if (process.env.K_SERVICE) {
      const {loadGCPSecrets} = require("./src/utils/envLoader");
      await loadGCPSecrets();
    }

    // Check if database URL is available (either POSTGRES_URL or DATABASE_URL)
    const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    if (databaseUrl) {
      // Check database health before starting - REQUIRED if URL is provided!
      const dbHealth = await db.healthCheck();
      if (!dbHealth.healthy) {
        throw new Error(`Database connection REQUIRED but failed: ${dbHealth.error}.
          Please ensure POSTGRES_URL or DATABASE_URL environment variable is set correctly.
          Expected format: postgresql://user:pass@host.neon.tech/db?sslmode=require`);
      }
      logger.info("Database connection healthy");

      // Initialize database tables
      await initializeDatabaseTables();
      logger.info("Database tables initialized");

      // Prepare Postgres sync_state table
      await syncState.init();

      // Prepare sent_events dedup table
      global.dedupStore = dedupStore;
      await dedupStore.init();
    } else {
      logger.warn("Database URL not set - running without database features");
      logger.warn("Please set POSTGRES_URL or DATABASE_URL in your environment");
      logger.warn("Some features will be disabled (event storage, user tracking, etc.)");
    }

    // Start monitoring health checks
    monitoring.startHealthChecks();

    // Initialize WebSocket service (non-blocking)
    if (WebSocketService) {
      try {
        webSocketService = new WebSocketService(server);
        // Pass WebSocket service to product event routes for real-time event streaming
        productEventRoutes.webSocketService = webSocketService;
        logger.info("WebSocket service initialized for real-time event streaming");
      } catch (error) {
        logger.error("Failed to initialize WebSocket service (continuing without real-time features):", error);
        // Continue without WebSocket - this is not critical for basic functionality
      }
    } else {
      logger.warn("WebSocket service unavailable - install 'ws' package for real-time features");
    }

    // Sync configuration
    // Check for conflicting sync configurations
    if (process.env.USE_PERIODIC_SYNC === "true" && process.env.ENABLE_CRON_JOBS === "true") {
      logger.warn(" WARNING: Both USE_PERIODIC_SYNC and ENABLE_CRON_JOBS are enabled!");
      logger.warn(" This will cause duplicate sync operations and may overload your system.");
      logger.warn(" Recommended: Set ENABLE_CRON_JOBS=false and use USE_PERIODIC_SYNC=true only.");
      logger.warn(" Proceeding with Periodic Sync (legacy cron will be ignored)...");
    }

    // Option 1: Use new periodic sync (recommended - every 4 hours)
    // Skip on Cloud Run - Cloud Scheduler handles this
    const isCloudRun = !!process.env.K_SERVICE;
    if (process.env.USE_PERIODIC_SYNC === "true" && !isCloudRun) {
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
    } else if (isCloudRun && process.env.USE_PERIODIC_SYNC === "true") {
      logger.info("[Server] Running on Cloud Run - periodic sync handled by Cloud Scheduler");
    }
    // Option 2: Use legacy cron jobs (DEPRECATED - every 10-15 minutes)
    else if (process.env.ENABLE_CRON_JOBS === "true") {
      logger.warn(" DEPRECATION WARNING: Legacy cron jobs (ENABLE_CRON_JOBS) are deprecated!");
      logger.warn(" Please migrate to USE_PERIODIC_SYNC=true for better performance and control.");
      logger.warn(" Legacy cron support will be removed in a future version.");
      cronManager.start();
      logger.info("Legacy cron jobs started (10-15 minute intervals)");
    }
    // Option 3: Manual sync only (default)
    else {
      logger.info(
        "Automatic sync disabled - use dashboard or API endpoints to trigger syncs manually"
      );
    }

    console.log(`Server is ready! (headless MCP-first mode)`);
    console.log(`\n  Primary interface:`);
    console.log(`  - POST /mcp          - MCP protocol (JSON-RPC, for agents)`);
    console.log(`  - GET  /mcp          - MCP discovery (list tools)`);
    console.log(`  - GET  /llms.txt     - Agent-readable documentation`);
    console.log(`\n  Health:`);
    console.log(`  - GET  /health       - Health check`);
    console.log(`  - GET  /health/simple - Simple health check (no DB)`);
    console.log(`\n  REST API (compatibility):`);
    console.log(`  - POST /api/v2/batch          - Batch event ingestion`);
    console.log(`  - POST /api/v2/track          - Track event`);
    console.log(`  - POST /api/v2/identify       - Identify user`);
    console.log(`  - POST /api/v2/errors/capture - Capture error`);
  } catch (error) {
    logger.error("FATAL: Failed to initialize application:", error);
    await monitoring.captureError(error, { type: "startup" });
    console.error(`
APPLICATION STARTUP FAILED!
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