class InMemoryStorage {
  constructor() {
    this.data = new Map();
    this.processedEvents = new Set();
    this.eventTimestamps = new Map();

    // Clean up old events every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Store a value with the given key
   * @param {string} key - The storage key
   * @param {any} value - The value to store
   * @returns {boolean} - Success indicator
   */
  set(key, value) {
    this.data.set(key, value);
    return true;
  }

  /**
   * Retrieve a value by key
   * @param {string} key - The storage key
   * @returns {any} - The stored value or null if not found
   */
  get(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  /**
   * Check if a key exists in storage
   * @param {string} key - The key to check
   * @returns {boolean} - True if the key exists
   */
  has(key) {
    return this.data.has(key);
  }

  /**
   * Remove a key-value pair from storage
   * @param {string} key - The key to remove
   * @returns {boolean} - Success indicator
   */
  delete(key) {
    return this.data.delete(key);
  }

  /**
   * Clear all stored data
   */
  clear() {
    this.data.clear();
  }

  hasProcessed(eventId) {
    return this.processedEvents.has(eventId);
  }

  markProcessed(eventId) {
    this.processedEvents.add(eventId);
    this.eventTimestamps.set(eventId, Date.now());
  }

  cleanup() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    for (const [eventId, timestamp] of this.eventTimestamps.entries()) {
      if (timestamp < cutoff) {
        this.processedEvents.delete(eventId);
        this.eventTimestamps.delete(eventId);
      }
    }
  }

  getStats() {
    return {
      totalProcessedEvents: this.processedEvents.size,
      oldestEvent: this.eventTimestamps.size > 0 ? 
        new Date(Math.min(...this.eventTimestamps.values())).toISOString() : null
    };
  }
}

module.exports = InMemoryStorage;
