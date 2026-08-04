'use strict';

let rpcId = 1;

/**
 * Call a Cairo MCP tool over HTTP JSON-RPC.
 */
async function callCairoTool(host, writeKey, name, args = {}) {
  const base = String(host || '').replace(/\/$/, '');
  if (!base) throw new Error('CAIRO_HOST required');
  if (!writeKey) throw new Error('CAIRO_WRITE_KEY required');

  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Write-Key': writeKey,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcId++,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `Cairo MCP HTTP ${res.status}`);
  }
  if (json.error) {
    throw new Error(json.error.message || `Cairo MCP error ${json.error.code}`);
  }
  return json.result;
}

async function ackNotification(host, writeKey, id, status = 'acked') {
  return callCairoTool(host, writeKey, 'ack_notification', { id, status });
}

async function registerAgentWebhook(host, writeKey, { agentId, url, namespace = 'default' }) {
  return callCairoTool(host, writeKey, 'register_agent_webhook', {
    agent_id: agentId,
    url,
    namespace,
  });
}

module.exports = { callCairoTool, ackNotification, registerAgentWebhook };
