const express = require("express");
const McpService = require("../services/mcpService");

/**
 * GET /docs - plain-HTML documentation, auto-generated from the MCP tool
 * registry so tool reference stays in sync with the code.
 *
 * Deliberately bare HTML — no CSS framework, no JS, no assets. Browser
 * default styles with a tiny <style> for monospaced code blocks.
 */
function renderDocs(baseUrl) {
  const mcp = new McpService();
  const tools = Object.values(mcp.tools);

  const categorize = (name) => {
    if (name.startsWith("gdpr_")) return "GDPR";
    if (name === "capture_error" || name.includes("error")) return "Error tracking";
    if (name.includes("destination")) return "Destinations";
    if (name.includes("transformation")) return "Transformations";
    if (name.includes("tracking_plan")) return "Tracking plans";
    if (name.includes("agent")) return "Agent observability";
    if (name.includes("identity") || name === "alias_identity") return "Identity";
    if (["track_event", "batch_track", "query_events"].includes(name)) return "Events";
    if (["identify_user", "lookup_user"].includes(name)) return "Users";
    return "System";
  };

  const groups = {};
  for (const t of tools) {
    const cat = categorize(t.name);
    (groups[cat] = groups[cat] || []).push(t);
  }
  const order = [
    "Events", "Users", "Identity", "Error tracking", "Destinations",
    "Transformations", "Tracking plans", "GDPR", "Agent observability", "System",
  ];

  const esc = (s) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const renderTool = (t) => {
    const required = (t.inputSchema && t.inputSchema.required) || [];
    const props = (t.inputSchema && t.inputSchema.properties) || {};
    const propRows = Object.entries(props).map(([k, v]) => {
      const req = required.includes(k) ? " <em>(required)</em>" : "";
      const type = v.type || "any";
      return `<tr><td><code>${esc(k)}</code>${req}</td><td>${esc(type)}</td><td>${esc(v.description || "")}</td></tr>`;
    }).join("\n");

    const sampleArgs = {};
    for (const [k, v] of Object.entries(props)) {
      if (required.includes(k)) {
        sampleArgs[k] = v.type === "number" ? 1 : (v.type === "boolean" ? true : (v.type === "object" ? {} : (v.type === "array" ? [] : `<${k}>`)));
      }
    }
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: t.name, arguments: sampleArgs },
    };
    const curl = `curl -X POST ${baseUrl}/mcp \\
  -H "Content-Type: application/json" \\
  -H "X-Write-Key: YOUR_KEY" \\
  -d '${JSON.stringify(payload)}'`;

    return `
<section id="tool-${esc(t.name)}">
  <h3><code>${esc(t.name)}</code></h3>
  <p>${esc(t.description)}</p>
  ${propRows ? `<table>
    <thead><tr><th>Argument</th><th>Type</th><th>Description</th></tr></thead>
    <tbody>${propRows}</tbody>
  </table>` : "<p><em>No arguments.</em></p>"}
  <p><strong>Example:</strong></p>
  <pre>${esc(curl)}</pre>
</section>`;
  };

  const toc = order
    .filter((cat) => groups[cat])
    .map((cat) => `<li><a href="#cat-${cat.toLowerCase().replace(/\s+/g, "-")}">${esc(cat)}</a>
  <ul>${groups[cat].map(t => `<li><a href="#tool-${esc(t.name)}"><code>${esc(t.name)}</code></a></li>`).join("")}</ul></li>`)
    .join("\n");

  const toolSections = order
    .filter((cat) => groups[cat])
    .map((cat) => `
<h2 id="cat-${cat.toLowerCase().replace(/\s+/g, "-")}">${esc(cat)}</h2>
${groups[cat].map(renderTool).join("\n")}`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cairo — Documentation</title>
<style>
  body { max-width: 860px; margin: 2em auto; padding: 0 1em; font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.55; }
  pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { background: #f4f4f4; padding: 0.8em 1em; overflow-x: auto; font-size: 0.88em; white-space: pre-wrap; word-break: break-word; }
  code { background: #f4f4f4; padding: 1px 4px; font-size: 0.92em; }
  pre code { background: transparent; padding: 0; font-size: inherit; }
  table { border-collapse: collapse; width: 100%; margin: 0.75em 0; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 0.92em; vertical-align: top; }
  th { background: #f4f4f4; }
  h1 { margin-top: 0; }
  h2 { border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 2em; }
  h3 { margin-top: 1.5em; }
  section { margin-bottom: 1.5em; }
  nav ul { margin: 0.3em 0; }
  .muted { color: #666; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 2em 0; }
</style>
</head>
<body>

<h1>Cairo Documentation</h1>
<p>Cairo is a headless, MCP-first customer data platform. Agents are the primary user. This document describes how to connect, authenticate, and call every available tool.</p>

<p class="muted">
  Also: <a href="/llms.txt">/llms.txt</a> (agent-readable summary) ·
  <a href="/.well-known/mcp.json">/.well-known/mcp.json</a> (machine-readable discovery) ·
  <a href="/mcp">/mcp</a> (MCP JSON-RPC endpoint) ·
  <a href="/health">/health</a> (health)
</p>

<hr>

<nav>
  <h2>Contents</h2>
  <ol>
    <li><a href="#overview">Overview</a></li>
    <li><a href="#auth">Authentication</a></li>
    <li><a href="#protocol">MCP protocol</a>
      <ul>
        <li><a href="#initialize">initialize</a></li>
        <li><a href="#tools-list">tools/list</a></li>
        <li><a href="#tools-call">tools/call</a></li>
        <li><a href="#ping">ping</a></li>
        <li><a href="#errors">Error codes</a></li>
      </ul>
    </li>
    <li><a href="#tools">Tool reference (${tools.length})</a>
      <ul>${toc}</ul>
    </li>
    <li><a href="#rest">REST compatibility</a></li>
    <li><a href="#sdks">SDKs</a></li>
    <li><a href="#selfhost">Self-hosting</a></li>
  </ol>
</nav>

<hr>

<h2 id="overview">Overview</h2>
<p>Cairo exposes its capabilities as an <strong>MCP (Model Context Protocol)</strong> server over HTTP. Agents send JSON-RPC requests to <code>POST /mcp</code> and receive structured JSON responses. The same capabilities are also exposed as REST endpoints for backward compatibility with existing tools (Segment-compatible event ingestion, REST CRUD for destinations, etc.).</p>
<p>There is no UI. Everything is done through MCP or REST.</p>

<h2 id="auth">Authentication</h2>
<p>All requests to <code>/mcp</code> require a write key. Pass it as one of:</p>
<pre>X-Write-Key: your-key</pre>
<pre>Authorization: Bearer your-key</pre>
<p>Any non-empty key is currently accepted. Fine-grained key validation (per-namespace scopes, rate limits) is on the roadmap.</p>

<h2 id="protocol">MCP protocol</h2>
<p>Cairo implements MCP protocol version <code>2024-11-05</code> over the Streamable HTTP transport. All requests are JSON-RPC 2.0.</p>

<h3 id="initialize">initialize</h3>
<p>Handshake. Returns protocol version, server info, and capabilities.</p>
<pre>curl -X POST ${baseUrl}/mcp \\
  -H "Content-Type: application/json" \\
  -H "X-Write-Key: YOUR_KEY" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'</pre>
<pre>Response:
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "serverInfo": { "name": "cairo-cdp", "version": "2.0.0" },
    "capabilities": { "tools": {} }
  }
}</pre>

<h3 id="tools-list">tools/list</h3>
<p>Returns every available tool with its name, description, and input schema.</p>
<pre>curl -X POST ${baseUrl}/mcp \\
  -H "Content-Type: application/json" \\
  -H "X-Write-Key: YOUR_KEY" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'</pre>

<h3 id="tools-call">tools/call</h3>
<p>Invoke a tool. The result is returned inside <code>result.content</code> as an array of MCP content blocks. Cairo always returns one <code>text</code> block containing the stringified JSON response.</p>
<pre>curl -X POST ${baseUrl}/mcp \\
  -H "Content-Type: application/json" \\
  -H "X-Write-Key: YOUR_KEY" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{
    "name":"track_event",
    "arguments":{"event":"signup","user_email":"jane@example.com"}
  }}'</pre>
<pre>Response:
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      { "type": "text", "text": "{\\n  \\"tracked\\": true,\\n  \\"event\\": \\"signup\\",\\n  \\"event_key\\": \\"mcp-signup-jane@example.com-1234567890\\"\\n}" }
    ]
  }
}</pre>

