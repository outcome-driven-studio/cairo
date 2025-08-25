const crypto = require("crypto");
const logger = require("./logger");

/**
 * Unified Event Key Generator
 *
 * Provides a reliable, collision-resistant event key generation system
 * that standardizes key generation across all platforms and services.
 *
 * Key Format: {platform}_{campaign_id}_{event_type}_{unique_identifier}_{hash_suffix}
 *
 * Features:
 * - Collision detection and prevention
 * - Robust fallback mechanisms
 * - Consistent format across all platforms
 * - Hash-based collision resistance
 * - Validation and monitoring
 */
class EventKeyGenerator {
  constructor() {
    this.collisionStats = {
      total_generated: 0,
      collisions_detected: 0,
      fallback_used: 0,
      invalid_inputs: 0,
    };

    this.collisionCache = new Map(); // In-memory collision detection
    this.maxCacheSize = 10000; // Prevent memory leaks
  }

  /**
   * Generate a unique, collision-resistant event key
   * @param {Object} options Event data
   * @param {string} options.platform Platform name (smartlead, lemlist)
   * @param {string} options.campaignId Campaign identifier
   * @param {string} options.eventType Event type (sent, opened, clicked, etc.)
   * @param {string} options.email User email
   * @param {string|number} [options.activityId] Platform-specific activity ID
   * @param {string|Date} [options.timestamp] Event timestamp
   * @param {string} [options.namespace] Namespace context
   * @param {Object} [options.metadata] Additional identifying data
   * @returns {string} Unique event key
   */
  generateEventKey(options) {
    this.collisionStats.total_generated++;

    try {
      // Validate required fields
      const validation = this._validateInput(options);
      if (!validation.isValid) {
        this.collisionStats.invalid_inputs++;
        logger.warn(
          `[EventKey] Invalid input: ${validation.errors.join(", ")}`,
          { options }
        );
        return this._generateFallbackKey(options);
      }

      // Extract and clean components
      const platform = this._cleanComponent(options.platform);
      const campaignId = this._cleanComponent(options.campaignId);
      const eventType = this._cleanComponent(options.eventType);
      const email = this._cleanComponent(options.email);

      // Create unique identifier with multiple fallback levels
      const uniqueId = this._generateUniqueIdentifier(options);

      // Create hash suffix for collision resistance
      const hashData = {
        platform,
        campaignId,
        eventType,
        email,
        uniqueId,
        timestamp: options.timestamp
          ? new Date(options.timestamp).getTime()
          : Date.now(),
        namespace: options.namespace || "default",
      };

      const hashSuffix = this._generateHashSuffix(hashData);

      // Construct event key
      const eventKey = `${platform}_${campaignId}_${eventType}_${uniqueId}_${hashSuffix}`;

      // Check for collisions and handle them
      return this._handleCollisions(eventKey, options);
    } catch (error) {
      this.collisionStats.invalid_inputs++;
      logger.error(`[EventKey] Generation failed:`, error, { options });
      return this._generateFallbackKey(options);
    }
  }

  /**
   * Detect if an event key already exists in cache
   * @param {string} eventKey Event key to check
   * @returns {boolean} True if collision detected
   */
  detectCollision(eventKey) {
    return this.collisionCache.has(eventKey);
  }

