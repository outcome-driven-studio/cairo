const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const logger = require("../utils/logger");
const { query } = require("../utils/db");

class BackgroundJobRoutes {
  constructor() {
    this.runningJobs = new Map();
    this.setupRoutes = this.setupRoutes.bind(this);
  }

  /**
   * Start a background job
   */
  startBackgroundJob(scriptPath, jobName) {
    // Check if job is already running
    if (this.runningJobs.has(jobName)) {
      const existingJob = this.runningJobs.get(jobName);
      if (existingJob.status === "running") {
        return {
          success: false,
          message: `Job ${jobName} is already running`,
          jobId: existingJob.jobId,
          startedAt: existingJob.startedAt,
        };
      }
    }

    const jobId = `${jobName}_${Date.now()}`;

    // Spawn the process without file logging (logs will be in console/stdout)
    const child = spawn("node", [scriptPath], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Log output to console and store in job info
    child.stdout.on("data", (data) => {
      const logEntry = data.toString();
      logger.info(`[${jobName}] ${logEntry}`);

      // Store logs in job info (keep last 200 lines)
      const job = this.runningJobs.get(jobName);
      if (job && job.logs) {
        job.logs.push({
          timestamp: new Date().toISOString(),
          type: "stdout",
          message: logEntry.trim(),
        });
        // Keep only last 200 log entries
        if (job.logs.length > 200) {
          job.logs = job.logs.slice(-200);
        }
      }
    });

    child.stderr.on("data", (data) => {
      const logEntry = data.toString();
      logger.error(`[${jobName}] ${logEntry}`);

      // Store error logs in job info
      const job = this.runningJobs.get(jobName);
      if (job && job.logs) {
        job.logs.push({
          timestamp: new Date().toISOString(),
          type: "stderr",
          message: logEntry.trim(),
        });
        // Keep only last 200 log entries
        if (job.logs.length > 200) {
          job.logs = job.logs.slice(-200);
        }
      }
    });

    const jobInfo = {
      jobId,
      jobName,
      pid: child.pid,
      status: "running",
      startedAt: new Date().toISOString(),
      process: child,
      logs: [], // Add log storage
    };

    // Track job status
    child.on("exit", (code, signal) => {
      const job = this.runningJobs.get(jobName);
      if (job) {
        job.status = code === 0 ? "completed" : "failed";
        job.endedAt = new Date().toISOString();
        job.exitCode = code;
        job.signal = signal;
        delete job.process; // Remove process reference
      }
      logger.info(
        `Background job ${jobName} (${jobId}) finished with code ${code}`
      );
    });

    // Store job info
    this.runningJobs.set(jobName, jobInfo);

    // Unref the child process so it doesn't keep the parent alive
    child.unref();

    return {
      success: true,
      message: `Background job ${jobName} started successfully`,
      jobId,
      pid: child.pid,
      startedAt: jobInfo.startedAt,
    };
  }

  /**
   * Sync users to Attio in background
   */
  async syncUsersBackground(req, res) {
    try {
      const scriptPath = path.join(process.cwd(), "sync-users-only.js");

      const result = this.startBackgroundJob(scriptPath, "sync-users-to-attio");

      if (!result.success) {
        return res.status(409).json(result);
      }

      res.status(202).json({
        success: true,
        message: "User sync to Attio started in background",
        jobId: result.jobId,
        pid: result.pid,
        status:
          "The sync is running in the background and will continue even if you close this connection",
        checkStatus: `/api/jobs/status/sync-users-to-attio`,
        note: "Logs are available in Railway dashboard",
      });
    } catch (error) {
      logger.error("Failed to start user sync:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Sync events to Attio in background
   */
  async syncEventsBackground(req, res) {
    try {
      const scriptPath = path.join(process.cwd(), "sync-events-only.js");

      const result = this.startBackgroundJob(
        scriptPath,
        "sync-events-to-attio"
      );

      if (!result.success) {
        return res.status(409).json(result);
      }

      res.status(202).json({
        success: true,
        message: "Event sync to Attio started in background",
        jobId: result.jobId,
        pid: result.pid,
        status:
          "The sync is running in the background and will continue even if you close this connection",
        checkStatus: `/api/jobs/status/sync-events-to-attio`,
        note: "Logs are available in Railway dashboard",
      });
    } catch (error) {
      logger.error("Failed to start event sync:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Full sync to Attio in background (both users and events)
   */
  async syncFullBackground(req, res) {
    try {
      const scriptPath = path.join(process.cwd(), "sync-to-attio-resilient.js");

      const result = this.startBackgroundJob(scriptPath, "sync-full-to-attio");

      if (!result.success) {
        return res.status(409).json(result);
      }

      res.status(202).json({
        success: true,
        message: "Full sync to Attio (users + events) started in background",
        jobId: result.jobId,
        pid: result.pid,
        status:
          "The sync is running in the background and will continue even if you close this connection",
        checkStatus: `/api/jobs/status/sync-full-to-attio`,
        note: "Logs are available in Railway dashboard",
      });
    } catch (error) {
      logger.error("Failed to start full sync:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Calculate lead scores in background
   */
  async calculateLeadScoresBackground(req, res) {
    try {
      const {
        skipEnrichment = false,
        forceReenrich = false, // Add support for forceReenrich
        maxUsers = null,
        maxEnrichment = 100,
      } = req.body;

      // Build command arguments
      const args = [];
      if (skipEnrichment) args.push("--skip-enrichment");
      if (forceReenrich) args.push("--force-reenrich"); // Add force reenrich flag
      if (maxUsers) args.push("--max-users", maxUsers);
      if (maxEnrichment !== 100) args.push("--max-enrichment", maxEnrichment);

      const scriptPath = path.join(process.cwd(), "sync-lead-scores.js");
      const jobName = "calculate-lead-scores";

      // Check if job is already running
      if (this.runningJobs.has(jobName)) {
        const existingJob = this.runningJobs.get(jobName);
        if (existingJob.status === "running") {
          return res.status(409).json({
            success: false,
            message: `Lead scoring job is already running`,
            jobId: existingJob.jobId,
            startedAt: existingJob.startedAt,
          });
        }
      }

      const jobId = `${jobName}_${Date.now()}`;

      // Spawn the process with arguments
      const child = spawn("node", [scriptPath, ...args], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      // Log output
      const jobInfo = {
        jobId,
        jobName,
        status: "running",
        startedAt: new Date().toISOString(),
        pid: child.pid,
        logs: [],
        options: { skipEnrichment, forceReenrich, maxUsers, maxEnrichment },
      };

      child.stdout.on("data", (data) => {
        const logEntry = data.toString();
        logger.info(`[${jobName}] ${logEntry}`);
        if (jobInfo.logs) {
          jobInfo.logs.push({
            timestamp: new Date().toISOString(),
            type: "stdout",
            message: logEntry.trim(),
          });
          if (jobInfo.logs.length > 200) {
            jobInfo.logs.shift();
          }
        }
      });

      child.stderr.on("data", (data) => {
        const logEntry = data.toString();
        logger.error(`[${jobName}] ${logEntry}`);
        if (jobInfo.logs) {
          jobInfo.logs.push({
            timestamp: new Date().toISOString(),
            type: "stderr",
            message: logEntry.trim(),
          });
          if (jobInfo.logs.length > 200) {
            jobInfo.logs.shift();
          }
        }
      });

      child.on("exit", (code) => {
        const job = this.runningJobs.get(jobName);
        if (job) {
          job.status = code === 0 ? "completed" : "failed";
          job.exitCode = code;
          job.completedAt = new Date().toISOString();
        }
        logger.info(`[${jobName}] Job completed with code ${code}`);
      });

      child.unref();

      this.runningJobs.set(jobName, {
        ...jobInfo,
        process: child,
      });

      res.status(202).json({
        success: true,
        message: "Lead scoring calculation started in background",
        jobId,
        pid: child.pid,
        options: { skipEnrichment, forceReenrich, maxUsers, maxEnrichment },
        checkStatus: `/api/jobs/status/${jobName}`,
        checkLogs: `/api/jobs/logs/${jobName}`,
        note: "The job is running in the background",
      });
    } catch (error) {
      logger.error("Failed to start lead scoring:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Sync lead scores to Attio in background
   */
  async syncScoresToAttioBackground(req, res) {
    try {
      const { maxUsers = null } = req.body;

      const scriptPath = path.join(process.cwd(), "sync-scores-to-attio.js");

      // Build command line arguments
      const args = [];
      if (maxUsers) {
        args.push("--max-users", maxUsers.toString());
      } else {
        args.push("--all");
      }

      const result = this.startBackgroundJob(
        scriptPath,
        "sync-scores-to-attio",
        args
      );

      if (!result.success) {
        return res.status(409).json(result);
      }

      res.status(202).json({
        success: true,
        message: "Lead scores sync to Attio started in background",
        jobId: result.jobId,
        pid: result.pid,
        status: "The sync is running in the background",
        checkStatus: `/api/jobs/status/sync-scores-to-attio`,
        options: { maxUsers: maxUsers || "all" },
        note: "This will update ICP, behavior, and lead scores in Attio",
      });
    } catch (error) {
      logger.error("Failed to start score sync:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Combined scoring and Attio sync in background
   */
  async scoreAndSyncBackground(req, res) {
    try {
      const {
        skipEnrichment = false,
        forceReenrich = false, // Add support for forceReenrich
        maxUsers = null,
        maxEnrichment = 100,
      } = req.body;

      // Build command arguments
      const args = [];
      if (skipEnrichment) args.push("--skip-enrichment");
      if (forceReenrich) args.push("--force-reenrich"); // Add force reenrich flag
      if (maxUsers) args.push("--max-users", maxUsers);
      if (maxEnrichment !== 100) args.push("--max-enrichment", maxEnrichment);

      const scriptPath = path.join(process.cwd(), "score-and-sync-attio-ai.js");
      const jobName = "score-and-sync-attio";

      // Check if job is already running
      if (this.runningJobs.has(jobName)) {
        const existingJob = this.runningJobs.get(jobName);
        if (existingJob.status === "running") {
          return res.status(409).json({
            success: false,
            message: `Score and sync job is already running`,
            jobId: existingJob.jobId,
            startedAt: existingJob.startedAt,
          });
        }
      }

      const jobId = `${jobName}_${Date.now()}`;

      // Spawn the process with arguments
      const child = spawn("node", [scriptPath, ...args], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      // Log output
      const jobInfo = {
        jobId,
        jobName,
        status: "running",
        startedAt: new Date().toISOString(),
        pid: child.pid,
        logs: [],
        options: { skipEnrichment, forceReenrich, maxUsers, maxEnrichment },
      };

      child.stdout.on("data", (data) => {
        const logEntry = data.toString();
        logger.info(`[${jobName}] ${logEntry}`);
        if (jobInfo.logs) {
          jobInfo.logs.push({
            timestamp: new Date().toISOString(),
            type: "stdout",
            message: logEntry.trim(),
          });
          if (jobInfo.logs.length > 200) {
            jobInfo.logs.shift();
          }
        }
      });

      child.stderr.on("data", (data) => {
        const logEntry = data.toString();
        logger.error(`[${jobName}] ${logEntry}`);
        if (jobInfo.logs) {
          jobInfo.logs.push({
            timestamp: new Date().toISOString(),
            type: "stderr",
            message: logEntry.trim(),
          });
          if (jobInfo.logs.length > 200) {
            jobInfo.logs.shift();
          }
        }
      });

      child.on("exit", (code) => {
        const job = this.runningJobs.get(jobName);
        if (job) {
          job.status = code === 0 ? "completed" : "failed";
          job.exitCode = code;
          job.completedAt = new Date().toISOString();
        }
        logger.info(`[${jobName}] Job completed with code ${code}`);
      });

      child.unref();

      this.runningJobs.set(jobName, {
        ...jobInfo,
        process: child,
      });

      res.status(202).json({
        success: true,
        message: "Lead scoring and Attio sync started in background",
        jobId,
        pid: child.pid,
        options: { skipEnrichment, forceReenrich, maxUsers, maxEnrichment },
        checkStatus: `/api/jobs/status/${jobName}`,
        checkLogs: `/api/jobs/logs/${jobName}`,
        note: "This will calculate scores and sync to Attio with ICP, behavior, and lead scores",
      });
    } catch (error) {
      logger.error("Failed to start score and sync:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(req, res) {
    try {
      const { jobName } = req.params;

      const job = this.runningJobs.get(jobName);

      if (!job) {
        // Try to get status from database
        const dbStatus = await this.getDbSyncStatus();
        return res.json({
          success: true,
          jobName,
          status: "unknown",
          message: "No active job found with this name",
          lastKnownSync: dbStatus,
        });
      }

      // Remove process reference from response, but keep logs
      const { process, ...jobInfo } = job;

      // Include recent logs (last 50 entries)
      const recentLogs = jobInfo.logs ? jobInfo.logs.slice(-50) : [];

      res.json({
        success: true,
        ...jobInfo,
        recentLogs,
        totalLogCount: jobInfo.logs ? jobInfo.logs.length : 0,
      });
    } catch (error) {
      logger.error("Failed to get job status:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Master scoring - Complete pipeline for ALL leads
   */
  async masterScoreAllBackground(req, res) {
    try {
      const {
        skipAttioImport = false,
        forceReenrich = true,
        maxEnrichment = 5000,
        dryRun = false,
      } = req.body;

      const scriptPath = path.join(process.cwd(), "master-score-all.js");
      const jobName = "master-score-all";

      // Check if job is already running
      if (this.runningJobs.has(jobName)) {
        const existingJob = this.runningJobs.get(jobName);
        if (existingJob.status === "running") {
          return res.status(409).json({
            success: false,
            message: `Master scoring job is already running`,
            jobId: existingJob.jobId,
            startedAt: existingJob.startedAt,
          });
        }
      }

      // Build command arguments
      const args = [];
      if (skipAttioImport) args.push("--skip-attio-import");
      if (!forceReenrich) args.push("--no-force-reenrich");
      if (maxEnrichment !== 5000) args.push("--max-enrichment", maxEnrichment);
      if (dryRun) args.push("--dry-run");

      const jobId = `${jobName}_${Date.now()}`;

      // Spawn the process
      const child = spawn("node", [scriptPath, ...args], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      // Log output
      const jobInfo = {
        jobId,
        jobName,
        status: "running",
        startedAt: new Date().toISOString(),
        pid: child.pid,
        logs: [],
        options: { skipAttioImport, forceReenrich, maxEnrichment, dryRun },
      };

      child.stdout.on("data", (data) => {
        const logEntry = data.toString();
        logger.info(`[${jobName}] ${logEntry}`);
        if (jobInfo.logs) {
          jobInfo.logs.push({
            timestamp: new Date().toISOString(),
            type: "stdout",
            message: logEntry.trim(),
          });
          if (jobInfo.logs.length > 500) {
            jobInfo.logs.shift();
          }
        }
      });

      child.stderr.on("data", (data) => {
        const logEntry = data.toString();
        logger.error(`[${jobName}] ${logEntry}`);
        if (jobInfo.logs) {
          jobInfo.logs.push({
            timestamp: new Date().toISOString(),
            type: "stderr",
            message: logEntry.trim(),
          });
        }
      });

      child.on("exit", (code) => {
        const job = this.runningJobs.get(jobName);
        if (job) {
          job.status = code === 0 ? "completed" : "failed";
          job.exitCode = code;
          job.completedAt = new Date().toISOString();
        }
        logger.info(`[${jobName}] Job completed with code ${code}`);
      });

      child.unref();

      this.runningJobs.set(jobName, {
        ...jobInfo,
        process: child,
      });

      res.status(202).json({
        success: true,
        message:
          "Master scoring job started - this will process ALL leads completely",
        jobId,
        pid: child.pid,
        options: { skipAttioImport, forceReenrich, maxEnrichment, dryRun },
        checkStatus: `/api/jobs/status/${jobName}`,
        checkLogs: `/api/jobs/logs/${jobName}`,
        note: "This job will: 1) Import from Attio, 2) Enrich ALL with Apollo, 3) Score ALL, 4) Sync ALL to Attio",
      });
    } catch (error) {
      logger.error("Failed to start master scoring:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * List all jobs
   */
  async listJobs(req, res) {
    try {
      const jobs = Array.from(this.runningJobs.entries()).map(([name, job]) => {
        const { process, ...jobInfo } = job;
        return jobInfo;
      });

      const dbStatus = await this.getDbSyncStatus();

      res.json({
        success: true,
        activeJobs: jobs,
        databaseStatus: dbStatus,
      });
    } catch (error) {
      logger.error("Failed to list jobs:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Stop a running job
   */
  async stopJob(req, res) {
    try {
      const { jobName } = req.params;

      const job = this.runningJobs.get(jobName);

      if (!job || job.status !== "running") {
        return res.status(404).json({
          success: false,
          error: "No running job found with this name",
        });
      }

      // Kill the process
      if (job.process && job.process.kill) {
        job.process.kill("SIGTERM");
        job.status = "stopped";
        job.endedAt = new Date().toISOString();

        res.json({
          success: true,
          message: `Job ${jobName} has been stopped`,
          jobId: job.jobId,
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Unable to stop the job",
        });
      }
    } catch (error) {
      logger.error("Failed to stop job:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get job logs
   */
  async getJobLogs(req, res) {
    try {
      const { jobName } = req.params;
      const limit = parseInt(req.query.limit) || 100;

      const job = this.runningJobs.get(jobName);

      if (!job) {
        return res.status(404).json({
          success: false,
          message: `No job found with name: ${jobName}`,
        });
      }

      const logs = job.logs ? job.logs.slice(-limit) : [];

      res.json({
        success: true,
        jobName,
        jobId: job.jobId,
        status: job.status,
        logs,
        totalLogCount: job.logs ? job.logs.length : 0,
        limit,
      });
    } catch (error) {
      logger.error("Failed to get job logs:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get sync status from database
   */
  async getDbSyncStatus() {
    try {
      const stats = await query(`
        SELECT 
          (SELECT COUNT(*) FROM playmaker_user_source) as total_users,
          (SELECT COUNT(*) FROM event_source) as total_events,
          (SELECT COUNT(*) FROM attio_sync_tracking WHERE status = 'synced') as synced_records,
          (SELECT MAX(synced_at) FROM attio_sync_tracking WHERE status = 'synced') as last_sync_time
      `);

      return stats.rows[0];
    } catch (error) {
      logger.error("Failed to get DB sync status:", error);
      return null;
    }
  }

  setupRoutes() {
    const router = express.Router();

    // Background sync endpoints
    router.post("/sync/users-background", this.syncUsersBackground.bind(this));
    router.post(
      "/sync/events-background",
      this.syncEventsBackground.bind(this)
    );
    router.post("/sync/full-background", this.syncFullBackground.bind(this));

    // Lead scoring endpoints
    router.post(
      "/scoring/calculate",
      this.calculateLeadScoresBackground.bind(this)
    );
    router.post(
      "/scoring/sync-to-attio",
      this.syncScoresToAttioBackground.bind(this)
    );
    router.post(
      "/scoring/score-and-sync",
      this.scoreAndSyncBackground.bind(this)
    );
    router.post(
      "/scoring/master-score-all",
      this.masterScoreAllBackground.bind(this)
    );

    // Job management endpoints
    router.get("/jobs", this.listJobs.bind(this));
    router.get("/jobs/status/:jobName", this.getJobStatus.bind(this));
    router.get("/jobs/logs/:jobName", this.getJobLogs.bind(this));
    router.post("/jobs/stop/:jobName", this.stopJob.bind(this));

    return router;
  }
}

module.exports = BackgroundJobRoutes;
