const vm = require('vm');
const { query } = require('../utils/db');
const logger = require('../utils/logger');

class TransformationService {
  constructor() {
    this.cache = new Map();
  }

  async transform(event, namespace = 'default') {
    const transforms = await this.getTransforms(namespace);
    let result = { ...event };

    for (const transform of transforms) {
      if (!transform.enabled) continue;
      if (transform.destination_id && transform.destination_id !== event._destinationId) continue;

      try {
        result = this.executeTransform(transform.code, result);
        if (result === null) {
          logger.debug(`Transform ${transform.name} dropped event`);
          return null;
        }
      } catch (err) {
        logger.error(`Transform ${transform.name} (${transform.id}) failed: ${err.message}`);
        // fail-open: continue with untransformed event
      }
    }
    return result;
  }

  executeTransform(code, event) {
    const sandbox = {
      event: JSON.parse(JSON.stringify(event)),
      result: undefined,
      console: { log: () => {}, warn: () => {}, error: () => {} },
      Date,
      Math,
      JSON,
      parseInt,
      parseFloat,
      String,
      Number,
      Boolean,
      Array,
      Object,
    };

    const wrappedCode = `
      const transformFn = ${code};
      result = transformFn(event);
    `;

    const context = vm.createContext(sandbox);
    const script = new vm.Script(wrappedCode);
    script.runInContext(context, { timeout: 500 });

    return sandbox.result;
  }

  async testTransform(code, sampleEvent) {
    try {
      const result = this.executeTransform(code, sampleEvent);
      return { success: true, input: sampleEvent, output: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getTransforms(namespace = 'default') {
    if (this.cache.has(namespace)) {
      return this.cache.get(namespace);
    }

    const result = await query(
      'SELECT * FROM transformations WHERE namespace = $1 AND enabled = true ORDER BY execution_order ASC',
      [namespace]
    );

    this.cache.set(namespace, result.rows);
    // Cache for 30 seconds
    setTimeout(() => this.cache.delete(namespace), 30000);
    return result.rows;
  }

  async createTransform({ name, code, namespace = 'default', destinationId = null, executionOrder = 0 }) {
    // Validate the code compiles
    try {
      this.executeTransform(code, { type: 'track', event: 'test', properties: {} });
    } catch (err) {
      if (err.message.includes('Script execution timed out')) {
        // timeout on test data is fine
      } else if (!err.message.includes('is not a function')) {
        throw new Error(`Invalid transform code: ${err.message}`);
      }
    }

    const result = await query(
      `INSERT INTO transformations (name, code, namespace, destination_id, execution_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, code, namespace, destinationId, executionOrder]
    );
    this.invalidateCache(namespace);
    return result.rows[0];
  }

  async updateTransform(id, updates) {
    const sets = [];
    const params = [id];
    let idx = 2;

    for (const [key, value] of Object.entries(updates)) {
      if (['name', 'code', 'enabled', 'execution_order', 'destination_id'].includes(key)) {
        sets.push(`${key} = $${idx}`);
        params.push(value);
        idx++;
      }
    }
    sets.push(`updated_at = NOW()`);

    const result = await query(
      `UPDATE transformations SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    // Invalidate all caches since we don't know namespace
    this.cache.clear();
    return result.rows[0];
  }

  async deleteTransform(id) {
    await query('DELETE FROM transformations WHERE id = $1', [id]);
    this.cache.clear();
  }

  invalidateCache(namespace) {
    this.cache.delete(namespace);
  }
}

module.exports = TransformationService;
