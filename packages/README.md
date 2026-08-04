# Cairo packages

| Package | Purpose |
|---------|---------|
| `@ani-hq/tracker` | Universal Segment-style tracker for apps |
| `@ani-hq/agent-tracker` | Agent session / generation / tool-call SDK |
| `@ani-hq/agent-mcp` | stdio MCP for agent **self-telemetry** only |
| `@ani-hq/cairo-mcp` | stdio MCP proxy to the **full** Cairo `/mcp` surface (setup, rules, drain) |
| `@ani-hq/cairo-relay` | Thin webhook relay: Cairo push → batched Discord → ack (no LLM) |

Published on npm (`publishConfig.access: public`). See [docs/PUBLISHING.md](../docs/PUBLISHING.md).

```bash
npm install
npm run build
```

Turnkey agent path: [docs/AGENT_ONBOARDING.md](../docs/AGENT_ONBOARDING.md).
