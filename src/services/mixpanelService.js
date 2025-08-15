const axios = require("axios");
const logger = require("../utils/logger");

/**
 * Direct Mixpanel integration service
 * No Segment middleware - clean and simple
 */
class MixpanelService {
  constructor(projectToken) {
    if (!projectToken) {
      logger.warn("Mixpanel project token not provided - Mixpanel tracking disabled");
      this.enabled = false;
      return;
    }

    this.projectToken = projectToken;
    this.apiUrl = "https://api.mixpanel.com";
    this.enabled = true;

    // Track statistics
    this.stats = {
      eventsTracked: 0,
      usersIdentified: 0,
      errors: 0,
    };

    logger.info("MixpanelService initialized");
  }

  /**
   * Track an event in Mixpanel
   * @param {String} distinctId - User identifier (email)
   * @param {String} event - Event name
   * @param {Object} properties - Event properties
   */
  async track(distinctId, event, properties = {}) {
    if (!this.enabled) {
      logger.debug(`[Mixpanel] Skipped (disabled): ${event} for ${distinctId}`);
      return { success: false, reason: "disabled" };
    }

    try {
      // Mixpanel event format
      const eventData = {
        event: event,
        properties: {
          distinct_id: distinctId,
          token: this.projectToken,
          time: Math.floor(Date.now() / 1000),
          ...properties,
          // Add standard properties
          $insert_id: `${distinctId}_${event}_${Date.now()}`, // Prevent duplicates
          platform: properties.platform || "product",
          source: properties.source || "api",
        },
      };

      // Encode for Mixpanel
      const data = Buffer.from(JSON.stringify(eventData)).toString("base64");

      // Send to Mixpanel
      const response = await axios.post(
        `${this.apiUrl}/track`,
        `data=${data}`,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (response.data === 1 || response.data.status === 1) {
        this.stats.eventsTracked++;
        logger.debug(`[Mixpanel] ✅ Tracked: ${event} for ${distinctId}`);
        return { success: true };
      } else {
        this.stats.errors++;
        logger.error(`[Mixpanel] Failed to track event:`, response.data);
        return { success: false, error: response.data };
      }
    } catch (error) {
      this.stats.errors++;
      logger.error(`[Mixpanel] Error tracking event:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Identify a user in Mixpanel (set user properties)
   * @param {String} distinctId - User identifier (email)
   * @param {Object} properties - User properties
   */
  async identify(distinctId, properties = {}) {
    if (!this.enabled) {
      logger.debug(`[Mixpanel] Skipped identify (disabled): ${distinctId}`);
      return { success: false, reason: "disabled" };
    }

    try {
      // Mixpanel people properties format
      const profileData = {
        $token: this.projectToken,
        $distinct_id: distinctId,
        $set: {
          $email: distinctId, // Use email as the main identifier
          ...properties,
          last_seen: new Date().toISOString(),
        },
      };

      // Encode for Mixpanel
      const data = Buffer.from(JSON.stringify(profileData)).toString("base64");

      // Send to Mixpanel People API
      const response = await axios.post(
        `${this.apiUrl}/engage`,
        `data=${data}`,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (response.data === 1 || response.data.status === 1) {
        this.stats.usersIdentified++;
        logger.debug(`[Mixpanel] ✅ Identified user: ${distinctId}`);
        return { success: true };
      } else {
        this.stats.errors++;
        logger.error(`[Mixpanel] Failed to identify user:`, response.data);
        return { success: false, error: response.data };
      }
    } catch (error) {
      this.stats.errors++;
      logger.error(`[Mixpanel] Error identifying user:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Track multiple events in batch
   * @param {Array} events - Array of event objects
   */
  async trackBatch(events) {
    if (!this.enabled) {
      logger.debug(`[Mixpanel] Skipped batch (disabled): ${events.length} events`);
      return { success: false, reason: "disabled" };
    }

    try {
      // Format events for Mixpanel batch API
      const formattedEvents = events.map((e) => ({
        event: e.event,
        properties: {
          distinct_id: e.distinctId || e.user_email || e.email,
          token: this.projectToken,
          time: e.timestamp
            ? Math.floor(new Date(e.timestamp).getTime() / 1000)
            : Math.floor(Date.now() / 1000),
          ...e.properties,
          $insert_id: `${e.distinctId}_${e.event}_${Date.now()}_${Math.random()}`,
        },
      }));

      // Encode for Mixpanel
      const data = Buffer.from(JSON.stringify(formattedEvents)).toString("base64");

      // Send batch to Mixpanel
      const response = await axios.post(
        `${this.apiUrl}/track`,
        `data=${data}`,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (response.data === 1 || response.data.status === 1) {
        this.stats.eventsTracked += events.length;
        logger.info(`[Mixpanel] ✅ Tracked batch: ${events.length} events`);
        return { success: true, count: events.length };
      } else {
        this.stats.errors++;
        logger.error(`[Mixpanel] Failed to track batch:`, response.data);
        return { success: false, error: response.data };
      }
    } catch (error) {
      this.stats.errors++;
      logger.error(`[Mixpanel] Error tracking batch:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Track engagement events from email platforms
   * @param {Object} eventData - Event data from Lemlist/Smartlead
   */
  async trackEngagementEvent(eventData) {
    const {
      user_id,
      event_type,
      platform,
      metadata,
      created_at,
    } = eventData;

    // Map event types to cleaner names
    const eventNameMap = {
      "Email Sent": "Email Sent",
      "Email Opened": "Email Opened",
      "Email Clicked": "Email Clicked",
      "Email Replied": "Email Replied",
      "LinkedIn Sent": "LinkedIn Message Sent",
      "LinkedIn Opened": "LinkedIn Message Viewed",
      "LinkedIn Replied": "LinkedIn Message Replied",
    };

    const eventName = eventNameMap[event_type] || event_type;

    // Parse metadata if string
    const meta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;

    const properties = {
      platform,
      campaign_name: meta?.campaign_name,
      campaign_id: meta?.campaign_id,
      sequence_step: meta?.sequence_step,
      subject: meta?.subject,
      channel: meta?.channel || platform,
      ...meta,
    };

    return this.track(user_id, eventName, properties);
  }

  /**
   * Track product events
   * @param {String} userEmail - User email
   * @param {String} event - Event name
   * @param {Object} properties - Event properties
   */
  async trackProductEvent(userEmail, event, properties = {}) {
    // Add product-specific context
    const enrichedProperties = {
      ...properties,
      platform: "product",
      source: "product_api",
      tracked_at: new Date().toISOString(),
    };

    return this.track(userEmail, event, enrichedProperties);
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      enabled: this.enabled,
    };
  }
}

module.exports = MixpanelService;
