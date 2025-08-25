/**
 * Full Sync API Routes
 *
 * REST endpoints for triggering and managing full synchronization operations
 * with comprehensive parameter validation and background job support.
 */

const express = require("express");
const FullSyncService = require("../services/fullSyncService");
const FullSyncJobService = require("../services/fullSyncJobService");
const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../config/fullSyncConfig");
const logger = require("../utils/logger");

class FullSyncRoutes {
  constructor() {
    this.fullSyncService = new FullSyncService();
    this.jobService = new FullSyncJobService();

    // Simple in-memory job queue (replace with Redis/database in production)
    this.jobQueue = new Map();

    logger.info("FullSyncRoutes initialized");
  }

  /**
   * Simple validation for sync requests
   */
  validateSyncRequest(req, res, next) {
    const errors = [];

    // Validate mode
    if (!req.body.mode || !Object.values(SYNC_MODES).includes(req.body.mode)) {
      errors.push({
        field: "mode",
        message: `Mode must be one of: ${Object.values(SYNC_MODES).join(", ")}`,
      });
    }

    // Validate platforms if provided
    if (req.body.platforms) {
      const platforms = Array.isArray(req.body.platforms)
        ? req.body.platforms
        : [req.body.platforms];
      const validPlatforms = Object.values(PLATFORMS);
      const invalidPlatforms = platforms.filter(
        (p) => !validPlatforms.includes(p)
      );
      if (invalidPlatforms.length > 0) {
        errors.push({
          field: "platforms",
          message: `Invalid platforms: ${invalidPlatforms.join(", ")}`,
        });
      }
    }

    // Validate date range for DATE_RANGE mode
    if (req.body.mode === SYNC_MODES.DATE_RANGE) {
      if (
        !req.body.dateRange ||
        !req.body.dateRange.start ||
        !req.body.dateRange.end
      ) {
        errors.push({
          field: "dateRange",
          message:
            "DATE_RANGE mode requires dateRange with start and end dates",
        });
      }
    }

    // Validate reset date for RESET_FROM_DATE mode
    if (req.body.mode === SYNC_MODES.RESET_FROM_DATE && !req.body.resetDate) {
      errors.push({
        field: "resetDate",
        message: "RESET_FROM_DATE mode requires resetDate",
      });
    }

    // Validate batch size if provided
    if (
      req.body.batchSize &&
      (req.body.batchSize < 1 || req.body.batchSize > 1000)
    ) {
      errors.push({
        field: "batchSize",
        message: "Batch size must be between 1 and 1000",
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      });
    }

    next();
  }

