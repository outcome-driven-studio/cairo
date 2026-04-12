const logger = require('../utils/logger');
const { query } = require('../utils/db');
const IdentityService = require('./identityService');
const ErrorTrackingService = require('./errorTrackingService');
const TransformationService = require('./transformationService');
const TrackingPlanService = require('./trackingPlanService');
const GDPRService = require('./gdprService');

/**
 * Canonical MCP tool registry for Cairo.
 *
 * Every capability Cairo offers is registered here as an MCP tool.
 * REST routes exist as a compatibility layer but this is the source of truth.
 *
 * Tool categories:
 *   - Events:       track, query, batch
 *   - Users:        identify, lookup
 *   - Identity:     resolve, alias, lookup
 *   - Errors:       capture, list groups, get group, resolve, trends
 *   - Destinations: list, create, update, delete, list types
 *   - Transforms:   list, create, update, delete, test
 *   - Tracking:     list plans, create plan, update plan, delete plan
 *   - GDPR:         delete user, suppress, unsuppress, check suppression
 *   - Agents:       query sessions
 *   - System:       health, describe tool
 */
class McpService {
  constructor() {
    this.identityService = new IdentityService();
    this.errorTrackingService = new ErrorTrackingService();
    this.transformationService = new TransformationService();
    this.trackingPlanService = new TrackingPlanService();
    this.gdprService = new GDPRService();
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

    // ═══════════════════════════════════════════════════════════════════
    //  EVENT TOOLS
    // ═══════════════════════════════════════════════════════════════════

    register('track_event', 'Track a CDP event (page view, click, purchase, custom event).', {
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

    register('batch_track', 'Track multiple events in a single call. Each item needs at least an event name.', {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          description: 'Array of event objects',
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
        namespace: { type: 'string', description: 'Namespace for all events' },
      },
      required: ['events'],
    }, this._toolBatchTrack);

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

    // ═══════════════════════════════════════════════════════════════════
    //  USER / IDENTITY TOOLS
    // ═══════════════════════════════════════════════════════════════════

    register('identify_user', 'Identify a user with traits (email, name, plan, etc.).', {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID' },
        email: { type: 'string', description: 'Email address' },
        traits: { type: 'object', description: 'User traits' },
        namespace: { type: 'string', description: 'Namespace' },
      },
      required: ['user_id'],
    }, this._toolIdentifyUser);

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

    register('alias_identity', 'Link two user identities together (e.g., anonymous ID to known user).', {
      type: 'object',
      properties: {
        previous_id: { type: 'string', description: 'Previous user ID or anonymous ID' },
        user_id: { type: 'string', description: 'New canonical user ID' },
        namespace: { type: 'string', description: 'Namespace' },
      },
      required: ['previous_id', 'user_id'],
    }, this._toolAliasIdentity);

    // ═══════════════════════════════════════════════════════════════════
    //  ERROR TRACKING TOOLS
    // ═══════════════════════════════════════════════════════════════════

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

    register('list_error_groups', 'List error groups (like Sentry issues). Filter by status.', {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter: open, resolved, ignored, regressed' },
        namespace: { type: 'string', description: 'Namespace' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    }, this._toolListErrorGroups);

    register('get_error_group', 'Get details of a specific error group by fingerprint.', {
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

    // ═══════════════════════════════════════════════════════════════════
    //  DESTINATION TOOLS
    // ═══════════════════════════════════════════════════════════════════

    register('list_destinations', 'List configured event destinations and their status.', {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Namespace (default: "default")' },
      },
    }, this._toolListDestinations);

    register('list_destination_types', 'List all available destination types (Mixpanel, Slack, BigQuery, etc.).', {
      type: 'object',
      properties: {},
    }, this._toolListDestinationTypes);

    register('create_destination', 'Create a new event destination configuration.', {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Destination name' },
        type: { type: 'string', description: 'Destination type (e.g., mixpanel, slack, bigquery)' },
        namespace: { type: 'string', description: 'Namespace' },
        config: { type: 'object', description: 'Destination-specific config (API keys, URLs, etc.)' },
        event_types: { type: 'array', items: { type: 'string' }, description: 'Event types to forward (default: all)' },
      },
      required: ['name', 'type'],
    }, this._toolCreateDestination);

    register('update_destination', 'Update an existing destination configuration.', {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Destination config ID' },
        name: { type: 'string', description: 'New name' },
        config: { type: 'object', description: 'Updated config' },
        enabled: { type: 'boolean', description: 'Enable or disable' },
        event_types: { type: 'array', items: { type: 'string' }, description: 'Updated event types' },
      },
      required: ['id'],
    }, this._toolUpdateDestination);

    register('delete_destination', 'Delete a destination configuration.', {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Destination config ID' },
      },
      required: ['id'],
    }, this._toolDeleteDestination);

