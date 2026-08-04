# Cairo

**Agent-first event tracking.** Products and agents emit events; Cairo stores them and hands matching notifications to your agents. Agents relay through **their own** gateways (Slack, Discord, Telegram, WhatsApp, email, …).

Cairo does **not** connect to messaging platforms.

```text
your product ──track──▶ Cairo ──rule match──▶ pending queue
                                              │
                         webhook push ────────┤
                                              ▼
                                    thin relay (optional)
                                              │
                                              ▼
                                 your Slack / Discord / …
```

> Self-host from git. npm clients: `@ani-hq/tracker`, `@ani-hq/agent-tracker`, `@ani-hq/cairo-mcp`, `@ani-hq/agent-mcp`, `@ani-hq/cairo-relay`.

## Why Cairo

- **MCP-first.** Point any agent at Cairo; say “set this up for my product and ping me on signup.”
- **Product events still work.** SDKs and `POST /v2/track` for apps.
- **Agent handoff, not CDP fan-out.** Rules target an `agent_id`. Prefer webhook push to a thin relay; pull (`drain_notifications`) is the backup.
- **Gateway-agnostic.** Cairo POSTs JSON to *your* URL. Use `@ani-hq/cairo-relay`, or any worker you already run.
- **Self-hosted.** Node.js + PostgreSQL. MIT licensed.

## Quick start

```bash
git clone https://github.com/outcome-driven-studio/cairo.git
cd cairo
cp .env.example .env.local   # set POSTGRES_URL
npm install && npm run migrate && npm start

# mint an ops write key + print MCP JSON
node bin/cairo.js agent-config --host https://your-cairo-instance.com --agent-id my-agent
```

Paste the JSON into Cursor, Claude Code, OpenClaw, Hermes, or any MCP client (`@ani-hq/cairo-mcp`).

Then tell your agent:

> Set up tracking for Product X. Notify me on signup, checkout_completed, and errors.

The agent calls **`setup_product`**, registers **`register_agent_webhook`** once at your relay, and returns a product write key + install snippets. Alerts reach your channel via the relay **without** asking the agent each time. Use **`drain_notifications`** for digests or when the webhook is down.

Full ritual: [docs/AGENT_ONBOARDING.md](./docs/AGENT_ONBOARDING.md) · skill: [skills/cairo-onboarding/SKILL.md](./skills/cairo-onboarding/SKILL.md)

Production tip: set `NODE_ENV=production` (or `CAIRO_REQUIRE_WRITE_KEYS=true`) so bootstrap mode is disabled.

### Packages

| Package | Use |
|---------|-----|
| `@ani-hq/cairo-mcp` | **Full MCP surface** — setup, rules, drain, GDPR, events |
| `@ani-hq/agent-mcp` | Agent self-telemetry only (generations, tool calls) |
| `@ani-hq/tracker` | App / product event SDK |
| `@ani-hq/agent-tracker` | Agent session / generation SDK |
| `@ani-hq/cairo-relay` | Optional thin relay: push → batch → your webhook/Slack/Discord → ack |

```json
{
  "mcpServers": {
    "cairo": {
      "command": "npx",
      "args": ["-y", "@ani-hq/cairo-mcp"],
      "env": {
        "CAIRO_HOST": "https://your-cairo-instance.com",
        "CAIRO_WRITE_KEY": "YOUR_OPS_KEY",
        "CAIRO_AGENT_ID": "my-agent"
      }
    }
  }
}
```

### Product SDK

```bash
npm install @ani-hq/tracker
```

```typescript
import { Cairo } from '@ani-hq/tracker';

const cairo = Cairo.init({
  writeKey: 'YOUR_PRODUCT_KEY',
  host: 'https://your-cairo-instance.com',
});

cairo.track({
  event: 'signup',
  userId: 'user_123',
  properties: { plan: 'free', source: 'landing_page' },
});

await cairo.shutdown();
```

## Notification handoff

```text
product/agent  →  track event  →  Cairo stores event
                                      ↓
                              matching rule?
                                      ↓
                         enqueue for agent_id
                                      ↓
              webhook push (preferred)  or  agent drain (backup)
                                      ↓
              your relay / agent  →  Slack, Discord, Telegram, …
```

Prefer **`setup_product`** + **`register_agent_webhook`**. Lower-level tools: `create_notification_rule`, `get_pending_notifications`, `ack_notification`.

## MCP tools

| Category | Tools |
|----------|-------|
| **Onboarding** | `setup_product`, `register_agent_webhook`, `drain_notifications` |
| **Events** | `track_event`, `batch_track`, `query_events` |
| **Users** | `identify_user`, `lookup_user` |
| **Identity** | `resolve_identity`, `alias_identity` |
| **Errors** | `capture_error`, `list_error_groups`, `get_error_group`, `resolve_error`, `error_trends` |
| **Notifications** | `set_user_channel`, `create_notification_rule`, `list_notification_rules`, `delete_notification_rule`, `enqueue_notification`, `get_pending_notifications`, `ack_notification`, `register_agent_webhook` |
| **GDPR** | `gdpr_delete_user`, `gdpr_suppress_user`, `gdpr_unsuppress_user`, `gdpr_check_suppression` |
| **Auth** | `create_write_key`, `list_write_keys`, `revoke_write_key` |
| **Agents** | `query_agent_sessions` |
| **System** | `system_health`, `describe_tool` |

Discovery: `GET /mcp` · Docs: `GET /docs` · Agent text: `GET /llms.txt`

## REST (compatibility)

All require `X-Write-Key` (or `Authorization: Bearer`).

| Method | Path | Notes |
|--------|------|-------|
| POST | `/v2/track`, `/api/v2/track` | Track event |
| POST | `/v2/batch`, `/api/v2/batch` | Batch ingest |
| POST | `/v2/identify` | Identify user |
| GET/POST | `/v2/identities/*` | Identity |
| * | `/v2/users/:id/*` | GDPR |
| * | `/v2/errors/*` | Error tracking |
| * | `/v2/agent/*` | Agent sessions |

## Ops

```bash
node bin/cairo.js agent-config --host https://... --agent-id my-agent
node bin/cairo.js create-write-key --name prod
node bin/cairo.js list-write-keys
node bin/cairo.js revoke-write-key --id <id>
```

Env: [`.env.example`](./.env.example). Rate limit defaults to 120 req/min per write key. Webhook push retries with backoff (`CAIRO_WEBHOOK_RETRIES`). Optional shared secret: `CAIRO_WEBHOOK_SECRET` → `X-Hook-Secret`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Security: [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
