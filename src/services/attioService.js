const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Attio CRM integration service
 * Syncs lead data to Attio workspace
 */
class AttioService {
  constructor(apiKey = null) {
    this.apiKey = apiKey || process.env.ATTIO_API_KEY;
    this.baseUrl = 'https://api.attio.com/v2';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      logger.warn('[Attio] Service disabled - no API key provided');
    } else {
      logger.info('[Attio] Service initialized');
    }

    this.stats = {
      recordsSynced: 0,
      errors: 0
    };
  }

  /**
   * Sync a single record to Attio
   * @param {Object} record - Record data to sync
   * @returns {Promise<Object>} Sync result
   */
  async syncRecord(record) {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured' };
    }

    try {
      const { email, attributes = {} } = record;

      // Create or update person record in Attio
      const response = await axios.post(
        `${this.baseUrl}/objects/people/records`,
        {
          data: {
            values: {
              email_addresses: [{ email_address: email }],
              name: attributes.name || 'Unknown',
              lead_score: attributes.lead_score,
              lead_grade: attributes.lead_grade,
              icp_score: attributes.icp_score,
              organization_name: attributes.organization,
              job_title: attributes.title,
              location: attributes.location,
              last_updated: attributes.last_updated || new Date().toISOString(),
              source: 'cairo_cdp'
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      this.stats.recordsSynced++;
      logger.debug(`[Attio] Synced record for ${email}`);

      return { success: true, data: response.data };

    } catch (error) {
      this.stats.errors++;
      logger.error(`[Attio] Failed to sync record:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test the Attio connection
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured' };
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/workspaces`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return {
        success: true,
        workspace: response.data.data[0]?.name || 'Unknown',
        message: 'Connection successful'
      };

    } catch (error) {
      logger.error('[Attio] Connection test failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List people from Attio workspace
   * @param {number} limit - Number of records to return (max 500)
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Object>} List of people
   */
  async listPeople(limit = 100, offset = 0) {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured', data: [] };
    }

    try {
      // Attio API v2 uses POST for querying records
      const response = await axios.post(
        `${this.baseUrl}/objects/people/records/query`,
        {
          limit: Math.min(limit, 500), // Max 500 per Attio docs
          offset
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.debug(`[Attio] Listed ${response.data.data?.length || 0} people (limit: ${limit}, offset: ${offset})`);

      return {
        success: true,
        data: response.data.data || [],
        count: response.data.data?.length || 0
      };

    } catch (error) {
      logger.error(`[Attio] Failed to list people:`, error.message);
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Create an event in Attio as a note/timeline entry
   * @param {Object} eventData - Event data to create
   * @param {string} userId - Record ID to associate event with
   * @returns {Promise<Object>} Event creation result
   */
  async createEvent(eventData, userId) {
    if (!this.enabled) {
      return { success: false, error: 'Attio not configured' };
    }

    try {
      // Attio API v2 - create a note as timeline entry
      // Note: userId should be the record_id, not email
      const response = await axios.post(
        `${this.baseUrl}/notes`,
        {
          data: {
            parent_object: 'people',
            parent_record_id: userId,
            title: eventData.event_type || 'Event',
            format: 'plaintext',
            content: `Event: ${eventData.event_type}\nPlatform: ${eventData.platform}\nTimestamp: ${eventData.created_at}`,
            created_at: eventData.created_at || new Date().toISOString()
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.debug(`[Attio] Created event note for user ${userId}: ${eventData.event_type}`);

      return { success: true, data: response.data };

    } catch (error) {
      // Log but don't fail - Attio event tracking is optional
      logger.error(`[Attio] Failed to create event:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get service statistics
   * @returns {Object} Service stats
   */
  getStats() {
    return {
      ...this.stats,
      enabled: this.enabled,
      configured: !!this.apiKey
    };
  }
}

module.exports = AttioService;