    // ═══════════════════════════════════════════════════════════════════
    //  TRANSFORMATION TOOLS
    // ═══════════════════════════════════════════════════════════════════

    register('list_transformations', 'List event transformation rules for a namespace.', {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Namespace (default: "default")' },
      },
    }, this._toolListTransformations);

    register('create_transformation', 'Create a new event transformation rule (JavaScript function).', {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Transformation name' },
        code: { type: 'string', description: 'JavaScript transformation function body' },
        namespace: { type: 'string', description: 'Namespace' },
        destination_id: { type: 'string', description: 'Apply only to this destination' },
        execution_order: { type: 'number', description: 'Order of execution (lower runs first)' },
      },
      required: ['name', 'code'],
    }, this._toolCreateTransformation);

    register('update_transformation', 'Update an existing transformation rule.', {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Transformation ID' },
        name: { type: 'string' },
        code: { type: 'string' },
        enabled: { type: 'boolean' },
      },
      required: ['id'],
    }, this._toolUpdateTransformation);

    register('delete_transformation', 'Delete a transformation rule.', {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Transformation ID' },
      },
      required: ['id'],
    }, this._toolDeleteTransformation);

    // ═══════════════════════════════════════════════════════════════════
    //  TRACKING PLAN TOOLS
    // ═══════════════════════════════════════════════════════════════════

    register('list_tracking_plans', 'List tracking plans (event schemas and validation rules).', {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Namespace (default: "default")' },
      },
    }, this._toolListTrackingPlans);

    register('create_tracking_plan', 'Create a new tracking plan with event schema validation.', {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Plan name' },
        namespace: { type: 'string', description: 'Namespace' },
        enforcement_mode: { type: 'string', description: 'allow, warn, or drop' },
        schema: { type: 'object', description: 'JSON Schema for event validation' },
      },
      required: ['name'],
    }, this._toolCreateTrackingPlan);

    register('update_tracking_plan', 'Update an existing tracking plan.', {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Plan ID' },
        name: { type: 'string' },
        enforcement_mode: { type: 'string' },
        schema: { type: 'object' },
      },
      required: ['id'],
    }, this._toolUpdateTrackingPlan);

    register('delete_tracking_plan', 'Delete a tracking plan.', {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Plan ID' },
      },
      required: ['id'],
    }, this._toolDeleteTrackingPlan);

    // ═══════════════════════════════════════════════════════════════════
    //  GDPR / COMPLIANCE TOOLS
    // ═══════════════════════════════════════════════════════════════════

    register('gdpr_delete_user', 'Delete a user and all their data (GDPR right to erasure).', {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID or email to delete' },
        namespace: { type: 'string', description: 'Namespace' },
      },
      required: ['user_id'],
    }, this._toolGdprDeleteUser);

    register('gdpr_suppress_user', 'Suppress a user so no new events are stored for them.', {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID or email' },
        reason: { type: 'string', description: 'Reason for suppression' },
        namespace: { type: 'string', description: 'Namespace' },
      },
      required: ['user_id'],
    }, this._toolGdprSuppressUser);

    register('gdpr_unsuppress_user', 'Remove suppression for a user.', {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID or email' },
        namespace: { type: 'string', description: 'Namespace' },
      },
      required: ['user_id'],
    }, this._toolGdprUnsuppressUser);

    register('gdpr_check_suppression', 'Check if a user is currently suppressed.', {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID or email' },
        namespace: { type: 'string', description: 'Namespace' },
      },
      required: ['user_id'],
    }, this._toolGdprCheckSuppression);

    // ═══════════════════════════════════════════════════════════════════
    //  AGENT TRACKING TOOLS
    // ═══════════════════════════════════════════════════════════════════

    register('query_agent_sessions', 'Query AI agent tracking sessions. See which agents ran, their costs, and outcomes.', {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Filter by agent ID' },
        namespace: { type: 'string', description: 'Namespace' },
        status: { type: 'string', description: 'Filter: active, completed' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    }, this._toolQueryAgentSessions);

    // ═══════════════════════════════════════════════════════════════════
    //  SYSTEM TOOLS
    // ═══════════════════════════════════════════════════════════════════

    register('system_health', 'Get Cairo system health: database status, uptime, event counts, error counts.', {
      type: 'object',
      properties: {},
    }, this._toolSystemHealth);

    register('describe_tool', 'Get detailed description, input schema, and usage example for any MCP tool.', {
      type: 'object',
      properties: {
        tool_name: { type: 'string', description: 'Name of the tool to describe' },
      },
      required: ['tool_name'],
    }, this._toolDescribeTool);

    return tools;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  TOOL IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════

  // ── Events ──

  async _toolTrackEvent(args) {
    const eventKey = `mcp-${args.event}-${args.user_email || args.user_id || 'anon'}-${Date.now()}`;

    await query(`
      INSERT INTO event_source (event_key, event_type, platform, user_id, metadata, created_at)
      VALUES ($1, $2, 'mcp', $3, $4, NOW())
      ON CONFLICT (event_key) DO NOTHING
    `, [eventKey, args.event, args.user_email || args.user_id, JSON.stringify(args.properties || {})]);

    return { tracked: true, event: args.event, event_key: eventKey };
  }

  async _toolBatchTrack(args) {
    const results = { received: args.events.length, processed: 0, errors: [] };
    const namespace = args.namespace || 'default';

    for (const evt of args.events) {
      try {
        await this._toolTrackEvent({ ...evt, namespace });
        results.processed++;
      } catch (error) {
        results.errors.push({ event: evt.event, error: error.message });
      }
    }

    return results;
  }

  async _toolQueryEvents(args) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (args.event_type) { conditions.push(`event_type = $${idx++}`); params.push(args.event_type); }
    if (args.user_email) { conditions.push(`user_id = $${idx++}`); params.push(args.user_email); }
    if (args.platform) { conditions.push(`platform = $${idx++}`); params.push(args.platform); }
    if (args.since) { conditions.push(`created_at > $${idx++}`); params.push(args.since); }

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

  // ── Users / Identity ──

  async _toolIdentifyUser(args) {
    const result = await this.identityService.resolve({
      userId: args.user_id,
      email: args.email,
      namespace: args.namespace || 'default',
    });
    return { identified: true, canonical_id: result.canonicalId, merged: result.merged };
  }

  async _toolLookupUser(args) {
    const userResult = await query(
      `SELECT * FROM playmaker_user_source WHERE email = $1`,
      [args.email]
    );

    if (userResult.rows.length === 0) {
      const altResult = await query(`SELECT * FROM user_source WHERE email = $1`, [args.email]);
      if (altResult.rows.length === 0) return { found: false, email: args.email };
      return { found: true, user: altResult.rows[0] };
    }

    const eventsResult = await query(
      `SELECT event_type, platform, created_at FROM event_source WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [args.email]
    );

    return { found: true, user: userResult.rows[0], recent_events: eventsResult.rows };
  }

  async _toolResolveIdentity(args) {
    return await this.identityService.resolve({
      userId: args.user_id,
      email: args.email,
      anonymousId: args.anonymous_id,
      namespace: args.namespace || 'default',
    });
  }

  async _toolAliasIdentity(args) {
    const result = await this.identityService.alias({
      previousId: args.previous_id,
      userId: args.user_id,
      namespace: args.namespace || 'default',
    });
    return { aliased: true, ...result };
  }

  // ── Error Tracking ──

  async _toolCaptureError(args) {
    const result = await this.errorTrackingService.capture(args);
    return { captured: true, id: result.id, fingerprint: result.fingerprint };
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

  // ── Destinations ──

  async _toolListDestinations(args) {
    try {
      const ns = args.namespace || 'default';
      const result = await query('SELECT * FROM destination_configs_v2 WHERE namespace = $1 ORDER BY created_at DESC', [ns]);
      return { destinations: result.rows };
    } catch {
      // Fall back to env-based detection if table doesn't exist
      const destinations = [];
      if (process.env.MIXPANEL_PROJECT_TOKEN) destinations.push({ name: 'Mixpanel', status: 'configured' });
      if (process.env.SLACK_WEBHOOK_URL) destinations.push({ name: 'Slack', status: 'configured' });
      if (process.env.DISCORD_WEBHOOK_URL) destinations.push({ name: 'Discord', status: 'configured' });
      if (process.env.ATTIO_API_KEY) destinations.push({ name: 'Attio', status: 'configured' });
      return { destinations };
    }
  }

  async _toolListDestinationTypes() {
    try {
      const registry = require('../destinations/registry');
      const types = Object.keys(registry).map(key => ({ type: key, name: key.charAt(0).toUpperCase() + key.slice(1) }));
      return { types };
    } catch {
      return { types: ['mixpanel', 'amplitude', 'bigquery', 'slack', 'discord', 'webhook', 'posthog', 'hubspot', 'salesforce', 's3', 'snowflake', 'kafka', 'elasticsearch', 'braze', 'intercom', 'pipedrive'].map(t => ({ type: t, name: t.charAt(0).toUpperCase() + t.slice(1) })) };
    }
  }

  async _toolCreateDestination(args) {
    const ns = args.namespace || 'default';
    const eventTypes = args.event_types || ['track', 'identify', 'page', 'screen', 'group', 'alias'];
    const result = await query(
      `INSERT INTO destination_configs_v2 (name, type, namespace, config, event_types) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [args.name, args.type, ns, JSON.stringify(args.config || {}), eventTypes]
    );
    return { created: true, destination: result.rows[0] };
  }

  async _toolUpdateDestination(args) {
    const sets = ['updated_at = NOW()'];
    const params = [args.id];
    let idx = 2;
    if (args.name !== undefined) { sets.push(`name = $${idx++}`); params.push(args.name); }
    if (args.config !== undefined) { sets.push(`config = $${idx++}`); params.push(JSON.stringify(args.config)); }
    if (args.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(args.enabled); }
    if (args.event_types !== undefined) { sets.push(`event_types = $${idx++}`); params.push(args.event_types); }

    const result = await query(`UPDATE destination_configs_v2 SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
    if (result.rows.length === 0) return { found: false, id: args.id };
    return { updated: true, destination: result.rows[0] };
  }

  async _toolDeleteDestination(args) {
    const result = await query('DELETE FROM destination_configs_v2 WHERE id = $1 RETURNING id', [args.id]);
    if (result.rows.length === 0) return { found: false, id: args.id };
    return { deleted: true, id: args.id };
  }

  // ── Transformations ──

  async _toolListTransformations(args) {
    const transforms = await this.transformationService.getTransforms(args.namespace || 'default');
    return { transformations: transforms };
  }

  async _toolCreateTransformation(args) {
    const transform = await this.transformationService.createTransform({
      name: args.name,
      code: args.code,
      namespace: args.namespace || 'default',
      destinationId: args.destination_id,
      executionOrder: args.execution_order,
    });
    return { created: true, transformation: transform };
  }

  async _toolUpdateTransformation(args) {
    const transform = await this.transformationService.updateTransform(args.id, {
      name: args.name,
      code: args.code,
      enabled: args.enabled,
    });
    return { updated: true, transformation: transform };
  }

  async _toolDeleteTransformation(args) {
    await this.transformationService.deleteTransform(args.id);
    return { deleted: true, id: args.id };
  }

  // ── Tracking Plans ──

  async _toolListTrackingPlans(args) {
    const plans = await this.trackingPlanService.getPlans(args.namespace || 'default');
    return { tracking_plans: plans };
  }

  async _toolCreateTrackingPlan(args) {
    const plan = await this.trackingPlanService.createPlan({
      name: args.name,
      namespace: args.namespace || 'default',
      enforcementMode: args.enforcement_mode || 'warn',
      schema: args.schema || {},
    });
    return { created: true, tracking_plan: plan };
  }

  async _toolUpdateTrackingPlan(args) {
    const plan = await this.trackingPlanService.updatePlan(args.id, {
      name: args.name,
      enforcementMode: args.enforcement_mode,
      schema: args.schema,
    });
    return { updated: true, tracking_plan: plan };
  }

  async _toolDeleteTrackingPlan(args) {
    await this.trackingPlanService.deletePlan(args.id);
    return { deleted: true, id: args.id };
  }

  // ── GDPR ──

  async _toolGdprDeleteUser(args) {
    const result = await this.gdprService.deleteUser(args.user_id, args.namespace || 'default', 'mcp');
    return { deleted: true, ...result };
  }

  async _toolGdprSuppressUser(args) {
    const result = await this.gdprService.suppressUser(args.user_id, args.namespace || 'default', args.reason || '', 'mcp');
    return { suppressed: true, ...result };
  }

  async _toolGdprUnsuppressUser(args) {
    const result = await this.gdprService.unsuppressUser(args.user_id, args.namespace || 'default', 'mcp');
    return { unsuppressed: true, ...result };
  }

  async _toolGdprCheckSuppression(args) {
    const suppressed = await this.gdprService.isSuppressed(args.user_id, args.namespace || 'default');
    return { user_id: args.user_id, suppressed };
  }

  // ── Agent Sessions ──

  async _toolQueryAgentSessions(args) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (args.agent_id) { conditions.push(`agent_id = $${idx++}`); params.push(args.agent_id); }
    if (args.namespace) { conditions.push(`namespace = $${idx++}`); params.push(args.namespace); }
    if (args.status) { conditions.push(`status = $${idx++}`); params.push(args.status); }

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

  // ── System ──

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

    health.tool_count = Object.keys(this.tools).length;
    return health;
  }

  async _toolDescribeTool(args) {
    const tool = this.tools[args.tool_name];
    if (!tool) return { found: false, tool_name: args.tool_name, available: Object.keys(this.tools) };
    return {
      found: true,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      example: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: tool.name, arguments: {} },
      },
    };
  }
}

module.exports = McpService;
