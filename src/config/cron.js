const cron = require("node-cron");
const axios = require("axios");
const logger = require("../utils/logger");
const monitoring = require("../utils/monitoring");

class CronManager {
  constructor(baseUrl = "http://localhost:3000") {
    this.baseUrl = baseUrl;
    // Create axios instance with better timeout and retry configuration
    this.axiosInstance = axios.create({
      timeout: 180000, // 3 minutes timeout for sync operations
      headers: {
        "User-Agent": "SuperSync-Cron/1.0",
      },
    });

    // Add response interceptor for better error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.code === "ECONNABORTED") {
          error.message = `Request timed out after ${error.config.timeout}ms`;
        }
        return Promise.reject(error);
      }
    );
  }

  start() {
    // Skip cron jobs if disabled or if periodic sync is enabled
    if (
      process.env.DISABLE_CRON_JOBS === "true" ||
      process.env.USE_PERIODIC_SYNC === "true"
    ) {
      logger.info(
        process.env.USE_PERIODIC_SYNC === "true"
          ? "Legacy cron jobs disabled - using PeriodicSyncService instead"
          : "Cron jobs disabled by DISABLE_CRON_JOBS environment variable"
      );
      return;
    }

    // NOTE: These are LEGACY cron jobs running every 10-15 minutes
    // For new deployments, use PeriodicSyncService with 4-hour intervals instead
    // Set USE_PERIODIC_SYNC=true to use the new system

    // NOTE: All cron jobs now track ALL events including duplicates
    // This means multiple opens/clicks from the same email will be tracked as separate events
    // See ALL_EVENTS_TRACKING_GUIDE.md for details

    // Run Lemlist delta sync every 10 minutes with better error handling
    cron.schedule("*/10 * * * *", async () => {
      const platform = "lemlist";
      const syncType = "delta";

      try {
        logger.info("Starting scheduled Lemlist delta sync");
        monitoring.trackSyncStart(platform, syncType);

        const response = await this.axiosInstance.post(
          `${this.baseUrl}/sync/lemlist-delta`
        );

        const stats = response.data;
        monitoring.trackSyncSuccess(platform, syncType, stats);
        logger.info("Scheduled Lemlist delta sync completed", response.data);
      } catch (error) {
        monitoring.trackSyncFailure(platform, syncType, error);

        // Enhanced error logging with more context
        if (error.response) {
          logger.error(
            `Scheduled Lemlist delta sync failed: ${error.response.status} ${error.response.statusText}`,
            {
              url: error.config?.url,
              timeout: error.config?.timeout,
              data: error.response.data,
            }
          );
        } else if (error.request) {
          logger.error(
            "Scheduled Lemlist delta sync failed: No response from server",
            {
              url: error.config?.url,
              timeout: error.config?.timeout,
              code: error.code,
            }
          );
        } else {
          logger.error("Scheduled Lemlist delta sync failed:", {
            message: error.message,
            code: error.code,
          });
        }
      }
    });

    // Run Smartlead delta sync every 15 minutes with better error handling
    cron.schedule("*/15 * * * *", async () => {
      const platform = "smartlead";
      const syncType = "delta";

      try {
        logger.info("Starting scheduled Smartlead delta sync");
        monitoring.trackSyncStart(platform, syncType);

        const response = await this.axiosInstance.post(
          `${this.baseUrl}/sync/smartlead-delta`
        );

        const stats = response.data;
        monitoring.trackSyncSuccess(platform, syncType, stats);
        logger.info("Scheduled Smartlead delta sync completed", response.data);
      } catch (error) {
        monitoring.trackSyncFailure(platform, syncType, error);

        // Enhanced error logging with more context
        if (error.response) {
          logger.error(
            `Scheduled Smartlead delta sync failed: ${error.response.status} ${error.response.statusText}`,
            {
              url: error.config?.url,
              timeout: error.config?.timeout,
              data: error.response.data,
            }
          );
        } else if (error.request) {
          logger.error(
            "Scheduled Smartlead delta sync failed: No response from server",
            {
              url: error.config?.url,
              timeout: error.config?.timeout,
              code: error.code,
            }
          );
        } else {
          logger.error("Scheduled Smartlead delta sync failed:", {
            message: error.message,
            code: error.code,
          });
        }
      }
    });

    // Weekly ICP scoring job - runs once per week to enrich and score new/unscored leads
    if (process.env.ENABLE_WEEKLY_ICP_SCORING === "true") {
      const icpDay = parseInt(process.env.ICP_SCORING_DAY || "0"); // Default Sunday
      const icpHour = parseInt(process.env.ICP_SCORING_HOUR || "2"); // Default 2 AM

      // Cron format: minute hour day-of-month month day-of-week
      const icpSchedule = `0 ${icpHour} * * ${icpDay}`;

      cron.schedule(icpSchedule, async () => {
        logger.info("Starting weekly ICP scoring job");

        try {
          // Use periodic sync service for ICP scoring
          const { getInstance } = require("../services/periodicSyncService");
          const periodicSync = getInstance();

          const result = await periodicSync.calculateICPScores();

          if (result.success) {
            logger.info(
              `Weekly ICP scoring completed: ${result.scored} users scored`
            );
            monitoring.sendSlackAlert({
              type: "info",
              title: "📊 Weekly ICP Scoring Complete",
              message: `Successfully calculated ICP scores for ${result.scored} users`,
              context: {
                scored: result.scored,
                schedule: `Every ${
                  [
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ][icpDay]
                } at ${icpHour}:00`,
              },
            });
          } else {
            logger.error("Weekly ICP scoring failed:", result.error);
          }
        } catch (error) {
          logger.error("Weekly ICP scoring job error:", error);
          monitoring.trackSyncFailure("icp_scoring", "weekly", error);
        }
      });

      logger.info(
        `Weekly ICP scoring job scheduled: Every ${
          [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ][icpDay]
        } at ${icpHour}:00`
      );
    }

    logger.info(
      "Cron jobs initialized with 3-minute timeouts (Lemlist: every 10 min, Smartlead: every 15 min)"
    );

    // Send notification that cron jobs started
    monitoring.sendSlackAlert({
      type: "info",
      title: "⏰ Cron Jobs Started",
      message:
        "Automatic sync schedules activated with enhanced error handling and proper delta tracking",
      context: {
        lemlist_schedule: "every 10 minutes",
        smartlead_schedule: "every 15 minutes",
        timeout: "3 minutes per operation",
        improvements: "Both platforms now use database timestamp tracking",
      },
    });
  }
}

module.exports = CronManager;
