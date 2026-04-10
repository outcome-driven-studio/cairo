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
    const info = {
      name: 'cairo-cdp',
      version: '2.0.0',
      protocol: 'mcp',
      protocolVersion: '2024-11-05',
      transport: 'streamable-http',
      description: 'Cairo CDP - Headless customer data platform with error tracking, identity resolution, and AI agent observability.',
      endpoints: {
        mcp: 'POST /mcp (JSON-RPC)',
        rest: '/api/v2/* (REST)',
      },
      tools: Object.values(this.mcpService.tools).map(t => ({
        name: t.name,
        description: t.description,
      })),
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
