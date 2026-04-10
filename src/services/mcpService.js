const logger = require('../utils/logger');
const { query } = require('../utils/db');
const IdentityService = require('./identityService');
const ErrorTrackingService = require('./errorTrackingService');

/**
 * In-process MCP Server for Cairo.
 *
 * Implements the MCP JSON-RPC protocol over HTTP (Streamable HTTP transport).
 * Agents connect via POST /mcp with JSON-RPC requests.
 *
 * This replaces the need for a separate stdio-only MCP process: the same
 * Cairo server that handles REST also speaks MCP.
 */
class McpService {
  constructor() {
    this.identityService = new IdentityService();
    this.errorTrackingService = new ErrorTrackingService();
    this.serverInfo = {
      name: 'cairo-cdp',
      version: '2.0.0',
    };
    this.tools = this._buildToolRegistry();
  }

  // ── JSON-RPC dispatcher ──────────────────────────────────────────────

  async handleRequest(jsonRpcRequest, writeKey) {
    const { method, id, params } = jsonRpcRequest;

    try {
      let result;

      switch (method) {
        case 'initialize':
          result = this._handleInitialize(params);
          break;
        case 'tools/list':
          result = this._handleToolsList();
          break;
        case 'tools/call':
          result = await this._handleToolCall(params, writeKey);
          break;
        case 'ping':
          result = {};
          break;
        default:
          return this._errorResponse(id, -32601, `Method not found: ${method}`);
      }

      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      logger.error(`[MCP] Error handling ${method}:`, error);
      return this._errorResponse(id, -32603, error.message);
    }
  }

  // ── Protocol handlers ────────────────────────────────────────────────

