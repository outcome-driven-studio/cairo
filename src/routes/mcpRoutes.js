const express = require('express');
const logger = require('../utils/logger');
const McpService = require('../services/mcpService');
const { requireWriteKeyMcp } = require('../middleware/auth');

class McpRoutes {
  constructor() {
    this.mcpService = new McpService();
    logger.info('[MCP] Routes initialized');
  }

  async handlePost(req, res) {
    try {
      const body = req.body;

      if (Array.isArray(body)) {
        const results = [];
        for (const request of body) {
          const result = await this.mcpService.handleRequest(request, req.writeKey);
          if (result) results.push(result);
        }
        return res.json(results);
      }

      if (!body || !body.method) {
        return res.status(400).json({
          jsonrpc: '2.0',
          id: body?.id || null,
          error: { code: -32600, message: 'Invalid request: missing method' },
        });
      }

      const result = await this.mcpService.handleRequest(body, req.writeKey);
      res.json(result);
    } catch (error) {
      logger.error('[MCP] Request handling error:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: error.message },
      });
    }
  }

  async handleGet(req, res) {
    const allTools = Object.values(this.mcpService.tools);
    const categorize = (name) => {
      if (name.startsWith('gdpr_')) return 'gdpr';
      if (name.includes('error') || name === 'capture_error') return 'errors';
      if (name.includes('notification') || name === 'set_user_channel' || name === 'enqueue_notification' || name === 'ack_notification' || name === 'register_agent_webhook' || name === 'get_pending_notifications') {
        return 'notifications';
      }
      if (name.includes('agent')) return 'agents';
      if (name.includes('identity') || name === 'alias_identity') return 'identity';
      if (['track_event', 'batch_track', 'query_events'].includes(name)) return 'events';
      if (['identify_user', 'lookup_user'].includes(name)) return 'users';
      return 'system';
    };

    const toolsByCategory = {};
    for (const t of allTools) {
      const cat = categorize(t.name);
      if (!toolsByCategory[cat]) toolsByCategory[cat] = [];
      toolsByCategory[cat].push({ name: t.name, description: t.description });
    }

    res.json({
      name: 'cairo',
      version: '3.0.0',
      protocol: 'mcp',
      protocolVersion: '2024-11-05',
      transport: 'streamable-http',
      description: 'Cairo — agent-first event tracking. Notifications hand off to agents who relay via their own gateways.',
      endpoints: {
        mcp: 'POST /mcp (JSON-RPC)',
        discovery: 'GET /mcp',
        llms_txt: 'GET /llms.txt',
        docs: 'GET /docs',
        rest: '/api/v2/* and /v2/*',
      },
      tool_count: allTools.length,
      tools_by_category: toolsByCategory,
    });
  }

  setupRoutes() {
    const router = express.Router();
    router.use(requireWriteKeyMcp);
    router.post('/', this.handlePost.bind(this));
    router.get('/', this.handleGet.bind(this));
    return router;
  }
}

module.exports = McpRoutes;
