const logger = require("../utils/logger");

/**
 * Base Destination Plugin Class
 * All destination integrations inherit from this
 */
class BaseDestination {
  constructor(config = {}) {
    this.config = config;
    this.enabled = config.enabled !== false;
    this.name = this.constructor.name;
  }

  // Methods that must be implemented by each destination
  async track(event) {
    throw new Error(`track() not implemented for ${this.name}`);
  }

  async identify(user) {
    throw new Error(`identify() not implemented for ${this.name}`);
  }

  async page(pageView) {
    throw new Error(`page() not implemented for ${this.name}`);
  }

  async group(group) {
    throw new Error(`group() not implemented for ${this.name}`);
  }

  async alias(alias) {
    throw new Error(`alias() not implemented for ${this.name}`);
  }

  // Optional: Test the connection
  async test() {
    return { success: true, message: 'Base test passed' };
  }

  // Optional: Validate configuration
  validateConfig() {
    return { valid: true, errors: [] };
  }

  // Helper method to check if destination should process event
  shouldProcess(event, integrationSettings = {}) {
    if (!this.enabled) return false;

    // Check if this specific destination is disabled for this event
    const destSettings = integrationSettings[this.name];
    if (destSettings === false) return false;

    return true;
  }
}

/**
 * Destination Manager
 * Manages all destination plugins and routes events
 */
class DestinationService {
  constructor() {
    this.destinations = new Map();
    this.stats = {
      eventsProcessed: 0,
      eventsSucceeded: 0,
      eventsFailed: 0,
      destinationStats: new Map(),
    };

    logger.info("DestinationService initialized");
  }

  /**
   * Register a destination plugin
   */
  register(destination) {
    if (!(destination instanceof BaseDestination)) {
      throw new Error("Destination must extend BaseDestination");
    }

    const validation = destination.validateConfig();
    if (!validation.valid) {
      throw new Error(`Invalid destination config: ${validation.errors.join(', ')}`);
    }

    this.destinations.set(destination.name, destination);
    this.stats.destinationStats.set(destination.name, {
      sent: 0,
      failed: 0,
      lastSent: null,
      lastError: null,
    });

    logger.info(`Registered destination: ${destination.name}`);
  }

  /**
   * Remove a destination
   */
  unregister(destinationName) {
    this.destinations.delete(destinationName);
    this.stats.destinationStats.delete(destinationName);
    logger.info(`Unregistered destination: ${destinationName}`);
  }

  /**
   * Get all registered destinations
   */
  getDestinations() {
    return Array.from(this.destinations.values()).map(dest => ({
      name: dest.name,
      enabled: dest.enabled,
      config: dest.config,
    }));
  }

  /**
   * Route an event to all applicable destinations
   */
  async processEvent(eventType, eventData, integrationSettings = {}) {
    this.stats.eventsProcessed++;

    const results = [];
    const promises = [];

    for (const [name, destination] of this.destinations) {
      if (!destination.shouldProcess(eventData, integrationSettings)) {
        continue;
      }

      const promise = this.sendToDestination(destination, eventType, eventData);
      promises.push(promise);
    }

    // Process all destinations in parallel
    const settledResults = await Promise.allSettled(promises);

    settledResults.forEach((result, index) => {
      const destinationName = Array.from(this.destinations.keys())[index];
      const stats = this.stats.destinationStats.get(destinationName);

      if (result.status === 'fulfilled') {
        this.stats.eventsSucceeded++;
        stats.sent++;
        stats.lastSent = new Date();
        results.push({ destination: destinationName, success: true });
      } else {
        this.stats.eventsFailed++;
        stats.failed++;
        stats.lastError = result.reason?.message || 'Unknown error';
        results.push({
          destination: destinationName,
          success: false,
          error: result.reason?.message
        });

        logger.error(`Destination ${destinationName} failed:`, result.reason);
      }
    });

    return results;
  }

  /**
   * Send event to a specific destination
   */
  async sendToDestination(destination, eventType, eventData) {
    switch (eventType) {
      case 'track':
        return await destination.track(eventData);
      case 'identify':
        return await destination.identify(eventData);
      case 'page':
        return await destination.page(eventData);
      case 'group':
        return await destination.group(eventData);
      case 'alias':
        return await destination.alias(eventData);
      default:
        throw new Error(`Unknown event type: ${eventType}`);
    }
  }

  /**
   * Test a destination connection
   */
  async testDestination(destinationName) {
    const destination = this.destinations.get(destinationName);
    if (!destination) {
      throw new Error(`Destination not found: ${destinationName}`);
    }

    try {
      const result = await destination.test();
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      destinationStats: Object.fromEntries(this.stats.destinationStats),
    };
  }

  /**
   * Update destination configuration
   */
  updateDestinationConfig(destinationName, newConfig) {
    const destination = this.destinations.get(destinationName);
    if (!destination) {
      throw new Error(`Destination not found: ${destinationName}`);
    }

    destination.config = { ...destination.config, ...newConfig };
    destination.enabled = newConfig.enabled !== false;

    const validation = destination.validateConfig();
    if (!validation.valid) {
      throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
    }

    logger.info(`Updated destination config: ${destinationName}`);
    return destination.config;
  }
}

module.exports = {
  BaseDestination,
  DestinationService,
};