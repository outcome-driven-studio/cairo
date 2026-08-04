# @ani-hq/cairo-relay

Thin, non-LLM relay: **Cairo webhook push → batch → Discord → ack**.

At high volume it coalesces notifications (max N or T ms) so Discord stays readable and no model tokens are spent on the hot path.

## Run

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
# or: DISCORD_BOT_TOKEN=... DISCORD_CHANNEL_ID=...
CAIRO_HOST=https://your-cairo-instance.com \
CAIRO_WRITE_KEY=ck_... \
HOOK_SECRET=optional-shared-secret \
BATCH_MAX=10 \
BATCH_MS=30000 \
PORT=8790 \
node src/index.js
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness |
| `POST` | `/hooks/:agentId` | Cairo notification webhook target |

Optional header: `X-Hook-Secret` (required when `HOOK_SECRET` is set). Set the same value as Cairo’s `CAIRO_WEBHOOK_SECRET` so pushes authenticate.

## Register with Cairo

```bash
curl -X POST "$CAIRO_HOST/mcp" \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: $CAIRO_WRITE_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
    "name":"register_agent_webhook",
    "arguments":{"agent_id":"dash","url":"https://your-host:8787/hooks/dash","namespace":"default"}
  }}'
```

One `namespace=default` webhook covers all product namespaces (Cairo falls back to default).

## Agent role

Your conversational agent (e.g. Dash) still runs **setup** (`setup_product`, `register_agent_webhook`) and optional digests. It should **not** poll on a heartbeat for every signup — this relay owns the hot path.
