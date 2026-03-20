const { query } = require('../utils/db');
const logger = require('../utils/logger');

class TrackingPlanService {
  async validate(event, namespace = 'default') {
    const plans = await this.getPlans(namespace);
    if (plans.length === 0) return { valid: true };

    const plan = plans[0]; // Use first plan for namespace
    const schema = plan.schema;

    if (!schema.events || !event.event) return { valid: true };

    const eventSchema = schema.events[event.event];
    if (!eventSchema) {
      // Unknown event
      if (plan.enforcement_mode === 'drop') {
        await this._recordViolation(plan.id, event.event, 'unknown_event', { message: 'Event not in tracking plan' }, event, namespace);
        return { valid: false, violations: [{ type: 'unknown_event', message: `Event "${event.event}" not in tracking plan` }], action: plan.enforcement_mode };
      }
      return { valid: true };
    }

    const violations = [];
    const props = event.properties || {};

    // Check required properties
    if (eventSchema.properties?.required) {
      for (const req of eventSchema.properties.required) {
        if (props[req] === undefined || props[req] === null) {
          violations.push({ type: 'missing_field', field: req, message: `Required property "${req}" is missing` });
        }
      }
    }

    // Check property types
    if (eventSchema.properties?.properties) {
      for (const [field, fieldSchema] of Object.entries(eventSchema.properties.properties)) {
        if (props[field] !== undefined && props[field] !== null && fieldSchema.type) {
          const actualType = Array.isArray(props[field]) ? 'array' : typeof props[field];
          if (actualType !== fieldSchema.type) {
            violations.push({ type: 'wrong_type', field, expected: fieldSchema.type, actual: actualType, message: `Property "${field}" should be ${fieldSchema.type}, got ${actualType}` });
          }
        }
      }
    }

    if (violations.length > 0) {
      for (const v of violations) {
        await this._recordViolation(plan.id, event.event, v.type, v, event, namespace);
      }
      return { valid: false, violations, action: plan.enforcement_mode };
    }

    return { valid: true };
  }

  async _recordViolation(planId, eventName, violationType, details, eventPayload, namespace) {
    try {
      await query(
        `INSERT INTO tracking_plan_violations (tracking_plan_id, event_name, violation_type, violation_details, event_payload, namespace)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [planId, eventName, violationType, JSON.stringify(details), JSON.stringify(eventPayload), namespace]
      );
    } catch (error) {
      logger.error('Failed to record tracking plan violation:', error.message);
    }
  }

  async getPlans(namespace = 'default') {
    const result = await query('SELECT * FROM tracking_plans WHERE namespace = $1 ORDER BY created_at DESC', [namespace]);
    return result.rows;
  }

  async getPlan(id) {
    const result = await query('SELECT * FROM tracking_plans WHERE id = $1', [id]);
    return result.rows[0];
  }

  async createPlan({ name, namespace = 'default', enforcementMode = 'allow', schema = {} }) {
    const result = await query(
      `INSERT INTO tracking_plans (name, namespace, enforcement_mode, schema) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, namespace, enforcementMode, JSON.stringify(schema)]
    );
    return result.rows[0];
  }

  async updatePlan(id, updates) {
    const sets = [];
    const params = [id];
    let idx = 2;

    if (updates.name) { sets.push(`name = $${idx}`); params.push(updates.name); idx++; }
    if (updates.enforcementMode) { sets.push(`enforcement_mode = $${idx}`); params.push(updates.enforcementMode); idx++; }
    if (updates.schema) { sets.push(`schema = $${idx}`); params.push(JSON.stringify(updates.schema)); idx++; }
    sets.push('updated_at = NOW()');

    const result = await query(`UPDATE tracking_plans SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
    return result.rows[0];
  }

  async deletePlan(id) {
    await query('DELETE FROM tracking_plans WHERE id = $1', [id]);
  }

  async getViolations(namespace = 'default', limit = 50) {
    const result = await query(
      'SELECT * FROM tracking_plan_violations WHERE namespace = $1 ORDER BY created_at DESC LIMIT $2',
      [namespace, limit]
    );
    return result.rows;
  }

  async generateFromEvents(namespace = 'default', limit = 1000) {
    const result = await query(
      `SELECT event_type, metadata FROM event_source WHERE platform = 'sdk' ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );

    const events = {};
    for (const row of result.rows) {
      if (!events[row.event_type]) {
        events[row.event_type] = { properties: { required: [], properties: {} } };
      }
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      const props = meta?.properties || meta || {};
      for (const [key, value] of Object.entries(props)) {
        if (!events[row.event_type].properties.properties[key]) {
          events[row.event_type].properties.properties[key] = {
            type: Array.isArray(value) ? 'array' : typeof value
          };
        }
      }
    }

    return { events };
  }
}

module.exports = TrackingPlanService;
