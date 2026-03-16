const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');

class PostHogDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey;
    this.host = config.host || 'https://app.posthog.com';
  }

  validateConfig() {
    const errors = [];
    if (!this.apiKey) errors.push('apiKey is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) {
    await axios.post(`${this.host}/capture/`, {
      api_key: this.apiKey, distinct_id: event.userId || event.anonymousId, event: event.event, properties: event.properties || {}, timestamp: event.timestamp
    }, { timeout: 5000 });
    return { success: true, message: 'Event captured in PostHog' };
  }

  async identify(user) {
    await axios.post(`${this.host}/capture/`, {
      api_key: this.apiKey, distinct_id: user.userId, event: '$identify', properties: { $set: user.traits || {} }
    }, { timeout: 5000 });
    return { success: true, message: 'User identified in PostHog' };
  }

  async page(p) { return this.track({ ...p, event: '$pageview', properties: { $current_url: p.properties?.url, ...p.properties } }); }
  async screen(s) { return this.track({ ...s, event: '$screen', properties: { $screen_name: s.name, ...s.properties } }); }
  async group(g) {
    await axios.post(`${this.host}/capture/`, {
      api_key: this.apiKey, distinct_id: g.userId, event: '$groupidentify', properties: { $group_type: 'company', $group_key: g.groupId, $group_set: g.traits || {} }
    }, { timeout: 5000 });
    return { success: true, message: 'Group identified in PostHog' };
  }
  async alias(a) {
    await axios.post(`${this.host}/capture/`, {
      api_key: this.apiKey, distinct_id: a.userId, event: '$create_alias', properties: { alias: a.previousId }
    }, { timeout: 5000 });
    return { success: true, message: 'Alias created in PostHog' };
  }

  async test() {
    try {
      await axios.post(`${this.host}/capture/`, { api_key: this.apiKey, distinct_id: 'test', event: 'cairo_test' }, { timeout: 5000 });
      return { success: true, message: 'PostHog connection verified' };
    } catch (error) { return { success: false, error: error.message }; }
  }
}

module.exports = PostHogDestination;
