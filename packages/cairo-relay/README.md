# @ani-hq/cairo-relay

Thin, **non-LLM** relay for Cairo’s agent webhook push:

**Cairo → batch → your gateway → ack**

Cairo never talks to Discord, Slack, Telegram, etc. This optional package is one way to turn the push into a message on *your* channel. Point it at a generic HTTP webhook, Slack incoming webhook, Discord, or stdout.

At high volume it coalesces notifications (max N **or** T ms) so chat stays readable and no model tokens are spent on the hot path.

## Destinations

| Mode | Env | Notes |
|------|-----|--------|
| Generic / Slack webhook | `FORWARD_URL` (or `WEBHOOK_URL`) | JSON POST. Set `WEBHOOK_STYLE=slack` for `{ "text": "..." }` only |
| Discord | `DISCORD_WEBHOOK_URL` **or** `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` | Optional adapter |
| Stdout | `DESTINATION=stdout` | Local / debug |

Or set `DESTINATION=webhook|discord|stdout` explicitly.

## Run

```bash
# Example: forward to any HTTPS endpoint (Slack, custom worker, …)
FORWARD_URL=https://hooks.example.com/incoming \
CAIRO_HOST=https://your-cairo-instance.com \
CAIRO_WRITE_KEY=ck_... \
HOOK_SECRET=optional-shared-secret \
BATCH_MAX=10 \
BATCH_MS=30000 \
PORT=8790 \
npx -y @ani-hq/cairo-relay
```

From this repo:

```bash
cd packages/cairo-relay && npm start
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness (+ resolved destination) |
| `POST` | `/hooks/:agentId` | Cairo notification webhook target |

Optional header: `X-Hook-Secret` (required when `HOOK_SECRET` is set). Match Cairo’s `CAIRO_WEBHOOK_SECRET` if you enable it.

## Register with Cairo

```bash
curl -X POST "$CAIRO_HOST/mcp" \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: $CAIRO_WRITE_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
    "name":"register_agent_webhook",
    "arguments":{
      "agent_id":"my-agent",
      "url":"https://relay.example.com/hooks/my-agent",
      "namespace":"default"
    }
  }}'
```

One `namespace=default` webhook covers all product namespaces (Cairo falls back to default).

## Agent role

Your conversational agent still owns **setup** (`setup_product`, `register_agent_webhook`) and optional digests (“how many today?”). It should **not** poll on a heartbeat for every signup — this relay owns the hot path.

## Deploy

See [deploy/cairo-relay.service.example](./deploy/cairo-relay.service.example) for a sample systemd unit. Expose `/hooks/:agentId` over HTTPS so your Cairo host can reach it.
