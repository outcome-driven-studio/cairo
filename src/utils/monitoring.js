const sentry = require("./sentry");
const axios = require("axios");
const logger = require("./logger");

class MonitoringService {
  constructor() {
    // Sentry is now initialized in server.js via sentry.js
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    this.alertThresholds = {
      errorRate: 0.1, // 10% error rate threshold
      syncFailures: 3, // Alert after 3 consecutive sync failures
      webhookSilence: 30 * 60 * 1000, // 30 minutes without webhooks
    };
    this.metrics = {
      errors: 0,
      warnings: 0,
      syncFailures: { lemlist: 0, smartlead: 0 },
      lastWebhookTime: { lemlist: null, smartlead: null },
      lastSyncTime: { lemlist: null, smartlead: null },
    };
  }

  // Error tracking and alerting
  async captureError(error, context = {}) {
    this.metrics.errors++;

    // Send to Sentry using the new sentry module
    sentry.captureError(error, context, "error");

    // Check if we should alert to Slack
    const shouldAlert = this.shouldAlertForError(error, context);
    if (shouldAlert) {
      await this.sendSlackAlert({
        type: "error",
        title: "🚨 Critical Error Detected",
        message: error.message,
        context,
        error: error.stack,
      });
    }

    logger.error(`[MONITORING] Error captured: ${error.message}`, { context });
  }

  async captureWarning(message, context = {}) {
    this.metrics.warnings++;

    // Send to Sentry using the new sentry module
    sentry.captureMessage(message, "warning", context);

    logger.warn(`[MONITORING] Warning: ${message}`, { context });
  }

  // Sync monitoring
  async trackSyncStart(platform, syncType = "periodic") {
    logger.info(`[MONITORING] ${platform} ${syncType} sync started`);

    // Add breadcrumb via Sentry module
    if (sentry.Sentry) {
      sentry.Sentry.addBreadcrumb({
        message: `${platform} sync started`,
        category: "sync",
        level: "info",
        data: { platform, syncType, timestamp: new Date().toISOString() },
      });
    }
  }

