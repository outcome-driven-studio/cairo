# @ani-hq/agent-mcp

stdio [MCP](https://modelcontextprotocol.io) server for agent self-reporting into [Cairo](https://github.com/Ani-HQ/cairo).

```bash
npx -y @ani-hq/agent-mcp
```

Cursor / Claude Code config:

```json
{
  "mcpServers": {
    "cairo-agent": {
      "command": "npx",
      "args": ["-y", "@ani-hq/agent-mcp"],
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
