/**
 * Full Sync Job Service
 *
 * Manages background job execution for full sync operations,
 * integrating with the existing periodic sync infrastructure.
 */

const FullSyncService = require("./fullSyncService");
const { FullSyncConfig, SYNC_MODES } = require("../config/fullSyncConfig");
const logger = require("../utils/logger");

/**
 * Full Sync Job Service Class
 */
class FullSyncJobService {
  constructor() {
    this.fullSyncService = new FullSyncService();
    this.activeJobs = new Map(); // In production, use Redis or database
    this.jobHistory = new Map(); // Store completed jobs
    this.maxHistorySize = 100; // Keep last 100 jobs
  }

  /**
   * Execute full sync as a background job
   * @param {string} jobId - Unique job identifier
   * @param {object} config - Sync configuration
   * @param {object} options - Job options (callback URL, etc.)
   * @returns {Promise<object>} Job execution result
   */
  async executeFullSyncJob(jobId, config, options = {}) {
    const job = this.createJobRecord(jobId, config, options);

    try {
      // Mark job as running
      job.status = "running";
      job.startedAt = new Date();
      this.activeJobs.set(jobId, job);

      logger.info("Starting full sync background job", {
        jobId: jobId,
        config: job.config,
      });

      // Execute the full sync
      const result = await this.fullSyncService.executeFullSync(config);

      // Mark job as completed
      job.status = "completed";
      job.completedAt = new Date();
      job.duration = (job.completedAt - job.startedAt) / 1000;
      job.result = result;

      this.completeJob(jobId, job);

      logger.info("Full sync background job completed", {
        jobId: jobId,
        duration: job.duration + "s",
        success: result.success,
        totalUsers: result.summary?.totalUsers || 0,
        totalEvents: result.summary?.totalEvents || 0,
      });

      // Send callback notification if configured
      if (options.callbackUrl) {
        await this.sendCallback(options.callbackUrl, {
          jobId: jobId,
          status: "completed",
          result: result,
          duration: job.duration,
        });
      }

      return job;
    } catch (error) {
      // Mark job as failed
      job.status = "failed";
      job.completedAt = new Date();
      job.duration = job.startedAt
        ? (job.completedAt - job.startedAt) / 1000
        : 0;
      job.error = {
        message: error.message,
        stack: error.stack,
      };

      this.completeJob(jobId, job);

      logger.error("Full sync background job failed", {
        jobId: jobId,
        duration: job.duration + "s",
        error: error.message,
      });

      // Send error callback if configured
      if (options.callbackUrl) {
        await this.sendCallback(options.callbackUrl, {
          jobId: jobId,
          status: "failed",
          error: error.message,
          duration: job.duration,
        });
      }

      throw error;
    }
  }

  /**
   * Create a job record
   * @private
   */
  createJobRecord(jobId, config, options) {
    const syncConfig =
      config instanceof FullSyncConfig ? config : new FullSyncConfig(config);

    return {
      id: jobId,
      status: "queued",
      config: syncConfig.getSummary(),
      options: options,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      duration: null,
      result: null,
      error: null,
      progress: {
        stage: "queued",
        platforms: {},
        totalProgress: 0,
      },
    };
  }

  /**
   * Complete a job and move to history
   * @private
   */
  completeJob(jobId, job) {
    // Move from active to history
    this.activeJobs.delete(jobId);
    this.jobHistory.set(jobId, job);

    // Trim history if needed
    if (this.jobHistory.size > this.maxHistorySize) {
      const oldestKey = this.jobHistory.keys().next().value;
      this.jobHistory.delete(oldestKey);
    }
  }

  /**
   * Get job status
   * @param {string} jobId - Job identifier
   * @returns {object|null} Job status or null if not found
   */
  getJobStatus(jobId) {
    return this.activeJobs.get(jobId) || this.jobHistory.get(jobId) || null;
  }

  /**
   * Get all active jobs
   * @returns {Array} Array of active job statuses
   */
  getActiveJobs() {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Get job history
   * @param {number} limit - Maximum number of jobs to return
   * @returns {Array} Array of completed job statuses
   */
  getJobHistory(limit = 20) {
    const jobs = Array.from(this.jobHistory.values());
    return jobs.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job identifier
   * @returns {boolean} True if job was cancelled, false if not found or already completed
   */
  cancelJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job || job.status === "completed" || job.status === "failed") {
      return false;
    }

    job.status = "cancelled";
    job.completedAt = new Date();
    job.duration = job.startedAt ? (job.completedAt - job.startedAt) / 1000 : 0;

    this.completeJob(jobId, job);

    logger.info("Full sync job cancelled", {
      jobId: jobId,
      duration: job.duration + "s",
    });

    return true;
  }

