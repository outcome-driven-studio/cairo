const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

/**
 * Environment Configuration Management Routes
 * Manage environment variables and application settings
 */
class EnvConfigRoutes {
  constructor() {
    this.configFile = path.join(__dirname, "../../.env");
  }

  /**
   * Get current configuration (with sensitive values masked)
   */
  async getConfig(req, res) {
    try {
      const config = {};

      // Read from environment variables
      const configKeys = [
        // API Keys
        'LEMLIST_API_KEY',
        'SMARTLEAD_API_KEY',
        'ATTIO_API_KEY',
        'MIXPANEL_PROJECT_TOKEN',
        'APOLLO_API_KEY',
        'HUNTER_API_KEY',
        'GEMINI_API_KEY',
        'GEMINI_MODEL_PRO',
        'GEMINI_MODEL_FLASH',
        'ENABLE_AI_LEAD_SCORING',
        'ENABLE_AI_INSIGHTS',
        'ENABLE_AI_QUERIES',

        // Sync Configuration
        'USE_PERIODIC_SYNC',
        'SYNC_INTERVAL_HOURS',
        'RUN_SYNC_ON_START',
        'PERIODIC_SYNC_MIXPANEL_ENABLED',
        'SYNC_FROM_LEMLIST',
        'SYNC_FROM_SMARTLEAD',
        'SYNC_FROM_ATTIO',
        'CALCULATE_SCORES',
        'SYNC_SCORES_TO_ATTIO',
        'ENABLE_WEEKLY_ICP_SCORING',
        'PERIODIC_SYNC_HEARTBEAT',
        'SYNC_TEST_MODE',

        // Database
        'POSTGRES_URL',

        // Monitoring
        'SENTRY_DSN',
        'SENTRY_LOG_WARNINGS',
        'SENTRY_TRACK_SYNC',
        'SLACK_WEBHOOK_URL',
        'DISCORD_WEBHOOK_URL',

        // Environment
        'NODE_ENV',
        'LOG_LEVEL',
        'PORT',

        // Enrichment
        'CLAY_ENRICHMENT_ENABLED',
        'ENRICHMENT_STRATEGY',
        'PREFERRED_AI_PROVIDER'
      ];

      // Get current values from environment
      configKeys.forEach(key => {
        const value = process.env[key];
        if (value !== undefined) {
          // Mask sensitive values
          if (this.isSensitiveKey(key) && value) {
            config[key] = this.maskSensitiveValue(value);
          } else {
            config[key] = value;
          }
        }
      });

      res.json(config);
    } catch (error) {
      logger.error("Failed to get environment configuration:", error);
      res.status(500).json({
        error: "Failed to get configuration"
      });
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(req, res) {
    try {
      const updates = req.body;
      const envContent = [];

      // Read existing .env file if it exists
      let existingConfig = {};
      if (fs.existsSync(this.configFile)) {
        const content = fs.readFileSync(this.configFile, 'utf8');
        content.split('\n').forEach(line => {
          const match = line.match(/^([^=]+)=(.*)$/);
          if (match) {
            existingConfig[match[1]] = match[2].replace(/^["']|["']$/g, '');
          }
        });
      }

      // Merge updates with existing config
      const finalConfig = { ...existingConfig };

      Object.entries(updates).forEach(([key, value]) => {
        // Don't update masked values
        if (typeof value === 'string' && value.includes('***')) {
          // Keep original value for masked fields
          if (existingConfig[key]) {
            finalConfig[key] = existingConfig[key];
          }
        } else {
          finalConfig[key] = value;
        }
      });

      // Write updated config
      Object.entries(finalConfig).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          envContent.push(`${key}="${value}"`);
        }
      });

      // Write to .env file
      fs.writeFileSync(this.configFile, envContent.join('\n'));

      // Update current process environment for non-sensitive values
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '' && !value.includes('***')) {
          process.env[key] = String(value);
        }
      });

      logger.info("Environment configuration updated successfully");

      // Check if services need to be restarted
      const restartRequired = this.requiresRestart(Object.keys(updates));

      // If periodic sync settings changed, restart the service
      if (updates.USE_PERIODIC_SYNC !== undefined || updates.SYNC_INTERVAL_HOURS !== undefined) {
        try {
          const { getInstance } = require("../services/periodicSyncService");
          const periodicSync = getInstance();

          if (updates.USE_PERIODIC_SYNC === 'false' || updates.USE_PERIODIC_SYNC === false) {
            periodicSync.stop();
            logger.info("Periodic sync stopped");
          } else if (updates.USE_PERIODIC_SYNC === 'true' || updates.USE_PERIODIC_SYNC === true) {
            await periodicSync.start();
            logger.info("Periodic sync started");
          } else if (updates.SYNC_INTERVAL_HOURS) {
            periodicSync.stop();
            periodicSync.syncInterval = parseInt(updates.SYNC_INTERVAL_HOURS);
            await periodicSync.start();
            logger.info(`Periodic sync restarted with interval: ${updates.SYNC_INTERVAL_HOURS} hours`);
          }
        } catch (error) {
          logger.error("Failed to restart periodic sync:", error);
        }
      }

