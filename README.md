<div align="center">
  <img src="./logo.svg" alt="Cairo" width="200" height="auto">
  <br/><br/>
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
</div>

# Cairo

Open-source customer data platform. Track events from any app, resolve user identities, transform data on the fly, and route it all to 15+ destinations. Segment-compatible API, self-hosted, MIT licensed.

## Why Cairo

- **Track anything.** Product events (signups, purchases), page views, AI agent behavior, backend events. One pipeline for all of it.
- **Segment-compatible.** Drop-in replacement for Segment's tracking API. Existing Segment client libraries work out of the box.
- **Full CDP pipeline.** Identity resolution, event transformations, tracking plans, GDPR compliance, and event replay ship out of the box.
- **AI agent support.** First-class tracking for LLM generations, tool calls, decisions, and errors with dedicated agent SDK and MCP server.
- **Self-hosted.** Your data stays on your infrastructure. Node.js + PostgreSQL.

## Quick Start

### Install

```bash
npm install @cairo/tracker
```

### Track Events

```typescript
import { Cairo } from '@cairo/tracker';

const cairo = Cairo.init({
  writeKey: 'your-write-key',
  host: 'https://your-cairo-instance.com',
});

// Track product events
cairo.track({
  event: 'signup',
  userId: 'user_123',
  properties: { plan: 'free', source: 'landing_page' },
});

cairo.track({
  event: 'story_generated',
  userId: 'user_123',
  properties: { theme: 'pirates', pages: 12, generationTimeMs: 3200 },
});

// Identify users
cairo.identify({
  userId: 'user_123',
  traits: { name: 'Ava', email: 'ava@school.edu', grade: 5 },
});

// Track page views
cairo.page({ name: 'Story Builder', userId: 'user_123' });

// Associate user with a group
cairo.group({
  groupId: 'school_456',
  userId: 'user_123',
  traits: { name: 'Lincoln Elementary', plan: 'classroom' },
});

// Before process exits
await cairo.shutdown();
```

### Use the HTTP API directly (no SDK)

```bash
curl -X POST https://your-cairo.com/v2/track \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: your-write-key" \
  -d '{
    "event": "purchase",
    "userId": "user_123",
    "properties": { "amount": 29.99, "item": "premium_plan" }
  }'
```

## AI Agent Tracking

For tracking AI agent behavior, use the dedicated agent SDK:

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

const session = tracker.session({ task: 'resolve-ticket-4521' });

tracker.generation({
  model: 'claude-sonnet-4-20250514',
  promptTokens: 1200,
  completionTokens: 350,
  latencyMs: 2100,
  costUsd: 0.0047,
});

tracker.toolCall({ tool: 'search_kb', input: { query: 'refund policy' }, success: true, latencyMs: 450 });
tracker.decision({ type: 'routing', options: ['escalate', 'resolve'], chosen: 'resolve', confidence: 0.92 });
tracker.error({ type: 'tool_timeout', message: 'KB search timed out', recoverable: true });

session.end({ exitReason: 'task_complete' });
await tracker.shutdown();
```

### MCP Support (for Claude, GPT, and other agents)

```bash
claude mcp add cairo-agent -- npx @cairo/agent-mcp

export CAIRO_WRITE_KEY=your-write-key
export CAIRO_HOST=https://your-cairo-instance.com
export CAIRO_AGENT_ID=my-agent
```

### Framework Middleware

```typescript
// LangChain
import { CairoCallbackHandler } from '@cairo/agent-tracker/middleware/langchain';
const handler = new CairoCallbackHandler(tracker);

// OpenAI
import { wrapOpenAI } from '@cairo/agent-tracker/middleware/openai';
const client = wrapOpenAI(new OpenAI(), tracker);

// Vercel AI SDK
import { trackVercelAI } from '@cairo/agent-tracker/middleware/vercel-ai';
trackVercelAI(tracker, result);
```

## Architecture

```
                      +-----------------------+
                      |   Your App / Agents   |
                      |                       |
                      |  @cairo/tracker       |
                      |  @cairo/agent-tracker |
                      |  HTTP API             |
                      +-----------+-----------+
                                  |
                         +--------v---------+
                         |   Cairo Server   |
                         |                  |
                         |  - Ingestion     |
                         |  - Identity      |
                         |  - Transforms    |
                         |  - Tracking Plans|
                         |  - GDPR          |
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

## API Reference

### Event Ingestion (Segment-compatible)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/track` | POST | Track a single event |
| `/v2/batch` | POST | Track multiple events |
| `/v2/identify` | POST | Identify a user or agent |
| `/v2/group` | POST | Associate user with a group |
| `/v2/page` | POST | Track a page view |
| `/v2/screen` | POST | Track a screen view (mobile) |
| `/v2/alias` | POST | Link two user identities |

### Agent Tracking

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/agent/session/start` | POST | Start a new agent session |
| `/v2/agent/session/end` | POST | End an agent session |
| `/v2/agent/sessions/:agentId` | GET | List sessions for an agent |
| `/v2/agent/metrics/:agentId` | GET | Get aggregated agent metrics |
| `/v2/agent/compare` | GET | Compare metrics across agents |

### CDP Pipeline

| Capability | Endpoints |
|------------|-----------|
| Identity Resolution | `/api/v2/identities/*` |
| Transformations | `/api/v2/transformations/*` |
| Tracking Plans | `/api/v2/tracking-plans/*` |
| GDPR Compliance | `/api/v2/gdpr/*` |
| Event Replay | `/api/v2/replay/*` |
| Destinations | `/api/v2/destinations/*` |

See [docs/API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md) for the full API reference.

## Destinations

| Category | Destinations |
|----------|-------------|
| **Analytics** | Mixpanel, Amplitude, PostHog, GA4 |
| **CRM & Sales** | HubSpot, Salesforce, Pipedrive, Attio |
| **Data Warehouses** | BigQuery, Snowflake, S3, Elasticsearch, Kafka |
| **Messaging & Ops** | Slack, Discord, Braze, CustomerIO, Intercom, SendGrid, Resend, Webhook |

## SDKs and Packages

| Package | Description |
|---------|-------------|
| [`@cairo/tracker`](./packages/tracker) | Universal event tracking SDK for product events. |
| [`@cairo/agent-tracker`](./packages/agent-tracker) | Agent behavior tracking SDK with session management. |
| [`@cairo/agent-mcp`](./packages/agent-mcp) | MCP server for agent self-reporting. |

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

### Deployment

```bash
# Docker
docker build -t cairo .
docker run -p 8080:8080 --env-file .env cairo

# PM2
npm install -g pm2
pm2 start server.js --name cairo
```

See [docs/DEPLOYMENT_GUIDE.md](./docs/DEPLOYMENT_GUIDE.md) for Railway, GCP, and production configuration.

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
| `docs/` | Technical documentation |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run `npm test` and `npm run lint`
5. Open a pull request

## License

MIT. See [LICENSE](LICENSE) for details.

---

<div align="center">
  <a href="https://github.com/outcome-driven-studio/cairo">github.com/outcome-driven-studio/cairo</a>
</div>
