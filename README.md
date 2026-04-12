<div align="center">
  <img src="./logo.svg" alt="Cairo" width="200" height="auto">
  <br/><br/>
  <img src="https://img.shields.io/badge/version-2.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
</div>

# Cairo

Open-source, headless, MCP-first customer data platform. Agents are the primary user. Track events, resolve identities, transform data, route to 15+ destinations. No UI required.

## Why Cairo

- **MCP-first.** Agents connect via the Model Context Protocol. 30+ tools for events, errors, identity, destinations, GDPR, and more. No UI to navigate.
- **Segment-compatible.** Drop-in replacement for Segment's tracking API. Existing client libraries work out of the box.
- **Full CDP pipeline.** Identity resolution, event transformations, tracking plans, GDPR compliance, and event replay.
- **AI agent support.** First-class tracking for LLM generations, tool calls, decisions, and errors with dedicated agent SDK and MCP server.
- **Self-hosted.** Your data stays on your infrastructure. Node.js + PostgreSQL.

## Quick Start

### For Agents (MCP)

Add Cairo to your agent's MCP config:

```json
{
  "mcpServers": {
    "cairo": {
      "command": "npx",
      "args": ["-y", "@cairo/agent-mcp"],
      "env": {
        "CAIRO_HOST": "https://your-cairo-instance.com",
        "CAIRO_WRITE_KEY": "your-write-key",
        "CAIRO_AGENT_ID": "my-agent"
      }
    }
  }
}
```

Or connect directly via HTTP:

```bash
curl -X POST https://your-cairo.com/mcp \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: your-write-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
    "name":"track_event",
    "arguments":{"event":"signup","user_email":"jane@example.com"}
  }}'
```

### For Apps (SDK)

```bash
npm install @cairo/tracker
```

```typescript
import { Cairo } from '@cairo/tracker';

const cairo = Cairo.init({
  writeKey: 'your-write-key',
  host: 'https://your-cairo-instance.com',
});

cairo.track({
  event: 'signup',
  userId: 'user_123',
  properties: { plan: 'free', source: 'landing_page' },
});

cairo.identify({
  userId: 'user_123',
  traits: { name: 'Ava', email: 'ava@school.edu' },
});

await cairo.shutdown();
```

## MCP Tools

Cairo exposes 30+ tools via the MCP protocol. Use `GET /mcp` for discovery or `GET /llms.txt` for the full reference.

| Category | Tools |
|----------|-------|
| **Events** | `track_event`, `batch_track`, `query_events` |
| **Users** | `identify_user`, `lookup_user` |
| **Identity** | `resolve_identity`, `alias_identity` |
| **Errors** | `capture_error`, `list_error_groups`, `get_error_group`, `resolve_error`, `error_trends` |
| **Destinations** | `list_destinations`, `list_destination_types`, `create_destination`, `update_destination`, `delete_destination` |
| **Transformations** | `list_transformations`, `create_transformation`, `update_transformation`, `delete_transformation` |
| **Tracking Plans** | `list_tracking_plans`, `create_tracking_plan`, `update_tracking_plan`, `delete_tracking_plan` |
| **GDPR** | `gdpr_delete_user`, `gdpr_suppress_user`, `gdpr_unsuppress_user`, `gdpr_check_suppression` |
| **Agents** | `query_agent_sessions` |
| **System** | `system_health`, `describe_tool` |

## AI Agent Tracking

```bash
npm install @cairo/agent-tracker
```

```typescript
import { AgentTracker } from '@cairo/agent-tracker';

const tracker = AgentTracker.init({
  writeKey: 'your-write-key',
  host: 'https://your-cairo-instance.com',
  agentId: 'support-agent',
});

tracker.generation({
  model: 'claude-sonnet-4-20250514',
  promptTokens: 1200,
  completionTokens: 350,
  latencyMs: 2100,
});

tracker.toolCall({ tool: 'search_kb', input: { query: 'refund policy' }, success: true, latencyMs: 450 });
tracker.error({ type: 'tool_timeout', message: 'KB search timed out', recoverable: true });

await tracker.shutdown();
```

## Architecture

```
                      +-----------------------+
                      |   Agents / Apps       |
                      |                       |
                      |  MCP protocol         |
                      |  @cairo/tracker       |
                      |  @cairo/agent-tracker |
                      +-----------+-----------+
                                  |
                         +--------v---------+
                         |  Cairo Server    |
                         |  (headless)      |
                         |                  |
                         |  POST /mcp       |
                         |  /api/v2/*       |
                         +--------+---------+
                                  |
                 +----------------+----------------+
                 |                |                 |
          +------v------+  +-----v------+  +-------v-------+
          | Warehouses  |  | Analytics  |  | Operational   |
          | BigQuery    |  | Mixpanel   |  | Slack         |
          | Snowflake   |  | Amplitude  |  | Discord       |
          | S3          |  | PostHog    |  | Webhooks      |
          | Elastic     |  | Langfuse   |  | Kafka         |
          +-------------+  +------------+  +---------------+
```

## REST API (Compatibility)

REST endpoints exist for backward compatibility. All functionality is also available via MCP.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/track` | POST | Track a single event |
| `/v2/batch` | POST | Track multiple events |
| `/v2/identify` | POST | Identify a user |
| `/v2/group` | POST | Associate user with a group |
| `/v2/page` | POST | Track a page view |
| `/v2/screen` | POST | Track a screen view |
| `/v2/alias` | POST | Link two user identities |

## Destinations

| Category | Destinations |
|----------|-------------|
| **Analytics** | Mixpanel, Amplitude, PostHog, GA4 |
| **CRM & Sales** | HubSpot, Salesforce, Pipedrive, Attio |
| **Data Warehouses** | BigQuery, Snowflake, S3, Elasticsearch, Kafka |
| **Messaging & Ops** | Slack, Discord, Braze, CustomerIO, Intercom, SendGrid, Resend, Webhook |

## SDKs

| Package | Description |
|---------|-------------|
| [`@cairo/tracker`](./packages/tracker) | Universal event tracking SDK |
| [`@cairo/agent-tracker`](./packages/agent-tracker) | Agent behavior tracking with session management |
| [`@cairo/agent-mcp`](./packages/agent-mcp) | MCP server for agent self-reporting |
| [`@cairo/node-sdk`](./packages/node-sdk) | Node.js server-side SDK |

## Server Setup

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14

### Install and Run

```bash
git clone https://github.com/outcome-driven-studio/cairo.git
cd cairo
npm install
cp .env.example .env
# Edit .env with your POSTGRES_URL
npm start
```

Server runs on port 8080. Verify with `curl http://localhost:8080/health`.

### Docker

```bash
docker build -t cairo .
docker run -p 8080:8080 --env-file .env cairo
```

### Discovery Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /mcp` | MCP server info and tool list |
| `GET /llms.txt` | Agent-readable documentation |
| `GET /.well-known/mcp.json` | Automated MCP server discovery |
| `GET /health` | Health check with database status |

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `server.js` | Express application entry point |
| `src/routes/` | API route handlers |
| `src/services/` | Business logic and pipeline services |
| `src/destinations/` | Destination connector plugins |
| `src/migrations/` | Database migration scripts |
| `packages/tracker/` | Universal event tracking SDK |
| `packages/agent-tracker/` | Agent tracking SDK |
| `packages/agent-mcp/` | MCP server package |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run `npm test`
5. Open a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## License

MIT. See [LICENSE](LICENSE) for details.

---

<div align="center">
  <a href="https://github.com/outcome-driven-studio/cairo">github.com/outcome-driven-studio/cairo</a>
</div>
