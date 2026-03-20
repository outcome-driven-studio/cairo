const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');

class AmplitudeDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey;
    this.baseUrl = 'https://api2.amplitude.com';
  }

  validateConfig() {
    const errors = [];
    if (!this.apiKey) errors.push('apiKey is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) {
    await axios.post(`${this.baseUrl}/2/httpapi`, {
      api_key: this.apiKey,
      events: [{ user_id: event.userId, device_id: event.anonymousId, event_type: event.event, event_properties: event.properties || {}, time: Date.now() }]
    }, { timeout: 5000 });
    return { success: true, message: 'Event sent to Amplitude' };
  }

  async identify(user) {
    await axios.post(`${this.baseUrl}/identify`, {
      api_key: this.apiKey,
      identification: [{ user_id: user.userId, user_properties: { $set: user.traits || {} } }]
    }, { timeout: 5000 });
    return { success: true, message: 'User identified in Amplitude' };
  }

  async page(p) { return this.track({ ...p, event: 'Page Viewed', properties: { name: p.name, ...p.properties } }); }
  async screen(s) { return this.track({ ...s, event: 'Screen Viewed', properties: { name: s.name, ...s.properties } }); }
  async group(g) { return { success: true, message: 'Group handled via user properties in Amplitude' }; }
  async alias(a) { return { success: true, message: 'Use user_id mapping for Amplitude alias' }; }

  async test() {
    try {
      await axios.post(`${this.baseUrl}/2/httpapi`, { api_key: this.apiKey, events: [{ user_id: 'test', event_type: 'cairo_test' }] }, { timeout: 5000 });
      return { success: true, message: 'Amplitude connection verified' };
    } catch (error) { return { success: false, error: error.message }; }
  }
}

module.exports = AmplitudeDestination;
