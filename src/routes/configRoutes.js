const express = require("express");
const { query } = require("../utils/db");
const logger = require("../utils/logger");
const { getNotificationsEnabled } = require("../utils/notificationsEnabled");
const { DestinationService } = require("../services/destinationService");
const SlackDestination = require("../destinations/slackDestination");
const DiscordDestination = require("../destinations/discordDestination");
const MixpanelDestination = require("../destinations/mixpanelDestination");
const WebhookDestination = require("../destinations/webhookDestination");

/**
 * Configuration Routes
 * Manage sources, destinations, and settings via REST API
 */
class ConfigRoutes {
  constructor() {
    this.destinationService = new DestinationService();
    this.setupDefaultDestinations();
    logger.info("ConfigRoutes initialized");
  }

  setupDefaultDestinations() {
    // Register available destination types (wrapped in try-catch for graceful handling of invalid configs)
    if (process.env.SLACK_WEBHOOK_URL && process.env.SLACK_WEBHOOK_URL !== 'placeholder') {
      try {
        const slack = new SlackDestination({
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_DEFAULT_CHANNEL || '#events',
          alertEvents: process.env.SLACK_ALERT_EVENTS?.split(',') || [],
        });
        this.destinationService.register(slack);
      } catch (error) {
        logger.warn(`[ConfigRoutes] Skipping Slack destination: ${error.message}`);
      }
    }

    if (process.env.DISCORD_WEBHOOK_URL && process.env.DISCORD_WEBHOOK_URL !== 'placeholder') {
      try {
        const discord = new DiscordDestination({
          webhookUrl: process.env.DISCORD_WEBHOOK_URL,
          username: process.env.DISCORD_USERNAME || 'Cairo CDP',
          avatarUrl: process.env.DISCORD_AVATAR_URL,
          alertEvents: process.env.DISCORD_ALERT_EVENTS?.split(',') || [],
          paymentThreshold: process.env.DISCORD_PAYMENT_THRESHOLD
            ? parseFloat(process.env.DISCORD_PAYMENT_THRESHOLD)
            : 100,
        });
        this.destinationService.register(discord);
      } catch (error) {
        logger.warn(`[ConfigRoutes] Skipping Discord destination: ${error.message}`);
      }
    }

    if (process.env.MIXPANEL_PROJECT_TOKEN && process.env.MIXPANEL_PROJECT_TOKEN !== 'placeholder') {
      try {
        const mixpanel = new MixpanelDestination({
          projectToken: process.env.MIXPANEL_PROJECT_TOKEN,
          apiSecret: process.env.MIXPANEL_API_SECRET,
        });
        this.destinationService.register(mixpanel);
      } catch (error) {
        logger.warn(`[ConfigRoutes] Skipping Mixpanel destination: ${error.message}`);
      }
    }
  }

