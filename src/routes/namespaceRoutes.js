const express = require("express");
const NamespaceService = require("../services/namespaceService");
const TableManagerService = require("../services/tableManagerService");
const logger = require("../utils/logger");

class NamespaceRoutes {
  constructor() {
    this.namespaceService = new NamespaceService();
    this.tableManager = new TableManagerService();

    logger.info("NamespaceRoutes initialized");
  }

  setupRoutes() {
    const router = express.Router();

    // Get all namespaces
    router.get("/namespaces", this.getAllNamespaces.bind(this));

    // Get namespace by name
    router.get("/namespaces/:name", this.getNamespaceByName.bind(this));

    // Create new namespace
    router.post("/namespaces", this.createNamespace.bind(this));

    // Update namespace
    router.put("/namespaces/:name", this.updateNamespace.bind(this));

    // Get namespace statistics
    router.get("/namespaces/:name/stats", this.getNamespaceStats.bind(this));

    // Test campaign name matching
    router.post("/namespaces/test-match", this.testCampaignMatch.bind(this));

    // Get namespace overview (all stats)
    router.get("/namespaces-overview", this.getNamespacesOverview.bind(this));

    logger.info("Namespace routes registered");
    return router;
  }

  /**
   * Get all active namespaces
   * GET /api/namespaces
   */
  async getAllNamespaces(req, res) {
    try {
      const namespaces = await this.namespaceService.getAllActiveNamespaces();

      res.json({
        success: true,
        data: namespaces,
        count: namespaces.length,
      });
    } catch (error) {
      logger.error("[NamespaceAPI] Error fetching namespaces:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch namespaces",
        message: error.message,
      });
    }
  }

  /**
   * Get namespace by name
   * GET /api/namespaces/:name
   */
  async getNamespaceByName(req, res) {
    try {
      const { name } = req.params;
      const namespace = await this.namespaceService.getNamespaceByName(name);

      if (!namespace) {
        return res.status(404).json({
          success: false,
          error: "Namespace not found",
        });
      }

      res.json({
        success: true,
        data: namespace,
      });
    } catch (error) {
      logger.error(
        `[NamespaceAPI] Error fetching namespace ${req.params.name}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: "Failed to fetch namespace",
        message: error.message,
      });
    }
  }

  /**
   * Create new namespace
   * POST /api/namespaces
   * Body: { name, keywords, attio_config? }
   */
  async createNamespace(req, res) {
    try {
      const {
        name,
        keywords,
        attio_config,
        auto_create_table = true,
      } = req.body;

      // Validation
      if (!name || !keywords) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: name and keywords are required",
        });
      }

      if (!Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Keywords must be a non-empty array",
        });
      }

      // Create namespace
      const namespace = await this.namespaceService.createNamespace({
        name,
        keywords,
        attio_config,
      });

      // Optionally create the table immediately
      if (auto_create_table) {
        try {
          const tableName = await this.tableManager.ensureNamespaceTableExists(
            name
          );
          namespace.table_created = true;
          namespace.table_name = tableName;
        } catch (tableError) {
          logger.warn(
            `[NamespaceAPI] Failed to create table for namespace ${name}:`,
            tableError
          );
          namespace.table_created = false;
          namespace.table_error = tableError.message;
        }
      }

      logger.info(
        `[NamespaceAPI] Created namespace: ${name} with ${keywords.length} keywords`
      );

      res.status(201).json({
        success: true,
        data: namespace,
        message: `Namespace '${name}' created successfully`,
      });
    } catch (error) {
      logger.error("[NamespaceAPI] Error creating namespace:", error);

      if (error.message.includes("already exists")) {
        return res.status(409).json({
          success: false,
          error: "Namespace already exists",
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to create namespace",
        message: error.message,
      });
    }
  }

  /**
   * Update namespace keywords or configuration
   * PUT /api/namespaces/:name
   * Body: { keywords?, attio_config?, is_active? }
   */
  async updateNamespace(req, res) {
    try {
      const { name } = req.params;
      const updateData = req.body;

      // Validation
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: "No update data provided",
        });
      }

      if (
        updateData.keywords &&
        (!Array.isArray(updateData.keywords) ||
          updateData.keywords.length === 0)
      ) {
        return res.status(400).json({
          success: false,
          error: "Keywords must be a non-empty array",
        });
      }

      // Update namespace
      const updatedNamespace = await this.namespaceService.updateNamespace(
        name,
        updateData
      );

      logger.info(`[NamespaceAPI] Updated namespace: ${name}`);

      res.json({
        success: true,
        data: updatedNamespace,
        message: `Namespace '${name}' updated successfully`,
      });
    } catch (error) {
      logger.error(
        `[NamespaceAPI] Error updating namespace ${req.params.name}:`,
        error
      );

      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          error: "Namespace not found",
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to update namespace",
        message: error.message,
      });
    }
  }

  /**
   * Get namespace statistics (table stats)
   * GET /api/namespaces/:name/stats
   */
  async getNamespaceStats(req, res) {
    try {
      const { name } = req.params;

      // Check if namespace exists
      const namespace = await this.namespaceService.getNamespaceByName(name);
      if (!namespace) {
        return res.status(404).json({
          success: false,
          error: "Namespace not found",
        });
      }

      // Get table statistics
      const tableStats = await this.tableManager.getTableStats(name);

      res.json({
        success: true,
        data: {
          namespace: namespace,
          table_stats: tableStats,
        },
      });
    } catch (error) {
      logger.error(
        `[NamespaceAPI] Error fetching stats for namespace ${req.params.name}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: "Failed to fetch namespace statistics",
        message: error.message,
      });
    }
  }

  /**
   * Test campaign name matching against namespaces
   * POST /api/namespaces/test-match
   * Body: { campaign_name }
   */
  async testCampaignMatch(req, res) {
    try {
      const { campaign_name } = req.body;

      if (!campaign_name) {
        return res.status(400).json({
          success: false,
          error: "campaign_name is required",
        });
      }

      // Test namespace detection
      const detectedNamespace =
        await this.namespaceService.detectNamespaceFromCampaign(campaign_name);
      const namespaceDetails = await this.namespaceService.getNamespaceByName(
        detectedNamespace
      );

      // Get all namespaces to show matching logic
      const allNamespaces =
        await this.namespaceService.getAllActiveNamespaces();
      const matchingResults = [];

      for (const ns of allNamespaces) {
        const keywords = Array.isArray(ns.keywords) ? ns.keywords : [];
        const matches = keywords.filter((keyword) =>
          campaign_name.toLowerCase().includes(keyword.toLowerCase())
        );

        matchingResults.push({
          namespace: ns.name,
          keywords: keywords,
          matched_keywords: matches,
          is_match: matches.length > 0,
        });
      }

      res.json({
        success: true,
        data: {
          campaign_name: campaign_name,
          detected_namespace: detectedNamespace,
          namespace_details: namespaceDetails,
          all_matching_results: matchingResults,
        },
      });
    } catch (error) {
      logger.error("[NamespaceAPI] Error testing campaign match:", error);
      res.status(500).json({
        success: false,
        error: "Failed to test campaign matching",
        message: error.message,
      });
    }
  }

  /**
   * Get overview of all namespaces with statistics
   * GET /api/namespaces-overview
   */
  async getNamespacesOverview(req, res) {
    try {
      const namespaces = await this.namespaceService.getAllActiveNamespaces();
      const overview = [];

      for (const namespace of namespaces) {
        const tableStats = await this.tableManager.getTableStats(
          namespace.name
        );

        overview.push({
          ...namespace,
          table_stats: tableStats,
        });
      }

      // Get global namespace statistics
      const globalStats = await this.namespaceService.getNamespaceStats();

      res.json({
        success: true,
        data: {
          namespaces: overview,
          global_stats: globalStats,
          total_count: overview.length,
        },
      });
    } catch (error) {
      logger.error("[NamespaceAPI] Error fetching namespaces overview:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch namespaces overview",
        message: error.message,
      });
    }
  }
}

module.exports = NamespaceRoutes;