  async trackSyncSuccess(platform, syncType = "periodic", stats = {}) {
    this.metrics.lastSyncTime[platform] = new Date();
    this.metrics.syncFailures[platform] = 0; // Reset failure count

    logger.info(
      `[MONITORING] ${platform} ${syncType} sync completed successfully`,
      stats
    );

    if (sentry.Sentry) {
      sentry.Sentry.addBreadcrumb({
        message: `${platform} sync completed`,
        category: "sync",
        level: "info",
        data: {
          platform,
          syncType,
          stats,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Alert on significant data volumes
    if (stats.processed > 1000) {
      await this.sendSlackAlert({
        type: "info",
        title: `📊 Large Sync Completed - ${platform}`,
        message: `Processed ${stats.processed} events`,
        context: { platform, stats },
      });
    }
  }

  async trackSyncFailure(platform, syncType = "periodic", error, stats = {}) {
    this.metrics.syncFailures[platform]++;

    logger.error(`[MONITORING] ${platform} ${syncType} sync failed`, {
      error: error.message,
      stats,
    });

    const errorContext = {
      platform,
      syncType,
      failureCount: this.metrics.syncFailures[platform],
      ...stats,
    };

    await this.captureError(error, errorContext);

    // Alert after multiple consecutive failures
    if (
      this.metrics.syncFailures[platform] >= this.alertThresholds.syncFailures
    ) {
      await this.sendSlackAlert({
        type: "critical",
        title: `🔥 Repeated Sync Failures - ${platform}`,
        message: `${this.metrics.syncFailures[platform]} consecutive failures`,
        context: errorContext,
        error: error.message,
      });
    }
  }

  // Webhook monitoring
  async trackWebhookReceived(platform, eventType, payload = {}) {
    this.metrics.lastWebhookTime[platform] = new Date();

    if (sentry.Sentry) {
      sentry.Sentry.addBreadcrumb({
        message: `Webhook received: ${platform} ${eventType}`,
        category: "webhook",
        level: "info",
        data: { platform, eventType, timestamp: new Date().toISOString() },
      });
    }

    logger.debug(`[MONITORING] Webhook received: ${platform} ${eventType}`);
  }

  async trackWebhookError(platform, eventType, error, payload = {}) {
    const context = {
      platform,
      eventType,
      webhookData: JSON.stringify(payload).slice(0, 500), // Limit size
    };

    await this.captureError(error, context);
  }

  // Health monitoring
  async checkWebhookHealth() {
    const now = new Date();
    const alerts = [];

    for (const [platform, lastTime] of Object.entries(
      this.metrics.lastWebhookTime
    )) {
      if (lastTime && now - lastTime > this.alertThresholds.webhookSilence) {
        alerts.push({
          type: "warning",
          title: `⚠️ Webhook Silence - ${platform}`,
          message: `No webhooks received for ${Math.round(
            (now - lastTime) / 60000
          )} minutes`,
          context: { platform, lastWebhookTime: lastTime.toISOString() },
        });
      }
    }

    for (const alert of alerts) {
      await this.sendSlackAlert(alert);
    }

    return alerts.length === 0;
  }

  async checkSyncHealth() {
    const now = new Date();
    const alerts = [];

    // Check if syncs are running on schedule
    for (const [platform, lastTime] of Object.entries(
      this.metrics.lastSyncTime
    )) {
      if (!lastTime) continue;

      const expectedInterval =
        platform === "lemlist" ? 10 * 60 * 1000 : 3 * 60 * 60 * 1000; // 10min vs 3hours
      const timeSinceLastSync = now - lastTime;

      if (timeSinceLastSync > expectedInterval * 2) {
        // Alert if 2x overdue
        alerts.push({
          type: "warning",
          title: `⏰ Sync Overdue - ${platform}`,
          message: `Last sync was ${Math.round(
            timeSinceLastSync / 60000
          )} minutes ago`,
          context: {
            platform,
            lastSyncTime: lastTime.toISOString(),
            expectedInterval,
          },
        });
      }
    }

    for (const alert of alerts) {
      await this.sendSlackAlert(alert);
    }

    return alerts.length === 0;
  }

  // Slack alerting
  async sendSlackAlert({ type, title, message, context = {}, error = null }) {
    // if (!this.slackWebhookUrl) {
    //   logger.warn("SLACK_WEBHOOK_URL not configured. Slack alerts disabled.");
    //   return;
    // }
    // const color = this.getAlertColor(type);
    // const emoji = this.getAlertEmoji(type);
    // const slackPayload = {
    //   username: "SuperSync Monitor",
    //   icon_emoji: ":robot_face:",
    //   attachments: [
    //     {
    //       color,
    //       title: `${emoji} ${title}`,
    //       text: message,
    //       fields: [
    //         {
    //           title: "Environment",
    //           value: process.env.NODE_ENV || "production",
    //           short: true,
    //         },
    //         {
    //           title: "Timestamp",
    //           value: new Date().toISOString(),
    //           short: true,
    //         },
    //         ...Object.entries(context).map(([key, value]) => ({
    //           title: key
    //             .replace(/_/g, " ")
    //             .replace(/\b\w/g, (l) => l.toUpperCase()),
    //           value:
    //             typeof value === "object"
    //               ? JSON.stringify(value)
    //               : String(value),
    //           short: true,
    //         })),
    //       ],
    //       footer: "SuperSync Monitoring",
    //       ts: Math.floor(Date.now() / 1000),
    //     },
    //   ],
    // };
    // // Add error details if present
    // if (error) {
    //   slackPayload.attachments[0].fields.push({
    //     title: "Error Details",
    //     value: `\`\`\`${error.slice(0, 1000)}\`\`\``,
    //     short: false,
    //   });
    // }
    // try {
    //   await axios.post(this.slackWebhookUrl, slackPayload);
    //   logger.info(`[MONITORING] Slack alert sent: ${title}`);
    // } catch (err) {
    //   logger.error(`[MONITORING] Failed to send Slack alert: ${err.message}`);
    // }
  }

  // Alert filtering and throttling
  shouldAlertForError(error, context) {
    // Don't alert for test/development errors
    if (
      process.env.NODE_ENV === "development" ||
      process.env.DISABLE_SLACK_ALERTS === "true"
    ) {
      return false;
    }

    // Alert for critical platforms/operations
    const criticalOperations = ["sync", "webhook", "database", "segment"];
    const isCritical = criticalOperations.some(
      (op) =>
        context.operation?.includes(op) ||
        context.platform ||
        error.message.toLowerCase().includes(op)
    );

    return isCritical;
  }

  getAlertColor(type) {
    const colors = {
      error: "#ff0000", // Red
      critical: "#ff0000", // Red
      warning: "#ffaa00", // Orange
      info: "#00aa00", // Green
    };
    return colors[type] || "#cccccc";
  }

  getAlertEmoji(type) {
    const emojis = {
      error: "🚨",
      critical: "🔥",
      warning: "⚠️",
      info: "ℹ️",
    };
    return emojis[type] || "📢";
  }

  // Health check endpoint data
  getHealthStatus() {
    const now = new Date();
    return {
      status: "healthy",
      timestamp: now.toISOString(),
      uptime: process.uptime(),
      metrics: {
        ...this.metrics,
        lastWebhookAge: Object.fromEntries(
          Object.entries(this.metrics.lastWebhookTime).map(
            ([platform, time]) => [
              platform,
              time ? Math.round((now - time) / 1000) : null,
            ]
          )
        ),
        lastSyncAge: Object.fromEntries(
          Object.entries(this.metrics.lastSyncTime).map(([platform, time]) => [
            platform,
            time ? Math.round((now - time) / 1000) : null,
          ])
        ),
      },
      environment: process.env.NODE_ENV || "production",
      version: require("../../package.json").version,
    };
  }

  // Periodic health checks
  startHealthChecks() {
    // Check webhook health every 15 minutes
    setInterval(() => {
      this.checkWebhookHealth().catch((err) =>
        logger.error("Health check failed:", err)
      );
    }, 15 * 60 * 1000);

    // Check sync health every 30 minutes
    setInterval(() => {
      this.checkSyncHealth().catch((err) =>
        logger.error("Sync health check failed:", err)
      );
    }, 30 * 60 * 1000);

    logger.info("[MONITORING] Health checks started");
  }
}

// Singleton instance
const monitoring = new MonitoringService();

module.exports = monitoring;