  /**
   * Get all sources
   * GET /api/config/sources
   */
  async getSources(req, res) {
    try {
      const result = await query(`
        SELECT
          id,
          name,
          type,
          write_key,
          enabled,
          settings,
          created_at,
          updated_at,
          (SELECT COUNT(*) FROM event_source WHERE event_source.user_id LIKE CONCAT('%', sources.write_key, '%')) as event_count
        FROM sources
        ORDER BY created_at DESC
      `);

      const sources = result.rows.map(row => ({
        ...row,
        settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings,
      }));

      res.json({
        success: true,
        sources,
      });
    } catch (error) {
      logger.error("Failed to get sources:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Create a new source
   * POST /api/config/sources
   */
  async createSource(req, res) {
    try {
      const { name, type, settings = {} } = req.body;

      if (!name || !type) {
        return res.status(400).json({
          success: false,
          error: "name and type are required",
        });
      }

      const writeKey = this.generateWriteKey();

      const result = await query(`
        INSERT INTO sources (name, type, write_key, enabled, settings, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *
      `, [name, type, writeKey, true, JSON.stringify(settings)]);

      const source = {
        ...result.rows[0],
        settings: typeof result.rows[0].settings === 'string'
          ? JSON.parse(result.rows[0].settings)
          : result.rows[0].settings,
      };

      logger.info(`Created source: ${name} (${type})`);

      res.status(201).json({
        success: true,
        source,
      });
    } catch (error) {
      logger.error("Failed to create source:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Update a source
   * PUT /api/config/sources/:id
   */
  async updateSource(req, res) {
    try {
      const { id } = req.params;
      const { name, enabled, settings } = req.body;

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        values.push(name);
        paramIndex++;
      }

      if (enabled !== undefined) {
        updates.push(`enabled = $${paramIndex}`);
        values.push(enabled);
        paramIndex++;
      }

      if (settings !== undefined) {
        updates.push(`settings = $${paramIndex}`);
        values.push(JSON.stringify(settings));
        paramIndex++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const result = await query(`
        UPDATE sources
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Source not found",
        });
      }

      const source = {
        ...result.rows[0],
        settings: typeof result.rows[0].settings === 'string'
          ? JSON.parse(result.rows[0].settings)
          : result.rows[0].settings,
      };

      res.json({
        success: true,
        source,
      });
    } catch (error) {
      logger.error("Failed to update source:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Delete a source
   * DELETE /api/config/sources/:id
   */
  async deleteSource(req, res) {
    try {
      const { id } = req.params;

      const result = await query(`
        DELETE FROM sources WHERE id = $1 RETURNING *
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Source not found",
        });
      }

      res.json({
        success: true,
        message: "Source deleted successfully",
      });
    } catch (error) {
      logger.error("Failed to delete source:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get all destinations
   * GET /api/config/destinations
   */
  async getDestinations(req, res) {
    try {
      const result = await query(`
        SELECT
          id,
          name,
          type,
          enabled,
          settings,
          created_at,
          updated_at
        FROM destinations
        ORDER BY created_at DESC
      `);

      const destinations = result.rows.map(row => ({
        ...row,
        settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings,
      }));

      // Also include stats from destination service
      const stats = this.destinationService.getStats();

      res.json({
        success: true,
        destinations,
        stats,
      });
    } catch (error) {
      logger.error("Failed to get destinations:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Create a new destination
   * POST /api/config/destinations
   */
  async createDestination(req, res) {
    try {
      const { name, type, settings = {}, enabled = true } = req.body;

      if (!name || !type) {
        return res.status(400).json({
          success: false,
          error: "name and type are required",
        });
      }

      // Validate destination type and settings
      const DestinationClass = this.getDestinationClass(type);
      if (!DestinationClass) {
        return res.status(400).json({
          success: false,
          error: `Unsupported destination type: ${type}`,
        });
      }

      const destination = new DestinationClass({ ...settings, enabled });
      const validation = destination.validateConfig();

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: `Invalid configuration: ${validation.errors.join(', ')}`,
        });
      }

      // Store in database
      const result = await query(`
        INSERT INTO destinations (name, type, enabled, settings, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING *
      `, [name, type, enabled, JSON.stringify(settings)]);

      // Register with destination service
      this.destinationService.register(destination);

      const createdDestination = {
        ...result.rows[0],
        settings: typeof result.rows[0].settings === 'string'
          ? JSON.parse(result.rows[0].settings)
          : result.rows[0].settings,
      };

      logger.info(`Created destination: ${name} (${type})`);

      res.status(201).json({
        success: true,
        destination: createdDestination,
      });
    } catch (error) {
      logger.error("Failed to create destination:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get a single destination by id
   * GET /api/config/destinations/:id
   */
  async getDestination(req, res) {
    try {
      const { id } = req.params;

      const result = await query(`
        SELECT id, name, type, enabled, settings, created_at, updated_at
        FROM destinations WHERE id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Destination not found",
        });
      }

      const row = result.rows[0];
      const destination = {
        ...row,
        settings: typeof row.settings === "string" ? JSON.parse(row.settings) : row.settings,
      };

      res.json({
        success: true,
        destination,
      });
    } catch (error) {
      logger.error("Failed to get destination:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Update a destination
   * PUT /api/config/destinations/:id
   */
  async updateDestination(req, res) {
    try {
      const { id } = req.params;
      const { name, enabled, settings } = req.body;

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        values.push(name);
        paramIndex++;
      }

      if (enabled !== undefined) {
        updates.push(`enabled = $${paramIndex}`);
        values.push(enabled);
        paramIndex++;
      }

      if (settings !== undefined) {
        updates.push(`settings = $${paramIndex}`);
        values.push(JSON.stringify(settings));
        paramIndex++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const result = await query(`
        UPDATE destinations
        SET ${updates.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Destination not found",
        });
      }

      const destination = {
        ...result.rows[0],
        settings:
          typeof result.rows[0].settings === "string"
            ? JSON.parse(result.rows[0].settings)
            : result.rows[0].settings,
      };

      res.json({
        success: true,
        destination,
      });
    } catch (error) {
      logger.error("Failed to update destination:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Test a destination
   * POST /api/config/destinations/:id/test
   */
  async testDestination(req, res) {
    try {
      const { id } = req.params;

      const result = await query(`
        SELECT * FROM destinations WHERE id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Destination not found",
        });
      }

      const { name, type, settings } = result.rows[0];
      const parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : settings;

      const DestinationClass = this.getDestinationClass(type);
      if (!DestinationClass) {
        return res.status(400).json({
          success: false,
          error: `Unsupported destination type: ${type}`,
        });
      }

      const destination = new DestinationClass(parsedSettings);
      const testResult = await destination.test();

      res.json({
        success: true,
        test: testResult,
      });
    } catch (error) {
      logger.error("Failed to test destination:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get suggested event names for notification configuration
   * GET /api/config/event-names
   */
  async getEventNames(req, res) {
    const eventNames = [
      "identify",
      "page",
      "group",
      "Sign Up",
      "Signup",
      "Login",
      "Purchase",
      "Payment Completed",
      "Subscription Created",
      "Subscription Upgraded",
      "Subscription Cancelled",
      "Trial Started",
      "Lead Created",
      "Lead Qualified",
      "Email Opened",
      "Email Clicked",
      "Campaign Started",
      "Sync Completed",
      "Error Occurred",
      "User Action",
      "Page Viewed",
      "Feature Used",
    ];

    res.json({
      success: true,
      eventNames,
    });
  }

  /**
   * Get available destination types
   * GET /api/config/destination-types
   */
  async getDestinationTypes(req, res) {
    const types = [
      {
        type: 'slack',
        name: 'Slack',
        description: 'Send event notifications to Slack channels',
        icon: '💬',
        fields: [
          { name: 'webhookUrl', type: 'url', required: true, label: 'Webhook URL' },
          { name: 'channel', type: 'text', required: false, label: 'Default Channel' },
          { name: 'username', type: 'text', required: false, label: 'Bot Username' },
          { name: 'alertEvents', type: 'tags', required: false, label: 'Alert Events' },
        ]
      },
      {
        type: 'discord',
        name: 'Discord',
        description: 'Send event notifications to Discord channels via webhooks',
        icon: '🎮',
        fields: [
          { name: 'webhookUrl', type: 'url', required: true, label: 'Webhook URL' },
          { name: 'username', type: 'text', required: false, label: 'Bot Username' },
          { name: 'avatarUrl', type: 'url', required: false, label: 'Avatar URL' },
          { name: 'alertEvents', type: 'tags', required: false, label: 'Alert Events' },
          { name: 'paymentThreshold', type: 'number', required: false, label: 'Payment Threshold' },
        ]
      },
      {
        type: 'mixpanel',
        name: 'Mixpanel',
        description: 'Send events to Mixpanel analytics platform',
        icon: '📊',
        fields: [
          { name: 'projectToken', type: 'password', required: true, label: 'Project Token' },
          { name: 'apiSecret', type: 'password', required: false, label: 'API Secret' },
        ]
      },
      {
        type: 'webhook',
        name: 'Webhook',
        description: 'Send events to custom HTTP endpoints',
        icon: '🔗',
        fields: [
          { name: 'url', type: 'url', required: true, label: 'Webhook URL' },
          { name: 'method', type: 'select', required: false, label: 'HTTP Method', options: ['POST', 'PUT', 'PATCH'] },
          { name: 'signatureSecret', type: 'password', required: false, label: 'Signature Secret' },
          { name: 'timeout', type: 'number', required: false, label: 'Timeout (ms)' },
        ]
      }
    ];

    res.json({
      success: true,
      types,
    });
  }

  /**
   * Get all transformations (source-destination mappings)
   * GET /api/config/transformations
   */
  async getTransformations(req, res) {
    try {
      const result = await query(`
        SELECT
          t.id,
          t.name,
          t.enabled,
          t.conditions,
          t.mappings,
          t.code,
          t.created_at,
          t.updated_at,
          s.id as source_id,
          s.name as source_name,
          s.type as source_type,
          d.id as destination_id,
          d.name as destination_name,
          d.type as destination_type
        FROM transformations t
        LEFT JOIN sources s ON t.source_id = s.id
        LEFT JOIN destinations d ON t.destination_id = d.id
        ORDER BY t.created_at DESC
      `);

      const transformations = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        enabled: row.enabled,
        conditions: typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions,
        mappings: typeof row.mappings === 'string' ? JSON.parse(row.mappings) : row.mappings,
        code: row.code,
        source: {
          id: row.source_id,
          name: row.source_name,
          type: row.source_type
        },
        destination: {
          id: row.destination_id,
          name: row.destination_name,
          type: row.destination_type
        },
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

      res.json({
        success: true,
        transformations
      });
    } catch (error) {
      logger.error("Failed to get transformations:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Create a new transformation (source-destination mapping)
   * POST /api/config/transformations
   */
  async createTransformation(req, res) {
    try {
      const { name, source_id, destination_id, enabled = true, conditions = [], mappings = {}, code = null } = req.body;

      if (!name || !source_id || !destination_id) {
        return res.status(400).json({
          success: false,
          error: "name, source_id, and destination_id are required"
        });
      }

      const result = await query(`
        INSERT INTO transformations (name, source_id, destination_id, enabled, conditions, mappings, code, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *
      `, [name, source_id, destination_id, enabled, JSON.stringify(conditions), JSON.stringify(mappings), code]);

      const transformation = {
        ...result.rows[0],
        conditions: typeof result.rows[0].conditions === 'string' ? JSON.parse(result.rows[0].conditions) : result.rows[0].conditions,
        mappings: typeof result.rows[0].mappings === 'string' ? JSON.parse(result.rows[0].mappings) : result.rows[0].mappings
      };

      logger.info(`Created transformation: ${name}`);

      res.status(201).json({
        success: true,
        transformation
      });
    } catch (error) {
      logger.error("Failed to create transformation:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Update a transformation
   * PUT /api/config/transformations/:id
   */
  async updateTransformation(req, res) {
    try {
      const { id } = req.params;
      const { name, enabled, conditions, mappings, code } = req.body;

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        values.push(name);
        paramIndex++;
      }

      if (enabled !== undefined) {
        updates.push(`enabled = $${paramIndex}`);
        values.push(enabled);
        paramIndex++;
      }

      if (conditions !== undefined) {
        updates.push(`conditions = $${paramIndex}`);
        values.push(JSON.stringify(conditions));
        paramIndex++;
      }

      if (mappings !== undefined) {
        updates.push(`mappings = $${paramIndex}`);
        values.push(JSON.stringify(mappings));
        paramIndex++;
      }

      if (code !== undefined) {
        updates.push(`code = $${paramIndex}`);
        values.push(code);
        paramIndex++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update"
        });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const result = await query(`
        UPDATE transformations
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Transformation not found"
        });
      }

      const transformation = {
        ...result.rows[0],
        conditions: typeof result.rows[0].conditions === 'string' ? JSON.parse(result.rows[0].conditions) : result.rows[0].conditions,
        mappings: typeof result.rows[0].mappings === 'string' ? JSON.parse(result.rows[0].mappings) : result.rows[0].mappings
      };

      res.json({
        success: true,
        transformation
      });
    } catch (error) {
      logger.error("Failed to update transformation:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Delete a transformation
   * DELETE /api/config/transformations/:id
   */
  async deleteTransformation(req, res) {
    try {
      const { id } = req.params;

      const result = await query(`
        DELETE FROM transformations WHERE id = $1 RETURNING *
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Transformation not found"
        });
      }

      res.json({
        success: true,
        message: "Transformation deleted successfully"
      });
    } catch (error) {
      logger.error("Failed to delete transformation:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get system configuration
   * GET /api/config/system
   */
  async getSystemConfig(req, res) {
    try {
      const config = {
        version: '1.0.0',
        database: {
          connected: true, // TODO: Check actual connection
        },
        features: {
          multiTenant: true,
          leadScoring: true,
          aiEnrichment: !!process.env.GEMINI_API_KEY,
          periodicSync: process.env.USE_PERIODIC_SYNC === 'true',
        },
        integrations: {
          slack: !!process.env.SLACK_WEBHOOK_URL,
          discord: !!process.env.DISCORD_WEBHOOK_URL,
          mixpanel: !!process.env.MIXPANEL_PROJECT_TOKEN,
          attio: !!process.env.ATTIO_API_KEY,
          apollo: !!process.env.APOLLO_API_KEY,
          hunter: !!process.env.HUNTER_API_KEY,
        }
      };

      res.json({
        success: true,
        config,
      });
    } catch (error) {
      logger.error("Failed to get system config:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get global notifications enabled state. GET /api/config/notifications
   */
  async getNotifications(req, res) {
    try {
      const enabled = await getNotificationsEnabled();
      res.json({ success: true, enabled });
    } catch (error) {
      logger.error("Failed to get notifications state:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Update global notifications enabled state. PUT /api/config/notifications
   */
  async updateNotifications(req, res) {
    try {
      const enabled = req.body?.enabled !== false;
      await query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        ["notifications_enabled", JSON.stringify({ enabled })]
      );
      res.json({ success: true, enabled });
    } catch (error) {
      logger.error("Failed to update notifications state:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get Notion bridge settings (for POST /api/bridge/notion). Merges DB with env defaults.
   * GET /api/config/notion-bridge
   */
  async getNotionBridge(req, res) {
    try {
      const defaults = {
        webhookUrl: process.env.NOTION_BRIDGE_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || "",
        username: process.env.NOTION_BRIDGE_USERNAME || process.env.DISCORD_USERNAME || "Notion",
        avatarUrl: process.env.NOTION_BRIDGE_AVATAR_URL || process.env.DISCORD_AVATAR_URL || "",
        footer: process.env.NOTION_BRIDGE_FOOTER || "Cairo · Notion",
        titleKeys: process.env.NOTION_BRIDGE_TITLE_KEYS
          ? process.env.NOTION_BRIDGE_TITLE_KEYS.split(",").map((s) => s.trim()).filter(Boolean)
          : ["Task name", "Name", "Title", "title", "name"],
        defaultColor: (process.env.NOTION_BRIDGE_DEFAULT_COLOR || "5B4FFF").replace(/^#/, ""),
        includePageLink: process.env.NOTION_BRIDGE_INCLUDE_LINK !== "false",
      };

      let value = defaults;
      try {
        const result = await query(
          "SELECT value FROM app_settings WHERE key = $1",
          ["notion_bridge"]
        );
        const stored = result.rows[0]?.value;
        if (stored && typeof stored === "object") {
          value = { ...defaults, ...stored };
        }
      } catch (e) {
        // app_settings table may not exist yet; use env defaults
      }

      // Ensure titleKeys is array and defaultColor has no leading #
      if (!Array.isArray(value.titleKeys)) {
        value.titleKeys =
          typeof value.titleKeys === "string"
            ? value.titleKeys.split(",").map((s) => s.trim()).filter(Boolean)
            : defaults.titleKeys;
      }
      if (value.defaultColor && value.defaultColor.startsWith("#")) {
        value.defaultColor = value.defaultColor.slice(1);
      }

      res.json({ success: true, config: value });
    } catch (error) {
      logger.error("Failed to get Notion bridge config:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Update Notion bridge settings. Persisted to app_settings; used by POST /api/bridge/notion.
   * PUT /api/config/notion-bridge
   */
  async updateNotionBridge(req, res) {
    try {
      const {
        webhookUrl,
        username,
        avatarUrl,
        footer,
        titleKeys,
        defaultColor,
        includePageLink,
      } = req.body || {};

      const value = {};
      if (webhookUrl !== undefined) value.webhookUrl = String(webhookUrl).trim();
      if (username !== undefined) value.username = String(username).trim();
      if (avatarUrl !== undefined) value.avatarUrl = String(avatarUrl).trim();
      if (footer !== undefined) value.footer = String(footer).trim();
      if (titleKeys !== undefined) {
        value.titleKeys = Array.isArray(titleKeys)
          ? titleKeys.map((s) => String(s).trim()).filter(Boolean)
          : String(titleKeys)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
      }
      if (defaultColor !== undefined) {
        value.defaultColor = String(defaultColor).replace(/^#/, "").trim();
      }
      if (includePageLink !== undefined) value.includePageLink = !!includePageLink;

      let existing = {};
      try {
        const result = await query(
          "SELECT value FROM app_settings WHERE key = $1",
          ["notion_bridge"]
        );
        existing = result.rows[0]?.value || {};
      } catch (e) {
        // Table may not exist; run migrations first. Will still try INSERT.
      }
      const merged =
        typeof existing === "object" ? { ...existing, ...value } : value;

      await query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        ["notion_bridge", JSON.stringify(merged)]
      );

      const config = { ...merged };
      if (!Array.isArray(config.titleKeys)) {
        config.titleKeys =
          typeof config.titleKeys === "string"
            ? config.titleKeys.split(",").map((s) => s.trim()).filter(Boolean)
            : ["Task name", "Name", "Title", "title", "name"];
      }
      if (config.defaultColor && config.defaultColor.startsWith("#")) {
        config.defaultColor = config.defaultColor.slice(1);
      }

      res.json({ success: true, config });
    } catch (error) {
      logger.error("Failed to update Notion bridge config:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Helper methods

  getDestinationClass(type) {
    switch (type) {
      case 'slack':
        return SlackDestination;
      case 'discord':
        return DiscordDestination;
      case 'mixpanel':
        return MixpanelDestination;
      case 'webhook':
        return WebhookDestination;
      default:
        return null;
    }
  }

  generateWriteKey() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'wk_';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    const router = express.Router();

    // Sources
    router.get('/sources', this.getSources.bind(this));
    router.post('/sources', this.createSource.bind(this));
    router.put('/sources/:id', this.updateSource.bind(this));
    router.delete('/sources/:id', this.deleteSource.bind(this));

    // Destinations
    router.get('/destinations', this.getDestinations.bind(this));
    router.get('/destinations/:id', this.getDestination.bind(this));
    router.post('/destinations', this.createDestination.bind(this));
    router.put('/destinations/:id', this.updateDestination.bind(this));
    router.post('/destinations/:id/test', this.testDestination.bind(this));

    // Event names (for notification config)
    router.get('/event-names', this.getEventNames.bind(this));

    // Notion bridge (UI-configurable; used by POST /api/bridge/notion)
    router.get('/notion-bridge', this.getNotionBridge.bind(this));
    router.put('/notion-bridge', this.updateNotionBridge.bind(this));

    // Global notifications on/off switch
    router.get('/notifications', this.getNotifications.bind(this));
    router.put('/notifications', this.updateNotifications.bind(this));

    // Destination types
    router.get('/destination-types', this.getDestinationTypes.bind(this));

    // Transformations (mappings)
    router.get('/transformations', this.getTransformations.bind(this));
    router.post('/transformations', this.createTransformation.bind(this));
    router.put('/transformations/:id', this.updateTransformation.bind(this));
    router.delete('/transformations/:id', this.deleteTransformation.bind(this));

    // System configuration
    router.get('/system', this.getSystemConfig.bind(this));

    return router;
  }
}

module.exports = ConfigRoutes;