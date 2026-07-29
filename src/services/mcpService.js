const logger = require('../utils/logger');
const { query } = require('../utils/db');
const IdentityService = require('./identityService');
const ErrorTrackingService = require('./errorTrackingService');
const GDPRService = require('./gdprService');
const NotificationService = require('../notifications');

/**
 * Canonical MCP tool registry for Cairo (agent-first).
 *
 * Categories: events, users, identity, errors, notifications, GDPR, agents, system.
 */
class McpService {
  constructor() {
    this.identityService = new IdentityService();
    this.errorTrackingService = new ErrorTrackingService();
    this.gdprService = new GDPRService();
    this.notifications = new NotificationService();
    this.serverInfo = {
      name: 'cairo',
      version: '3.0.0',
    };
    this.tools = this._buildToolRegistry();
  }

  async handleRequest(jsonRpcRequest, writeKey) {
    const { method, id, params } = jsonRpcRequest;
    try {
      let result;
      switch (method) {
        case 'initialize':
          result = this._handleInitialize();
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

  _handleInitialize() {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: this.serverInfo,
      capabilities: { tools: {} },
    };
  }

  _handleToolsList() {
    return {
      tools: Object.values(this.tools).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  async _handleToolCall(params, writeKey) {
    const { name, arguments: args } = params;
    const tool = this.tools[name];
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const result = await tool.handler(args || {}, writeKey);
    return {
      content: [{
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      }],
    };
  }

  _errorResponse(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }

  _buildToolRegistry() {
    const tools = {};
    const register = (name, description, inputSchema, handler) => {
      tools[name] = { name, description, inputSchema, handler: handler.bind(this) };
    };

    // ── Events ─────────────────────────────────────────────────────────
    register('track_event', 'Track an event from a product or agent.', {
      type: 'object',
      properties: {
        event: { type: 'string', description: 'Event name' },
        user_id: { type: 'string' },
        user_email: { type: 'string' },
        anonymous_id: { type: 'string' },
        properties: { type: 'object' },
        namespace: { type: 'string' },
      },
      required: ['event'],
    }, this._toolTrackEvent);

    register('batch_track', 'Track multiple events in one call.', {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              event: { type: 'string' },
              user_id: { type: 'string' },
              user_email: { type: 'string' },
              properties: { type: 'object' },
            },
            required: ['event'],
          },
        },
        namespace: { type: 'string' },
      },
      required: ['events'],
    }, this._toolBatchTrack);

    register('query_events', 'Query stored events by user, event name, or time range.', {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        event: { type: 'string' },
        since: { type: 'string', description: 'ISO timestamp' },
        until: { type: 'string', description: 'ISO timestamp' },
        limit: { type: 'number' },
      },
    }, this._toolQueryEvents);

    // ── Users ──────────────────────────────────────────────────────────
    register('identify_user', 'Identify a user and optionally set channel addresses (telegram/discord/whatsapp).', {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        traits: { type: 'object' },
        anonymous_id: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['user_id'],
    }, this._toolIdentifyUser);

