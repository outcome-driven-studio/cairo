const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');

class SendGridDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey;
    this.baseUrl = 'https://api.sendgrid.com/v3';
  }

  validateConfig() {
    const errors = [];
    if (!this.apiKey) errors.push('apiKey is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) { return { success: true, message: 'Track events not sent to SendGrid' }; }
  async identify(user) {
    try {
      const email = user.traits?.email || user.userId;
      await axios.put(`${this.baseUrl}/marketing/contacts`, {
        contacts: [{ email, first_name: user.traits?.firstName, last_name: user.traits?.lastName, custom_fields: user.traits }]
      }, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'Contact upserted in SendGrid' };
    } catch (error) { throw new Error(`SendGrid identify failed: ${error.message}`); }
  }
  async page(p) { return { success: true, message: 'Page events not sent to SendGrid' }; }
  async group(g) { return { success: true, message: 'Group not supported by SendGrid' }; }
  async alias(a) { return { success: true, message: 'Alias not supported by SendGrid' }; }

  async test() {
    try {
      await axios.get(`${this.baseUrl}/user/profile`, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'SendGrid connection verified' };
    } catch (error) { return { success: false, error: error.message }; }
  }

  _headers() { return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }; }
}

module.exports = SendGridDestination;
