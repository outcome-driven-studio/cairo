# @cairo/agent-mcp

stdio [MCP](https://modelcontextprotocol.io) server for agent self-reporting into [Cairo](https://github.com/outcome-driven-studio/cairo).

```bash
npx -y @cairo/agent-mcp
```

Cursor / Claude Code config:

```json
{
  "mcpServers": {
    "cairo-agent": {
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

This package is for **agent self-telemetry**. The full Cairo tool surface (events, notification handoff, GDPR, etc.) is on the server at `POST /mcp`.
