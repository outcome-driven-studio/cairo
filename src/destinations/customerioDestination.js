const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');

class CustomerIODestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.siteId = config.siteId;
    this.apiKey = config.apiKey;
    this.baseUrl = 'https://track.customer.io/api/v1';
  }

  validateConfig() {
    const errors = [];
    if (!this.siteId) errors.push('siteId is required');
    if (!this.apiKey) errors.push('apiKey is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) {
    const id = event.userId || event.anonymousId;
    await axios.post(`${this.baseUrl}/customers/${id}/events`, {
      name: event.event, data: event.properties || {}
    }, { headers: this._headers(), timeout: 5000 });
    return { success: true, message: 'Event tracked in Customer.io' };
  }

  async identify(user) {
    await axios.put(`${this.baseUrl}/customers/${user.userId}`, {
      email: user.traits?.email, ...user.traits, created_at: Math.floor(Date.now() / 1000)
    }, { headers: this._headers(), timeout: 5000 });
    return { success: true, message: 'Customer created/updated in Customer.io' };
  }

  async page(p) { return this.track({ ...p, event: 'Page Viewed', properties: { name: p.name, url: p.properties?.url, ...p.properties } }); }
  async screen(s) { return this.track({ ...s, event: 'Screen Viewed' }); }
  async group(g) { return { success: true, message: 'Group not supported by Customer.io' }; }
  async alias(a) { return { success: true, message: 'Alias not supported by Customer.io' }; }

  async test() {
    try {
      await axios.get(`${this.baseUrl}/customers/test`, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'Customer.io connection verified' };
    } catch (error) { return { success: false, error: error.message }; }
  }

  _headers() {
    const auth = Buffer.from(`${this.siteId}:${this.apiKey}`).toString('base64');
    return { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };
  }
}

module.exports = CustomerIODestination;
