/**
 * Full Sync Job Management Routes
 *
 * Additional endpoints for managing background jobs, scheduling,
 * and administrative operations.
 */

const express = require("express");
const { query, param, validationResult } = require("express-validator");
const FullSyncJobService = require("../services/fullSyncJobService");
const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../config/fullSyncConfig");
const logger = require("../utils/logger");

const router = express.Router();

// Initialize the job service
const jobService = new FullSyncJobService();

/**
 * Middleware for request validation
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: errors.array(),
    });
  }
  next();
};

/**
 * Middleware for error handling
 */
const handleAsyncErrors = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * GET /api/full-sync/jobs
 * Get list of all jobs (active and recent history)
 */
router.get(
  "/jobs",
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),

    query("status")
      .optional()
      .isIn(["active", "completed", "failed", "cancelled", "all"])
      .withMessage(
        "Status must be one of: active, completed, failed, cancelled, all"
      ),
  ],
  handleValidationErrors,
  handleAsyncErrors(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const statusFilter = req.query.status || "all";

    try {
      let jobs = [];

      if (statusFilter === "active" || statusFilter === "all") {
        jobs.push(...jobService.getActiveJobs());
      }

      if (statusFilter !== "active") {
        const history = jobService.getJobHistory(limit);

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
          stats: jobService.getJobStats(),
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
  })
);

/**
 * GET /api/full-sync/jobs/:jobId
 * Get detailed status of a specific job
 */
router.get(
  "/jobs/:jobId",
  [param("jobId").isLength({ min: 1 }).withMessage("Job ID is required")],
  handleValidationErrors,
  handleAsyncErrors(async (req, res) => {
    const { jobId } = req.params;

    try {
      const job = jobService.getJobStatus(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Job not found",
          message: `No job found with ID: ${jobId}`,
        });
      }

      res.json({
        success: true,
        data: {
          job: job,
          logs: await getJobLogs(jobId), // Optional: get job-specific logs
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to get job details", {
        jobId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Failed to get job details",
        message: error.message,
      });
    }
  })
);

/**
 * DELETE /api/full-sync/jobs/:jobId
 * Cancel a running job
 */
router.delete(
  "/jobs/:jobId",
  [param("jobId").isLength({ min: 1 }).withMessage("Job ID is required")],
  handleValidationErrors,
  handleAsyncErrors(async (req, res) => {
    const { jobId } = req.params;

    try {
      const cancelled = jobService.cancelJob(jobId);

      if (!cancelled) {
        return res.status(404).json({
          success: false,
          error: "Cannot cancel job",
          message: "Job not found, already completed, or not cancellable",
        });
      }

      logger.info("Job cancelled via API", {
        jobId: jobId,
        cancelledBy: req.ip,
      });

      res.json({
        success: true,
        data: {
          jobId: jobId,
          status: "cancelled",
          cancelledAt: new Date(),
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to cancel job", {
        jobId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Failed to cancel job",
        message: error.message,
      });
    }
  })
);

/**
 * GET /api/full-sync/stats
 * Get comprehensive statistics about full sync operations
 */
router.get(
  "/stats",
  handleAsyncErrors(async (req, res) => {
    try {
      const stats = jobService.getJobStats();
      const systemStatus = await jobService.fullSyncService.getSyncStatus();

      res.json({
        success: true,
        data: {
          jobs: stats,
          system: {
            rateLimiters: Object.entries(systemStatus.rateLimiters).reduce(
              (acc, [name, limiter]) => {
                acc[name] = {
                  ready: limiter.backoffDelay === 0,
                  consecutiveErrors: limiter.consecutiveErrors,
                  requestCount: limiter.requestCount,
                };
                return acc;
              },
              {}
            ),
            recentActivity: systemStatus.recentActivity,
            health: systemStatus.systemHealth,
          },
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to get stats", {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Failed to get stats",
        message: error.message,
      });
    }
  })
);

/**
 * POST /api/full-sync/maintenance/cleanup
 * Clean up old job records
 */
router.post(
  "/maintenance/cleanup",
  [
    query("maxAge")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Max age must be a positive integer (hours)"),
  ],
  handleValidationErrors,
  handleAsyncErrors(async (req, res) => {
    const maxAgeHours = parseInt(req.query.maxAge) || 24;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    try {
      const beforeCount = jobService.getJobHistory(1000).length;

      jobService.cleanupOldJobs(maxAgeMs);

      const afterCount = jobService.getJobHistory(1000).length;
      const cleaned = beforeCount - afterCount;

      logger.info("Job cleanup completed via API", {
        maxAgeHours: maxAgeHours,
        cleaned: cleaned,
        remaining: afterCount,
      });

      res.json({
        success: true,
        data: {
          maxAgeHours: maxAgeHours,
          jobsCleaned: cleaned,
          remainingJobs: afterCount,
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to cleanup jobs", {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Failed to cleanup jobs",
        message: error.message,
      });
    }
  })
);

/**
 * POST /api/full-sync/templates
 * Save a sync configuration as a reusable template
 */
router.post(
  "/templates",
  handleAsyncErrors(async (req, res) => {
    try {
      const { name, description, config } = req.body;

      if (!name || !config) {
        return res.status(400).json({
          success: false,
          error: "Name and config are required",
        });
      }

      // Validate the configuration
      const syncConfig = new FullSyncConfig(config);

      // Store template (in production, save to database)
      const template = {
        id: `template-${Date.now()}`,
        name: name,
        description: description || "",
        config: syncConfig.getSummary(),
        createdAt: new Date(),
        createdBy: req.ip,
        usageCount: 0,
      };

      // TODO: Save to database
      // For now, store in memory (will be lost on restart)
      if (!global.syncTemplates) {
        global.syncTemplates = new Map();
      }
      global.syncTemplates.set(template.id, template);

      res.json({
        success: true,
        data: {
          template: template,
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to create template", {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Failed to create template",
        message: error.message,
      });
    }
  })
);

/**
 * GET /api/full-sync/templates
 * Get list of saved sync configuration templates
 */
router.get(
  "/templates",
  handleAsyncErrors(async (req, res) => {
    try {
      const templates = global.syncTemplates
        ? Array.from(global.syncTemplates.values())
        : [];

      templates.sort((a, b) => b.createdAt - a.createdAt);

      res.json({
        success: true,
        data: {
          templates: templates,
          total: templates.length,
        },
        meta: {
          apiVersion: "1.0",
          requestTime: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to get templates", {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: "Failed to get templates",
        message: error.message,
      });
    }
  })
);

/**
 * Helper Functions
 */

/**
 * Get job-specific logs (placeholder)
 */
async function getJobLogs(jobId, limit = 50) {
  // TODO: Implement job-specific logging
  // For now, return empty array
  return [];
}

// Error handling middleware
router.use((error, req, res, next) => {
  logger.error("Job API route error", {
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

module.exports = router;
