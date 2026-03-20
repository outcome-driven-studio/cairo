<div align="center">
  <img src="./logo.svg" alt="Cairo" width="200" height="auto">
  <br/><br/>
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
</div>

# Cairo

Open-source event pipeline for AI agents. Cairo collects events from LLM generations, tool calls, decisions, errors, and handoffs, then routes them to any destination: data warehouses, observability tools (Langfuse, LangSmith), Slack, Kafka, and more. Think Segment, but purpose-built for agent infrastructure.

## Why Cairo

- **Pipeline, not another dashboard.** Langfuse and LangSmith are observability UIs (destinations). Cairo is the collection and routing layer that sends data *to* them, and to everything else simultaneously. Same relationship as Segment to Mixpanel.
- **Agent-native event model.** First-class support for generations, tool calls, decisions, errors, handoffs, and sessions. Not shoehorned into page views and button clicks.
- **Framework agnostic.** Works with LangChain, OpenAI, Vercel AI SDK, or raw HTTP. Agents can self-report via MCP. No vendor lock-in.
- **Full CDP pipeline included.** Identity resolution, transformations, tracking plans, GDPR compliance, and event replay ship out of the box. Not just a forwarder.

## Quick Start

### Install the SDK

```bash
npm install @cairo/agent-tracker
```

### Track Agent Events

```typescript
import { AgentTracker } from '@cairo/agent-tracker';

const tracker = AgentTracker.init({
  writeKey: 'ak_...',
  host: 'http://localhost:8080',
  agentId: 'support-agent',
  flushAt: 50,
  flushInterval: 5000,
});

// Start a session
const session = tracker.session({ task: 'resolve-ticket-4521' });

// Track an LLM generation
tracker.generation({
  model: 'claude-sonnet-4-20250514',
  promptTokens: 1200,
  completionTokens: 350,
  latencyMs: 2100,
  costUsd: 0.0047,
});

// Track a tool call
tracker.toolCall({
  tool: 'search_kb',
  input: { query: 'refund policy' },
  latencyMs: 450,
  success: true,
});

// Track a decision
tracker.decision({
  type: 'routing',
  options: ['escalate', 'resolve'],
  chosen: 'resolve',
  confidence: 0.92,
});

// Track an error
tracker.error({
  type: 'tool_timeout',
  message: 'KB search timed out',
  recoverable: true,
});

// End the session
session.end({ exitReason: 'task_complete' });

// Graceful shutdown
await tracker.shutdown();
```

### Use with MCP (for Claude, GPT, and other agents)

Agents that support the Model Context Protocol can self-report events directly.

```bash
# Add to Claude Desktop or any MCP-compatible client
claude mcp add cairo-agent -- npx @cairo/agent-mcp

# Configure via environment
export CAIRO_WRITE_KEY=ak_...
export CAIRO_HOST=http://localhost:8080
export CAIRO_AGENT_ID=my-agent
npx @cairo/agent-mcp
```

The MCP server exposes 6 tools: `track_generation`, `track_tool_call`, `track_decision`, `track_error`, `start_session`, `end_session`.

### Use with LangChain / OpenAI / Vercel AI

```typescript
// LangChain
import { CairoCallbackHandler } from '@cairo/agent-tracker/middleware/langchain';
const handler = new CairoCallbackHandler(tracker);
const chain = new LLMChain({ llm, prompt, callbacks: [handler] });

// OpenAI
import { wrapOpenAI } from '@cairo/agent-tracker/middleware/openai';
const client = wrapOpenAI(new OpenAI(), tracker);

// Vercel AI SDK
import { trackVercelAI } from '@cairo/agent-tracker/middleware/vercel-ai';
const result = await generateText({ model, prompt });
trackVercelAI(tracker, result);
```

## Architecture

```
                         +------------------+
                         |   AI Agents      |
                         | (LangChain,      |
                         |  OpenAI, Claude, |
                         |  custom)         |
                         +--------+---------+
                                  |
                    SDK / MCP / HTTP API
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
          | Warehouses  |  | Observ.    |  | Operational   |
          | BigQuery    |  | Langfuse   |  | Slack         |
          | Snowflake   |  | LangSmith  |  | Kafka         |
          | S3          |  | PostHog    |  | Discord       |
          | Elastic     |  | Mixpanel   |  | Webhooks      |
          +-------------+  +------------+  +---------------+
```

## Event Taxonomy

Cairo uses an `agent.*` event namespace for agent-specific tracking.

| Event | Description | Key Properties |
|-------|-------------|----------------|
| `agent.session.start` | Agent session began | `session_id`, `agent_type`, `model`, `task` |
| `agent.session.end` | Agent session completed | `session_id`, `duration_ms`, `total_tokens`, `total_cost_usd`, `exit_reason` |
| `agent.generation` | LLM call completed | `model`, `prompt_tokens`, `completion_tokens`, `latency_ms`, `cost_usd` |
| `agent.tool_call` | Tool/function invoked | `tool_name`, `input`, `output`, `success`, `latency_ms` |
| `agent.decision` | Agent made a routing/logic decision | `decision_type`, `options`, `chosen`, `confidence` |
| `agent.error` | Error occurred during execution | `error_type`, `error_message`, `recoverable` |
| `agent.retrieval` | RAG or search performed | `source`, `query`, `num_results`, `latency_ms` |
| `agent.handoff` | Agent handed off to another agent | `to_agent_id`, `reason`, `context_size` |
| `agent.feedback` | Feedback on agent output | `score`, `source`, `criteria` |