      res.json({
        success: true,
        message: restartRequired
          ? "Configuration updated. Some changes require a server restart to take full effect."
          : "Configuration updated successfully.",
        requiresRestart: restartRequired
      });
    } catch (error) {
      logger.error("Failed to update environment configuration:", error);
      res.status(500).json({
        error: "Failed to update configuration"
      });
    }
  }

  /**
   * Test connection for a specific service
   */
  async testConnection(req, res) {
    try {
      const { service } = req.body;

      let result = { success: false, error: "Unknown service" };

      switch (service.toLowerCase()) {
        case 'database':
          result = await this.testDatabase();
          break;
        case 'lemlist':
          result = await this.testLemlist();
          break;
        case 'smartlead':
          result = await this.testSmartlead();
          break;
        case 'attio':
          result = await this.testAttio();
          break;
        case 'mixpanel':
          result = await this.testMixpanel();
          break;
        case 'sentry':
          result = await this.testSentry();
          break;
        case 'slack':
          result = await this.testSlack();
          break;
        case 'discord':
          result = await this.testDiscord();
          break;
        default:
          result = { success: false, error: "Unknown service: " + service };
      }

      res.json(result);
    } catch (error) {
      logger.error("Failed to test connection:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Helper methods
  isSensitiveKey(key) {
    const sensitivePatterns = [
      'KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'DSN', 'URL', 'WEBHOOK'
    ];
    return sensitivePatterns.some(pattern => key.includes(pattern));
  }

  maskSensitiveValue(value) {
    if (!value || value.length < 8) return value;
    const visibleChars = 4;
    return value.substring(0, visibleChars) + '***' + value.substring(value.length - visibleChars);
  }

  requiresRestart(keys) {
    const restartRequired = [
      'POSTGRES_URL', 'PORT', 'NODE_ENV', 'SENTRY_DSN'
    ];
    return keys.some(key => restartRequired.includes(key));
  }

  // Test methods
  async testDatabase() {
    try {
      const { query } = require("../utils/db");
      await query("SELECT 1");
      return { success: true, message: "Database connection successful" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testLemlist() {
    try {
      if (!process.env.LEMLIST_API_KEY) {
        return { success: false, error: "Lemlist API key not configured" };
      }
      const LemlistService = require("../services/lemlistService");
      const service = new LemlistService(process.env.LEMLIST_API_KEY);
      const campaigns = await service.getCampaigns();
      return {
        success: true,
        message: `Connected successfully. Found ${campaigns.length} campaigns.`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testSmartlead() {
    try {
      if (!process.env.SMARTLEAD_API_KEY) {
        return { success: false, error: "Smartlead API key not configured" };
      }
      const SmartleadService = require("../services/smartleadService");
      const service = new SmartleadService(process.env.SMARTLEAD_API_KEY);
      const campaigns = await service.getCampaigns();
      return {
        success: true,
        message: `Connected successfully. Found ${campaigns.length} campaigns.`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testAttio() {
    try {
      if (!process.env.ATTIO_API_KEY) {
        return { success: false, error: "Attio API key not configured" };
      }
      const AttioService = require("../services/attioService");
      const service = new AttioService(process.env.ATTIO_API_KEY);
      const people = await service.listPeople(1, 0);
      return {
        success: true,
        message: "Connected successfully to Attio"
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testMixpanel() {
    try {
      if (!process.env.MIXPANEL_PROJECT_TOKEN) {
        return { success: false, error: "Mixpanel project token not configured" };
      }
      const MixpanelService = require("../services/mixpanelService");
      const service = new MixpanelService(process.env.MIXPANEL_PROJECT_TOKEN);
      const result = await service.track("test@example.com", "Test Event", { test: true });
      return {
        success: result.success,
        message: result.success ? "Connected successfully to Mixpanel" : "Failed to send test event",
        error: result.error
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testSentry() {
    try {
      if (!process.env.SENTRY_DSN) {
        return { success: false, error: "Sentry DSN not configured" };
      }
      const sentry = require("../utils/sentry");
      sentry.captureMessage("Test message from configuration UI", "info");
      return {
        success: true,
        message: "Test event sent to Sentry. Check your Sentry dashboard."
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testSlack() {
    try {
      if (!process.env.SLACK_WEBHOOK_URL) {
        return { success: false, error: "Slack webhook URL not configured" };
      }
      const axios = require('axios');
      await axios.post(process.env.SLACK_WEBHOOK_URL, {
        text: "Test message from Cairo CDP configuration UI",
        username: "Cairo CDP",
        icon_emoji: ":robot_face:"
      });
      return {
        success: true,
        message: "Test message sent to Slack successfully"
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testDiscord() {
    try {
      if (!process.env.DISCORD_WEBHOOK_URL) {
        return { success: false, error: "Discord webhook URL not configured" };
      }
      const axios = require('axios');
      await axios.post(process.env.DISCORD_WEBHOOK_URL, {
        username: "Cairo CDP",
        embeds: [
          {
            title: "🧪 Test Message",
            description: "Test message from Cairo CDP configuration UI",
            color: 0x3498db,
            timestamp: new Date().toISOString(),
            footer: {
              text: "Cairo CDP"
            }
          }
        ]
      });
      return {
        success: true,
        message: "Test message sent to Discord successfully"
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  setupRoutes() {
    router.get("/", this.getConfig.bind(this));
    router.put("/", this.updateConfig.bind(this));
    router.post("/test", this.testConnection.bind(this));

    return router;
  }
}

module.exports = EnvConfigRoutes;