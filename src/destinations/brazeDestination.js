const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');

class BrazeDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey;
    this.restEndpoint = config.restEndpoint || 'https://rest.iad-01.braze.com';
  }

  validateConfig() {
    const errors = [];
    if (!this.apiKey) errors.push('apiKey is required');
    if (!this.restEndpoint) errors.push('restEndpoint is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) {
    await axios.post(`${this.restEndpoint}/users/track`, {
      events: [{ external_id: event.userId, name: event.event, time: event.timestamp || new Date().toISOString(), properties: event.properties || {} }]
    }, { headers: this._headers(), timeout: 5000 });
    return { success: true, message: 'Event sent to Braze' };
  }

  async identify(user) {
    await axios.post(`${this.restEndpoint}/users/track`, {
      attributes: [{ external_id: user.userId, ...user.traits }]
    }, { headers: this._headers(), timeout: 5000 });
    return { success: true, message: 'User attributes set in Braze' };
  }

  async page(p) { return this.track({ ...p, event: 'Page Viewed', properties: { name: p.name, ...p.properties } }); }
  async screen(s) { return this.track({ ...s, event: 'Screen Viewed', properties: { name: s.name, ...s.properties } }); }
  async group(g) { return { success: true, message: 'Group not directly supported by Braze' }; }
  async alias(a) {
    await axios.post(`${this.restEndpoint}/users/alias/new`, {
      user_aliases: [{ alias_name: a.previousId, alias_label: 'previous_id', external_id: a.userId }]
    }, { headers: this._headers(), timeout: 5000 });
    return { success: true, message: 'Alias created in Braze' };
  }

  async test() {
    try {
      await axios.get(`${this.restEndpoint}/users/export/ids`, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'Braze connection verified' };
    } catch (error) { return { success: false, error: error.message }; }
  }

  _headers() { return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }; }
}

module.exports = BrazeDestination;
