const { query } = require('../utils/db');
const logger = require('../utils/logger');
const crypto = require('crypto');

class ErrorTrackingService {
  /**
   * Compute a deterministic fingerprint from error message + stack trace.
   * Normalizes line numbers, file paths, and dynamic values so the same
   * logical error always produces the same fingerprint.
   */
  computeFingerprint(message, stackTrace) {
    let normalized = (message || '').trim();

    if (stackTrace) {
      // Extract function names and file paths, strip line/col numbers
      const frames = stackTrace
        .split('\n')
        .slice(0, 5) // top 5 frames
        .map(line => line.replace(/:\d+:\d+/g, '').replace(/\(.*node_modules/g, '(node_modules').trim())
        .filter(Boolean);
      normalized += '\n' + frames.join('\n');
    }

    // Strip dynamic values: UUIDs, numbers, hex strings
    normalized = normalized
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
      .replace(/0x[0-9a-f]+/gi, '<hex>')
      .replace(/\b\d{4,}\b/g, '<num>');

    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 64);
  }

  /**
   * Capture an error event. Creates or updates the error group, then inserts
   * the individual event.
   */
  async capture(errorData) {
    const {
      message,
      stack_trace,
      type = 'error',
      level = 'error',
      source_file,
      source_line,
      source_column,
      namespace = 'default',
      user_id,
      user_email,
      context = {},
      tags = {},
      release,
      environment,
      sdk_name,
      sdk_version,
      os_name,
      os_version,
      browser_name,
      browser_version,
      url,
    } = errorData;

    if (!message) {
      throw new Error('message is required');
    }

    const fingerprint = errorData.fingerprint || this.computeFingerprint(message, stack_trace);
    const title = message.length > 255 ? message.slice(0, 252) + '...' : message;

    // Upsert the error group
    await query(`
      INSERT INTO error_groups (fingerprint, title, type, level, namespace, source_file, first_seen_at, last_seen_at, event_count)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), 1)
      ON CONFLICT (fingerprint) DO UPDATE SET
        last_seen_at = NOW(),
        event_count = error_groups.event_count + 1,
        updated_at = NOW(),
        status = CASE WHEN error_groups.status = 'resolved' THEN 'regressed' ELSE error_groups.status END
    `, [fingerprint, title, type, level, namespace, source_file]);

    // Insert the event
    const result = await query(`
      INSERT INTO error_events (
        fingerprint, type, level, message, stack_trace,
        source_file, source_line, source_column,
        namespace, user_id, user_email,
        context, tags, release, environment,
        sdk_name, sdk_version, os_name, os_version,
        browser_name, browser_version, url
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING id, fingerprint, created_at
    `, [
      fingerprint, type, level, message, stack_trace,
      source_file, source_line, source_column,
      namespace, user_id, user_email,
      JSON.stringify(context), JSON.stringify(tags), release, environment,
      sdk_name, sdk_version, os_name, os_version,
      browser_name, browser_version, url,
    ]);

    return result.rows[0];
  }

  /**
   * Query error events with filters.
   */
  async queryErrors({ namespace = 'default', fingerprint, level, user_email, limit = 50, offset = 0 }) {
    const conditions = ['e.namespace = $1'];
    const params = [namespace];
    let idx = 2;

    if (fingerprint) {
      conditions.push(`e.fingerprint = $${idx++}`);
      params.push(fingerprint);
    }
    if (level) {
      conditions.push(`e.level = $${idx++}`);
      params.push(level);
    }
    if (user_email) {
      conditions.push(`e.user_email = $${idx++}`);
      params.push(user_email);
    }

    params.push(limit, offset);

    const result = await query(`
      SELECT e.*, g.title as group_title, g.status as group_status
      FROM error_events e
      JOIN error_groups g ON g.fingerprint = e.fingerprint
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    return result.rows;
  }

  /**
   * List error groups with optional status filter.
   */
  async getErrorGroups({ namespace = 'default', status, limit = 50, offset = 0 }) {
    const conditions = ['namespace = $1'];
    const params = [namespace];
    let idx = 2;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }

    params.push(limit, offset);

    const result = await query(`
      SELECT *
      FROM error_groups
      WHERE ${conditions.join(' AND ')}
      ORDER BY last_seen_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    return result.rows;
  }

  /**
   * Get a single error group with its recent events.
   */
  async getErrorGroup(fingerprint, { eventLimit = 20 } = {}) {
    const groupResult = await query(
      'SELECT * FROM error_groups WHERE fingerprint = $1',
      [fingerprint]
    );

    if (groupResult.rows.length === 0) return null;

    const eventsResult = await query(
      'SELECT * FROM error_events WHERE fingerprint = $1 ORDER BY created_at DESC LIMIT $2',
      [fingerprint, eventLimit]
    );

    return {
      ...groupResult.rows[0],
      recent_events: eventsResult.rows,
    };
  }

  /**
   * Update error group status (open, resolved, ignored).
   */
  async updateStatus(fingerprint, status, assignedTo) {
    const resolved_at = status === 'resolved' ? 'NOW()' : 'NULL';
    const result = await query(`
      UPDATE error_groups
      SET status = $1,
          assigned_to = COALESCE($2, assigned_to),
          resolved_at = ${resolved_at},
          updated_at = NOW()
      WHERE fingerprint = $3
      RETURNING *
    `, [status, assignedTo || null, fingerprint]);

    return result.rows[0];
  }

  /**
   * Get error trends (count per hour/day).
   */
  async getTrends({ namespace = 'default', timeRange = '24h', groupBy = 'hour' } = {}) {
    const interval = timeRange === '7d' ? '7 days' : timeRange === '30d' ? '30 days' : '24 hours';
    const trunc = groupBy === 'day' ? 'day' : 'hour';

    const result = await query(`
      SELECT
        date_trunc($1, created_at) as bucket,
        level,
        COUNT(*) as count
      FROM error_events
      WHERE namespace = $2 AND created_at > NOW() - $3::interval
      GROUP BY bucket, level
      ORDER BY bucket ASC
    `, [trunc, namespace, interval]);

    return result.rows;
  }
}

module.exports = ErrorTrackingService;
