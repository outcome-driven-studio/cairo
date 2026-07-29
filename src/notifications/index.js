const axios = require('axios');
const { query } = require('../utils/db');
const logger = require('../utils/logger');

/**
 * Render a simple mustache-ish template: {{event}}, {{userId}}, {{properties.x}}
 */
function renderTemplate(template, context) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const parts = path.split('.');
    let cur = context;
    for (const p of parts) {
      if (cur == null) return '';
      cur = cur[p];
    }
    if (cur == null) return '';
    if (typeof cur === 'object') return JSON.stringify(cur);
    return String(cur);
  });
}

/**
 * Agent-handoff notification engine.
 *
 * Cairo never talks to Telegram/Discord/WhatsApp itself.
 * Rules enqueue notifications for agents; agents pull (or receive webhook push)
 * and relay to end users via their own gateways.
 *
 * user_channels is an optional address book agents can look up when relaying.
 */
class NotificationService {
  // ── Channel address book (metadata for agents — not used to send) ────

  async upsertUserChannel({ userId, channel, address, namespace = 'default' }) {
    if (!userId || !channel || !address) {
      throw new Error('userId, channel, and address are required');
    }
    const allowed = ['telegram', 'discord', 'whatsapp', 'slack', 'other'];
    if (!allowed.includes(channel)) {
      throw new Error(`channel must be one of: ${allowed.join(', ')}`);
    }
    await query(
      `INSERT INTO user_channels (user_id, channel, address, namespace, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, channel, namespace)
       DO UPDATE SET address = EXCLUDED.address, updated_at = NOW()`,
      [userId, channel, address, namespace]
    );
    return { userId, channel, address, namespace };
  }

  async getUserChannels(userId, namespace = 'default') {
    const result = await query(
      `SELECT channel, address FROM user_channels WHERE user_id = $1 AND namespace = $2`,
      [userId, namespace]
    );
    return Object.fromEntries(result.rows.map((r) => [r.channel, r.address]));
  }

  // ── Rules CRUD (always target an agent) ──────────────────────────────

  async createRule(rule) {
    const {
      name,
      event_name,
      property_match = null,
      agent_id,
      message_template,
      namespace = 'default',
      enabled = true,
    } = rule;

    if (!name || !event_name || !agent_id || !message_template) {
      throw new Error('name, event_name, agent_id, and message_template are required');
    }

    const result = await query(
      `INSERT INTO notification_rules
        (name, event_name, property_match, target_type, channel, destination, agent_id, message_template, namespace, enabled)
       VALUES ($1,$2,$3,'agent',NULL,NULL,$4,$5,$6,$7)
       RETURNING *`,
      [
        name,
        event_name,
        property_match ? JSON.stringify(property_match) : null,
        agent_id,
        message_template,
        namespace,
        enabled,
      ]
    );
    return result.rows[0];
  }

  async listRules(namespace = 'default') {
    const result = await query(
      `SELECT * FROM notification_rules WHERE namespace = $1 ORDER BY created_at DESC`,
      [namespace]
    );
    return result.rows;
  }

  async deleteRule(id) {
    const result = await query(`DELETE FROM notification_rules WHERE id = $1 RETURNING id`, [id]);
    return { deleted: result.rowCount > 0, id };
  }

  // ── Agent endpoints (webhook push) ───────────────────────────────────

  async registerAgentWebhook({ agentId, url, namespace = 'default' }) {
    if (!agentId || !url) throw new Error('agentId and url required');
    await query(
      `INSERT INTO agent_endpoints (agent_id, webhook_url, namespace, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (agent_id, namespace)
       DO UPDATE SET webhook_url = EXCLUDED.webhook_url, updated_at = NOW()`,
      [agentId, url, namespace]
    );
    return { agentId, url, namespace };
  }

  // ── Evaluation on ingest → enqueue for agent ─────────────────────────

  async evaluateEvent(event) {
    const {
      event: eventName,
      userId,
      anonymousId,
      properties = {},
      namespace = 'default',
    } = event;

    if (!eventName) return [];

    let rules;
    try {
      const result = await query(
        `SELECT * FROM notification_rules
         WHERE enabled = true AND namespace = $1 AND event_name = $2`,
        [namespace, eventName]
      );
      rules = result.rows;
    } catch (err) {
      logger.warn('[notifications] rule lookup failed:', err.message);
      return [];
    }

    if (rules.length === 0) return [];

    // Attach user channel addresses so the agent can relay without another lookup
    let channels = {};
    const uid = userId || anonymousId;
    if (uid) {
      try {
        channels = await this.getUserChannels(uid, namespace);
      } catch (_) { /* optional */ }
    }

    const results = [];
    for (const rule of rules) {
      if (!this._matchesProperties(rule.property_match, properties)) continue;
      if (!rule.agent_id) continue;

      const context = {
        event: eventName,
        userId: userId || anonymousId || '',
        anonymousId: anonymousId || '',
        properties,
        namespace,
        channels,
      };
      const text = renderTemplate(rule.message_template, context);

      try {
        const row = await this._enqueue({
          ruleId: rule.id,
          eventName,
          userId: uid,
          channel: 'agent',
          destination: rule.agent_id,
          message: text,
          payload: {
            event: eventName,
            userId,
            anonymousId,
            properties,
            namespace,
            channels,
          },
          status: 'pending',
          agentId: rule.agent_id,
          namespace,
        });
        await this._pushToAgent(rule.agent_id, row, namespace);
        results.push({ ruleId: rule.id, status: 'pending', notificationId: row.id, agentId: rule.agent_id });
      } catch (err) {
        logger.error(`[notifications] rule ${rule.id} failed:`, err.message);
        results.push({ ruleId: rule.id, status: 'failed', error: err.message });
      }
    }
    return results;
  }

