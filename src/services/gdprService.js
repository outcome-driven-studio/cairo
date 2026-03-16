const { query } = require('../utils/db');
const logger = require('../utils/logger');

class GDPRService {
  async deleteUser(userId, namespace = 'default', performedBy = 'api') {
    logger.info(`GDPR delete requested for user ${userId} in namespace ${namespace}`);
    const tablesAffected = [];
    let totalRows = 0;

    try {
      const r = await query('DELETE FROM event_source WHERE user_id = $1', [userId]);
      if (r.rowCount > 0) { tablesAffected.push('event_source'); totalRows += r.rowCount; }
    } catch (e) { logger.error('GDPR delete event_source error:', e.message); }

    try {
      const r = await query('DELETE FROM playmaker_user_source WHERE email = $1 OR original_user_id = $1', [userId]);
      if (r.rowCount > 0) { tablesAffected.push('playmaker_user_source'); totalRows += r.rowCount; }
    } catch (e) { logger.error('GDPR delete playmaker_user_source error:', e.message); }

    try {
      const r = await query('DELETE FROM identity_graph WHERE identity_value = $1 AND namespace = $2', [userId, namespace]);
      if (r.rowCount > 0) { tablesAffected.push('identity_graph'); totalRows += r.rowCount; }
    } catch (e) { /* table may not exist yet */ }

    try {
      const r = await query(
        `DELETE FROM raw_events WHERE namespace = $1 AND (payload->>'userId' = $2 OR payload->>'anonymousId' = $2)`,
        [namespace, userId]
      );
      if (r.rowCount > 0) { tablesAffected.push('raw_events'); totalRows += r.rowCount; }
    } catch (e) { /* table may not exist yet */ }

    try {
      await query('DELETE FROM user_suppressions WHERE user_id = $1 AND namespace = $2', [userId, namespace]);
    } catch (e) { /* table may not exist */ }

    await this._audit(userId, namespace, 'delete', tablesAffected, totalRows, performedBy);
    logger.info(`GDPR delete complete for ${userId}: ${totalRows} rows from ${tablesAffected.length} tables`);
    return { userId, tablesAffected, rowsDeleted: totalRows };
  }

  async suppressUser(userId, namespace = 'default', reason = '', performedBy = 'api') {
    await query(
      `INSERT INTO user_suppressions (user_id, namespace, suppressed_by, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, namespace) DO UPDATE SET suppressed_at = NOW(), suppressed_by = $3, reason = $4`,
      [userId, namespace, performedBy, reason]
    );
    await this._audit(userId, namespace, 'suppress', [], 0, performedBy);
    return { userId, suppressed: true };
  }

  async unsuppressUser(userId, namespace = 'default', performedBy = 'api') {
    await query('DELETE FROM user_suppressions WHERE user_id = $1 AND namespace = $2', [userId, namespace]);
    await this._audit(userId, namespace, 'unsuppress', [], 0, performedBy);
    return { userId, suppressed: false };
  }

  async isSuppressed(userId, namespace = 'default') {
    const result = await query('SELECT id FROM user_suppressions WHERE user_id = $1 AND namespace = $2', [userId, namespace]);
    return result.rows.length > 0;
  }

  async getAuditLog(userId) {
    const result = await query('SELECT * FROM deletion_audit_log WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return result.rows;
  }

  async getSuppressions(namespace = 'default', limit = 100) {
    const result = await query('SELECT * FROM user_suppressions WHERE namespace = $1 ORDER BY suppressed_at DESC LIMIT $2', [namespace, limit]);
    return result.rows;
  }

  async _audit(userId, namespace, action, tablesAffected, rowsDeleted, performedBy) {
    try {
      await query(
        `INSERT INTO deletion_audit_log (user_id, namespace, action, tables_affected, rows_deleted, performed_by) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, namespace, action, tablesAffected, rowsDeleted, performedBy]
      );
    } catch (e) { logger.error('Failed to write audit log:', e.message); }
  }
}

module.exports = GDPRService;
