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