  _matchesProperties(propertyMatch, properties) {
    if (!propertyMatch) return true;
    const match =
      typeof propertyMatch === 'string' ? JSON.parse(propertyMatch) : propertyMatch;
    for (const [key, expected] of Object.entries(match)) {
      if (properties?.[key] !== expected) return false;
    }
    return true;
  }

  async _enqueue(row) {
    const result = await query(
      `INSERT INTO notifications
        (rule_id, event_name, user_id, channel, destination, message, payload, status, error, agent_id, namespace)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        row.ruleId,
        row.eventName,
        row.userId || null,
        row.channel,
        row.destination || null,
        row.message,
        JSON.stringify(row.payload || {}),
        row.status,
        row.error || null,
        row.agentId || null,
        row.namespace || 'default',
      ]
    );
    return result.rows[0];
  }

  async _pushToAgent(agentId, notification, namespace) {
    const maxAttempts = Math.max(1, parseInt(process.env.CAIRO_WEBHOOK_RETRIES || '3', 10));
    const baseDelayMs = Math.max(50, parseInt(process.env.CAIRO_WEBHOOK_RETRY_DELAY_MS || '250', 10));

    let url;
    try {
      const result = await query(
        `SELECT webhook_url FROM agent_endpoints WHERE agent_id = $1 AND namespace = $2`,
        [agentId, namespace]
      );
      url = result.rows[0]?.webhook_url;
    } catch (err) {
      logger.warn(`[notifications] agent endpoint lookup failed:`, err.message);
      return { pushed: false, reason: 'lookup_failed' };
    }

    if (!url) return { pushed: false, reason: 'no_webhook' };

    const body = {
      type: 'notification',
      notification: {
        id: notification.id,
        event: notification.event_name,
        userId: notification.user_id,
        message: notification.message,
        payload: notification.payload,
        channels: notification.payload?.channels || {},
        createdAt: notification.created_at,
      },
    };

    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await axios.post(url, body, { timeout: 8000 });
        return { pushed: true, attempts: attempt };
      } catch (err) {
        lastError = err.response?.data?.message || err.message;
        logger.warn(
          `[notifications] webhook push attempt ${attempt}/${maxAttempts} failed for ${agentId}: ${lastError}`
        );
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
        }
      }
    }

    // Exhausted retries — leave pending for pull, but record error
    try {
      await query(
        `UPDATE notifications SET error = $1, updated_at = NOW() WHERE id = $2`,
        [`webhook_failed_after_${maxAttempts}: ${lastError}`, notification.id]
      );
    } catch (_) { /* */ }

    return { pushed: false, reason: 'exhausted', error: lastError, attempts: maxAttempts };
  }

  /**
   * Manually enqueue a notification for an agent (no channel send).
   * Agents use this to create follow-ups for themselves or peer agents.
   */
  async enqueueForAgent({
    agentId,
    userId,
    text,
    eventName = '_manual',
    properties = {},
    namespace = 'default',
  }) {
    if (!agentId || !text) throw new Error('agentId and text required');

    let channels = {};
    if (userId) {
      try { channels = await this.getUserChannels(userId, namespace); } catch (_) { /* */ }
    }

    const row = await this._enqueue({
      ruleId: null,
      eventName,
      userId,
      channel: 'agent',
      destination: agentId,
      message: text,
      payload: { event: eventName, userId, properties, namespace, channels, manual: true },
      status: 'pending',
      agentId,
      namespace,
    });
    await this._pushToAgent(agentId, row, namespace);
    return row;
  }

  // ── Agent pull queue ─────────────────────────────────────────────────

  async getPendingNotifications({ agentId, limit = 50, namespace = 'default' }) {
    const result = await query(
      `SELECT * FROM notifications
       WHERE status = 'pending' AND channel = 'agent'
         AND ($1::text IS NULL OR agent_id = $1)
         AND namespace = $2
       ORDER BY created_at ASC
       LIMIT $3`,
      [agentId || null, namespace, limit]
    );
    return result.rows;
  }

  async ackNotification(id, status = 'sent') {
    if (!['sent', 'failed', 'acked'].includes(status)) {
      status = 'acked';
    }
    const result = await query(
      `UPDATE notifications SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status === 'acked' ? 'sent' : status, id]
    );
    return result.rows[0] || null;
  }
}

module.exports = NotificationService;
module.exports.renderTemplate = renderTemplate;
