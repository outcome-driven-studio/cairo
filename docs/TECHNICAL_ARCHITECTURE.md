# Technical Architecture

## Overview

Cairo is a server-side event pipeline that ingests, processes, and routes events. It is designed for tracking AI agent behavior but works for any Segment-compatible event type. Events flow from sources (SDKs, MCP, raw HTTP) through a processing pipeline (identity resolution, tracking plan validation, transformations, GDPR suppression) and fan out to destination connectors.

## System Architecture

```
Sources                      Cairo Server                              Destinations
--------------------------   ----------------------------------------  ---------------------------
                             +--------------------------------------+
  @cairo/agent-tracker --->  |                                      |  --> Slack
  @cairo/agent-mcp    --->  |  Ingestion     Processing    Routing |  --> Mixpanel
  HTTP (curl, any SDK) --->  |  (auth,        (suppress,   (fan-out|  --> BigQuery
                             |   validate)     identity,    per     |  --> Snowflake
                             |                 transform,   dest)   |  --> Kafka
                             |                 track plan)          |  --> HubSpot
                             |                                      |  --> S3 / GCS
                             +-------------- PostgreSQL ------------+  --> 13 more...
```

## Event Pipeline

Every event entering Cairo passes through `processMessage()`. The steps, in order:

1. **Suppression check (GDPR).**
   Query `gdpr_suppression` for the userId/anonymousId. If suppressed, return `202 Accepted` and drop the event silently.

2. **Raw event storage.**
   Write the event to `raw_events` for replay capability. This happens before any transformation so the original payload is preserved.

3. **Identity resolution.**
   Look up or create entries in `identity_graph`. For `identify` calls with both `userId` and `anonymousId`, link them under a shared canonical ID. For `alias` calls, merge canonical IDs (with conflict detection to prevent accidental identity collapse).

4. **Tracking plan validation.**
   If a tracking plan is active for this namespace, validate the event's properties against the JSON Schema. Enforcement modes:
   - `allow`: log violation, forward event
   - `drop`: reject event, log violation
   - `warn`: forward event, record violation in `tracking_plan_violations`

5. **Transformations.**
   Run user-defined JavaScript transformations in execution order. Each runs in a sandboxed VM with a 500ms timeout, 64MB memory limit, and no network or filesystem access. If a transform returns `null`, the event is dropped. If it throws, the original event is forwarded.

6. **Type-specific routing.**
   Route the event based on its `type` field (`track`, `identify`, `page`, `screen`, `group`, `alias`). The agent tracking routes additionally process `agent.*` events for session management and metrics.

7. **Destination delivery.**
   Fan out the event to all enabled destinations for this namespace. Each destination receives the event through its type-specific handler (`track()`, `identify()`, etc.). Failed deliveries retry 3 times with exponential backoff (1s, 4s, 16s). Exhausted retries write to a dead-letter store.

## Agent Event Model

### Event Taxonomy

| Event Name | Description | Key Properties |
|------------|-------------|----------------|
| `agent.generation` | LLM completion | `model`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `latency_ms`, `cost_usd`, `stop_reason` |
| `agent.tool_call` | Tool invocation | `tool_name`, `input`, `output`, `latency_ms`, `success`, `error` |
| `agent.decision` | Routing/branching choice | `decision_type`, `options`, `chosen`, `confidence`, `reasoning` |
| `agent.error` | Error during execution | `error_type`, `error_message`, `recoverable`, `stack` |
| `agent.retrieval` | RAG/retrieval operation | `source`, `query`, `num_results`, `latency_ms` |
| `agent.handoff` | Agent-to-agent handoff | `to_agent_id`, `reason`, `context_size` |
| `agent.feedback` | Quality feedback | `score`, `source`, `criteria`, `comment` |
| `agent.session.start` | Session begins | `session_id`, `agent_type`, `model`, `task` |
| `agent.session.end` | Session ends with summary | `session_id`, `duration_ms`, `total_tokens`, `total_cost_usd`, `generation_count`, `tool_call_count`, `error_count`, `exit_reason` |

### Identity Model

