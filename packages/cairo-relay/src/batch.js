'use strict';

/**
 * In-memory batch buffer keyed by agentId|event|channel.
 * Flushes when size hits max OR timer elapses.
 */
class BatchBuffer {
  /**
   * @param {{ max?: number, ms?: number, onFlush: (key: string, items: object[]) => Promise<void> }} opts
   */
  constructor({ max = 10, ms = 30000, onFlush }) {
    if (typeof onFlush !== 'function') throw new Error('onFlush required');
    this.max = Math.max(1, max);
    this.ms = Math.max(0, ms);
    this.onFlush = onFlush;
    /** @type {Map<string, { items: object[], timer: NodeJS.Timeout | null }>} */
    this.buckets = new Map();
  }

  static key(agentId, event, channel = 'default') {
    return `${agentId || '_'}|${event || '_'}|${channel || 'default'}`;
  }

  push(key, item) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { items: [], timer: null };
      this.buckets.set(key, bucket);
      if (this.ms > 0) {
        bucket.timer = setTimeout(() => {
          this._flushKey(key).catch(() => {});
        }, this.ms);
        if (typeof bucket.timer.unref === 'function') bucket.timer.unref();
      }
    }
    bucket.items.push(item);
    if (bucket.items.length >= this.max) {
      return this._flushKey(key);
    }
    return Promise.resolve();
  }

  async flushAll() {
    const keys = [...this.buckets.keys()];
    for (const key of keys) {
      await this._flushKey(key);
    }
  }

  async _flushKey(key) {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.items.length === 0) {
      this.buckets.delete(key);
      return;
    }
    if (bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }
    this.buckets.delete(key);
    const items = bucket.items;
    await this.onFlush(key, items);
  }
}

module.exports = { BatchBuffer };