    register('lookup_user', 'Look up a user by email or user_id.', {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        email: { type: 'string' },
      },
    }, this._toolLookupUser);

    // ── Identity ───────────────────────────────────────────────────────
    register('resolve_identity', 'Resolve anonymousId/userId/email to a canonical identity.', {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        anonymous_id: { type: 'string' },
        email: { type: 'string' },
        namespace: { type: 'string' },
      },
    }, this._toolResolveIdentity);

    register('alias_identity', 'Alias previousId into userId.', {
      type: 'object',
      properties: {
        previous_id: { type: 'string' },
        user_id: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['previous_id', 'user_id'],
    }, this._toolAliasIdentity);

    // ── Errors ─────────────────────────────────────────────────────────
    register('capture_error', 'Capture an error (Sentry-style).', {
      type: 'object',
      properties: {
        message: { type: 'string' },
        stack: { type: 'string' },
        level: { type: 'string' },
        user_id: { type: 'string' },
        tags: { type: 'object' },
        extra: { type: 'object' },
        namespace: { type: 'string' },
      },
      required: ['message'],
    }, this._toolCaptureError);

    register('list_error_groups', 'List error groups.', {
      type: 'object',
      properties: {
        status: { type: 'string' },
        limit: { type: 'number' },
        namespace: { type: 'string' },
      },
    }, async (args) => this.errorTrackingService.getErrorGroups({
      namespace: args.namespace || 'default',
      status: args.status,
      limit: args.limit || 50,
    }));

    register('get_error_group', 'Get a single error group by fingerprint.', {
      type: 'object',
      properties: { fingerprint: { type: 'string' }, id: { type: 'string' } },
      required: [],
    }, async (args) => {
      const fp = args.fingerprint || args.id;
      if (!fp) throw new Error('fingerprint required');
      return this.errorTrackingService.getErrorGroup(fp);
    });

    register('resolve_error', 'Mark an error group as resolved.', {
      type: 'object',
      properties: { fingerprint: { type: 'string' }, id: { type: 'string' } },
    }, async (args) => {
      const fp = args.fingerprint || args.id;
      if (!fp) throw new Error('fingerprint required');
      return this.errorTrackingService.updateStatus(fp, 'resolved');
    });

    register('error_trends', 'Error occurrence trends.', {
      type: 'object',
      properties: {
        timeRange: { type: 'string' },
        namespace: { type: 'string' },
      },
    }, async (args) => this.errorTrackingService.getTrends({
      namespace: args.namespace || 'default',
      timeRange: args.timeRange || '24h',
    }));

    // ── Notifications (agent handoff only) ───────────────────────────────
    register('set_user_channel', 'Store a user gateway address (telegram/discord/whatsapp/slack) for agents to use when relaying. Cairo does not send to gateways itself.', {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        channel: { type: 'string', enum: ['telegram', 'discord', 'whatsapp', 'slack', 'other'] },
        address: { type: 'string', description: 'chat_id / user_id / phone / slack user id' },
        namespace: { type: 'string' },
      },
      required: ['user_id', 'channel', 'address'],
    }, async (args) => this.notifications.upsertUserChannel({
      userId: args.user_id,
      channel: args.channel,
      address: args.address,
      namespace: args.namespace || 'default',
    }));

    register('create_notification_rule', 'Create a rule that hands a notification to an agent when an event matches. The agent relays via its own gateway.', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        event_name: { type: 'string' },
        property_match: { type: 'object', description: 'Exact property match filter' },
        agent_id: { type: 'string', description: 'Agent that should receive/relay the notification' },
        message_template: { type: 'string', description: 'Supports {{event}}, {{userId}}, {{properties.x}}, {{channels.telegram}}' },
        namespace: { type: 'string' },
      },
      required: ['name', 'event_name', 'agent_id', 'message_template'],
    }, async (args) => this.notifications.createRule(args));

    register('list_notification_rules', 'List notification rules.', {
      type: 'object',
      properties: { namespace: { type: 'string' } },
    }, async (args) => this.notifications.listRules(args.namespace || 'default'));

    register('delete_notification_rule', 'Delete a notification rule by id.', {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    }, async (args) => this.notifications.deleteRule(args.id));

    register('enqueue_notification', 'Manually enqueue a notification for an agent to relay via its gateway.', {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        user_id: { type: 'string' },
        text: { type: 'string' },
        event_name: { type: 'string' },
        properties: { type: 'object' },
        namespace: { type: 'string' },
      },
      required: ['agent_id', 'text'],
    }, async (args) => this.notifications.enqueueForAgent({
      agentId: args.agent_id,
      userId: args.user_id,
      text: args.text,
      eventName: args.event_name || '_manual',
      properties: args.properties || {},
      namespace: args.namespace || 'default',
    }));

    register('get_pending_notifications', 'Pull pending notifications handed off to agents. Payload includes user channel addresses for relaying.', {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        limit: { type: 'number' },
        namespace: { type: 'string' },
      },
    }, async (args) => this.notifications.getPendingNotifications({
      agentId: args.agent_id,
      limit: args.limit || 50,
      namespace: args.namespace || 'default',
    }));

    register('ack_notification', 'Acknowledge a pending notification after your agent has relayed it.', {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['sent', 'failed', 'acked'] },
      },
      required: ['id'],
    }, async (args) => this.notifications.ackNotification(args.id, args.status || 'acked'));

    register('register_agent_webhook', 'Register a webhook URL for push delivery of agent notifications.', {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        url: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['agent_id', 'url'],
    }, async (args) => this.notifications.registerAgentWebhook({
      agentId: args.agent_id,
      url: args.url,
      namespace: args.namespace || 'default',
    }));

    // ── GDPR ───────────────────────────────────────────────────────────
    register('gdpr_delete_user', 'Delete all data for a user (GDPR).', {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['user_id'],
    }, async (args) => this.gdprService.deleteUser(args.user_id, args.namespace || 'default', 'mcp'));

    register('gdpr_suppress_user', 'Suppress a user from further tracking.', {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        reason: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['user_id'],
    }, async (args) => this.gdprService.suppressUser(args.user_id, args.namespace || 'default', args.reason || '', 'mcp'));

    register('gdpr_unsuppress_user', 'Remove suppression for a user.', {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['user_id'],
    }, async (args) => this.gdprService.unsuppressUser(args.user_id, args.namespace || 'default', 'mcp'));

    register('gdpr_check_suppression', 'Check if a user is suppressed.', {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['user_id'],
    }, async (args) => ({
      user_id: args.user_id,
      suppressed: await this.gdprService.isSuppressed(args.user_id, args.namespace || 'default'),
    }));

    // ── Agents ─────────────────────────────────────────────────────────
    register('query_agent_sessions', 'Query agent session history.', {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        limit: { type: 'number' },
        namespace: { type: 'string' },
      },
    }, this._toolQueryAgentSessions);

    // ── System ─────────────────────────────────────────────────────────
    register('system_health', 'Check Cairo health and configured notification channels.', {
      type: 'object',
      properties: {},
    }, this._toolSystemHealth);

    register('describe_tool', 'Describe an MCP tool by name.', {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    }, async (args) => {
      const tool = this.tools[args.name];
      if (!tool) throw new Error(`Unknown tool: ${args.name}`);
      return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
    });

    return tools;
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  async _toolTrackEvent(args) {
    const namespace = args.namespace || 'default';
    const userId = args.user_id || args.user_email || args.anonymous_id || 'anonymous';
    const eventKey = `mcp-${args.event}-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Suppression
    try {
      if (await this.gdprService.isSuppressed(userId, namespace)) {
        return { success: true, dropped: true, reason: 'suppressed' };
      }
    } catch (_) { /* fail open */ }

    // Identity
    try {
      if (args.user_id || args.anonymous_id || args.user_email) {
        await this.identityService.resolve({
          userId: args.user_id,
          anonymousId: args.anonymous_id,
          email: args.user_email,
          namespace,
        });
      }
    } catch (e) {
      logger.warn('[MCP] identity resolve failed:', e.message);
    }

    await query(
      `INSERT INTO event_source (event_key, user_id, event_type, platform, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (event_key) DO NOTHING`,
      [
        eventKey,
        userId,
        args.event,
        'mcp',
        JSON.stringify({ properties: args.properties || {}, namespace }),
      ]
    );

    let notifications = [];
    try {
      notifications = await this.notifications.evaluateEvent({
        event: args.event,
        userId: args.user_id,
        anonymousId: args.anonymous_id,
        properties: args.properties || {},
        namespace,
      });
    } catch (e) {
      logger.warn('[MCP] notification eval failed:', e.message);
    }

    return { success: true, event_key: eventKey, notifications };
  }

  async _toolBatchTrack(args) {
    const results = [];
    for (const ev of args.events || []) {
      results.push(await this._toolTrackEvent({ ...ev, namespace: args.namespace || ev.namespace }));
    }
    return { success: true, count: results.length, results };
  }

  async _toolQueryEvents(args) {
    const clauses = [];
    const params = [];
    let i = 1;
    if (args.user_id) { clauses.push(`user_id = $${i++}`); params.push(args.user_id); }
    if (args.event) { clauses.push(`event_type = $${i++}`); params.push(args.event); }
    if (args.since) { clauses.push(`created_at >= $${i++}`); params.push(args.since); }
    if (args.until) { clauses.push(`created_at <= $${i++}`); params.push(args.until); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(args.limit || 50, 500);
    params.push(limit);
    const result = await query(
      `SELECT id, event_key, event_type, platform, user_id, metadata, created_at
       FROM event_source ${where}
       ORDER BY created_at DESC LIMIT $${i}`,
      params
    );
    return { events: result.rows, count: result.rows.length };
  }

  async _toolIdentifyUser(args) {
    const namespace = args.namespace || 'default';
    const traits = args.traits || {};

    await this.identityService.resolve({
      userId: args.user_id,
      anonymousId: args.anonymous_id,
      email: traits.email,
      namespace,
    });

    if (traits.email) {
      await query(
        `INSERT INTO playmaker_user_source (email, original_user_id, name, meta, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (email) DO UPDATE SET
           original_user_id = EXCLUDED.original_user_id,
           name = COALESCE(EXCLUDED.name, playmaker_user_source.name),
           meta = EXCLUDED.meta,
           updated_at = NOW()`,
        [traits.email, args.user_id, traits.name || null, JSON.stringify({ traits })]
      );
    }

    const channelMap = {
      telegram_chat_id: 'telegram', telegram: 'telegram',
      discord_user_id: 'discord', discord_channel_id: 'discord', discord: 'discord',
      whatsapp_number: 'whatsapp', whatsapp: 'whatsapp', phone: 'whatsapp',
      slack_user_id: 'slack', slack: 'slack',
    };
    for (const [k, channel] of Object.entries(channelMap)) {
      if (traits[k]) {
        await this.notifications.upsertUserChannel({
          userId: args.user_id,
          channel,
          address: String(traits[k]),
          namespace,
        });
      }
    }

    return { success: true, user_id: args.user_id };
  }

  async _toolLookupUser(args) {
    if (args.email) {
      const result = await query(
        `SELECT * FROM playmaker_user_source WHERE email = $1 LIMIT 1`,
        [args.email]
      );
      return { user: result.rows[0] || null };
    }
    if (args.user_id) {
      const result = await query(
        `SELECT * FROM playmaker_user_source WHERE original_user_id = $1 LIMIT 1`,
        [args.user_id]
      );
      const channels = await this.notifications.getUserChannels(args.user_id);
      return { user: result.rows[0] || null, channels };
    }
    throw new Error('user_id or email required');
  }

  async _toolResolveIdentity(args) {
    return this.identityService.resolve({
      userId: args.user_id,
      anonymousId: args.anonymous_id,
      email: args.email,
      namespace: args.namespace || 'default',
    });
  }

  async _toolAliasIdentity(args) {
    return this.identityService.alias({
      previousId: args.previous_id,
      userId: args.user_id,
      namespace: args.namespace || 'default',
    });
  }

  async _toolCaptureError(args) {
    return this.errorTrackingService.capture({
      message: args.message,
      stack_trace: args.stack,
      level: args.level,
      user_id: args.user_id,
      tags: args.tags,
      context: args.extra,
      namespace: args.namespace || 'default',
    });
  }

  async _toolQueryAgentSessions(args) {
    try {
      const clauses = [];
      const params = [];
      let i = 1;
      if (args.agent_id) { clauses.push(`agent_id = $${i++}`); params.push(args.agent_id); }
      if (args.namespace) { clauses.push(`namespace = $${i++}`); params.push(args.namespace); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      params.push(Math.min(args.limit || 50, 200));
      const result = await query(
        `SELECT * FROM agent_sessions ${where} ORDER BY started_at DESC LIMIT $${i}`,
        params
      );
      return { sessions: result.rows };
    } catch (e) {
      return { sessions: [], error: e.message };
    }
  }

  async _toolSystemHealth() {
    let dbOk = false;
    try {
      await query('SELECT 1');
      dbOk = true;
    } catch (_) { /* */ }

    return {
      status: dbOk ? 'healthy' : 'degraded',
      version: this.serverInfo.version,
      delivery: 'agent-handoff',
      tool_count: Object.keys(this.tools).length,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = McpService;
