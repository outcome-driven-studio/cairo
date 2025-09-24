const axios = require("axios");
const logger = require("../utils/logger");

/**
 * Slack integration service for event alerts
 * Sends notifications to Slack channels for important events
 */
class SlackService {
  constructor(webhookUrl, config = {}) {
    if (!webhookUrl) {
      logger.warn("Slack webhook URL not provided - Slack alerts disabled");
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
      iconEmoji: config.iconEmoji || ":rocket:",

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

    // Rate limiting
    this.alertTimes = [];

    logger.info("SlackService initialized", {
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
   * Check if an event should trigger a Slack alert
   * @param {String} eventName - Name of the event
   * @param {Object} properties - Event properties
   * @returns {Boolean} Whether to send alert
   */
  shouldAlert(eventName, properties = {}) {
    if (!this.enabled) return false;

    // Check if event has specific configuration
    const eventConfig = this.config.eventConfig[eventName];
    if (eventConfig) {
      // If explicitly disabled
      if (eventConfig.enabled === false) return false;

      // Check event-specific threshold
      if (eventConfig.threshold) {
        const thresholdKey = eventConfig.thresholdProperty || "amount";
        if (properties[thresholdKey] < eventConfig.threshold) {
          return false;
        }
      }

      // Check required properties
      if (eventConfig.properties && eventConfig.properties.length > 0) {
        const hasAllProps = eventConfig.properties.every(
          (prop) =>
            properties.hasOwnProperty(prop) && properties[prop] !== undefined
        );
        if (!hasAllProps) return false;
      }

      return true;
    }

    // Check if event is in alert list
    if (!this.config.alertEvents.includes(eventName)) {
      // Check for global threshold conditions
      if (
        eventName === "payment_succeeded" &&
        properties.amount >= this.config.thresholds.payment_amount
      ) {
        return true;
      }

      if (
        eventName === "feature_used" &&
        properties.usage_count >= this.config.thresholds.usage_count
      ) {
        return true;
      }

      return false;
    }

    return true;
  }

  /**
   * Check rate limiting
   * @returns {Boolean} Whether alert can be sent
   */
  checkRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old entries
    this.alertTimes = this.alertTimes.filter((time) => time > oneMinuteAgo);

    // Check limit
    if (this.alertTimes.length >= this.config.maxAlertsPerMinute) {
      logger.warn("Slack rate limit reached", {
        current: this.alertTimes.length,
        limit: this.config.maxAlertsPerMinute,
      });
      return false;
    }

    this.alertTimes.push(now);
    return true;
  }

  /**
   * Format event data for Slack message
   * @param {Object} eventData - Event data
   * @returns {Object} Formatted Slack message
   */
  formatMessage(eventData) {
    const { user_email, event, properties = {}, timestamp } = eventData;

    // Get event-specific configuration
    const eventConfig = this.config.eventConfig[event] || {};

    // Color coding based on event type or custom color
    const color = eventConfig.color || this.getEventColor(event);

    // Build message
    const message = {
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      attachments: [
        {
          color: color,
          title: eventConfig.title || `Event: ${this.formatEventName(event)}`,
          fields: [],
          footer: eventConfig.footer || "Cairo Event Tracking",
          ts: Math.floor(new Date(timestamp || Date.now()).getTime() / 1000),
        },
      ],
    };

    // Add custom text if template is provided
    if (eventConfig.template) {
      message.attachments[0].text = this.formatTemplate(eventConfig.template, {
        event,
        user_email,
        ...properties,
      });
    }

    // Add user info
    if (this.config.includeUserInfo && user_email) {
      message.attachments[0].fields.push({
        title: "User",
        value: user_email,
        short: true,
      });
    }

    // Add important properties
    if (this.config.includeProperties && properties) {
      const importantProps = this.getImportantProperties(event, properties);

      Object.entries(importantProps).forEach(([key, value]) => {
        message.attachments[0].fields.push({
          title: this.formatPropertyName(key),
          value: this.formatPropertyValue(value),
          short: true,
        });
      });
    }

    // Add custom channel if specified (priority: property > event config > default)
    if (
      properties._slackChannel ||
      eventConfig.channel ||
      this.config.defaultChannel
    ) {
      message.channel =
        properties._slackChannel ||
        eventConfig.channel ||
        this.config.defaultChannel;
    }

    return message;
  }

  /**
   * Format a template string with variables
   * @param {String} template - Template string with {variables}
   * @param {Object} data - Data to interpolate
   * @returns {String} Formatted string
   */
  formatTemplate(template, data) {
    return template.replace(/{(\w+)}/g, (match, key) => {
      return data.hasOwnProperty(key) ? data[key] : match;
    });
  }

  /**
   * Send alert to Slack
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
      if (!this.checkRateLimit()) {
        return { success: false, reason: "rate_limited" };
      }

      // Format message
      const message = this.formatMessage(eventData);

      // Send to Slack
      const response = await axios.post(this.webhookUrl, message, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      this.stats.alertsSent++;
      this.stats.lastAlertTime = new Date();

      logger.debug(`[Slack] Alert sent for event: ${eventData.event}`);

      return { success: true };
    } catch (error) {
      this.stats.alertsFailed++;
      logger.error("[Slack] Failed to send alert:", error.message);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get color for event type
   * @param {String} eventName - Event name
   * @returns {String} Hex color code
   */
  getEventColor(eventName) {
    const colorMap = {
      // Success events - Green
      signup_completed: "#36a64f",
      payment_succeeded: "#36a64f",
      subscription_created: "#36a64f",

      // Warning events - Yellow
      trial_ending: "#ff9900",
      subscription_cancelled: "#ff9900",

      // Error events - Red
      payment_failed: "#dc3545",
      error_occurred: "#dc3545",

      // Info events - Blue
      feature_used: "#0084ff",
      login_succeeded: "#0084ff",
    };

    return colorMap[eventName] || "#808080"; // Default gray
  }

  /**
   * Format event name for display
   * @param {String} eventName - Raw event name
   * @returns {String} Formatted name
   */
  formatEventName(eventName) {
    return eventName
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Get important properties for specific event types
   * @param {String} eventName - Event name
   * @param {Object} properties - All properties
   * @returns {Object} Filtered properties
   */
  getImportantProperties(eventName, properties) {
    const importantProps = {};

    // Define important properties per event type
    const propertyMap = {
      signup_completed: ["plan", "source", "company"],
      payment_succeeded: ["amount", "currency", "plan"],
      subscription_created: ["plan", "interval", "amount"],
      feature_used: ["feature_name", "usage_count", "page"],
      trial_started: ["plan", "duration_days"],
      page_viewed: ["page", "referrer"],
      button_clicked: ["button_name", "page", "location"],
    };

    const propsToInclude = propertyMap[eventName] || [];

    // Add mapped properties
    propsToInclude.forEach((prop) => {
      if (properties[prop] !== undefined) {
        importantProps[prop] = properties[prop];
      }
    });

    // Add any properties starting with "alert_"
    Object.keys(properties).forEach((key) => {
      if (key.startsWith("alert_")) {
        importantProps[key.replace("alert_", "")] = properties[key];
      }
    });

    return importantProps;
  }

  /**
   * Format property name for display
   * @param {String} propName - Property name
   * @returns {String} Formatted name
   */
  formatPropertyName(propName) {
    return propName
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Format property value for display
   * @param {Any} value - Property value
   * @returns {String} Formatted value
   */
  formatPropertyValue(value) {
    if (typeof value === "number") {
      // Format currency
      if (value > 100) {
        return `$${value.toFixed(2)}`;
      }
      return value.toString();
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (value instanceof Date) {
      return value.toLocaleString();
    }

    return String(value);
  }

  /**
   * Send a custom alert
   * @param {String} title - Alert title
   * @param {String} text - Alert text
   * @param {Object} options - Additional options
   */
  async sendCustomAlert(title, text, options = {}) {
    if (!this.enabled) return { success: false, reason: "disabled" };

    try {
      const message = {
        username: this.config.username,
        icon_emoji: this.config.iconEmoji,
        text: title,
        attachments: [
          {
            color: options.color || "#0084ff",
            text: text,
            fields: options.fields || [],
            footer: "Cairo Event Tracking",
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      if (options.channel || this.config.defaultChannel) {
        message.channel = options.channel || this.config.defaultChannel;
      }

      const response = await axios.post(this.webhookUrl, message);

      return { success: true };
    } catch (error) {
      logger.error("[Slack] Failed to send custom alert:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      enabled: this.enabled,
      rateLimit: {
        current: this.alertTimes.length,
        max: this.config.maxAlertsPerMinute,
      },
    };
  }
}

module.exports = SlackService;
