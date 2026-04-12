const express = require('express');
const logger = require('../utils/logger');
const McpService = require('../services/mcpService');

/**
 * MCP Routes - Streamable HTTP transport for MCP protocol.
 *
 * POST /mcp - JSON-RPC endpoint (single request or batch)
 * GET  /mcp - Server info / capabilities (for discovery)
 *
 * Auth: same X-Write-Key / Bearer as the rest of Cairo.
 */
class McpRoutes {
  constructor() {
    this.mcpService = new McpService();
    logger.info('[MCP] Routes initialized with Streamable HTTP transport');
  }

  authenticate(req, res, next) {
    const writeKey = req.headers['x-write-key'] || req.headers.authorization?.replace('Bearer ', '');
    if (!writeKey) {
      return res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Missing write key. Pass X-Write-Key header or Bearer token.' },
      });
    }
    req.writeKey = writeKey;
    next();
  }

  /**
   * POST /mcp - Handle MCP JSON-RPC request(s).
   * Supports both single request and batch (array) mode.
   */
  async handlePost(req, res) {
    try {
      const body = req.body;

      // Batch mode
      if (Array.isArray(body)) {
        const results = [];
        for (const request of body) {
          const result = await this.mcpService.handleRequest(request, req.writeKey);
          if (result) results.push(result);
        }
        return res.json(results);
      }

      // Single request
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

  /**
   * GET /mcp - Discovery endpoint. Returns server info and available tools.
   */
  async handleGet(req, res) {
    const allTools = Object.values(this.mcpService.tools);
    const categorize = (name) => {
      if (name.startsWith('gdpr_')) return 'gdpr';
      if (name.includes('error') || name === 'capture_error') return 'errors';
      if (name.includes('destination')) return 'destinations';
      if (name.includes('transformation')) return 'transformations';
      if (name.includes('tracking_plan')) return 'tracking_plans';
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

    const info = {
      name: 'cairo-cdp',
      version: '2.0.0',
      protocol: 'mcp',
      protocolVersion: '2024-11-05',
      transport: 'streamable-http',
      description: 'Cairo CDP - Headless MCP-first customer data platform. Agents connect via MCP protocol, humans use REST.',
      endpoints: {
        mcp: 'POST /mcp (JSON-RPC)',
        discovery: 'GET /mcp',
        llms_txt: 'GET /llms.txt',
        rest: '/api/v2/* (compatibility)',
      },
      tool_count: allTools.length,
      tools_by_category: toolsByCategory,
    };
    res.json(info);
  }

  setupRoutes() {
    const router = express.Router();
    router.use(this.authenticate.bind(this));
    router.post('/', this.handlePost.bind(this));
    router.get('/', this.handleGet.bind(this));
    return router;
  }
}

module.exports = McpRoutes;
