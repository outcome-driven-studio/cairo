# Agent onboarding (turnkey)

Cairo is agent-first: **you talk to your agent**, the agent talks to Cairo, and alerts reach you through **your** gateway (Discord, Slack, Telegram, WhatsApp, email worker, etc.). Cairo never opens those gateways itself.

## Proactive path (recommended)

When you say “let me know when someone signs up”:

1. Agent calls **`setup_product`** (write key + notification rules).
2. Agent ensures a relay webhook is registered once via **`register_agent_webhook`** (usually `namespace: "default"` so one URL covers all products).
3. Product emits events → Cairo enqueues + **HTTP pushes** to your relay → relay batches → your gateway → **`ack_notification`**.

After setup, alerts arrive **without** you asking the agent. The agent is for setup and digests (“how many today?”), not the hot path. Do **not** use heartbeat/polling for every signup.

Reference relay (optional): [`packages/cairo-relay`](../packages/cairo-relay/README.md) — forwards to a generic HTTPS webhook, Slack, Discord, or stdout. You can also implement the same contract in any language.

## 1. Connect your agent (once)

On the Cairo host:

```bash
POSTGRES_URL=... node bin/cairo.js agent-config \
  --host https://your-cairo-instance.com \
  --agent-id my-agent
```

Paste the printed MCP JSON into Cursor, Claude Code, OpenClaw, Hermes, or any MCP client.

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

Then register the relay (once per agent):

```text
register_agent_webhook {
  agent_id: "my-agent",
  url: "https://relay.example.com/hooks/my-agent",
  namespace: "default"
}
```

Tell the user: you’ll ping their preferred channel when those events fire (via the relay / their gateway).

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

## 4. Backup: pull / “any alerts?”

If the webhook is down, or the user asks “any alerts?”, the agent can still:

1. **`drain_notifications`** `{ agent_id }` (optional `namespace`)
2. Post each `message` via the agent’s gateway
3. **`ack_notification`** `{ id }` for each delivered row

Pull is the backup path; webhook + relay is the proactive default.

## Ritual cheat sheet

| Step | Tool / service |
|---|---|
| Onboard product | `setup_product` |
| Proactive delivery | `register_agent_webhook` → **your relay** → your gateway |
| Pull / digests | `drain_notifications` |
| Confirm delivery | `ack_notification` (relay or agent) |
| Add more rules later | `create_notification_rule` |
| New ops key | `create_write_key` or `cairo agent-config` |
