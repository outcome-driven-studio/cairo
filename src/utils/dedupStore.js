const { query } = require("./db");
const logger = require("./logger");

class DedupStore {
  constructor() {
    logger.info('DedupStore initialized');
  }

  /**
   * Generate a unique event key
   * @param {Object} event Event data
   * @returns {string} Unique event key
   */
  generateEventKey(event) {
    const components = [
      event.email,
      event.event_type,
      event.campaign_id,
      `${event.email}_${event.campaign_id}_${event.event_type}_${event.timestamp}`
    ];
    return components.join(':');
  }

  /**
   * Check if an event already exists (alias for eventExists for compatibility)
   * @param {string} eventKey Unique event key
   * @param {string} platform Platform name (e.g. 'smartlead', 'lemlist')
   * @param {string} eventType Event type
   * @returns {Promise<boolean>} Whether the event exists
   */
  async isDuplicate(eventKey, platform, eventType) {
    return this.eventExists(eventKey, platform, eventType);
  }

  /**
   * Check if an event already exists
   * @param {string} eventKey Unique event key
   * @param {string} platform Platform name (e.g. 'smartlead', 'lemlist')
   * @param {string} eventType Event type
   * @returns {Promise<boolean>} Whether the event exists
   */
  async eventExists(eventKey, platform, eventType) {
    try {
      const result = await query(
        'SELECT 1 FROM sent_events WHERE event_key = $1 AND platform = $2 AND event_type = $3',
        [eventKey, platform, eventType]
      );
      
      const exists = result.rows.length > 0;
      if (exists) {
        logger.info(`[DUPLICATE] Event already exists: ${eventKey} (${platform}, ${eventType})`);
      }
      return exists;
    } catch (error) {
      logger.error(`Error checking event existence: ${error.message}`);
      return false;
    }
  }

  /**
   * Store a new event
   * @param {Object} event Event data
   * @returns {Promise<Object>} Stored event
   */
  async storeEvent(event) {
    try {
      const eventKey = this.generateEventKey(event);
      
      // Check for duplicates
      if (await this.eventExists(eventKey, event.platform, event.event_type)) {
        return null;
      }

      // Store the event
      const result = await query(
        `INSERT INTO sent_events 
         (event_key, email, linkedin_profile, event_type, platform, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          eventKey,
          event.email,
          event.linkedin_profile || null,
          event.event_type,
          event.platform,
          event.metadata || {},
          event.timestamp || new Date()
        ]
      );

      logger.info(`✅ Stored new event: ${eventKey}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error storing event: ${error.message}`);
      return null;
    }
  }

  /**
   * Get event count by type
   * @param {string} platform Platform name
   * @param {string} eventType Event type
   * @returns {Promise<number>} Count of events
   */
  async getEventCount(platform, eventType) {
    const result = await query(
      'SELECT COUNT(*) FROM sent_events WHERE platform = $1 AND event_type = $2',
      [platform, eventType]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = DedupStore;
