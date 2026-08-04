# Agent onboarding (turnkey)

Cairo is agent-first: **you talk to your agent**, the agent talks to Cairo, and the agent relays alerts through its own gateway (Discord, Slack, Telegram, etc.). Cairo never opens those gateways.

## 1. Connect your agent (once)

On the Cairo host:

```bash
POSTGRES_URL=... node bin/cairo.js agent-config \
  --host https://your-cairo-instance.com \
  --agent-id my-agent
```

Paste the printed MCP JSON into Cursor, Claude Code, OpenClaw, or Hermes.

Or manually:

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

`@ani-hq/cairo-mcp` is the **full** MCP surface (setup, rules, pending drain).  
`@ani-hq/agent-mcp` is only for agent self-telemetry.

## 2. Ask the agent to set up a product

Say something like:

> Set up tracking for Product X. Notify me on signup, checkout_completed, and when errors are captured.

The agent should call **`setup_product`** once with:

- `product_name`
- `agent_id` (itself)
- `events`: the event names you care about

It gets back a **product write key** (shown once) plus install snippets. Give the product that key and host.

## 3. Product emits events

```bash
npm install @ani-hq/tracker
```

```ts
import { Cairo } from '@ani-hq/tracker';
const cairo = Cairo.init({ writeKey: 'ck_product...', host: 'https://your-cairo-instance.com' });
cairo.track({ event: 'signup', userId: 'u1', properties: { plan: 'free' } });
```

Or HTTP: `POST /v2/track` with `X-Write-Key`.

## 4. Agent relays notifications

On a schedule or when asked:

1. **`drain_notifications`** `{ agent_id }` (optional `namespace`)
2. Post each `message` via the agent’s gateway
3. **`ack_notification`** `{ id }` for each delivered row

Optional: **`register_agent_webhook`** for push instead of pull.

## Ritual cheat sheet

| Step | Tool |
|---|---|
| Onboard product | `setup_product` |
| Pull alerts | `drain_notifications` |
| Confirm delivery | `ack_notification` |
| Add more rules later | `create_notification_rule` |
| New ops key | `create_write_key` or `cairo agent-config` |
