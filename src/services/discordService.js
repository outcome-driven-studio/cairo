const axios = require("axios");
const logger = require("../utils/logger");
const { createRateLimiter } = require("../utils/unifiedRateLimiter");

/**
 * Discord integration service for event alerts
 * Sends notifications to Discord channels via webhooks for important events
 */
class DiscordService {
  constructor(webhookUrl, config = {}) {
    if (!webhookUrl) {
      logger.warn("Discord webhook URL not provided - Discord alerts disabled");
      this.enabled = false;
      return;
    }

    this.webhookUrl = webhookUrl;
    this.enabled = true;

    // Parse event configuration
    let alertConfig = this.parseEventConfig(config.alertEvents);

    // Configuration
    this.config = {
      // Default alert settings
      defaultChannel: config.defaultChannel || null,
      username: config.username || "Cairo Events",
      avatarUrl: config.avatarUrl || null,

      // Event configuration - supports both simple array and advanced object format
      alertEvents: alertConfig.events || [],
      eventConfig: alertConfig.config || {},

      // Global thresholds (can be overridden per event)
      thresholds: {
        payment_amount: config.paymentThreshold || 100,
        usage_count: config.usageThreshold || 1000,
        ...config.thresholds,
      },

      // Rate limiting
      maxAlertsPerMinute: config.maxAlertsPerMinute || 10,

      // Include additional context
      includeProperties: config.includeProperties !== false,
      includeTimestamp: config.includeTimestamp !== false,
      includeUserInfo: config.includeUserInfo !== false,
    };

    // Track statistics
    this.stats = {
      alertsSent: 0,
      alertsFailed: 0,
      lastAlertTime: null,
    };

    // Rate limiting using unified rate limiter
    this.rateLimiter = createRateLimiter("discord");

    logger.info("DiscordService initialized", {
      enabled: this.enabled,
      alertEvents: this.config.alertEvents,
      eventConfig: this.config.eventConfig,
    });
  }

  /**
   * Parse event configuration from various formats
   * @param {String|Array|Object} eventConfig - Event configuration
   * @returns {Object} Parsed configuration
   */
  parseEventConfig(eventConfig) {
    // If not provided, use defaults
    if (!eventConfig) {
      return {
        events: [
          "signup_completed",
          "subscription_created",
          "payment_succeeded",
          "trial_started",
        ],
        config: {},
      };
    }

    // If it's a string (from env var), try to parse as JSON first
    if (typeof eventConfig === "string") {
      try {
        // Try parsing as JSON for advanced config
        const parsed = JSON.parse(eventConfig);
        return this.parseEventConfig(parsed);
      } catch (e) {
        // If not JSON, treat as comma-separated list
        return {
          events: eventConfig
            .split(",")
            .map((e) => e.trim())
            .filter((e) => e),
          config: {},
        };
      }
    }

    // If it's an array, use as simple event list
    if (Array.isArray(eventConfig)) {
      return {
        events: eventConfig,
        config: {},
      };
    }

    // If it's an object, parse advanced configuration
    if (typeof eventConfig === "object") {
      const events = [];
      const config = {};

      Object.entries(eventConfig).forEach(([event, settings]) => {
        events.push(event);

        // Settings can be boolean (true = enable) or object with config
        if (typeof settings === "object" && settings !== null) {
          config[event] = {
            enabled: settings.enabled !== false,
            channel: settings.channel,
            threshold: settings.threshold,
            properties: settings.properties || [],
            template: settings.template,
            color: settings.color,
            ...settings,
          };
        } else if (settings === true) {
          config[event] = { enabled: true };
        }
      });

      return { events, config };
    }

    // Default fallback
    return { events: [], config: {} };
  }

