const Sentry = require("@sentry/node");
const logger = require("./logger");

// Profiling uses a native addon that may be missing on some Node/OS combinations
let ProfilingIntegration = null;
try {
  ProfilingIntegration = require("@sentry/profiling-node").ProfilingIntegration;
} catch (err) {
  logger.warn(
    "[Sentry] Profiling not loaded (native module missing for this Node/OS). Error tracking still enabled.",
    err.message
  );
}

/**
 * Initialize Sentry for error tracking and performance monitoring
 * This should be called as early as possible in the application
 */
function initSentry(app = null) {
  if (!process.env.SENTRY_DSN) {
    logger.warn("SENTRY_DSN not configured. Error tracking disabled.");
    logger.warn(
      "To enable Sentry, set SENTRY_DSN in your environment variables"
    );
    return false;
  }

  try {
    const integrations = [
      // Automatically instrument Node.js libraries and frameworks
      ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
    ];
    if (ProfilingIntegration) {
      integrations.push(new ProfilingIntegration());
    }

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "production",
      integrations,
      // Performance Monitoring
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      // Set sampling rate for profiling (only used if ProfilingIntegration loaded)
      profilesSampleRate: ProfilingIntegration
        ? process.env.NODE_ENV === "production"
          ? 0.1
          : 1.0
        : undefined,
      // Release tracking
      release: process.env.SENTRY_RELEASE || "cairo@1.0.0",
      // Server name
      serverName: process.env.RAILWAY_SERVICE_NAME || "cairo-local",
      // Additional tags
      tags: {
        service: "cairo",
        deployment: process.env.RAILWAY_ENVIRONMENT || "local",
      },
      // Before send hook for filtering
      beforeSend(event, hint) {
        // Filter out non-critical errors in development
        if (process.env.NODE_ENV === "development") {
          // Don't send info level events in dev
          if (event.level === "info") {
            return null;
          }
          // Don't send certain expected errors
          if (hint.originalException?.message?.includes("ECONNREFUSED")) {
            return null;
          }
        }

        // Add user context if available
        if (event.request?.headers) {
          event.user = {
            ip_address:
              event.request.headers["x-forwarded-for"] ||
              event.request.headers["x-real-ip"] ||
              "{{auto}}",
          };
        }

        // Log the error being sent to Sentry
        logger.info(
          `[SENTRY] Sending error to Sentry: ${
            event.exception?.values?.[0]?.type || event.message
          }`
        );

        return event;
      },
      // Breadcrumb filtering
      beforeBreadcrumb(breadcrumb) {
        // Filter out noisy breadcrumbs
        if (breadcrumb.category === "console" && breadcrumb.level === "debug") {
          return null;
        }
        return breadcrumb;
      },
    });

    // If Express app is provided, set up Express integration
    if (app) {
      setupExpressIntegration(app);
    }

    logger.info("✅ Sentry error monitoring initialized successfully");
    logger.info(`   Environment: ${process.env.NODE_ENV || "production"}`);
    logger.info(`   DSN: ${process.env.SENTRY_DSN.substring(0, 40)}...`);

    // Send a test event to verify setup
    if (process.env.NODE_ENV === "development") {
      Sentry.captureMessage("Sentry initialized successfully", "info");
    }

    return true;
  } catch (error) {
    logger.error("Failed to initialize Sentry:", error);
    return false;
  }
}

/**
 * Set up Sentry Express integration
 */
function setupExpressIntegration(app) {
  // The request handler must be the first middleware on the app
  app.use(Sentry.Handlers.requestHandler());

  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());

  logger.info("✅ Sentry Express middleware attached");
}

/**
 * Express error handler middleware (should be added after all other middleware and routes)
 */
function getErrorHandler() {
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture all errors
      return true;
    },
  });
}

/**
 * Helper to capture errors with additional context
 */
function captureError(error, context = {}, level = "error") {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.withScope((scope) => {
    // Set the error level
    scope.setLevel(level);

    // Add context as tags
    Object.entries(context).forEach(([key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        scope.setTag(key, value);
      } else {
        scope.setContext(key, value);
      }
    });

    // Add breadcrumb
    scope.addBreadcrumb({
      message: error.message,
      level: level,
      category: context.category || "error",
      data: context,
      timestamp: Date.now() / 1000,
    });

    // Capture the error
    Sentry.captureException(error);
  });

  logger.error(`[SENTRY] Error captured: ${error.message}`, context);
}

/**
 * Helper to capture messages
 */
function captureMessage(message, level = "info", context = {}) {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.withScope((scope) => {
    // Add context
    Object.entries(context).forEach(([key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        scope.setTag(key, value);
      } else {
        scope.setContext(key, value);
      }
    });

    // Capture the message
    Sentry.captureMessage(message, level);
  });

  logger.info(`[SENTRY] Message captured: ${message}`, context);
}

/**
 * Start a transaction for performance monitoring
 */
function startTransaction(name, op = "function") {
  if (!process.env.SENTRY_DSN) {
    return null;
  }

  return Sentry.startTransaction({
    op,
    name,
  });
}

/**
 * Test Sentry is working
 */
async function testSentry() {
  logger.info("🧪 Testing Sentry integration...");

  // Test message
  captureMessage("Test message from SuperSync", "info", {
    test: true,
    timestamp: new Date().toISOString(),
  });

  // Test warning
  captureMessage("Test warning from SuperSync", "warning", {
    test: true,
    type: "warning",
  });

  // Test error
  const testError = new Error(
    "Test error from SuperSync - this is intentional!"
  );
  captureError(testError, {
    test: true,
    intentional: true,
    source: "testSentry",
  });

  // Give Sentry time to send
  await new Promise((resolve) => setTimeout(resolve, 2000));

  logger.info(
    "✅ Sentry test completed. Check your Sentry dashboard for the test events."
  );
}

module.exports = {
  initSentry,
  setupExpressIntegration,
  getErrorHandler,
  captureError,
  captureMessage,
  startTransaction,
  testSentry,
  Sentry,
};