| Level | Field | Scope | Description |
|-------|-------|-------|-------------|
| Agent | `agentId` | Persistent | Identifies the agent across all runs |
| Instance | `instanceId` | Per process | UUID generated on `AgentTracker.init()` |
| Session | `sessionId` | Per task | UUID generated on `tracker.session()` |
| Team | `groupId` | Organization | Optional, via `group` calls |

## Destination Architecture

Destinations follow a plugin pattern. Every destination extends a base interface:

```javascript
class BaseDestination {
  constructor(config) { }
  async initialize() { }
  async test() { }                  // returns { success, message }
  async validateConfig() { }
  async track(event) { }
  async identify(event) { }
  async page(event) { }
  async screen(event) { }
  async group(event) { }
  async alias(event) { }
  async batch(events) { }          // optional batch support
  get supportsBatch() { }
  get batchSize() { }
}
```

The destination registry maps type strings to destination classes:

```javascript
const registry = {
  slack, mixpanel, discord, resend, webhook, bigquery, hubspot,
  salesforce, ga4, amplitude, posthog, braze, customerio, sendgrid,
  kafka, elasticsearch, snowflake, s3, intercom, pipedrive
};
```

**Adding a new destination:** Create a module that extends the base interface, register it in `src/destinations/registry.js`. No changes to the pipeline are needed.

**Warehouse destinations** (BigQuery, Snowflake, S3) differ from API destinations. They buffer events in memory, trigger on size or time thresholds, perform schema evolution (additive only), and write batches. Table naming follows `{namespace}_{event_type}`.

## Data Model

Key database tables:

| Table | Purpose |
|-------|---------|
| `event_source` | Primary event storage |
| `raw_events` | Immutable event backup for replay |
| `identity_graph` | Maps identity types/values to canonical IDs |
| `agent_sessions` | Agent session lifecycle and accumulated metrics |
| `destination_configs_v2` | Per-namespace destination configurations |
| `tracking_plans` | JSON Schema validation rules per event name |
| `tracking_plan_violations` | Recorded schema violations |
| `transformations` | User-defined JavaScript transforms |
| `gdpr_suppression` | User suppression list |
| `deletion_audit_log` | Audit trail for GDPR actions |

## SDKs

### @cairo/agent-tracker

TypeScript SDK. Uses native `fetch` (no HTTP library dependency). Queue-based batching with configurable `flushAt` and `flushInterval`. Session objects auto-accumulate token counts, costs, tool calls, and errors. Sampling, input redaction, and property truncation are built in.

Framework middleware:
- **LangChain**: `CairoCallbackHandler` hooks into LangChain's callback system
- **OpenAI**: `wrapOpenAI` patches `chat.completions.create`
- **Vercel AI SDK**: `trackVercelAI` and `createTrackedGenerateText`

### @cairo/agent-mcp

MCP server for Claude, GPT, and other MCP-capable agents. Runs over stdio transport. Contains a self-contained event poster (does not depend on `@cairo/agent-tracker`). Exposes 6 MCP tools: `track_generation`, `track_tool_call`, `track_decision`, `track_error`, `start_session`, `end_session`.

Configuration via environment variables: `CAIRO_WRITE_KEY`, `CAIRO_HOST`, `CAIRO_AGENT_ID`, `CAIRO_DEBUG`.

## Deployment Architecture

### Single Node

Cairo runs as a single Node.js (Express) process backed by PostgreSQL. This is the default deployment and handles moderate event volumes without additional infrastructure.

```
  Client SDKs / MCP
        |
        v
  Cairo Server (Express, port 8080)
        |
        v
  PostgreSQL
```

- **Stateless server.** No in-process state aside from destination connection pools. Horizontally scalable behind a load balancer.
- **Database.** PostgreSQL with JSONB columns for flexible event payloads. All queries use parameterized statements.
- **Resource requirements.** Single instance handles thousands of events per second. Add instances behind a load balancer for higher throughput.

### Scaling

For higher volumes, place a Redis (BullMQ) queue between ingestion and processing:

```
  Load Balancer
        |
  +-----+-----+
  |     |     |
  N ingestion nodes --> Redis queue --> N worker nodes --> PostgreSQL
```

Ingestion nodes accept and validate events, push to the queue. Worker nodes pull events, run the pipeline, and deliver to destinations. PostgreSQL can use read replicas for the agent metrics/session query endpoints.
