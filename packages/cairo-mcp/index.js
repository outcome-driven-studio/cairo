#!/usr/bin/env node

/**
 * @ani-hq/cairo-mcp — stdio MCP proxy to Cairo's full HTTP /mcp surface.
 *
 * Env:
 *   CAIRO_HOST       — base URL (required)
 *   CAIRO_WRITE_KEY  — write key (required)
 *   CAIRO_AGENT_ID   — optional default agent_id for setup/drain tools
 */

'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const HOST = (process.env.CAIRO_HOST || '').replace(/\/$/, '');
const WRITE_KEY = process.env.CAIRO_WRITE_KEY || '';
const AGENT_ID = process.env.CAIRO_AGENT_ID || '';

if (!HOST || !WRITE_KEY) {
  console.error(
    '@ani-hq/cairo-mcp requires CAIRO_HOST and CAIRO_WRITE_KEY environment variables'
  );
  process.exit(1);
}

let rpcId = 1;

async function cairoRpc(method, params) {
  const body = {
    jsonrpc: '2.0',
    id: rpcId++,
    method,
  };
  if (params !== undefined) body.params = params;

  const res = await fetch(`${HOST}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Write-Key': WRITE_KEY,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || `Cairo MCP HTTP ${res.status}`);
  }
  if (json.error) {
    throw new Error(json.error.message || `Cairo MCP error ${json.error.code}`);
  }
  return json.result;
}

function withDefaultAgentId(name, args) {
  if (!AGENT_ID) return args;
  if (
    [
      'setup_product',
      'drain_notifications',
      'get_pending_notifications',
      'enqueue_notification',
      'register_agent_webhook',
    ].includes(name) &&
    (args.agent_id === undefined || args.agent_id === null || args.agent_id === '')
  ) {
    return { ...args, agent_id: AGENT_ID };
  }
  return args;
}

async function main() {
  const server = new Server(
    { name: 'cairo', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const result = await cairoRpc('tools/list');
    return {
      tools: (result.tools || []).map((t) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const rawArgs = request.params.arguments || {};
    const args = withDefaultAgentId(name, rawArgs);

    const result = await cairoRpc('tools/call', {
      name,
      arguments: args,
    });

    if (result?.content) {
      return { content: result.content };
    }
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