  /**
   * Middleware for error handling
   */
  handleAsyncErrors(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * POST /execute - Execute a full synchronization operation
   */
  async executeFullSync(req, res) {
    const startTime = new Date();

    logger.info("Full sync execution requested", {
      mode: req.body.mode,
      platforms: req.body.platforms,
      namespaces: req.body.namespaces,
      userAgent: req.get("User-Agent"),
      ip: req.ip,
    });

    try {
      // Create configuration from request body
      const config = new FullSyncConfig(req.body);

      // Execute the full sync
      const result = await this.fullSyncService.executeFullSync(config);

      // Log the completion
      const duration = (new Date() - startTime) / 1000;
      logger.info("Full sync execution completed", {
        success: result.success,
        duration: duration + "s",
        totalUsers: result.summary.totalUsers,
        totalEvents: result.summary.totalEvents,
        totalErrors: result.summary.totalErrors,
      });

      // Return the results
      res.json({
        success: true,
        data: result,
        meta: {
          apiVersion: "1.0",
          requestTime: startTime,
          responseTime: new Date(),
          duration: duration,
        },
      });
    } catch (error) {
      const duration = (new Date() - startTime) / 1000;
      logger.error("Full sync execution failed", {
        error: error.message,
        stack: error.stack,
        duration: duration + "s",
      });

      res.status(500).json({
        success: false,
        error: "Full sync execution failed",
        message: error.message,
        meta: {
          apiVersion: "1.0",
          requestTime: startTime,
          responseTime: new Date(),
          duration: duration,
        },
      });
    }
  }

  /**
   * POST /execute-async - Execute a full sync operation asynchronously
   */
  async executeFullSyncAsync(req, res) {
    logger.info("Async full sync requested", {
      mode: req.body.mode,
      platforms: req.body.platforms,
      callbackUrl: req.body.callbackUrl,
    });

    try {
      // Create configuration from request body
      const config = new FullSyncConfig(req.body);

      // Generate a job ID for tracking
      const jobId = `full-sync-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Queue the background job
      const job = await this.queueFullSyncJob(
        jobId,
        config,
        req.body.callbackUrl
      );

      res.json({
        success: true,
        data: {
          jobId: jobId,
          status: "queued",
          config: config.getSummary(),
          estimatedDuration: this.estimateJobDuration(config),
          statusUrl: `/api/full-sync/status/${jobId}`,
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to queue async full sync", {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        error: "Failed to queue full sync job",
        message: error.message,
      });
    }
  }

  /**
   * GET /status/:jobId - Get the status of an asynchronous full sync job
   */
  async getJobStatus(req, res) {
    const { jobId } = req.params;

    try {
      const jobStatus = this.jobService.getJobStatus(jobId);

      if (!jobStatus) {
        return res.status(404).json({
          success: false,
          error: "Job not found",
          message: `No job found with ID: ${jobId}`,
        });
      }

      res.json({
        success: true,
        data: jobStatus,
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to get job status", {
        jobId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Failed to get job status",
        message: error.message,
      });
    }
  }

  /**
   * GET /health - Get system health and sync status
   */
  async getHealth(req, res) {
    try {
      const status = await this.fullSyncService.getSyncStatus();

      res.json({
        success: true,
        data: {
          status: "healthy",
          timestamp: new Date(),
          systemHealth: status.systemHealth,
          rateLimiters: Object.entries(status.rateLimiters).reduce(
            (acc, [name, limiter]) => {
              acc[name] = {
                apiType: limiter.apiType,
                ready: limiter.backoffDelay === 0,
                consecutiveErrors: limiter.consecutiveErrors,
                requestCount: limiter.requestCount,
              };
              return acc;
            },
            {}
          ),
          recentActivity: status.recentActivity,
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Health check failed", {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Health check failed",
        message: error.message,
        data: {
          status: "unhealthy",
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * POST /config/validate - Validate a sync configuration without executing it
   */
  async validateConfig(req, res) {
    try {
      // Try to create the configuration - this will validate it
      const config = new FullSyncConfig(req.body);

      // Get target namespaces to validate they exist
      const targetNamespaces = await this.fullSyncService.getTargetNamespaces(
        config
      );

      res.json({
        success: true,
        data: {
          valid: true,
          config: config.getSummary(),
          targetNamespaces: targetNamespaces,
          estimatedDuration: this.estimateJobDuration(config),
          warnings: this.generateConfigWarnings(config, targetNamespaces),
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        data: {
          valid: false,
          error: error.message,
        },
        error: "Configuration validation failed",
        message: error.message,
      });
    }
  }

  /**
   * GET /namespaces - Get list of available namespaces
   */
  async getNamespaces(req, res) {
    try {
      const { query } = require("../utils/db");
      const result = await query(`
        SELECT 
          namespace,
          active,
          last_smartlead_sync,
          last_lemlist_sync,
          updated_at
        FROM namespaces 
        ORDER BY namespace
      `);

      const namespaces = result.rows.map((row) => ({
        namespace: row.namespace,
        active: row.active,
        lastSmartleadSync: row.last_smartlead_sync,
        lastLemlistSync: row.last_lemlist_sync,
        updatedAt: row.updated_at,
      }));

      res.json({
        success: true,
        data: {
          namespaces,
          total: namespaces.length,
          active: namespaces.filter((ns) => ns.active).length,
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to get namespaces", {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Failed to get namespaces",
        message: error.message,
      });
    }
  }

  /**
   * GET /jobs - Get list of all jobs
   */
  async getJobs(req, res) {
    const limit = parseInt(req.query.limit) || 20;
    const statusFilter = req.query.status || "all";

    try {
      let jobs = [];

      if (statusFilter === "active" || statusFilter === "all") {
        jobs.push(...this.jobService.getActiveJobs());
      }

      if (statusFilter !== "active") {
        const history = this.jobService.getJobHistory(limit);

        if (statusFilter === "all") {
          jobs.push(...history);
        } else {
          jobs.push(...history.filter((job) => job.status === statusFilter));
        }
      }

      // Sort by creation date (newest first)
      jobs.sort((a, b) => b.createdAt - a.createdAt);

      // Apply limit
      if (jobs.length > limit) {
        jobs = jobs.slice(0, limit);
      }

      res.json({
        success: true,
        data: {
          jobs: jobs,
          total: jobs.length,
          stats: this.jobService.getJobStats(),
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to get jobs", {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Failed to get jobs",
        message: error.message,
      });
    }
  }

  /**
   * Helper Functions
   */

  /**
   * Queue a full sync job
   */
  async queueFullSyncJob(jobId, config, callbackUrl) {
    const job = {
      id: jobId,
      config: config.getSummary(),
      callbackUrl,
      status: "queued",
      createdAt: new Date(),
      updatedAt: new Date(),
      result: null,
      error: null,
    };

    // Store job
    this.jobQueue.set(jobId, job);

    // Process the job asynchronously using the job service
    setTimeout(async () => {
      try {
        await this.jobService.executeFullSyncJob(jobId, config, {
          callbackUrl,
        });
      } catch (error) {
        logger.error("Background job execution failed", {
          jobId,
          error: error.message,
        });
      }
    }, 1000);

    return job;
  }

  /**
   * Estimate job duration based on configuration
   */
  estimateJobDuration(config) {
    let estimatedMinutes = 5; // Base time

    // Add time based on platforms
    estimatedMinutes += config.platforms.length * 10;

    // Add time based on sync mode
    switch (config.mode) {
      case SYNC_MODES.FULL_HISTORICAL:
        estimatedMinutes += 30;
        break;
      case SYNC_MODES.DATE_RANGE:
        estimatedMinutes += 15;
        break;
      case SYNC_MODES.RESET_FROM_DATE:
        estimatedMinutes += 20;
        break;
    }

    // Add time based on namespace count
    if (config.namespaces === "all") {
      estimatedMinutes += 10;
    } else {
      estimatedMinutes += config.namespaces.length * 2;
    }

    return {
      estimated: estimatedMinutes,
      unit: "minutes",
      note: "This is an estimate and actual time may vary based on data volume and API response times",
    };
  }

  /**
   * Generate configuration warnings
   */
  generateConfigWarnings(config, targetNamespaces) {
    const warnings = [];

    if (config.mode === SYNC_MODES.FULL_HISTORICAL) {
      warnings.push(
        "Full historical sync may take a long time and consume significant API quota"
      );
    }

    if (targetNamespaces.length === 0) {
      warnings.push(
        "No target namespaces found - sync will not process any data"
      );
    }

    if (targetNamespaces.length > 5) {
      warnings.push(
        `Syncing ${targetNamespaces.length} namespaces may take considerable time`
      );
    }

    if (config.batchSize && config.batchSize > 100) {
      warnings.push("Large batch sizes may cause API rate limit issues");
    }

    return warnings;
  }

  /**
   * Setup and return router with all endpoints
   */
  setupRoutes() {
    const router = express.Router();

    // Routes with validation
    router.post(
      "/execute",
      this.validateSyncRequest.bind(this),
      this.handleAsyncErrors(this.executeFullSync.bind(this))
    );

    router.post(
      "/execute-async",
      this.validateSyncRequest.bind(this),
      this.handleAsyncErrors(this.executeFullSyncAsync.bind(this))
    );

    router.get(
      "/status/:jobId",
      this.handleAsyncErrors(this.getJobStatus.bind(this))
    );

    router.get("/health", this.handleAsyncErrors(this.getHealth.bind(this)));

    router.post(
      "/config/validate",
      this.validateSyncRequest.bind(this),
      this.handleAsyncErrors(this.validateConfig.bind(this))
    );

    router.get(
      "/namespaces",
      this.handleAsyncErrors(this.getNamespaces.bind(this))
    );

    router.get("/jobs", this.handleAsyncErrors(this.getJobs.bind(this)));

    // Error handling middleware
    router.use((error, req, res, next) => {
      logger.error("Full sync API route error", {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
      });

      res.status(500).json({
        success: false,
        error: "Internal server error",
        message:
          process.env.NODE_ENV === "production"
            ? "An error occurred"
            : error.message,
      });
    });

    return router;
  }
}

module.exports = FullSyncRoutes;
