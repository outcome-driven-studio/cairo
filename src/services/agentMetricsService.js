const { query } = require('../utils/db');
const logger = require('../utils/logger');

class AgentMetricsService {
  /**
   * Get aggregated metrics for an agent
   */
  async getMetrics(agentId, namespace = 'default', timeRange = '24h') {
    try {
      const interval = this.parseTimeRange(timeRange);

      const result = await query(
        `SELECT
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
          SUM(total_tokens) as total_tokens,
          SUM(total_cost_usd) as total_cost_usd,
          SUM(generation_count) as total_generations,
          SUM(tool_call_count) as total_tool_calls,
          SUM(error_count) as total_errors,
          AVG(duration_ms) as avg_duration_ms,
          AVG(CASE WHEN total_tokens > 0 THEN total_cost_usd / total_tokens * 1000 END) as avg_cost_per_1k_tokens,
          CASE WHEN SUM(tool_call_count) > 0
            THEN 1.0 - (SUM(error_count)::NUMERIC / SUM(tool_call_count))
            ELSE 1.0
          END as success_rate
        FROM agent_sessions
        WHERE agent_id = $1
          AND namespace = $2
          AND started_at >= NOW() - $3::INTERVAL`,
        [agentId, namespace, interval]
      );

      return result.rows[0] || {};
    } catch (error) {
      logger.error(`[AgentMetrics] Failed to get metrics for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * List sessions for an agent
   */
  async getSessions(agentId, namespace = 'default', { limit = 50, offset = 0, status } = {}) {
    try {
      let sql = `
        SELECT * FROM agent_sessions
        WHERE agent_id = $1 AND namespace = $2
      `;
      const params = [agentId, namespace];

      if (status) {
        sql += ` AND status = $${params.length + 1}`;
        params.push(status);
      }

      sql += ` ORDER BY started_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error(`[AgentMetrics] Failed to get sessions for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Compare multiple agents or models on metrics
   */
  async compare(filters = {}, namespace = 'default', timeRange = '24h') {
    try {
      const interval = this.parseTimeRange(timeRange);
      let groupBy = 'agent_id';

      if (filters.groupBy === 'model') {
        groupBy = 'model';
      }

      const result = await query(
        `SELECT
          ${groupBy},
          COUNT(*) as total_sessions,
          SUM(total_tokens) as total_tokens,
          SUM(total_cost_usd) as total_cost_usd,
          AVG(duration_ms) as avg_duration_ms,
          SUM(generation_count) as total_generations,
          SUM(tool_call_count) as total_tool_calls,
          SUM(error_count) as total_errors,
          CASE WHEN SUM(tool_call_count) > 0
            THEN 1.0 - (SUM(error_count)::NUMERIC / SUM(tool_call_count))
            ELSE 1.0
          END as success_rate
        FROM agent_sessions
        WHERE namespace = $1
          AND started_at >= NOW() - $2::INTERVAL
        GROUP BY ${groupBy}
        ORDER BY total_sessions DESC`,
        [namespace, interval]
      );

      return result.rows;
    } catch (error) {
      logger.error(`[AgentMetrics] Compare failed:`, error);
      throw error;
    }
  }

  /**
   * Create or update an agent session
   */
  async upsertSession(sessionData) {
    try {
      const {
        session_id, agent_id, instance_id, agent_type, model, task,
        config, namespace = 'default',
      } = sessionData;

      const result = await query(
        `INSERT INTO agent_sessions (
          session_id, agent_id, instance_id, agent_type, model, task, config, namespace
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (session_id) DO UPDATE SET
          updated_at = NOW()
        RETURNING *`,
        [session_id, agent_id, instance_id, agent_type, model, task,
         JSON.stringify(config || {}), namespace]
      );

      return result.rows[0];
    } catch (error) {
      logger.error(`[AgentMetrics] Failed to upsert session:`, error);
      throw error;
    }
  }

  /**
   * End an agent session
   */
  async endSession(sessionId, endData = {}) {
    try {
      const {
        duration_ms, total_tokens = 0, total_cost_usd = 0,
        generation_count = 0, tool_call_count = 0, error_count = 0,
        exit_reason = 'normal',
      } = endData;

      const result = await query(
        `UPDATE agent_sessions SET
          status = 'completed',
          duration_ms = $2,
          total_tokens = $3,
          total_cost_usd = $4,
          generation_count = $5,
          tool_call_count = $6,
          error_count = $7,
          exit_reason = $8,
          ended_at = NOW(),
          updated_at = NOW()
        WHERE session_id = $1
        RETURNING *`,
        [sessionId, duration_ms, total_tokens, total_cost_usd,
         generation_count, tool_call_count, error_count, exit_reason]
      );

      return result.rows[0];
    } catch (error) {
      logger.error(`[AgentMetrics] Failed to end session ${sessionId}:`, error);
      throw error;
    }
  }

  parseTimeRange(timeRange) {
    const match = timeRange.match(/^(\d+)(h|d|w|m)$/);
    if (!match) return '24 hours';
    const [, num, unit] = match;
    const units = { h: 'hours', d: 'days', w: 'weeks', m: 'months' };
    return `${num} ${units[unit] || 'hours'}`;
  }
}

module.exports = AgentMetricsService;