<h3 id="ping">ping</h3>
<p>Liveness check. Returns empty result.</p>
<pre>curl -X POST ${baseUrl}/mcp \\
  -H "X-Write-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":99,"method":"ping"}'</pre>

<h3 id="errors">Error codes</h3>
<table>
  <thead><tr><th>Code</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><code>-32000</code></td><td>Missing write key</td></tr>
    <tr><td><code>-32600</code></td><td>Invalid request (missing <code>method</code>)</td></tr>
    <tr><td><code>-32601</code></td><td>Method not found</td></tr>
    <tr><td><code>-32603</code></td><td>Internal error (uncaught exception)</td></tr>
  </tbody>
</table>
<p>Batch mode is supported: send a JSON array of JSON-RPC requests, receive an array of responses.</p>

<h2 id="tools">Tool reference (${tools.length})</h2>
<p>Every capability Cairo offers is an MCP tool. Each section below lists arguments and a working <code>curl</code> example. Required arguments are marked; everything else is optional.</p>
${toolSections}

<h2 id="rest">REST compatibility</h2>
<p>Cairo exposes Segment-compatible REST endpoints for existing client libraries. All also accept the <code>X-Write-Key</code> header.</p>
<table>
  <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
  <tbody>
    <tr><td><code>/api/v2/track</code></td><td>POST</td><td>Track a single event</td></tr>
    <tr><td><code>/api/v2/batch</code></td><td>POST</td><td>Track many events</td></tr>
    <tr><td><code>/api/v2/identify</code></td><td>POST</td><td>Identify a user</td></tr>
    <tr><td><code>/api/v2/page</code></td><td>POST</td><td>Page view</td></tr>
    <tr><td><code>/api/v2/screen</code></td><td>POST</td><td>Screen view (mobile)</td></tr>
    <tr><td><code>/api/v2/group</code></td><td>POST</td><td>Associate user with group</td></tr>
    <tr><td><code>/api/v2/alias</code></td><td>POST</td><td>Link two identities</td></tr>
    <tr><td><code>/api/v2/errors/capture</code></td><td>POST</td><td>Capture an error</td></tr>
    <tr><td><code>/api/v2/identities/resolve</code></td><td>GET</td><td>Resolve identity graph</td></tr>
    <tr><td><code>/api/v2/destinations</code></td><td>GET/POST</td><td>Destination CRUD</td></tr>
    <tr><td><code>/api/v2/transformations</code></td><td>GET/POST</td><td>Transformation CRUD</td></tr>
    <tr><td><code>/api/v2/tracking-plans</code></td><td>GET/POST</td><td>Tracking plan CRUD</td></tr>
    <tr><td><code>/api/v2/users/:userId</code></td><td>DELETE</td><td>GDPR delete</td></tr>
  </tbody>
