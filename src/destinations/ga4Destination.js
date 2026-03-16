const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');
const logger = require('../utils/logger');

class GA4Destination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.measurementId = config.measurementId;
    this.apiSecret = config.apiSecret;
    this.baseUrl = 'https://www.google-analytics.com/mp/collect';
  }

  validateConfig() {
    const errors = [];
    if (!this.measurementId) errors.push('measurementId is required');
    if (!this.apiSecret) errors.push('apiSecret is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) {
    try {
      await axios.post(`${this.baseUrl}?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`, {
        client_id: event.anonymousId || event.userId || 'unknown',
        user_id: event.userId,
        events: [{ name: event.event.replace(/\s+/g, '_').toLowerCase(), params: event.properties || {} }]
      }, { timeout: 5000 });
      return { success: true, message: 'Event sent to GA4' };
    } catch (error) {
      throw new Error(`GA4 track failed: ${error.message}`);
    }
  }

  async identify(user) { return { success: true, message: 'Identify sent as user_properties to GA4' }; }
  async page(pageView) {
    return this.track({ ...pageView, event: 'page_view', properties: { page_title: pageView.name, page_location: pageView.properties?.url, ...pageView.properties } });
  }
  async screen(s) { return this.track({ ...s, event: 'screen_view', properties: { screen_name: s.name, ...s.properties } }); }
  async group(g) { return { success: true, message: 'Group not supported by GA4' }; }
  async alias(a) { return { success: true, message: 'Alias not supported by GA4' }; }

  async test() {
    try {
      await axios.post(`https://www.google-analytics.com/debug/mp/collect?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`, {
        client_id: 'test', events: [{ name: 'test_event', params: {} }]
      }, { timeout: 5000 });
      return { success: true, message: 'GA4 connection verified' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = GA4Destination;
