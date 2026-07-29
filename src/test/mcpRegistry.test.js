/**
 * Smoke test: MCP tool registry loads and includes agent-handoff tools.
 * No DB required.
 */
describe('McpService registry', () => {
  let McpService;
  let mcp;

  beforeAll(() => {
    McpService = require('../services/mcpService');
    mcp = new McpService();
  });

  it('registers core + notification handoff tools', () => {
    const names = Object.keys(mcp.tools);
    expect(names).toEqual(expect.arrayContaining([
      'track_event',
      'batch_track',
      'query_events',
      'identify_user',
      'create_notification_rule',
      'get_pending_notifications',
      'ack_notification',
      'enqueue_notification',
      'register_agent_webhook',
      'set_user_channel',
      'create_write_key',
      'list_write_keys',
      'revoke_write_key',
      'system_health',
    ]));
    // Direct gateway send must NOT exist
    expect(names).not.toContain('send_notification');
  });

  it('initialize returns server info', async () => {
    const res = await mcp.handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, 'k');
    expect(res.result.serverInfo.name).toBe('cairo');
    expect(res.result.serverInfo.version).toBe('3.0.0');
  });

  it('tools/list returns schemas', async () => {
    const res = await mcp.handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'k');
    expect(res.result.tools.length).toBeGreaterThan(15);
    const rule = res.result.tools.find((t) => t.name === 'create_notification_rule');
    expect(rule.inputSchema.required).toEqual(
      expect.arrayContaining(['name', 'event_name', 'agent_id', 'message_template'])
    );
  });
});
