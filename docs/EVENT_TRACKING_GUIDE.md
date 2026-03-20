# SDK Integration Guide

## Overview

`@cairo/agent-tracker` is a TypeScript SDK for tracking AI agent behavior. It collects structured events (LLM generations, tool calls, decisions, errors, handoffs) and sends them to a Cairo server, which processes them through an event pipeline and routes them to configured destinations.

The SDK uses native `fetch`, queue-based batching, and automatic session accumulation. It has zero runtime dependencies beyond `uuid`.

## Installation

```bash
npm install @cairo/agent-tracker
```

## Configuration

```typescript
import { AgentTracker } from '@cairo/agent-tracker';

const tracker = AgentTracker.init({
  writeKey: 'your-write-key',
  host: 'https://your-cairo-instance.com',
  agentId: 'my-agent',
});
```

Full configuration reference:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `writeKey` | `string` | (required) | Authentication key for the Cairo server |
| `host` | `string` | `http://localhost:8080` | Cairo server URL |
| `agentId` | `string` | (required) | Persistent identifier for this agent |
| `flushAt` | `number` | `50` | Flush the queue when it reaches this size |
| `flushInterval` | `number` | `5000` | Flush the queue on this interval (ms) |
| `maxRetries` | `number` | `3` | Max retry attempts for failed requests |
| `timeout` | `number` | `10000` | HTTP request timeout (ms) |
| `sampleRate` | `number` | `1.0` | Fraction of events to send (0.0-1.0). Session events and errors always send. |
| `redactInputs` | `boolean` | `false` | Hash tool inputs/outputs and redact retrieval queries |
| `maxPropertySize` | `number` | `4096` | Truncate property values exceeding this length (bytes) |
| `debug` | `boolean` | `false` | Log internal operations to console |
| `enable` | `boolean` | `true` | Master switch. Set to `false` to disable all tracking. |

## Core Concepts

### Events

All events are sent as `track` calls with structured event names. The SDK provides typed methods for each event type, and internally serializes them as Segment-compatible `track` messages sent to `POST /v2/batch`.

Event names follow the `agent.*` namespace:

- `agent.generation`
- `agent.tool_call`
- `agent.decision`
- `agent.error`
- `agent.retrieval`
- `agent.handoff`
- `agent.feedback`
- `agent.session.start`
- `agent.session.end`

### Sessions

A session groups related events for a single agent task. When you call `tracker.session()`, the SDK:

1. Generates a `sessionId` and attaches it to all subsequent events.
2. Accumulates totals (tokens, cost, tool calls, errors) from `generation()`, `toolCall()`, and `error()` calls.
3. On `session.end()`, emits an `agent.session.end` event with the accumulated summary.

### Identity

Cairo uses a three-level identity model:

- **agentId** -- persistent identifier for the agent (set in config, sent as `userId`)
- **instanceId** -- auto-generated UUID per `AgentTracker.init()` call (per process/run)
- **sessionId** -- auto-generated UUID per `tracker.session()` call (per task)

These are attached to every event in the `context` object.

## Event Reference

### generation()

Track an LLM generation (completion, chat, embedding).

