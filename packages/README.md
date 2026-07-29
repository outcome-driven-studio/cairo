# Cairo packages

| Package | Purpose |
|---------|---------|
| `@cairo/tracker` | Universal Segment-style tracker for apps |
| `@cairo/agent-tracker` | Agent session / generation / tool-call SDK |
| `@cairo/agent-mcp` | stdio MCP server for agent self-reporting |

All packages post to `${host}/v2/batch` (also available as `/api/v2/batch`).

**Not yet published to npm.** Build locally:

```bash
npm install
npm run build
```

Until published, point MCP configs at the local package:

```json
{
  "mcpServers": {
    "cairo-agent": {
      "command": "node",
      "args": ["./packages/agent-mcp/dist/index.js"],
      "env": {
        "CAIRO_HOST": "http://localhost:8080",
        "CAIRO_WRITE_KEY": "your-key",
        "CAIRO_AGENT_ID": "my-agent"
      }
    }
  }
}
```

For the server's full MCP tool surface (events, notifications, GDPR, etc.), connect to `POST /mcp` on a running Cairo instance — that is separate from `@cairo/agent-mcp`.
