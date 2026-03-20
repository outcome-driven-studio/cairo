const { BaseDestination } = require('../services/destinationService');
const axios = require('axios');
const logger = require('../utils/logger');

class ElasticsearchDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.node = config.node || 'http://localhost:9200';
    this.index = config.index || 'cairo-events';
    this.apiKey = config.apiKey;
  }

  validateConfig() {
    const errors = [];
    if (!this.node) errors.push('node is required');
    return { valid: errors.length === 0, errors };
  }

  async _index(type, data) {
    const doc = { type, ...data, indexed_at: new Date().toISOString() };
    await axios.post(`${this.node}/${this.index}/_doc`, doc, { headers: this._headers(), timeout: 5000 });
    return { success: true, message: `Indexed ${type} event in Elasticsearch` };
  }

  async track(event) { return this._index('track', event); }
  async identify(user) { return this._index('identify', user); }
  async page(p) { return this._index('page', p); }
  async screen(s) { return this._index('screen', s); }
  async group(g) { return this._index('group', g); }
  async alias(a) { return this._index('alias', a); }

  async test() {
    try {
      await axios.get(`${this.node}/_cluster/health`, { headers: this._headers(), timeout: 5000 });
      return { success: true, message: 'Elasticsearch connection verified' };
    } catch (error) { return { success: false, error: error.message }; }
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h.Authorization = `ApiKey ${this.apiKey}`;
    return h;
  }
}

module.exports = ElasticsearchDestination;