```typescript
tracker.generation({
  model: 'claude-sonnet-4-20250514',   // required
  promptTokens: 1200,
  completionTokens: 350,
  totalTokens: 1550,            // auto-calculated if omitted
  latencyMs: 1830,
  costUsd: 0.0042,
  stopReason: 'end_turn',
  temperature: 0.7,
  maxTokens: 4096,
});
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `model` | `string` | yes | Model identifier |
| `promptTokens` | `number` | no | Input token count |
| `completionTokens` | `number` | no | Output token count |
| `totalTokens` | `number` | no | Total tokens (auto-calculated from prompt + completion if omitted) |
| `latencyMs` | `number` | no | Response latency in ms |
| `costUsd` | `number` | no | Cost in USD |
| `stopReason` | `string` | no | Why generation stopped (e.g., `end_turn`, `max_tokens`) |
| `temperature` | `number` | no | Sampling temperature |
| `maxTokens` | `number` | no | Max tokens setting |

### toolCall()

Track a tool invocation.

```typescript
tracker.toolCall({
  tool: 'web_search',           // required
  input: { query: 'revenue' },
  output: { results: 5 },
  latencyMs: 420,
  success: true,                // required
  error: undefined,
});
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tool` | `string` | yes | Tool name |
| `input` | `object` | no | Tool input (redacted if `redactInputs` is true) |
| `output` | `object` | no | Tool output (redacted if `redactInputs` is true) |
| `latencyMs` | `number` | no | Execution time in ms |
| `success` | `boolean` | yes | Whether the call succeeded |
| `error` | `string` | no | Error message if failed |

### decision()

Track a routing or branching decision.

```typescript
tracker.decision({
  type: 'routing',              // required
  options: ['search', 'calc', 'respond'],  // required
  chosen: 'search',            // required
  confidence: 0.92,
  reasoning: 'Query requires external data',
});
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `string` | yes | Decision category (e.g., `routing`, `classification`) |
| `options` | `string[]` | yes | Available choices |
| `chosen` | `string` | yes | The selected option |
| `confidence` | `number` | no | Confidence score (0-1) |
| `reasoning` | `string` | no | Explanation for the choice |

### error()

Track an error. Errors always bypass sampling.

```typescript
tracker.error({
  type: 'tool_timeout',         // required
  message: 'web_search timed out',  // required
  recoverable: true,
  stack: '...',
});
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `string` | yes | Error category |
| `message` | `string` | yes | Error message |
| `recoverable` | `boolean` | no | Whether the agent can recover |
| `stack` | `string` | no | Stack trace |

### retrieval()

Track a retrieval/RAG operation.

```typescript
tracker.retrieval({
  source: 'pinecone',          // required
  query: 'billing policy',    // required (redacted if redactInputs is true)
  numResults: 5,
  latencyMs: 120,
});
```

### handoff()

Track a handoff to another agent.

```typescript
tracker.handoff({
  toAgentId: 'escalation-agent',  // required
  reason: 'Complex billing dispute',  // required
  contextSize: 4200,
});
```

### feedback()

Track feedback on agent performance.

```typescript
tracker.feedback({
  score: 0.85,                 // required
  source: 'human_review',     // required
  criteria: 'accuracy',
  comment: 'Correct answer but slow',
});
```

### session() / session.end()

Start and end a session. See the Sessions section above.

```typescript
const session = tracker.session({
  task: 'Resolve billing inquiry',
  agentType: 'customer-support',
  model: 'claude-sonnet-4-20250514',
  config: { maxTurns: 10 },
});

// ... do work, track events ...

session.end({ exitReason: 'task_complete' });
```

The `session.end()` call emits an `agent.session.end` event with:

| Property | Description |
|----------|-------------|
| `session_id` | UUID of the session |
| `duration_ms` | Wall-clock duration |
| `total_tokens` | Sum of all generation tokens |
| `total_cost_usd` | Sum of all generation costs |
| `generation_count` | Number of generation events |
| `tool_call_count` | Number of tool call events |
| `error_count` | Number of error events |
| `exit_reason` | Why the session ended |

## Framework Integrations

### LangChain

`CairoCallbackHandler` implements the LangChain callback interface. It automatically tracks generations, tool calls, and errors from any chain or agent.

```typescript
import { CairoCallbackHandler } from '@cairo/agent-tracker/middleware/langchain';

const handler = new CairoCallbackHandler(tracker);

// Use with any LangChain chain or agent
const chain = new LLMChain({
  llm: new ChatOpenAI({ modelName: 'gpt-4o' }),
  prompt,
  callbacks: [handler],
});

const result = await chain.call({ input: 'What is our refund policy?' });
```

Tracked automatically: `handleLLMStart/End` (generations with token counts and latency), `handleToolStart/End/Error` (tool calls), `handleLLMError`, `handleChainError`.

### OpenAI

`wrapOpenAI` monkey-patches `chat.completions.create` to track every call.

```typescript
import OpenAI from 'openai';
import { wrapOpenAI } from '@cairo/agent-tracker/middleware/openai';

