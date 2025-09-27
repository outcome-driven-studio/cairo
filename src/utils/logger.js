const winston = require('winston');
const Sentry = require('@sentry/node');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error',
      format: logFormat
    }),
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: 'combined.log',
      format: logFormat
    })
  ]
});

// If we're in development, also log to the console with some colors
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Create a wrapper that also sends errors and warnings to Sentry
const originalError = logger.error.bind(logger);
const originalWarn = logger.warn.bind(logger);
const originalInfo = logger.info.bind(logger);

logger.error = function(message, ...args) {
  originalError(message, ...args);

  // Send to Sentry if initialized
  if (process.env.SENTRY_DSN) {
    if (message instanceof Error) {
      Sentry.captureException(message, {
        level: 'error',
        extra: args[0] || {}
      });
    } else {
      Sentry.captureMessage(message, 'error');
      // If there's an error object in args, capture it too
      if (args[0] instanceof Error) {
        Sentry.captureException(args[0]);
      }
    }
  }
};

logger.warn = function(message, ...args) {
  originalWarn(message, ...args);

  // Send warnings to Sentry if initialized
  if (process.env.SENTRY_DSN && process.env.SENTRY_LOG_WARNINGS === 'true') {
    Sentry.captureMessage(message, 'warning');
  }
};

// Track critical info messages to Sentry (for monitoring sync operations)
logger.info = function(message, ...args) {
  originalInfo(message, ...args);

  // Send critical sync-related info to Sentry for monitoring
  if (process.env.SENTRY_DSN && process.env.SENTRY_TRACK_SYNC === 'true') {
    const criticalPatterns = [
      /periodic sync/i,
      /sync failed/i,
      /mixpanel/i,
      /error/i,
      /failed/i,
      /crash/i,
      /unable to/i
    ];

    if (criticalPatterns.some(pattern => pattern.test(message))) {
      Sentry.addBreadcrumb({
        message: message,
        level: 'info',
        category: 'sync',
        data: args[0] || {}
      });

      // If it's a sync completion or failure, send as message
      if (/sync (completed|failed|started)/i.test(message)) {
        Sentry.captureMessage(message, 'info');
      }
    }
  }
};

module.exports = logger;
