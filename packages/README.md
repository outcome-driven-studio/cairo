# Cairo packages

| Package | Purpose |
|---------|---------|
| `@ani-hq/tracker` | Universal Segment-style tracker for apps |
| `@ani-hq/agent-tracker` | Agent session / generation / tool-call SDK |
| `@ani-hq/agent-mcp` | stdio MCP server for agent self-reporting |

All packages post to `${host}/v2/batch` (also available as `/api/v2/batch`).

**Not yet published to npm.** See [docs/PUBLISHING.md](../docs/PUBLISHING.md).

Build locally:

```bash
npm install
npm run build
```

Install from path:

```bash
npm install /path/to/cairo/packages/tracker
```

For the server's full MCP tool surface (events, notifications, GDPR, write keys), connect to `POST /mcp` on a running Cairo instance — that is separate from `@ani-hq/agent-mcp`.