const openai = wrapOpenAI(new OpenAI(), tracker);

// This call is now tracked automatically
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

Tracks: model, token counts (`prompt_tokens`, `completion_tokens`, `total_tokens`), latency, `finish_reason`. Errors are tracked as both `agent.error` and `agent.generation` events.

### Vercel AI SDK

Two options: manual tracking with `trackVercelAI`, or auto-tracking with `createTrackedGenerateText`.

```typescript
import { generateText } from 'ai';
import { trackVercelAI, createTrackedGenerateText } from '@cairo/agent-tracker/middleware/vercel-ai';

// Option 1: Manual
const result = await generateText({ model, prompt });
trackVercelAI(tracker, result, { latencyMs: 1200 });

// Option 2: Auto-wrapped
const trackedGenerate = createTrackedGenerateText(tracker, generateText);
const result = await trackedGenerate({ model, prompt });
```

Both options track: model, token usage, finish reason, and any tool calls in the response.

## Advanced

### Sampling

Set `sampleRate` to a value between 0 and 1 to send only a fraction of events. Session lifecycle events (`agent.session.start`, `agent.session.end`) and error events always send regardless of sample rate.

```typescript
const tracker = AgentTracker.init({
  writeKey: 'key',
  agentId: 'my-agent',
  sampleRate: 0.1,  // send 10% of events
});
```

### Input Redaction

When `redactInputs` is true, tool call inputs and outputs are replaced with a deterministic hash (`[redacted:a3f2b1]`), and retrieval queries are replaced with `[redacted]`.

### Property Truncation

Properties exceeding `maxPropertySize` bytes are truncated with a `...[truncated]` suffix.

### Batching and Flushing

Events are queued in memory and flushed when:
- The queue reaches `flushAt` items (default: 50), or
- The `flushInterval` timer fires (default: every 5 seconds)

Flushing sends a single `POST /v2/batch` request with all queued events.

### Graceful Shutdown

Call `tracker.shutdown()` before process exit. This ends any active session, flushes the queue, and stops the flush timer.

```typescript
process.on('SIGTERM', async () => {
  await tracker.shutdown();
  process.exit(0);
});
```

## Server-Side Endpoints

The SDK sends events to these Cairo server endpoints:

### Event Ingestion

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/batch` | POST | Primary batch endpoint (used by the SDK) |
| `/v2/track` | POST | Single event |
| `/v2/identify` | POST | User/agent identification |
| `/v2/page` | POST | Page view |
| `/v2/screen` | POST | Screen view |
| `/v2/group` | POST | Group membership |
| `/v2/alias` | POST | Identity alias |

### Agent-Specific

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/agent/session/start` | POST | Start agent session |
| `/v2/agent/session/end` | POST | End agent session with summary |
| `/v2/agent/sessions/:agentId` | GET | List sessions for an agent |
| `/v2/agent/metrics/:agentId` | GET | Aggregated metrics for an agent |
| `/v2/agent/compare` | GET | Compare metrics across agents |

## Migrating from Segment

Cairo's event API is Segment-compatible. To migrate:

1. Replace your Segment write key with a Cairo write key.
2. Point the host URL to your Cairo instance.
3. Event payloads (`track`, `identify`, `page`, etc.) use the same schema.

```typescript
// Before (Segment analytics-node)
const analytics = new Analytics({ writeKey: 'seg_xxx' });
analytics.track({ userId: 'user_1', event: 'Order Completed', properties: { total: 99 } });

// After (Cairo - same payload format)
// Just change the write key and host. The API accepts the same request body.
```

Cairo supports 20 destination connectors out of the box, so you can replace Segment's destination catalog with Cairo's for common targets like Mixpanel, BigQuery, Snowflake, Slack, HubSpot, and others.