</table>

<h2 id="sdks">SDKs</h2>
<table>
  <thead><tr><th>Package</th><th>Use for</th></tr></thead>
  <tbody>
    <tr><td><code>@cairo/tracker</code></td><td>Universal event tracking from apps</td></tr>
    <tr><td><code>@cairo/agent-tracker</code></td><td>AI agent session tracking (generations, tool calls, costs)</td></tr>
    <tr><td><code>@cairo/agent-mcp</code></td><td>stdio MCP server for Claude Code, Cursor, and other agents</td></tr>
    <tr><td><code>@cairo/node-sdk</code></td><td>Node.js server-side SDK</td></tr>
  </tbody>
</table>

<h3>stdio MCP for Claude Code / Cursor</h3>
<pre>{
  "mcpServers": {
    "cairo": {
      "command": "npx",
      "args": ["-y", "@cairo/agent-mcp"],
      "env": {
        "CAIRO_HOST": "${baseUrl}",
        "CAIRO_WRITE_KEY": "your-write-key",
        "CAIRO_AGENT_ID": "my-agent"
      }
    }
  }
}</pre>

<h2 id="selfhost">Self-hosting</h2>
<p>Cairo is Node.js + PostgreSQL. MIT licensed.</p>
<pre>git clone https://github.com/outcome-driven-studio/cairo.git
cd cairo
npm install
cp .env.example .env
# Set POSTGRES_URL in .env
npm run migrate
npm start</pre>

<hr>
<p class="muted">Source: <a href="https://github.com/outcome-driven-studio/cairo">github.com/outcome-driven-studio/cairo</a></p>

</body>
</html>`;
}

function setup() {
  const router = express.Router();
  router.get("/", (req, res) => {
    const host = req.headers.host || `localhost:${process.env.PORT || 8080}`;
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const baseUrl = `${protocol}://${host}`;
    res.type("html").send(renderDocs(baseUrl));
  });
  return router;
}

module.exports = { setup, renderDocs };
