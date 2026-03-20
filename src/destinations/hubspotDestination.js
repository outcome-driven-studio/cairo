const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');
const logger = require('../utils/logger');

class HubSpotDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey;
    this.baseUrl = 'https://api.hubapi.com';
  }

  validateConfig() {
    const errors = [];
    if (!this.apiKey) errors.push('apiKey is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) {
    try {
      const email = event.userId || event.properties?.email;
      if (!email) return { success: true, message: 'No email for HubSpot event' };
      await axios.post(`${this.baseUrl}/events/v3/send`, {
        eventName: event.event,
        objectId: email,
        properties: event.properties || {}
      }, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'Event sent to HubSpot' };
    } catch (error) {
      throw new Error(`HubSpot track failed: ${error.message}`);
    }
  }

  async identify(user) {
    try {
      const email = user.traits?.email || user.userId;
      const properties = Object.entries(user.traits || {}).map(([k, v]) => ({ property: k, value: v }));
      await axios.post(`${this.baseUrl}/crm/v3/objects/contacts`, {
        properties: { email, ...user.traits }
      }, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'Contact created/updated in HubSpot' };
    } catch (error) {
      if (error.response?.status === 409) {
        // Contact exists, update instead
        try {
          await axios.patch(`${this.baseUrl}/crm/v3/objects/contacts/${user.traits?.email}?idProperty=email`, {
            properties: user.traits
          }, { headers: this._headers(), timeout: 5000 });
          return { success: true, message: 'Contact updated in HubSpot' };
        } catch (e) {
          throw new Error(`HubSpot update failed: ${e.message}`);
        }
      }
      throw new Error(`HubSpot identify failed: ${error.message}`);
    }
  }

  async page(pageView) { return { success: true, message: 'Page events not sent to HubSpot' }; }
  async group(group) {
    try {
      await axios.post(`${this.baseUrl}/crm/v3/objects/companies`, {
        properties: { name: group.traits?.name || group.groupId, ...group.traits }
      }, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'Company created in HubSpot' };
    } catch (error) {
      throw new Error(`HubSpot group failed: ${error.message}`);
    }
  }
  async alias(alias) { return { success: true, message: 'Alias not supported by HubSpot' }; }

  async test() {
    try {
      await axios.get(`${this.baseUrl}/crm/v3/objects/contacts?limit=1`, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'HubSpot connection verified' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _headers() {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }
}

module.exports = HubSpotDestination;
