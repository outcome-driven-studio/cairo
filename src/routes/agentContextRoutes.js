const express = require("express");
const { query } = require("../utils/db");
const logger = require("../utils/logger");

/**
 * Agent Context Routes
 *
 * Provides compact, LLM-prompt-friendly context about leads, pipeline,
 * and stats. Supports both text (default) and JSON output formats.
 */
class AgentContextRoutes {
  constructor() {
    logger.info("[AgentContext] Routes initialized");
  }

  /**
   * GET /api/agent/context/lead?email=...&namespace=...&format=text|json
   *
   * Returns a compact summary of a single lead.
   */
  async getLeadContext(req, res) {
    try {
      const { email, namespace = "default", format = "text" } = req.query;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: "email query parameter is required",
        });
      }

      const tableName = `${namespace === "default" ? "playmaker" : namespace}_user_source`;

      const userResult = await query(
        `SELECT email, name, first_name, last_name, company, title,
                icp_score, behaviour_score, lead_score, lead_grade,
                enrichment_profile, apollo_data, updated_at, created_at
         FROM ${tableName}
         WHERE email = $1`,
        [email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: `Lead not found: ${email}`,
        });
      }

      const user = userResult.rows[0];

      const eventsResult = await query(
        `SELECT event_type, created_at
         FROM event_source
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 15`,
        [email]
      );

      const leadData = this._buildLeadData(user, eventsResult.rows);

      if (format === "json") {
        return res.json({ success: true, lead: leadData });
      }

      const text = this._leadToText(leadData);
      res.type("text/plain").send(text);
    } catch (error) {
      logger.error("[AgentContext] Lead context error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/agent/context/pipeline?namespace=...&limit=20&format=text|json
   *
   * Returns a pipeline snapshot: top N leads with minimal fields.
   */
  async getPipelineContext(req, res) {
    try {
      const {
        namespace = "default",
        limit = "20",
        format = "text",
      } = req.query;

      const tableName = `${namespace === "default" ? "playmaker" : namespace}_user_source`;
      const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

      const result = await query(
        `SELECT email, name, first_name, company, lead_score, lead_grade,
                icp_score, behaviour_score, updated_at
         FROM ${tableName}
         WHERE lead_score IS NOT NULL
         ORDER BY lead_score DESC
         LIMIT $1`,
        [safeLimit]
      );

      const leads = result.rows.map((row) => ({
        email: row.email,
        name: row.name || row.first_name || "Unknown",
        company: row.company || "Unknown",
        lead_score: row.lead_score || 0,
        lead_grade: row.lead_grade || "F",
        icp_score: row.icp_score || 0,
        behavior_score: row.behaviour_score || 0,
        last_updated: row.updated_at,
      }));

      if (format === "json") {
        return res.json({
          success: true,
          pipeline: { leads, count: leads.length },
        });
      }

      const lines = [
        `Pipeline Snapshot (Top ${leads.length} Leads)`,
        "=".repeat(50),
        "",
      ];

      for (const lead of leads) {
        lines.push(
          `${lead.name} (${lead.email}) | ${lead.company} | Score: ${lead.lead_score} (${lead.lead_grade}) | ICP: ${lead.icp_score} | Behavior: ${lead.behavior_score}`
        );
      }

      res.type("text/plain").send(lines.join("\n"));
    } catch (error) {
      logger.error("[AgentContext] Pipeline context error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/agent/context/stats?namespace=...&format=text|json
   *
   * Returns key metrics: total leads, grade distribution, events last 7d,
   * last sync time.
   */
  async getStatsContext(req, res) {
    try {
      const { namespace = "default", format = "text" } = req.query;

      const tableName = `${namespace === "default" ? "playmaker" : namespace}_user_source`;

      const leadStats = await query(`
        SELECT
          COUNT(*) as total_leads,
          COUNT(CASE WHEN lead_grade = 'A' OR lead_grade = 'A+' THEN 1 END) as grade_a,
          COUNT(CASE WHEN lead_grade = 'B' OR lead_grade = 'B+' THEN 1 END) as grade_b,
          COUNT(CASE WHEN lead_grade = 'C' OR lead_grade = 'C+' THEN 1 END) as grade_c,
          COUNT(CASE WHEN lead_grade = 'D' THEN 1 END) as grade_d,
          COUNT(CASE WHEN lead_grade = 'F' OR lead_grade IS NULL THEN 1 END) as grade_f,
          AVG(lead_score) as avg_lead_score,
          MAX(updated_at) as last_updated
        FROM ${tableName}
      `);

      const eventStats = await query(`
        SELECT
          COUNT(*) as total_events,
          COUNT(DISTINCT user_id) as unique_users,
          MAX(created_at) as last_event
        FROM event_source
        WHERE created_at > NOW() - INTERVAL '7 days'
      `);

      let lastSyncTime = null;
      try {
        const syncResult = await query(`
          SELECT created_at
          FROM sync_logs
          WHERE status = 'success'
          ORDER BY created_at DESC
          LIMIT 1
        `);
        if (syncResult.rows.length > 0) {
          lastSyncTime = syncResult.rows[0].created_at;
        }
      } catch (_) {
        // sync_logs table may not exist
      }

      const ls = leadStats.rows[0];
      const es = eventStats.rows[0];

      const stats = {
        total_leads: parseInt(ls.total_leads),
        grade_distribution: {
          A: parseInt(ls.grade_a),
          B: parseInt(ls.grade_b),
          C: parseInt(ls.grade_c),
          D: parseInt(ls.grade_d),
          F: parseInt(ls.grade_f),
        },
        avg_lead_score: parseFloat(ls.avg_lead_score || 0).toFixed(1),
        events_last_7d: parseInt(es.total_events),
        unique_active_users_7d: parseInt(es.unique_users),
        last_event: es.last_event || null,
        last_sync: lastSyncTime,
        last_lead_update: ls.last_updated || null,
      };

      if (format === "json") {
        return res.json({ success: true, stats });
      }

      const lines = [
        `Cairo CDP Stats`,
        "=".repeat(40),
        "",
        `Total Leads: ${stats.total_leads}`,
        `Avg Lead Score: ${stats.avg_lead_score}`,
        "",
        `Grade Distribution:`,
        `  A: ${stats.grade_distribution.A}`,
        `  B: ${stats.grade_distribution.B}`,
        `  C: ${stats.grade_distribution.C}`,
        `  D: ${stats.grade_distribution.D}`,
        `  F: ${stats.grade_distribution.F}`,
        "",
        `Events (Last 7 Days): ${stats.events_last_7d}`,
        `Unique Active Users (7d): ${stats.unique_active_users_7d}`,
        `Last Event: ${stats.last_event ? this._timeAgo(new Date(stats.last_event)) : "N/A"}`,
        `Last Sync: ${stats.last_sync ? this._timeAgo(new Date(stats.last_sync)) : "N/A"}`,
      ];

      res.type("text/plain").send(lines.join("\n"));
    } catch (error) {
      logger.error("[AgentContext] Stats context error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Build structured lead data from DB row and events
   */
  _buildLeadData(user, events) {
    const profile = user.enrichment_profile || {};
    const apollo = user.apollo_data || {};

    const name =
      user.name ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      profile.name ||
      "Unknown";

    const companyName =
      user.company ||
      profile.company ||
      apollo.organization?.name ||
      "Unknown";

    const companyDetails = {};
    if (apollo.organization) {
      const org = apollo.organization;
      if (org.funding_stage) companyDetails.funding_stage = org.funding_stage;
      if (org.estimated_num_employees)
        companyDetails.employees = org.estimated_num_employees;
      if (org.industry) companyDetails.industry = org.industry;
    }

    // Aggregate recent events by type with count
    const eventCounts = {};
    for (const evt of events) {
      eventCounts[evt.event_type] = (eventCounts[evt.event_type] || 0) + 1;
    }
    const recentEvents = Object.entries(eventCounts).map(([type, count]) =>
      count > 1 ? `${type} (${count}x)` : type
    );

    const lastActivity = events.length > 0 ? events[0].created_at : null;

    return {
      email: user.email,
      name,
      company: companyName,
      company_details: Object.keys(companyDetails).length
        ? companyDetails
        : null,
      title: user.title || apollo.title || profile.title || null,
      lead_score: user.lead_score || 0,
      lead_grade: user.lead_grade || "F",
      icp_score: user.icp_score || 0,
      behavior_score: user.behaviour_score || 0,
      last_activity: lastActivity,
      recent_events: recentEvents,
      created_at: user.created_at,
      last_updated: user.updated_at,
    };
  }

  /**
   * Format lead data as LLM-prompt-friendly text
   */
  _leadToText(lead) {
    const lines = [];

    lines.push(`Lead: ${lead.name} (${lead.email})`);

    let companyLine = `Company: ${lead.company}`;
    if (lead.company_details) {
      const parts = [];
      if (lead.company_details.funding_stage)
        parts.push(lead.company_details.funding_stage);
      if (lead.company_details.employees)
        parts.push(`${lead.company_details.employees} employees`);
      if (lead.company_details.industry)
        parts.push(lead.company_details.industry);
      if (parts.length) companyLine += ` (${parts.join(", ")})`;
    }
    lines.push(companyLine);

    if (lead.title) {
      lines.push(`Title: ${lead.title}`);
    }

    lines.push(
      `Score: ${lead.lead_score}/100 (Grade: ${lead.lead_grade})`
    );
    lines.push(
      `ICP Score: ${lead.icp_score} | Behavior Score: ${lead.behavior_score}`
    );

    if (lead.last_activity) {
      lines.push(`Last Activity: ${this._timeAgo(new Date(lead.last_activity))}`);
    } else {
      lines.push("Last Activity: None recorded");
    }

    if (lead.recent_events.length > 0) {
      lines.push(`Recent Events: ${lead.recent_events.join(", ")}`);
    } else {
      lines.push("Recent Events: None");
    }

    return lines.join("\n");
  }

  /**
   * Convert a date to a human-readable "time ago" string
   */
  _timeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays > 0)
      return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    if (diffHours > 0)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffMins > 0)
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    return "Just now";
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    const router = express.Router();

    router.get("/context/lead", this.getLeadContext.bind(this));
    router.get("/context/pipeline", this.getPipelineContext.bind(this));
    router.get("/context/stats", this.getStatsContext.bind(this));

    return router;
  }
}

module.exports = AgentContextRoutes;