  _handleInitialize() {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: this.serverInfo,
      capabilities: {
        tools: {},
      },
    };
  }

  _handleToolsList() {
    return {
      tools: Object.values(this.tools).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  async _handleToolCall(params, writeKey) {
    const { name, arguments: args } = params;
    const tool = this.tools[name];

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await tool.handler(args || {}, writeKey);
    return {
      content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
    };
  }

  _errorResponse(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }

  // ── Tool registry ────────────────────────────────────────────────────

  _buildToolRegistry() {
    const tools = {};
    const register = (name, description, inputSchema, handler) => {
      tools[name] = { name, description, inputSchema, handler: handler.bind(this) };
    };

    // ── Write tools ──

    register('track_event', 'Track a CDP event (page view, click, purchase, custom event)', {
      type: 'object',
      properties: {
        event: { type: 'string', description: 'Event name' },
        user_id: { type: 'string', description: 'User ID' },
        user_email: { type: 'string', description: 'User email' },
        anonymous_id: { type: 'string', description: 'Anonymous ID' },
        properties: { type: 'object', description: 'Event properties' },
        namespace: { type: 'string', description: 'Namespace (default: "default")' },
      },
      required: ['event'],
    }, this._toolTrackEvent);

    register('identify_user', 'Identify a user with traits (email, name, plan, etc.)', {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID' },
        email: { type: 'string', description: 'Email address' },
        traits: { type: 'object', description: 'User traits' },
        namespace: { type: 'string', description: 'Namespace' },
      },
      required: ['user_id'],
    }, this._toolIdentifyUser);

    register('capture_error', 'Capture an error event (like Sentry). Supports stack traces, context, and tagging.', {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Error message' },
        stack_trace: { type: 'string', description: 'Stack trace' },
        type: { type: 'string', description: 'Error type (error, exception, rejection)' },
        level: { type: 'string', description: 'Severity: fatal, error, warning, info' },
        source_file: { type: 'string', description: 'Source file path' },
        source_line: { type: 'number', description: 'Line number' },
        user_email: { type: 'string', description: 'Affected user email' },
        context: { type: 'object', description: 'Additional context' },
        tags: { type: 'object', description: 'Tags for filtering' },
        release: { type: 'string', description: 'Release/version' },
        environment: { type: 'string', description: 'Environment (production, staging)' },
        namespace: { type: 'string', description: 'Namespace' },
      },
      required: ['message'],
    }, this._toolCaptureError);

    // ── Read tools ──

    register('query_events', 'Query CDP events with filters. Returns recent events matching criteria.', {
      type: 'object',
      properties: {
        event_type: { type: 'string', description: 'Filter by event type' },
        user_email: { type: 'string', description: 'Filter by user email' },
        platform: { type: 'string', description: 'Filter by platform' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        since: { type: 'string', description: 'ISO timestamp: only events after this time' },
      },
    }, this._toolQueryEvents);

    register('lookup_user', 'Look up a user by email. Returns profile, traits, and recent activity.', {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'User email to look up' },
      },
      required: ['email'],
    }, this._toolLookupUser);

    register('resolve_identity', 'Resolve the identity graph for a user across IDs, emails, and anonymous IDs.', {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID' },
        email: { type: 'string', description: 'Email' },
        anonymous_id: { type: 'string', description: 'Anonymous ID' },
        namespace: { type: 'string', description: 'Namespace' },
      },
    }, this._toolResolveIdentity);

    register('list_error_groups', 'List error groups (like Sentry issues). Filter by status: open, resolved, ignored.', {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter: open, resolved, ignored, regressed' },
        namespace: { type: 'string', description: 'Namespace' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    }, this._toolListErrorGroups);

    register('get_error_group', 'Get details of a specific error group by fingerprint, including recent occurrences.', {
      type: 'object',
      properties: {
        fingerprint: { type: 'string', description: 'Error group fingerprint' },
      },
      required: ['fingerprint'],
    }, this._toolGetErrorGroup);

    register('resolve_error', 'Update an error group status to resolved, ignored, or reopen it.', {
      type: 'object',
      properties: {
        fingerprint: { type: 'string', description: 'Error group fingerprint' },
        status: { type: 'string', description: 'New status: open, resolved, ignored' },
        assigned_to: { type: 'string', description: 'Assign to (email or name)' },
      },
      required: ['fingerprint', 'status'],
    }, this._toolResolveError);

    register('error_trends', 'Get error count trends over time for monitoring and alerting.', {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Namespace' },
        time_range: { type: 'string', description: '24h, 7d, or 30d' },
        group_by: { type: 'string', description: 'hour or day' },
      },
    }, this._toolErrorTrends);

    register('list_destinations', 'List configured event destinations (Mixpanel, Slack, Discord, etc.) and their status.', {
      type: 'object',
      properties: {},
    }, this._toolListDestinations);

    register('system_health', 'Get Cairo system health: database status, uptime, event counts, error counts.', {
      type: 'object',
      properties: {},
    }, this._toolSystemHealth);

    register('query_agent_sessions', 'Query AI agent tracking sessions. See which agents ran, their costs, and outcomes.', {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Filter by agent ID' },
        namespace: { type: 'string', description: 'Namespace' },
        status: { type: 'string', description: 'Filter: active, completed' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    }, this._toolQueryAgentSessions);

    return tools;
  }

  // ── Tool implementations ─────────────────────────────────────────────

  async _toolTrackEvent(args) {
    const namespace = args.namespace || 'default';
    const eventKey = `mcp-${args.event}-${args.user_email || args.user_id || 'anon'}-${Date.now()}`;

    await query(`
      INSERT INTO event_source (event_key, event_type, platform, user_id, metadata, created_at)
      VALUES ($1, $2, 'mcp', $3, $4, NOW())
      ON CONFLICT (event_key) DO NOTHING
    `, [eventKey, args.event, args.user_email || args.user_id, JSON.stringify(args.properties || {})]);

    return { tracked: true, event: args.event, event_key: eventKey };
  }

  async _toolIdentifyUser(args) {
    const result = await this.identityService.resolve({
      userId: args.user_id,
      email: args.email,
      namespace: args.namespace || 'default',
    });
    return { identified: true, canonical_id: result.canonicalId, merged: result.merged };
  }

  async _toolCaptureError(args) {
    const result = await this.errorTrackingService.capture(args);
    return { captured: true, id: result.id, fingerprint: result.fingerprint };
  }

  async _toolQueryEvents(args) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (args.event_type) {
      conditions.push(`event_type = $${idx++}`);
      params.push(args.event_type);
    }
    if (args.user_email) {
      conditions.push(`user_id = $${idx++}`);
      params.push(args.user_email);
    }
    if (args.platform) {
      conditions.push(`platform = $${idx++}`);
      params.push(args.platform);
    }
    if (args.since) {
      conditions.push(`created_at > $${idx++}`);
      params.push(args.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(args.limit || 20, 100);
    params.push(limit);

    const result = await query(
      `SELECT event_key, event_type, platform, user_id, metadata, created_at
       FROM event_source ${where}
       ORDER BY created_at DESC LIMIT $${idx}`,
      params
    );

    return { count: result.rows.length, events: result.rows };
  }

  async _toolLookupUser(args) {
    const userResult = await query(
      `SELECT * FROM playmaker_user_source WHERE email = $1`,
      [args.email]
    );

    if (userResult.rows.length === 0) {
      // Try user_source table
      const altResult = await query(
        `SELECT * FROM user_source WHERE email = $1`,
        [args.email]
      );
      if (altResult.rows.length === 0) {
        return { found: false, email: args.email };
      }
      return { found: true, user: altResult.rows[0] };
    }

    // Also get recent events
    const eventsResult = await query(
      `SELECT event_type, platform, created_at FROM event_source WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [args.email]
    );

    return {
      found: true,
      user: userResult.rows[0],
      recent_events: eventsResult.rows,
    };
  }

  async _toolResolveIdentity(args) {
    const result = await this.identityService.resolve({
      userId: args.user_id,
      email: args.email,
      anonymousId: args.anonymous_id,
      namespace: args.namespace || 'default',
    });
    return result;
  }

  async _toolListErrorGroups(args) {
    const groups = await this.errorTrackingService.getErrorGroups({
      namespace: args.namespace || 'default',
      status: args.status,
      limit: Math.min(args.limit || 20, 100),
    });
    return { count: groups.length, groups };
  }

  async _toolGetErrorGroup(args) {
    const group = await this.errorTrackingService.getErrorGroup(args.fingerprint);
    if (!group) return { found: false, fingerprint: args.fingerprint };
    return { found: true, group };
  }

  async _toolResolveError(args) {
    const group = await this.errorTrackingService.updateStatus(args.fingerprint, args.status, args.assigned_to);
    if (!group) return { found: false, fingerprint: args.fingerprint };
    return { updated: true, group };
  }

  async _toolErrorTrends(args) {
    const trends = await this.errorTrackingService.getTrends({
      namespace: args.namespace || 'default',
      timeRange: args.time_range || '24h',
      groupBy: args.group_by || 'hour',
    });
    return { trends };
  }

  async _toolListDestinations() {
    try {
      const result = await query('SELECT * FROM destination_configs ORDER BY created_at DESC');
      return { destinations: result.rows };
    } catch {
      // Table may not exist
      const destinations = [];
      if (process.env.MIXPANEL_PROJECT_TOKEN) destinations.push({ name: 'Mixpanel', status: 'configured' });
      if (process.env.SLACK_WEBHOOK_URL) destinations.push({ name: 'Slack', status: 'configured' });
      if (process.env.DISCORD_WEBHOOK_URL) destinations.push({ name: 'Discord', status: 'configured' });
      if (process.env.ATTIO_API_KEY) destinations.push({ name: 'Attio', status: 'configured' });
      return { destinations };
    }
  }

  async _toolSystemHealth() {
    const health = { status: 'healthy', uptime: process.uptime() };

    try {
      const dbResult = await query('SELECT NOW() as time');
      health.database = { connected: true, time: dbResult.rows[0].time };
    } catch (err) {
      health.database = { connected: false, error: err.message };
      health.status = 'degraded';
    }

    try {
      const counts = await query(`
        SELECT
          (SELECT COUNT(*) FROM event_source) as events,
          (SELECT COUNT(*) FROM playmaker_user_source) as users
      `);
      health.counts = counts.rows[0];
    } catch {
      health.counts = {};
    }

    try {
      const errorCounts = await query(`
        SELECT
          (SELECT COUNT(*) FROM error_groups WHERE status = 'open') as open_errors,
          (SELECT COUNT(*) FROM error_events WHERE created_at > NOW() - INTERVAL '24 hours') as errors_24h
      `);
      health.errors = errorCounts.rows[0];
    } catch {
      health.errors = {};
    }

    return health;
  }

  async _toolQueryAgentSessions(args) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (args.agent_id) {
      conditions.push(`agent_id = $${idx++}`);
      params.push(args.agent_id);
    }
    if (args.namespace) {
      conditions.push(`namespace = $${idx++}`);
      params.push(args.namespace);
    }
    if (args.status) {
      conditions.push(`status = $${idx++}`);
      params.push(args.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(args.limit || 20, 100);
    params.push(limit);

    try {
      const result = await query(
        `SELECT * FROM agent_sessions ${where} ORDER BY started_at DESC LIMIT $${idx}`,
        params
      );
      return { count: result.rows.length, sessions: result.rows };
    } catch {
      return { count: 0, sessions: [], note: 'Agent tracking tables not yet created. Run migrations.' };
    }
  }
}

module.exports = McpService;
