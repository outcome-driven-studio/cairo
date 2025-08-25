/**
 * Full Sync Configuration System
 *
 * Provides flexible configuration options for full synchronization
 * operations with date ranges, namespace control, and platform selection.
 */

const { validateDateRange, parseDate } = require("../utils/dateUtils");
const logger = require("../utils/logger");

/**
 * Sync Mode Enumeration
 */
const SYNC_MODES = {
  FULL_HISTORICAL: "FULL_HISTORICAL", // Sync all historical data, ignore last_sync_time
  DATE_RANGE: "DATE_RANGE", // Sync specific date range
  RESET_FROM_DATE: "RESET_FROM_DATE", // Reset last_sync_time and sync from specific date
};

/**
 * Platform Enumeration
 */
const PLATFORMS = {
  SMARTLEAD: "smartlead",
  LEMLIST: "lemlist",
};

/**
 * Default Configuration Values
 */
const DEFAULT_CONFIG = {
  batchSize: 100,
  rateLimitDelay: 500,
  enableMixpanelTracking: true,
  enableProgressTracking: true,
  enableDeduplication: true,
  skipExistingEvents: true,
};

/**
 * Full Sync Configuration Class
 */
class FullSyncConfig {
  constructor(options = {}) {
    this.mode = options.mode || SYNC_MODES.DATE_RANGE;
    this.platforms = this._normalizePlatforms(options.platforms);
    this.namespaces = this._normalizeNamespaces(options.namespaces);
    this.dateRange = options.dateRange || null;
    this.resetDate = options.resetDate || null;
    this.batchSize = options.batchSize || DEFAULT_CONFIG.batchSize;
    this.rateLimitDelay =
      options.rateLimitDelay || DEFAULT_CONFIG.rateLimitDelay;
    this.enableMixpanelTracking = options.enableMixpanelTracking !== false;
    this.enableProgressTracking = options.enableProgressTracking !== false;
    this.enableDeduplication = options.enableDeduplication !== false;
    this.skipExistingEvents = options.skipExistingEvents !== false;

    this._validate();
  }

  /**
   * Validate the configuration
   * @private
   */
  _validate() {
    // Validate sync mode
    if (!Object.values(SYNC_MODES).includes(this.mode)) {
      throw new Error(
        `Invalid sync mode: ${this.mode}. Valid modes: ${Object.values(
          SYNC_MODES
        ).join(", ")}`
      );
    }

    // Validate platforms
    if (!this.platforms || this.platforms.length === 0) {
      throw new Error("At least one platform must be specified");
    }

    // Validate mode-specific requirements
    switch (this.mode) {
      case SYNC_MODES.DATE_RANGE:
        if (!this.dateRange || !this.dateRange.start || !this.dateRange.end) {
          throw new Error(
            "DATE_RANGE mode requires dateRange with start and end dates"
          );
        }
        validateDateRange(this.dateRange.start, this.dateRange.end);
        break;

      case SYNC_MODES.RESET_FROM_DATE:
        if (!this.resetDate) {
          throw new Error("RESET_FROM_DATE mode requires resetDate");
        }
        parseDate(this.resetDate); // Validates date format
        break;
    }

    // Validate batch size
    if (this.batchSize < 1 || this.batchSize > 1000) {
      throw new Error("batchSize must be between 1 and 1000");
    }

    // Validate rate limit delay
    if (this.rateLimitDelay < 0) {
      throw new Error("rateLimitDelay must be non-negative");
    }

    logger.info("Full sync configuration validated successfully", {
      mode: this.mode,
      platforms: this.platforms,
      namespaces: this.namespaces,
    });
  }

  /**
   * Normalize platforms input to array format
   * @private
   */
  _normalizePlatforms(platforms) {
    if (!platforms) {
      return Object.values(PLATFORMS); // Default to all platforms
    }

    if (typeof platforms === "string") {
      platforms = [platforms];
    }

    if (!Array.isArray(platforms)) {
      throw new Error("platforms must be string, array, or null");
    }

    // Validate each platform
    const validPlatforms = platforms.filter((platform) => {
      const isValid = Object.values(PLATFORMS).includes(platform);
      if (!isValid) {
        logger.warn(
          `Invalid platform specified: ${platform}. Valid platforms: ${Object.values(
            PLATFORMS
          ).join(", ")}`
        );
      }
      return isValid;
    });

    if (validPlatforms.length === 0) {
      throw new Error(
        `No valid platforms specified. Valid platforms: ${Object.values(
          PLATFORMS
        ).join(", ")}`
      );
    }

    return validPlatforms;
  }

  /**
   * Normalize namespaces input
   * @private
   */
  _normalizeNamespaces(namespaces) {
    if (!namespaces || namespaces === "all") {
      return "all";
    }

    if (typeof namespaces === "string") {
      namespaces = [namespaces];
    }

    if (!Array.isArray(namespaces)) {
      throw new Error('namespaces must be string, array, or "all"');
    }

    return namespaces.filter(
      (ns) => ns && typeof ns === "string" && ns.trim().length > 0
    );
  }

  /**
   * Check if a platform should be synced
   */
  shouldSyncPlatform(platform) {
    return this.platforms.includes(platform);
  }

  /**
   * Check if a namespace should be synced
   */
  shouldSyncNamespace(namespace) {
    if (this.namespaces === "all") {
      return true;
    }

    return this.namespaces.includes(namespace);
  }

  /**
   * Get the date filter for queries based on sync mode
   */
  getDateFilter() {
    switch (this.mode) {
      case SYNC_MODES.FULL_HISTORICAL:
        return null; // No date filter

      case SYNC_MODES.DATE_RANGE:
        return {
          start: parseDate(this.dateRange.start),
          end: parseDate(this.dateRange.end),
        };

      case SYNC_MODES.RESET_FROM_DATE:
        return {
          start: parseDate(this.resetDate),
          end: null, // No end date - sync from reset date to now
        };

      default:
        return null;
    }
  }

  /**
   * Get summary of configuration for logging
   */
  getSummary() {
    return {
      mode: this.mode,
      platforms: this.platforms,
      namespaces: this.namespaces,
      dateFilter: this.getDateFilter(),
      batchSize: this.batchSize,
      rateLimitDelay: this.rateLimitDelay,
      enableMixpanelTracking: this.enableMixpanelTracking,
      enableProgressTracking: this.enableProgressTracking,
    };
  }

  /**
   * Create configuration from API request parameters
   */
  static fromApiRequest(params) {
    const config = {
      mode: params.mode,
      platforms: params.platforms
        ? params.platforms.includes(",")
          ? params.platforms.split(",").map((p) => p.trim())
          : params.platforms
        : undefined,
      namespaces: params.namespaces
        ? params.namespaces.includes(",")
          ? params.namespaces.split(",").map((n) => n.trim())
          : params.namespaces
        : undefined,
      batchSize: parseInt(params.batchSize) || undefined,
      rateLimitDelay: parseInt(params.rateLimitDelay) || undefined,
    };

    // Handle date range
    if (params.startDate && params.endDate) {
      config.dateRange = {
        start: params.startDate,
        end: params.endDate,
      };
    }

    // Handle reset date
    if (params.resetDate) {
      config.resetDate = params.resetDate;
    }

    // Handle boolean flags
    if (params.enableMixpanelTracking !== undefined) {
      config.enableMixpanelTracking = params.enableMixpanelTracking === "true";
    }

    if (params.enableProgressTracking !== undefined) {
      config.enableProgressTracking = params.enableProgressTracking === "true";
    }

    return new FullSyncConfig(config);
  }
}

module.exports = {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
  DEFAULT_CONFIG,
};