  /**
   * Register an event key to track collisions
   * @param {string} eventKey Event key to register
   * @param {Object} metadata Associated metadata
   */
  registerEventKey(eventKey, metadata = {}) {
    // Manage cache size to prevent memory leaks
    if (this.collisionCache.size >= this.maxCacheSize) {
      const firstKey = this.collisionCache.keys().next().value;
      this.collisionCache.delete(firstKey);
    }

    this.collisionCache.set(eventKey, {
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Get collision statistics
   * @returns {Object} Collision statistics
   */
  getStats() {
    return {
      ...this.collisionStats,
      cache_size: this.collisionCache.size,
      collision_rate:
        this.collisionStats.total_generated > 0
          ? (
              (this.collisionStats.collisions_detected /
                this.collisionStats.total_generated) *
              100
            ).toFixed(2) + "%"
          : "0%",
    };
  }

  /**
   * Clear collision cache (useful for testing)
   */
  clearCache() {
    this.collisionCache.clear();
  }

  /**
   * Validate input options
   * @private
   */
  _validateInput(options) {
    const errors = [];

    if (!options) {
      errors.push("Options object is required");
      return { isValid: false, errors };
    }

    if (!options.platform) errors.push("platform is required");
    if (!options.campaignId) errors.push("campaignId is required");
    if (!options.eventType) errors.push("eventType is required");
    if (!options.email) errors.push("email is required");

    // Additional validation
    if (
      options.platform &&
      !["smartlead", "lemlist"].includes(options.platform.toLowerCase())
    ) {
      errors.push('platform must be "smartlead" or "lemlist"');
    }

    if (options.email && !this._isValidEmail(options.email)) {
      errors.push("email format is invalid");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clean component strings for key generation
   * @private
   */
  _cleanComponent(str) {
    if (!str) return "unknown";
    return (
      String(str)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") // Remove non-alphanumeric
        .substring(0, 50) || // Limit length
      "unknown"
    );
  }

  /**
   * Generate unique identifier with robust fallbacks
   * @private
   */
  _generateUniqueIdentifier(options) {
    // Priority order for unique identification
    const identifiers = [
      options.activityId,
      options.metadata?.activity_id,
      options.metadata?.event_id,
      options.metadata?.id,
      options.metadata?.seq_id,
      options.metadata?.email_campaign_seq_id,
    ].filter(Boolean);

    if (identifiers.length > 0) {
      return this._cleanComponent(identifiers[0]);
    }

    // Fallback: Create identifier from email + timestamp
    const email = this._cleanComponent(options.email);
    const timestamp = options.timestamp
      ? new Date(options.timestamp).getTime()
      : Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);

    this.collisionStats.fallback_used++;
    logger.warn(`[EventKey] Using fallback identifier for event`, { options });

    return `${email}${timestamp}${randomSuffix}`.substring(0, 50);
  }

  /**
   * Generate collision-resistant hash suffix
   * @private
   */
  _generateHashSuffix(hashData) {
    const dataString = JSON.stringify(hashData, Object.keys(hashData).sort());
    return crypto
      .createHash("md5")
      .update(dataString)
      .digest("hex")
      .substring(0, 8);
  }

  /**
   * Handle collision detection and resolution
   * @private
   */
  _handleCollisions(eventKey, options) {
    if (this.detectCollision(eventKey)) {
      this.collisionStats.collisions_detected++;
      logger.warn(`[EventKey] Collision detected for key: ${eventKey}`, {
        options,
      });

      // Generate collision-resistant variant
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const collisionKey = `${eventKey}_collision_${timestamp}_${randomSuffix}`;

      logger.info(
        `[EventKey] Generated collision-resistant key: ${collisionKey}`
      );
      this.registerEventKey(collisionKey, {
        collision: true,
        original_key: eventKey,
      });

      return collisionKey;
    }

    // Register key for future collision detection
    this.registerEventKey(eventKey);
    return eventKey;
  }

  /**
   * Generate fallback key when normal generation fails
   * @private
   */
  _generateFallbackKey(options) {
    const platform = options?.platform || "unknown";
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString("hex");

    const fallbackKey = `${platform}_fallback_${timestamp}_${randomId}`;

    logger.error(`[EventKey] Generated fallback key: ${fallbackKey}`, {
      options,
    });
    this.registerEventKey(fallbackKey, { fallback: true });

    return fallbackKey;
  }

  /**
   * Basic email validation
   * @private
   */
  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Platform-specific event key generators for compatibility
   */

  /**
   * Generate Lemlist event key with improved reliability
   */
  generateLemlistKey(activity, campaignId, namespace = "default") {
    return this.generateEventKey({
      platform: "lemlist",
      campaignId: campaignId || activity.campaignId,
      eventType: activity.type,
      email: activity.lead?.email || activity.email,
      activityId: activity.id || activity._id,
      timestamp: activity.date || activity.createdAt,
      namespace,
      metadata: {
        activity_id: activity.id,
        _id: activity._id,
        leadId: activity.leadId,
        campaignName: activity.campaignName,
      },
    });
  }

  /**
   * Generate Smartlead event key with improved reliability
   */
  generateSmartleadKey(
    event,
    eventType,
    campaignId,
    email,
    namespace = "default"
  ) {
    return this.generateEventKey({
      platform: "smartlead",
      campaignId,
      eventType,
      email,
      activityId: event.id || event.email_campaign_seq_id,
      timestamp:
        event.sent_time ||
        event.open_time ||
        event.click_time ||
        event.reply_time ||
        event.created_at,
      namespace,
      metadata: {
        event_id: event.id,
        email_campaign_seq_id: event.email_campaign_seq_id,
        lead_id: event.lead_id,
        seq_id: event.seq_id,
      },
    });
  }
}

// Export singleton instance
const eventKeyGenerator = new EventKeyGenerator();

module.exports = {
  EventKeyGenerator,
  eventKeyGenerator,
};
