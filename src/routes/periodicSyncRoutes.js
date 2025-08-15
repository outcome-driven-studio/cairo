const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const { getInstance } = require("../services/periodicSyncService");

class PeriodicSyncRoutes {
  constructor() {
    this.periodicSyncService = getInstance();
    this.setupRoutes = this.setupRoutes.bind(this);
  }

  /**
   * Start periodic sync
   */
  async startPeriodicSync(req, res) {
    try {
      await this.periodicSyncService.start();

      res.json({
        success: true,
        message: `Periodic sync started (every ${this.periodicSyncService.syncInterval} hours)`,
        nextSyncTime: this.periodicSyncService.getNextSyncTime(),
      });
    } catch (error) {
      logger.error("Failed to start periodic sync:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Stop periodic sync
   */
  async stopPeriodicSync(req, res) {
    try {
      this.periodicSyncService.stop();

      res.json({
        success: true,
        message: "Periodic sync stopped",
      });
    } catch (error) {
      logger.error("Failed to stop periodic sync:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get periodic sync status with next sync times
   */
  async getPeriodicSyncStatus(req, res) {
    try {
      const stats = this.periodicSyncService.getStats();

      // Calculate next behavior sync time (every 4 hours)
      const syncInterval = parseInt(process.env.SYNC_INTERVAL_HOURS || "4");
      const nextBehaviorSync = stats.lastSyncTime
        ? new Date(
            new Date(stats.lastSyncTime).getTime() +
              syncInterval * 60 * 60 * 1000
          )
        : new Date(Date.now() + syncInterval * 60 * 60 * 1000);

      // Calculate next ICP sync time (weekly)
      const nextICPSync = this.getNextICPSyncTime();

      res.json({
        success: true,
        status: stats.isRunning ? "running" : "stopped",
        nextSyncTimes: {
          behaviorSync: {
            next: nextBehaviorSync.toISOString(),
            interval: `Every ${syncInterval} hours`,
            enabled: process.env.USE_PERIODIC_SYNC === "true",
          },
          icpSync: {
            next: nextICPSync ? nextICPSync.toISOString() : null,
            schedule: this.getICPScheduleDescription(),
            enabled: process.env.ENABLE_WEEKLY_ICP_SCORING === "true",
          },
        },
        stats,
      });
    } catch (error) {
      logger.error("Failed to get periodic sync status:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get next ICP sync time
   */
  getNextICPSyncTime() {
    if (process.env.ENABLE_WEEKLY_ICP_SCORING !== "true") {
      return null;
    }

    const icpDay = parseInt(process.env.ICP_SCORING_DAY || "0"); // 0 = Sunday
    const icpHour = parseInt(process.env.ICP_SCORING_HOUR || "2"); // 2 AM

    const now = new Date();
    const nextSync = new Date();

    // Set to next occurrence of the specified day and hour
    nextSync.setHours(icpHour, 0, 0, 0);

    // Calculate days until next occurrence
    const currentDay = now.getDay();
    let daysUntilNext = icpDay - currentDay;

    // If it's the same day but time has passed, or day is in the past, add 7 days
    if (
      daysUntilNext < 0 ||
      (daysUntilNext === 0 && now.getHours() >= icpHour)
    ) {
      daysUntilNext += 7;
    }

    nextSync.setDate(now.getDate() + daysUntilNext);

    return nextSync;
  }

  /**
   * Get ICP schedule description
   */
  getICPScheduleDescription() {
    const icpDay = parseInt(process.env.ICP_SCORING_DAY || "0");
    const icpHour = parseInt(process.env.ICP_SCORING_HOUR || "2");
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    return `Every ${days[icpDay]} at ${icpHour}:00`;
  }

  /**
   * Force run sync now (manual trigger)
   * Supports different sync types: full, behavior, icp
   */
  async forceSyncNow(req, res) {
    try {
      const { type = "full" } = req.body || {};

      let message = "";

      // Return immediately and run in background
      switch (type) {
        case "behavior":
          message = "Behavior scoring started in background (no API calls)";
          res.json({
            success: true,
            message,
            note: "This will calculate behavior scores for all users with events",
          });

          // Run behavior scoring only
          this.periodicSyncService
            .calculateBehaviorScores()
            .then((result) => {
              logger.info(
                `Manual behavior scoring completed: ${result.scored} users`
              );
            })
            .catch((error) => {
              logger.error("Manual behavior scoring failed:", error);
            });
          break;

        case "icp":
          message =
            "ICP scoring started in background (uses AI-first enrichment)";
          res.json({
            success: true,
            message,
            note: "This will enrich and score users with ICP score = 0",
            info: "Uses cost-optimized strategy: AI ($0.005) → Hunter ($0.08) → Apollo ($0.15) per enrichment",
          });

          // Run ICP scoring only
          this.periodicSyncService
            .calculateICPScores()
            .then((result) => {
              logger.info(
                `Manual ICP scoring completed: ${result.scored} users`
              );
            })
            .catch((error) => {
              logger.error("Manual ICP scoring failed:", error);
            });
          break;

        case "full":
        default:
          message = "Full sync started in background";
          res.json({
            success: true,
            message,
            note: "Running complete sync pipeline: import, sync, behavior scoring, Attio update",
          });

          // Run full sync
          this.periodicSyncService
            .forceSync()
            .then((result) => {
              logger.info("Manual full sync completed", result);
            })
            .catch((error) => {
              logger.error("Manual full sync failed:", error);
            });
          break;
      }
    } catch (error) {
      logger.error("Failed to trigger manual sync:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get sync history
   */
  async getSyncHistory(req, res) {
    try {
      const { limit = 10 } = req.query;
      const stats = this.periodicSyncService.getStats();

      const history = stats.syncHistory.slice(-limit);

      res.json({
        success: true,
        history,
        totalSyncs: stats.totalSyncs,
        lastSyncTime: stats.lastSyncTime,
      });
    } catch (error) {
      logger.error("Failed to get sync history:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Update sync configuration
   */
  async updateSyncConfig(req, res) {
    try {
      const {
        syncInterval,
        enableAttio,
        enableLemlist,
        enableSmartlead,
        enableScoring,
        enableAttioSync,
      } = req.body;

      // Update environment variables (for current session)
      if (syncInterval !== undefined) {
        process.env.SYNC_INTERVAL_HOURS = syncInterval;
        this.periodicSyncService.syncInterval = syncInterval;
      }

      if (enableAttio !== undefined) {
        process.env.SYNC_FROM_ATTIO = enableAttio ? "true" : "false";
      }

      if (enableLemlist !== undefined) {
        process.env.SYNC_FROM_LEMLIST = enableLemlist ? "true" : "false";
      }

      if (enableSmartlead !== undefined) {
        process.env.SYNC_FROM_SMARTLEAD = enableSmartlead ? "true" : "false";
      }

      if (enableScoring !== undefined) {
        process.env.CALCULATE_SCORES = enableScoring ? "true" : "false";
      }

      if (enableAttioSync !== undefined) {
        process.env.SYNC_SCORES_TO_ATTIO = enableAttioSync ? "true" : "false";
      }

      // Restart periodic sync if running
      if (this.periodicSyncService.isRunning) {
        this.periodicSyncService.stop();
        await this.periodicSyncService.start();
      }

      res.json({
        success: true,
        message: "Sync configuration updated",
        config: {
          syncInterval: this.periodicSyncService.syncInterval,
          enableAttio: process.env.SYNC_FROM_ATTIO !== "false",
          enableLemlist: process.env.SYNC_FROM_LEMLIST !== "false",
          enableSmartlead: process.env.SYNC_FROM_SMARTLEAD !== "false",
          enableScoring: process.env.CALCULATE_SCORES !== "false",
          enableAttioSync: process.env.SYNC_SCORES_TO_ATTIO !== "false",
        },
      });
    } catch (error) {
      logger.error("Failed to update sync config:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get last sync times for all sources
   */
  async getLastSyncTimes(req, res) {
    try {
      const syncState = require("../utils/syncState");

      const sources = [
        "attio_import",
        "lemlist",
        "smartlead",
        "attio_score_sync",
      ];
      const lastSyncTimes = {};

      for (const source of sources) {
        const lastSync = await syncState.getLastChecked(source);
        lastSyncTimes[source] = lastSync ? lastSync.toISOString() : null;
      }

      res.json({
        success: true,
        lastSyncTimes,
        nextSyncTime: this.periodicSyncService.getNextSyncTime(),
      });
    } catch (error) {
      logger.error("Failed to get last sync times:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get sync schedules and next run times
   */
  async getSyncSchedules(req, res) {
    try {
      const behaviorEnabled = process.env.USE_PERIODIC_SYNC === "true";
      const icpEnabled = process.env.ENABLE_WEEKLY_ICP_SCORING === "true";
      const syncInterval = parseInt(process.env.SYNC_INTERVAL_HOURS || "4");

      // Get last sync times
      const syncState = require("../utils/syncState");
      const lastBehaviorSync = await syncState.getLastChecked("periodic_sync");
      const lastICPSync = await syncState.getLastChecked("icp_scoring");

      // Calculate next times
      const nextBehaviorSync = lastBehaviorSync
        ? new Date(lastBehaviorSync.getTime() + syncInterval * 60 * 60 * 1000)
        : new Date(Date.now() + syncInterval * 60 * 60 * 1000);

      const nextICPSync = this.getNextICPSyncTime();

      res.json({
        success: true,
        schedules: {
          behaviorSync: {
            enabled: behaviorEnabled,
            interval: `Every ${syncInterval} hours`,
            lastRun: lastBehaviorSync
              ? lastBehaviorSync.toISOString()
              : "Never",
            nextRun: behaviorEnabled
              ? nextBehaviorSync.toISOString()
              : "Disabled",
            timeUntilNext: behaviorEnabled
              ? this.formatTimeUntil(nextBehaviorSync)
              : "N/A",
          },
          icpSync: {
            enabled: icpEnabled,
            schedule: this.getICPScheduleDescription(),
            lastRun: lastICPSync ? lastICPSync.toISOString() : "Never",
            nextRun:
              icpEnabled && nextICPSync
                ? nextICPSync.toISOString()
                : "Disabled",
            timeUntilNext:
              icpEnabled && nextICPSync
                ? this.formatTimeUntil(nextICPSync)
                : "N/A",
          },
          attioSyncFilter: {
            enabled: true,
            minBehaviorScore: parseInt(
              process.env.MIN_BEHAVIOR_SCORE_FOR_ATTIO || "1"
            ),
            description: `Only users with behavior_score >= ${
              process.env.MIN_BEHAVIOR_SCORE_FOR_ATTIO || "1"
            } sync to Attio`,
          },
        },
      });
    } catch (error) {
      logger.error("Failed to get sync schedules:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Format time until next sync
   */
  formatTimeUntil(targetDate) {
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) return "Now";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h ${minutes}m`;
    }

    return `${hours}h ${minutes}m`;
  }

  setupRoutes() {
    // Control endpoints
    router.post("/start", this.startPeriodicSync.bind(this));
    router.post("/stop", this.stopPeriodicSync.bind(this));
    router.get("/status", this.getPeriodicSyncStatus.bind(this));

    // Manual trigger
    router.post("/sync-now", this.forceSyncNow.bind(this));

    // Monitoring
    router.get("/history", this.getSyncHistory.bind(this));
    router.get("/last-sync-times", this.getLastSyncTimes.bind(this));
    router.get("/schedules", this.getSyncSchedules.bind(this));

    // Configuration
    router.put("/config", this.updateSyncConfig.bind(this));

    return router;
  }
}

module.exports = PeriodicSyncRoutes;
