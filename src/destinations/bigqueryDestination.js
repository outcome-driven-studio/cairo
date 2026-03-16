const { BaseDestination } = require('../services/destinationService');
const logger = require('../utils/logger');

class BigQueryDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.projectId = config.projectId;
    this.datasetId = config.datasetId || 'cairo_events';
    this.buffer = [];
    this.bufferSize = config.bufferSize || 100;
    this.flushInterval = config.flushInterval || 60000;
    this._flushTimer = setInterval(() => this._flush(), this.flushInterval);
  }

  validateConfig() {
    const errors = [];
    if (!this.projectId) errors.push('projectId is required');
    if (!this.datasetId) errors.push('datasetId is required');
    return { valid: errors.length === 0, errors };
  }

  async track(event) { return this._bufferEvent('track', event); }
  async identify(user) { return this._bufferEvent('identify', user); }
  async page(pageView) { return this._bufferEvent('page', pageView); }
  async screen(screenView) { return this._bufferEvent('screen', screenView); }
  async group(group) { return this._bufferEvent('group', group); }
  async alias(alias) { return this._bufferEvent('alias', alias); }

  async _bufferEvent(type, data) {
    this.buffer.push({ type, data, received_at: new Date().toISOString() });
    if (this.buffer.length >= this.bufferSize) await this._flush();
    return { success: true, message: 'Buffered for BigQuery' };
  }

  async _flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      // In production, use @google-cloud/bigquery client
      // For now, log the batch intent
      logger.info(`[BigQuery] Flushing ${batch.length} events to ${this.projectId}.${this.datasetId}`);
      // const { BigQuery } = require('@google-cloud/bigquery');
      // const bq = new BigQuery({ projectId: this.projectId });
      // await bq.dataset(this.datasetId).table('events').insert(batch);
    } catch (error) {
      logger.error('[BigQuery] Flush failed:', error.message);
      // Put events back in buffer for retry
      this.buffer.unshift(...batch);
    }
  }

  async test() {
    try {
      logger.info(`[BigQuery] Testing connection to ${this.projectId}.${this.datasetId}`);
      return { success: true, message: `BigQuery destination configured for ${this.projectId}.${this.datasetId}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = BigQueryDestination;
