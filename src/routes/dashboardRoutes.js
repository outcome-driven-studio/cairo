const express = require("express");
const router = express.Router();
const path = require("path");
const { query } = require("../utils/db");
const logger = require("../utils/logger");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

class DashboardRoutes {
  constructor() {
    this.setupRoutes = this.setupRoutes.bind(this);
  }

  // Serve the dashboard HTML
  async serveDashboard(req, res) {
    res.sendFile(path.join(__dirname, "../views/dashboard.html"));
  }

  // Get statistics
  async getStats(req, res) {
    try {
      // Get user count
      const userResult = await query(
        "SELECT COUNT(*) FROM playmaker_user_source WHERE email IS NOT NULL"
      );
      const totalUsers = parseInt(userResult.rows[0].count);

      // Get event count
      const eventResult = await query("SELECT COUNT(*) FROM event_source");
      const totalEvents = parseInt(eventResult.rows[0].count);

      // Get Attio sync stats
      let attioSynced = 0;
      let pendingSync = 0;

      try {
        const syncStats = await query(`
          SELECT 
            (SELECT COUNT(*) FROM attio_sync_tracking WHERE status = 'synced') as synced,
            (SELECT COUNT(*) FROM event_source es 
             JOIN playmaker_user_source us ON us.original_user_id::text = es.user_id 
             WHERE us.email IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM attio_sync_tracking ast 
                 WHERE ast.event_key = es.event_key
               )
            ) as pending
        `);

        if (syncStats.rows[0]) {
          attioSynced = parseInt(syncStats.rows[0].synced || 0);
          pendingSync = parseInt(syncStats.rows[0].pending || 0);
        }
      } catch (error) {
        // Table might not exist yet
        logger.debug("Attio tracking table not found");
      }

      res.json({
        totalUsers,
        totalEvents,
        attioSynced,
        pendingSync,
      });
    } catch (error) {
      logger.error("Failed to get stats:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Run sync operations
  async runSync(req, res) {
    const { type } = req.params;

    try {
      let command;
      let timeout = 300000; // 5 minutes default

      switch (type) {
        case "full-attio":
          command = "node sync-to-attio.js";
          timeout = 600000; // 10 minutes for full sync
          break;
        case "resume-attio":
          command = "node sync-to-attio-resume.js";
          timeout = 600000;
          break;
        case "users-only":
          command = "node sync-users-only.js";
          timeout = 300000; // 5 minutes for users sync
          break;
        case "events-only":
          command = "node sync-events-only.js";
          timeout = 600000;
          break;
        case "lemlist-delta":
          command = "curl -X POST http://localhost:8080/sync/lemlist-delta";
          break;
        case "smartlead-delta":
          command = "curl -X POST http://localhost:8080/sync/smartlead-delta";
          break;
        case "initial-sync":
          command = "curl -X POST http://localhost:8080/sync/initial-sync";
          timeout = 900000; // 15 minutes for initial sync
          break;
        default:
          return res.status(400).json({ error: "Unknown sync type" });
      }

      logger.info(`Running sync command: ${command}`);

      // Run command with timeout
      const { stdout, stderr } = await execPromise(command, { timeout });

      // Parse output if it's JSON
      let result;
      try {
        result = JSON.parse(stdout);
      } catch {
        result = { output: stdout, error: stderr };
      }

      res.json({
        success: true,
        type,
        result,
        message: `${type} completed successfully`,
      });
    } catch (error) {
      logger.error(`Sync ${type} failed:`, error);

      // Check if it's a timeout
      if (error.code === "ETIMEDOUT") {
        res.status(202).json({
          success: false,
          type,
          message:
            "Sync is taking longer than expected. Check logs for progress.",
          inProgress: true,
        });
      } else {
        res.status(500).json({
          success: false,
          type,
          error: error.message,
        });
      }
    }
  }

  // Run diagnostic checks
  async runCheck(req, res) {
    const { type } = req.params;

    try {
      let result;

      switch (type) {
        case "db-check":
          // Check database connection and tables
          const tables = await query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            ORDER BY tablename
          `);

          const counts = {};
          for (const table of tables.rows) {
            const countResult = await query(
              `SELECT COUNT(*) FROM ${table.tablename}`
            );
            counts[table.tablename] = parseInt(countResult.rows[0].count);
          }

          result = {
            connected: true,
            tables: tables.rows.map((t) => t.tablename),
            counts,
          };
          break;

        case "check-duplicates":
          // Check for duplicate events
          const duplicates = await query(`
            SELECT event_key, COUNT(*) as count
            FROM event_source
            GROUP BY event_key
            HAVING COUNT(*) > 1
            LIMIT 10
          `);

          result = {
            duplicateCount: duplicates.rows.length,
            samples: duplicates.rows,
          };
          break;

        case "sync-status":
          // Get detailed sync status
          const syncState = await query(`
            SELECT * FROM sync_state 
            ORDER BY last_checked DESC
          `);

          let attioStats = null;
          try {
            const attioResult = await query("SELECT * FROM attio_sync_stats");
            attioStats = attioResult.rows[0];
          } catch (e) {
            // Table might not exist
          }

          result = {
            lastSyncs: syncState.rows,
            attioStats,
          };
          break;

        default:
          return res.status(400).json({ error: "Unknown check type" });
      }

      res.json({
        success: true,
        type,
        result,
      });
    } catch (error) {
      logger.error(`Check ${type} failed:`, error);
      res.status(500).json({
        success: false,
        type,
        error: error.message,
      });
    }
  }

  setupRoutes() {
    const router = express.Router();

    // Dashboard UI
    router.get("/", this.serveDashboard);

    // API endpoints
    router.get("/api/stats", this.getStats);
    router.post("/api/sync/:type", this.runSync);
    router.get("/api/check/:type", this.runCheck);

    return router;
  }
}

module.exports = DashboardRoutes;
