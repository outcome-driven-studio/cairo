const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');

class PipedriveDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl || 'https://api.pipedrive.com/v1';
  }

  validateConfig() {
    const errors = [];
    if (!this.apiToken) errors.push('apiToken is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) {
    await axios.post(`${this.baseUrl}/activities?api_token=${this.apiToken}`, {
      subject: event.event, type: 'task', done: 1, note: JSON.stringify(event.properties || {})
    }, { timeout: 5000 });
    return { success: true, message: 'Activity created in Pipedrive' };
  }

  async identify(user) {
    const email = user.traits?.email || user.userId;
    await axios.post(`${this.baseUrl}/persons?api_token=${this.apiToken}`, {
      name: user.traits?.name || email, email: [{ value: email, primary: true }],
      org_id: user.traits?.company, job_title: user.traits?.title
    }, { timeout: 5000 });
    return { success: true, message: 'Person created in Pipedrive' };
  }

  async page(p) { return { success: true, message: 'Page events not sent to Pipedrive' }; }
  async group(g) { return { success: true, message: 'Group not directly supported by Pipedrive' }; }
  async alias(a) { return { success: true, message: 'Alias not supported by Pipedrive' }; }

  async test() {
    try {
      await axios.get(`${this.baseUrl}/users/me?api_token=${this.apiToken}`, { timeout: 5000 });
      return { success: true, message: 'Pipedrive connection verified' };
    } catch (error) { return { success: false, error: error.message }; }
  }
}

module.exports = PipedriveDestination;
