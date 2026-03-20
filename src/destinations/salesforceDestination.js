const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');
const logger = require('../utils/logger');

class SalesforceDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.instanceUrl = config.instanceUrl;
    this.accessToken = config.accessToken;
  }

  validateConfig() {
    const errors = [];
    if (!this.instanceUrl) errors.push('instanceUrl is required');
    if (!this.accessToken) errors.push('accessToken is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) {
    try {
      await axios.post(`${this.instanceUrl}/services/data/v58.0/sobjects/Task`, {
        Subject: event.event,
        Description: JSON.stringify(event.properties || {}),
        Status: 'Completed',
        ActivityDate: new Date().toISOString().split('T')[0]
      }, { headers: this._headers(), timeout: 10000 });
      return { success: true, message: 'Task created in Salesforce' };
    } catch (error) {
      throw new Error(`Salesforce track failed: ${error.message}`);
    }
  }

  async identify(user) {
    try {
      const email = user.traits?.email || user.userId;
      await axios.post(`${this.instanceUrl}/services/data/v58.0/sobjects/Lead`, {
        Email: email,
        FirstName: user.traits?.firstName || user.traits?.first_name,
        LastName: user.traits?.lastName || user.traits?.last_name || email.split('@')[0],
        Company: user.traits?.company || 'Unknown',
        Title: user.traits?.title
      }, { headers: this._headers(), timeout: 10000 });
      return { success: true, message: 'Lead created in Salesforce' };
    } catch (error) {
      throw new Error(`Salesforce identify failed: ${error.message}`);
    }
  }

  async page(p) { return { success: true, message: 'Page events not sent to Salesforce' }; }
  async group(g) { return { success: true, message: 'Group events not sent to Salesforce' }; }
  async alias(a) { return { success: true, message: 'Alias not supported by Salesforce' }; }

  async test() {
    try {
      await axios.get(`${this.instanceUrl}/services/data/v58.0/limits`, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'Salesforce connection verified' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _headers() {
    return { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' };
  }
}

module.exports = SalesforceDestination;
