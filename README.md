# Cairo

Open-source, agent-first event tracking. Agents are the primary user. Track events from products and agents, then hand notifications to agents who relay to end users via their own gateways (Telegram, Discord, Slack, WhatsApp, etc.).

Cairo does **not** connect to messaging gateways itself.

## Why Cairo

- **MCP-first.** Agents connect via Model Context Protocol. Tools for events, identity, errors, notification handoff, and GDPR.
- **Product events still work.** Frontend, backend, and mobile SDKs send to the same ingest API (`/v2/track`, `/v2/batch`).
- **Agent handoff.** Rules enqueue notifications for agents (pull via MCP or push via webhook). Agents relay through whatever gateway they already use.
- **Self-hosted.** Node.js + PostgreSQL. Your data stays on your infrastructure.

## Quick Start

### For Agents (MCP)

HTTP MCP against a running Cairo instance:

```bash
curl -X POST https://your-cairo.com/mcp \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: your-write-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
    "name":"track_event",
    "arguments":{"event":"signup","user_id":"user_123","properties":{"plan":"free"}}
  }}'
```

Agent self-reporting via stdio MCP (local package until published):

```json
{
  "mcpServers": {
    "cairo-agent": {
      "command": "node",
      "args": ["./packages/agent-mcp/dist/index.js"],
      "env": {
        "CAIRO_HOST": "https://your-cairo-instance.com",
        "CAIRO_WRITE_KEY": "your-write-key",
        "CAIRO_AGENT_ID": "my-agent"
      }
    }
  }
}
```

### For Apps (SDK)

```bash
npm install @cairo/tracker
# or until published: file:packages/tracker
```

```typescript
import { Cairo } from '@cairo/tracker';

const cairo = Cairo.init({
  writeKey: 'your-write-key',
  host: 'https://your-cairo-instance.com',
});

cairo.track({
  event: 'signup',
  userId: 'user_123',
  properties: { plan: 'free', source: 'landing_page' },
});

cairo.identify({
  userId: 'user_123',
  traits: {
    email: 'ava@school.edu',
    telegram_chat_id: '123456789', // stored for agents to look up when relaying
  },
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
              agent pulls (MCP) or receives webhook push
                                      ↓
         agent relays via its Telegram/Discord/Slack gateway
```

Example rule (MCP `create_notification_rule`):

```json
{
  "name": "signup-relay",
  "event_name": "signup",
  "agent_id": "notify-bot",
  "message_template": "New signup: {{userId}} plan={{properties.plan}}"
}
```

Agent loop:

1. `get_pending_notifications` (or webhook push)
2. Read `payload.channels` for gateway addresses
3. Send via the agent's own Telegram/Discord/Slack connection
4. `ack_notification`

## MCP Tools

| Category | Tools |
|----------|-------|
| **Events** | `track_event`, `batch_track`, `query_events` |
| **Users** | `identify_user`, `lookup_user` |
| **Identity** | `resolve_identity`, `alias_identity` |
| **Errors** | `capture_error`, `list_error_groups`, `get_error_group`, `resolve_error`, `error_trends` |
| **Notifications** | `set_user_channel`, `create_notification_rule`, `list_notification_rules`, `delete_notification_rule`, `enqueue_notification`, `get_pending_notifications`, `ack_notification`, `register_agent_webhook` |
| **GDPR** | `gdpr_delete_user`, `gdpr_suppress_user`, `gdpr_unsuppress_user`, `gdpr_check_suppression` |
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

## Setup

```bash
cp .env.example .env.local
# set POSTGRES_URL
npm install
npm run migrate
npm start
```

Insert a write key once the DB is up:

```sql
INSERT INTO write_keys (key, name) VALUES ('dev-key', 'local');
```

Until at least one write key exists, any non-empty key is accepted (bootstrap mode).

## License

MIT
