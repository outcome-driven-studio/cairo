# @ani-hq/cairo-mcp

stdio MCP server that proxies Cairo’s full HTTP `POST /mcp` surface (events, write keys, notification rules, pending drain, GDPR, etc.).

Use this for **agent onboarding and notification relay**. For agent self-telemetry only, see `@ani-hq/agent-mcp`.

## Install / run

```bash
npx -y @ani-hq/cairo-mcp
```

## Env

| Var | Required | Description |
|---|---|---|
| `CAIRO_HOST` | yes | Cairo base URL |
| `CAIRO_WRITE_KEY` | yes | Write key |
| `CAIRO_AGENT_ID` | no | Default `agent_id` for setup / drain tools |

## Cursor / Claude Code / OpenClaw

```json
{
  "mcpServers": {
    "cairo": {
      "command": "npx",
      "args": ["-y", "@ani-hq/cairo-mcp"],
      "env": {
        "CAIRO_HOST": "https://your-cairo-instance.com",
        "CAIRO_WRITE_KEY": "ck_...",
        "CAIRO_AGENT_ID": "my-agent"
      }
    }
  }
}
```

Then tell your agent:

> Set up tracking for Product X. Notify me on signup, checkout, and errors.

It should call `setup_product`, then later `drain_notifications` and relay via its own gateway.
