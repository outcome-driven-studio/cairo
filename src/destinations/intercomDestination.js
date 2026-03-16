const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');

class IntercomDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.accessToken = config.accessToken;
    this.baseUrl = 'https://api.intercom.io';
  }

  validateConfig() {
    const errors = [];
    if (!this.accessToken) errors.push('accessToken is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) {
    await axios.post(`${this.baseUrl}/events`, {
      event_name: event.event, user_id: event.userId, created_at: Math.floor(Date.now() / 1000), metadata: event.properties || {}
    }, { headers: this._headers(), timeout: 5000 });
    return { success: true, message: 'Event sent to Intercom' };
  }

  async identify(user) {
    await axios.post(`${this.baseUrl}/contacts`, {
      role: 'user', external_id: user.userId, email: user.traits?.email, name: user.traits?.name, custom_attributes: user.traits || {}
    }, { headers: this._headers(), timeout: 5000 });
    return { success: true, message: 'Contact created/updated in Intercom' };
  }

  async page(p) { return this.track({ ...p, event: 'Page Viewed' }); }
  async screen(s) { return { success: true, message: 'Screen events not sent to Intercom' }; }
  async group(g) {
    await axios.post(`${this.baseUrl}/companies`, {
      company_id: g.groupId, name: g.traits?.name || g.groupId, custom_attributes: g.traits || {}
    }, { headers: this._headers(), timeout: 5000 });
    return { success: true, message: 'Company created in Intercom' };
  }
  async alias(a) { return { success: true, message: 'Alias not supported by Intercom' }; }

  async test() {
    try {
      await axios.get(`${this.baseUrl}/me`, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'Intercom connection verified' };
    } catch (error) { return { success: false, error: error.message }; }
  }

  _headers() { return { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }; }
}

module.exports = IntercomDestination;
