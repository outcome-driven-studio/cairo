# Quick Start

Track AI agent behavior in 5 minutes. Events flow through Cairo's pipeline and get routed to any configured destination (warehouses, analytics, Slack, Kafka, etc).

## Install

```bash
npm install @cairo/agent-tracker
```

## Initialize

```typescript
import { AgentTracker } from '@cairo/agent-tracker';

const tracker = AgentTracker.init({
  writeKey: 'your-write-key',
  host: 'https://your-cairo-instance.com',
  agentId: 'my-agent',
});
```

## Track Events

```typescript
// LLM generation
tracker.generation({
  model: 'claude-sonnet-4-20250514',
  promptTokens: 1200,
  completionTokens: 350,
  latencyMs: 1830,
  costUsd: 0.0042,
  stopReason: 'end_turn',
});

// Tool call
tracker.toolCall({
  tool: 'web_search',
  input: { query: 'latest earnings report' },
  output: { results: 5 },
  latencyMs: 420,
  success: true,
});

// Decision
tracker.decision({
  type: 'routing',
  options: ['search', 'calculate', 'respond'],
  chosen: 'search',
  confidence: 0.92,
  reasoning: 'User query requires external data',
});

// Error
tracker.error({
  type: 'tool_timeout',
  message: 'web_search exceeded 5000ms timeout',
  recoverable: true,
});
```

## Sessions

Sessions group events and auto-accumulate tokens, cost, tool calls, and errors.

```typescript
const session = tracker.session({
  task: 'Answer customer question about billing',
  agentType: 'customer-support',
  model: 'claude-sonnet-4-20250514',
});

// ... track events as usual, they accumulate into the session ...

session.end({ exitReason: 'task_complete' });
```

On `session.end()`, Cairo emits a summary event with `total_tokens`, `total_cost_usd`, `generation_count`, `tool_call_count`, `error_count`, and `duration_ms`.

## MCP (for Claude, GPT, and other MCP-capable agents)

Add the Cairo MCP server so agents can self-report events over stdio.

```json
{
  "mcpServers": {
    "cairo": {
      "command": "npx",
      "args": ["-y", "@cairo/agent-mcp"],
      "env": {
        "CAIRO_WRITE_KEY": "your-write-key",
        "CAIRO_HOST": "https://your-cairo-instance.com",
        "CAIRO_AGENT_ID": "my-mcp-agent"
      }
    }
  }
}
```

The MCP server exposes tools: `track_generation`, `track_tool_call`, `track_decision`, `track_error`, `start_session`, `end_session`.

## Framework Middleware

### LangChain

```typescript
import { CairoCallbackHandler } from '@cairo/agent-tracker/middleware/langchain';

const handler = new CairoCallbackHandler(tracker);
const chain = new LLMChain({ llm, prompt, callbacks: [handler] });
```

### OpenAI

```typescript
import { wrapOpenAI } from '@cairo/agent-tracker/middleware/openai';
import OpenAI from 'openai';

const openai = wrapOpenAI(new OpenAI(), tracker);
// All chat.completions.create calls are now tracked automatically
```

### Vercel AI SDK

```typescript
import { createTrackedGenerateText } from '@cairo/agent-tracker/middleware/vercel-ai';
import { generateText } from 'ai';

const trackedGenerate = createTrackedGenerateText(tracker, generateText);
const result = await trackedGenerate({ model, prompt });
```

## Server Setup (self-hosting)

```bash
git clone https://github.com/outcome-driven-studio/cairo.git
cd cairo
npm install
npm run setup    # creates database tables
npm start        # starts on port 8080
```

Set `DATABASE_URL` to your PostgreSQL connection string. See the [Deployment Guide](./DEPLOYMENT_GUIDE.md) for production configuration.

## Graceful Shutdown

Always flush pending events before your process exits:

```typescript
process.on('SIGTERM', async () => {
  await tracker.shutdown();
  process.exit(0);
});
```

## What's Next

- [SDK Integration Guide](./EVENT_TRACKING_GUIDE.md) -- full configuration reference, all event types, advanced features
- [API Reference](./API_DOCUMENTATION.md) -- HTTP endpoints, agent session/metrics APIs, CDP pipeline
