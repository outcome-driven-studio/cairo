const express = require('express');
const logger = require('../utils/logger');
const AgentMetricsService = require('../services/agentMetricsService');

class AgentTrackingRoutes {
  constructor() {
    this.metricsService = new AgentMetricsService();
    logger.info('Agent Tracking Routes initialized');
  }

  authenticate(req, res, next) {
    const writeKey = req.headers['x-write-key'] || req.headers.authorization?.replace('Bearer ', '');
    if (!writeKey) {
      return res.status(401).json({ success: false, error: 'Missing write key' });
    }
    req.writeKey = writeKey;
    next();
  }

  /**
   * POST /v2/agent/session/start
   */
  async handleSessionStart(req, res) {
    try {
      const { session_id, agent_id, instance_id, agent_type, model, task, config } = req.body;

      if (!session_id || !agent_id) {
        return res.status(400).json({
          success: false,
          error: 'session_id and agent_id are required',
        });
      }

      const namespace = req.body.namespace || 'default';
      const session = await this.metricsService.upsertSession({
        session_id, agent_id, instance_id, agent_type, model, task, config, namespace,
      });

      res.json({ success: true, session });
    } catch (error) {
      logger.error('[AgentTracking] Session start failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /v2/agent/session/end
   */
  async handleSessionEnd(req, res) {
    try {
      const { session_id, duration_ms, total_tokens, total_cost_usd,
              generation_count, tool_call_count, error_count, exit_reason } = req.body;

      if (!session_id) {
        return res.status(400).json({ success: false, error: 'session_id is required' });
      }

      const session = await this.metricsService.endSession(session_id, {
        duration_ms, total_tokens, total_cost_usd,
        generation_count, tool_call_count, error_count, exit_reason,
      });

      if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      res.json({ success: true, session });
    } catch (error) {
      logger.error('[AgentTracking] Session end failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /v2/agent/sessions/:agentId
   */
  async handleGetSessions(req, res) {
    try {
      const { agentId } = req.params;
      const { namespace = 'default', limit = 50, offset = 0, status } = req.query;

      const sessions = await this.metricsService.getSessions(agentId, namespace, {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        status,
      });

      res.json({ success: true, sessions });
    } catch (error) {
      logger.error('[AgentTracking] Get sessions failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /v2/agent/metrics/:agentId
   */
  async handleGetMetrics(req, res) {
    try {
      const { agentId } = req.params;
      const { namespace = 'default', timeRange = '24h' } = req.query;

      const metrics = await this.metricsService.getMetrics(agentId, namespace, timeRange);

      res.json({ success: true, metrics });
    } catch (error) {
      logger.error('[AgentTracking] Get metrics failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /v2/agent/compare
   */
  async handleCompare(req, res) {
    try {
      const { namespace = 'default', timeRange = '24h', groupBy = 'agent_id' } = req.query;

      const comparison = await this.metricsService.compare({ groupBy }, namespace, timeRange);

      res.json({ success: true, comparison });
    } catch (error) {
      logger.error('[AgentTracking] Compare failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  setupRoutes() {
    const router = express.Router();

    router.use(this.authenticate.bind(this));

    router.post('/session/start', this.handleSessionStart.bind(this));
    router.post('/session/end', this.handleSessionEnd.bind(this));
    router.get('/sessions/:agentId', this.handleGetSessions.bind(this));
    router.get('/metrics/:agentId', this.handleGetMetrics.bind(this));
    router.get('/compare', this.handleCompare.bind(this));

    return router;
  }
}

module.exports = AgentTrackingRoutes;
