# @cairo/agent-tracker

Track AI agent sessions, LLM generations, tool calls, decisions, and errors into [Cairo](https://github.com/outcome-driven-studio/cairo).

```bash
npm install @cairo/agent-tracker
```

```ts
import { AgentTracker } from '@cairo/agent-tracker';

const tracker = AgentTracker.init({
  writeKey: process.env.CAIRO_WRITE_KEY!,
  host: 'https://your-cairo-instance.com',
  agentId: 'my-agent',
});

const session = tracker.startSession({ task: 'answer question' });
tracker.trackGeneration({ model: 'gpt-4o', inputTokens: 10, outputTokens: 20 });
await tracker.endSession();
```

Posts to `${host}/v2/batch`.