  /**
   * Send callback notification
   * @private
   */
  async sendCallback(callbackUrl, payload) {
    try {
      const axios = require("axios");
      await axios.post(callbackUrl, payload, {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Cairo-FullSync/1.0",
        },
      });

      logger.info("Callback sent successfully", {
        callbackUrl: callbackUrl,
        jobId: payload.jobId,
        status: payload.status,
      });
    } catch (error) {
      logger.error("Callback failed", {
        callbackUrl: callbackUrl,
        jobId: payload.jobId,
        error: error.message,
      });

      // Don't throw - callback failures shouldn't fail the job
    }
  }

  /**
   * Clean up old jobs
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanupOldJobs(maxAge = 24 * 60 * 60 * 1000) {
    // Default: 24 hours
    const cutoff = new Date(Date.now() - maxAge);
    const toDelete = [];

    for (const [jobId, job] of this.jobHistory) {
      if (job.completedAt && job.completedAt < cutoff) {
        toDelete.push(jobId);
      }
    }

    for (const jobId of toDelete) {
      this.jobHistory.delete(jobId);
    }

    if (toDelete.length > 0) {
      logger.info("Cleaned up old jobs", {
        count: toDelete.length,
        cutoffDate: cutoff,
      });
    }
  }

  /**
   * Get job statistics
   * @returns {object} Statistics about jobs
   */
  getJobStats() {
    const active = this.getActiveJobs();
    const history = this.getJobHistory(100);

    const stats = {
      active: {
        total: active.length,
        queued: active.filter((job) => job.status === "queued").length,
        running: active.filter((job) => job.status === "running").length,
      },
      completed: {
        total: history.filter((job) => job.status === "completed").length,
        failed: history.filter((job) => job.status === "failed").length,
        cancelled: history.filter((job) => job.status === "cancelled").length,
      },
      performance: {
        averageDuration: 0,
        successRate: 0,
      },
    };

    // Calculate performance metrics
    const completedJobs = history.filter(
      (job) => job.status === "completed" && job.duration !== null
    );

    if (completedJobs.length > 0) {
      stats.performance.averageDuration =
        completedJobs.reduce((sum, job) => sum + job.duration, 0) /
        completedJobs.length;
    }

    const totalCompleted = stats.completed.total + stats.completed.failed;
    if (totalCompleted > 0) {
      stats.performance.successRate =
        (stats.completed.total / totalCompleted) * 100;
    }

    return stats;
  }

  /**
   * Integration with periodic sync service
   * Schedule full sync jobs based on configuration
   */
  async schedulePeriodicFullSync(config) {
    const jobId = `periodic-full-sync-${Date.now()}`;

    logger.info("Scheduling periodic full sync", {
      jobId: jobId,
      config: config,
    });

    // Execute in background without blocking
    setImmediate(async () => {
      try {
        await this.executeFullSyncJob(jobId, config, {
          source: "periodic",
          automated: true,
        });
      } catch (error) {
        logger.error("Periodic full sync failed", {
          jobId: jobId,
          error: error.message,
        });
      }
    });

    return jobId;
  }

  /**
   * Create a scheduled full sync with cron-like functionality
   */
  async createScheduledSync(name, config, cronExpression) {
    // TODO: Integrate with existing cron system
    // This would use your existing cron.js infrastructure

    logger.info("Creating scheduled full sync", {
      name: name,
      config: config,
      cronExpression: cronExpression,
    });

    return {
      name: name,
      config: config,
      schedule: cronExpression,
      nextRun: this.calculateNextRun(cronExpression),
      active: true,
    };
  }

  /**
   * Calculate next run time for cron expression
   * @private
   */
  calculateNextRun(cronExpression) {
    // Simple implementation - in production use a proper cron parser
    const now = new Date();
    return new Date(now.getTime() + 60 * 60 * 1000); // Next hour
  }
}

module.exports = FullSyncJobService;