All events automatically include `agent_id`, `instance_id`, `session_id`, and `timestamp` in their context.

## Agent Identity Model

Cairo tracks agents across sessions and instances with a hierarchical identity model.

| Identity | Scope | Description |
|----------|-------|-------------|
| `agentId` | Persistent | Developer-assigned identifier for an agent type (e.g. `support-agent-v3`) |
| `instanceId` | Per-run | Auto-generated UUID for each AgentTracker instance |
| `sessionId` | Per-task | Auto-generated UUID per `tracker.session()` call |
| `namespace` | Tenant | Multi-tenant namespace for data segregation |

The existing identity resolution service merges these into a canonical identity graph, the same way it handles user identities.

## Server Setup

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14

### Clone and Install

```bash
git clone https://github.com/outcome-driven-studio/cairo.git
cd cairo
npm install
```

### Configure Environment

```bash
cp .env.example .env
```

The essential variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/cairo
PORT=8080
NODE_ENV=development
```

See `.env.example` for the full list of configuration options including destination API keys, AI enrichment, and sync settings.

### Run Migrations

```bash
npm run setup
```

### Start the Server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

The API is available at `http://localhost:8080`. Verify with:

```bash
curl http://localhost:8080/health
```

## API Reference

### Event Ingestion (Segment-compatible)

Cairo exposes a Segment-compatible API, so existing Segment client libraries work as drop-in replacements.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/track` | POST | Track a single event |
| `/v2/batch` | POST | Track multiple events |
| `/v2/identify` | POST | Identify a user or agent |
| `/v2/group` | POST | Associate user with a group |
| `/v2/page` | POST | Track a page view |

### Agent Tracking

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/agent/session/start` | POST | Start a new agent session |
| `/v2/agent/session/end` | POST | End an agent session |
| `/v2/agent/sessions/:agentId` | GET | List sessions for an agent |
| `/v2/agent/metrics/:agentId` | GET | Get aggregated agent metrics (cost, tokens, latency) |
| `/v2/agent/compare` | GET | Compare metrics across agents |

### CDP Pipeline

The full CDP pipeline is available for advanced use cases:

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

Cairo ships with 21 destination connectors across four categories.

| Category | Destinations |
|----------|-------------|
| **Analytics** | Mixpanel, Amplitude, PostHog, GA4 |
| **CRM & Sales** | HubSpot, Salesforce, Pipedrive, Attio |
| **Data Warehouses** | BigQuery, Snowflake, S3, Elasticsearch, Kafka |
| **Messaging & Ops** | Slack, Discord, Braze, CustomerIO, Intercom, SendGrid, Resend, Webhook |

Destinations are plugin-based. Each connector lives in `src/destinations/` and implements a standard interface. Adding a new destination is a single file.

## SDKs and Packages

| Package | Description |
|---------|-------------|
| `@cairo/agent-tracker` | Agent event tracking SDK. TypeScript, <20KB, zero heavy deps. Node 18+, Deno, Bun, Workers. |
| `@cairo/agent-mcp` | MCP server for agent self-reporting. 6 tools for generations, tool calls, decisions, errors, sessions. |
| `@cairo/node-sdk` | General-purpose Node.js SDK with Segment-compatible API. |
| `@cairo/react` | React SDK with hooks and context providers. |
| `@cairo/browser` | Browser SDK with auto page tracking and session management. |

All packages live in the `packages/` directory. Build locally with `npm run build` from each package directory.

## Deployment

### Docker

```bash
docker build -t cairo .
docker run -p 8080:8080 --env-file .env cairo
```

### Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

### Manual

```bash
npm install -g pm2
pm2 start server.js --name cairo
pm2 save && pm2 startup
```

See [docs/DEPLOYMENT_GUIDE.md](./docs/DEPLOYMENT_GUIDE.md) for detailed deployment instructions including GCP and production configuration.

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `server.js` | Express application entry point |
| `src/routes/` | API route handlers |
| `src/services/` | Business logic and pipeline services |
| `src/destinations/` | Destination connector plugins |
| `src/config/` | Server and pipeline configuration |
| `src/migrations/` | Database migration scripts |
| `src/utils/` | Shared utilities (db, logger, env) |
| `packages/agent-tracker/` | Agent tracking SDK |
| `packages/agent-mcp/` | MCP server package |
| `packages/node-sdk/` | Node.js SDK |
| `packages/react-sdk/` | React SDK |
| `packages/browser-sdk/` | Browser SDK |
| `ui/` | React dashboard (Vite) |
| `docs/` | Technical documentation |
| `examples/` | Example integrations |

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run `npm test` and `npm run lint`
5. Commit and push to your fork
6. Open a pull request

Please follow existing code patterns and include tests for new features.

## License

MIT. See [LICENSE](LICENSE) for details.

---

<div align="center">
  <a href="https://github.com/outcome-driven-studio/cairo">github.com/outcome-driven-studio/cairo</a>
</div>