  /**
   * Check if an event should trigger a Discord alert
   * @param {String} eventName - Name of the event
   * @param {Object} properties - Event properties
   * @returns {Boolean} Whether to send alert
   */
  shouldAlert(eventName, properties = {}) {
    if (!this.enabled) return false;

    // Check if event is in alert list
    if (this.config.alertEvents.length > 0) {
      if (!this.config.alertEvents.includes(eventName)) {
        return false;
      }
    }

    // Check event-specific configuration
    const eventConfig = this.config.eventConfig[eventName];
    if (eventConfig && eventConfig.enabled === false) {
      return false;
    }

    // Check thresholds
    if (eventConfig && eventConfig.threshold) {
      const thresholdProperty =
        eventConfig.thresholdProperty || "amount";
      const value = properties[thresholdProperty] || 0;
      if (value < eventConfig.threshold) {
        return false;
      }
    }

    // Check global payment threshold
    if (
      eventName.toLowerCase().includes("payment") ||
      eventName.toLowerCase().includes("purchase")
    ) {
      const amount =
        properties.amount ||
        properties.revenue ||
        properties.price ||
        0;
      if (amount < this.config.thresholds.payment_amount) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check rate limiting using unified rate limiter
   * @returns {Boolean} Whether alert can be sent
   */
  async checkRateLimit() {
    try {
      await this.rateLimiter.waitForToken();
      return true;
    } catch (error) {
      logger.warn("Discord rate limit reached:", error.message);
      return false;
    }
  }

  /**
   * Format event data for Discord message
   * @param {Object} eventData - Event data to send
   * @returns {Object} Formatted Discord message
   */
  formatMessage(eventData) {
    const { event, properties = {}, user_email, timestamp } = eventData;

    // Get event configuration
    const eventConfig = this.config.eventConfig[event] || {};
    const color = this.getColorForEvent(event, eventConfig.color);

    // Build embed
    const embed = {
      title: this.getEventTitle(event),
      description: this.buildDescription(event, properties, user_email),
      color: color,
      timestamp: timestamp || new Date().toISOString(),
      fields: [],
      footer: {
        text: "Cairo CDP",
      },
    };

    // Add user info
    if (this.config.includeUserInfo && user_email) {
      embed.fields.push({
        name: "User",
        value: user_email,
        inline: true,
      });
    }

    // Add key properties
    if (this.config.includeProperties && properties) {
      const importantProps = eventConfig.properties || [];
      const propsToShow = importantProps.length > 0
        ? importantProps
        : Object.keys(properties).slice(0, 5);

      propsToShow.forEach((key) => {
        if (properties[key] !== undefined && properties[key] !== null) {
          embed.fields.push({
            name: this.formatFieldName(key),
            value: String(properties[key]),
            inline: true,
          });
        }
      });
    }

    // Build Discord webhook payload
    const payload = {
      username: this.config.username,
      embeds: [embed],
    };

    // Add avatar if configured
    if (this.config.avatarUrl) {
      payload.avatar_url = this.config.avatarUrl;
    }

    return payload;
  }

  /**
   * Get event title
   */
  getEventTitle(eventName) {
    const eventConfig = this.config.eventConfig[eventName];
    if (eventConfig && eventConfig.title) {
      return eventConfig.title;
    }

    // Format event name
    return eventName
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Build description for embed
   */
  buildDescription(event, properties, user_email) {
    const eventConfig = this.config.eventConfig[event];
    
    if (eventConfig && eventConfig.template) {
      // Use custom template
      return this.formatTemplate(eventConfig.template, {
        event,
        user_email: user_email || "Unknown",
        ...properties,
      });
    }

    // Default description
    return `Event: **${event}**${user_email ? `\nUser: ${user_email}` : ""}`;
  }

  /**
   * Format template string
   */
  formatTemplate(template, data) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return data.hasOwnProperty(key) ? data[key] : match;
    });
  }

  /**
   * Format field name
   */
  formatFieldName(key) {
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Get color for event type
   */
  getColorForEvent(eventName, customColor = null) {
    if (customColor) {
      // Convert hex to decimal
      return parseInt(customColor.replace("#", ""), 16);
    }

    const eventLower = eventName.toLowerCase();

    // Color mapping (Discord uses decimal colors)
    if (eventLower.includes("signup") || eventLower.includes("register")) {
      return 0x36a64f; // Green
    }
    if (eventLower.includes("payment") || eventLower.includes("purchase")) {
      return 0x2eb886; // Teal
    }
    if (eventLower.includes("error") || eventLower.includes("fail")) {
      return 0xdc3545; // Red
    }
    if (eventLower.includes("warning") || eventLower.includes("alert")) {
      return 0xff9900; // Orange
    }
    if (eventLower.includes("success") || eventLower.includes("complete")) {
      return 0x36a64f; // Green
    }

    return 0x3498db; // Blue (default)
  }

  /**
   * Send alert to Discord
   * @param {Object} eventData - Event data to send
   * @returns {Promise<Object>} Result of send operation
   */
  async sendAlert(eventData) {
    if (!this.enabled) {
      return { success: false, reason: "disabled" };
    }

    try {
      // Check if should alert
      if (!this.shouldAlert(eventData.event, eventData.properties)) {
        return { success: false, reason: "filtered" };
      }

      // Check rate limit
      const canSend = await this.checkRateLimit();
      if (!canSend) {
        return { success: false, reason: "rate_limited" };
      }

      // Format message
      const message = this.formatMessage(eventData);

      // Send to Discord
      const response = await axios.post(this.webhookUrl, message, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 5000,
      });

      this.stats.alertsSent++;
      this.stats.lastAlertTime = new Date();

      logger.debug(`[Discord] Alert sent for event: ${eventData.event}`);

      return { success: true };
    } catch (error) {
      this.stats.alertsFailed++;
      logger.error("[Discord] Failed to send alert:", error.message);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send custom alert to Discord
   * @param {Object} alertData - Custom alert data
   * @returns {Promise<Object>} Result of send operation
   */
  async sendCustomAlert(alertData) {
    if (!this.enabled) {
      return { success: false, reason: "disabled" };
    }

    try {
      const canSend = await this.checkRateLimit();
      if (!canSend) {
        return { success: false, reason: "rate_limited" };
      }

      const payload = {
        username: this.config.username,
        embeds: [
          {
            title: alertData.title || "Alert",
            description: alertData.message || "",
            color: alertData.color
              ? parseInt(alertData.color.replace("#", ""), 16)
              : 0x3498db,
            timestamp: new Date().toISOString(),
            footer: {
              text: "Cairo CDP",
            },
          },
        ],
      };

      if (this.config.avatarUrl) {
        payload.avatar_url = this.config.avatarUrl;
      }

      await axios.post(this.webhookUrl, payload, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 5000,
      });

      this.stats.alertsSent++;
      return { success: true };
    } catch (error) {
      this.stats.alertsFailed++;
      logger.error("[Discord] Failed to send custom alert:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      enabled: this.enabled,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      alertsSent: 0,
      alertsFailed: 0,
      lastAlertTime: null,
    };
  }
}

module.exports = DiscordService;
