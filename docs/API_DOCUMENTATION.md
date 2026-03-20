# API Reference

## Authentication

All endpoints require a write key. Pass it as either:

- `X-Write-Key: your-write-key` header, or
- `Authorization: Bearer your-write-key` header

Requests without a valid write key receive a `401` response.

---

## Event Ingestion

### POST /v2/batch

Primary ingestion endpoint. The SDK uses this for all event delivery.

**Request body:**

```json
{
  "batch": [
    {
      "type": "track",
      "event": "agent.generation",
      "messageId": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2026-03-20T10:30:00.000Z",
      "userId": "my-agent",
      "properties": {
        "model": "claude-sonnet-4-20250514",
        "prompt_tokens": 1200,
        "completion_tokens": 350,
        "total_tokens": 1550,
        "latency_ms": 1830,
        "cost_usd": 0.0042
      },
      "context": {
        "agent_id": "my-agent",
        "instance_id": "uuid",
        "session_id": "uuid",
        "library": { "name": "@cairo/agent-tracker", "version": "1.0.0" }
      }
    }
  ],
  "sentAt": "2026-03-20T10:30:01.000Z"
}
```

**Response (200):**

```json
{ "success": true }
```

**curl example:**

```bash
curl -X POST https://your-cairo.com/v2/batch \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: your-write-key" \
  -d '{
    "batch": [{
      "type": "track",
      "event": "agent.generation",
      "messageId": "abc-123",
      "timestamp": "2026-03-20T10:00:00Z",
      "userId": "my-agent",
      "properties": { "model": "gpt-4o", "total_tokens": 500 }
    }],
    "sentAt": "2026-03-20T10:00:01Z"
  }'
```

### POST /v2/track

Single event ingestion.

**Request body:**

```json
{
  "type": "track",
  "event": "agent.tool_call",
  "userId": "my-agent",
  "properties": {
    "tool_name": "web_search",
    "success": true,
    "latency_ms": 420
  },
  "timestamp": "2026-03-20T10:30:00Z"
}
```

**Response (200):**

```json
{ "success": true }
```

### POST /v2/identify

Set traits on a user or agent identity.

**Request body:**

```json
{
  "type": "identify",
  "userId": "my-agent",
  "traits": {
    "agent_type": "customer-support",
    "version": "2.1.0",
    "team": "billing"
  }
}
```

### POST /v2/page

Track a page view. Follows the Segment page spec.

**Request body:**

```json
{
  "type": "page",
  "userId": "user-123",
  "name": "Dashboard",
  "category": "App",
  "properties": { "url": "/app/dashboard", "referrer": "/login" }
}
```

### POST /v2/screen

Track a screen view (mobile). Same schema as page.

### POST /v2/group

Associate a user/agent with a group.

**Request body:**

```json
{
  "type": "group",
  "userId": "my-agent",
  "groupId": "team-billing",
  "traits": { "name": "Billing Team", "plan": "enterprise" }
}
```

### POST /v2/alias

Link two identities.

**Request body:**

```json
{
  "type": "alias",
  "previousId": "anon-456",
  "userId": "user-123"
}
```

---

## Agent Tracking

### POST /v2/agent/session/start

Start a new agent session.

**Request body:**

```json
{
  "session_id": "uuid",
  "agent_id": "my-agent",
  "instance_id": "uuid",
  "agent_type": "customer-support",
  "model": "claude-sonnet-4-20250514",
  "task": "Resolve billing inquiry",
  "namespace": "production"
}
```

**Response (200):**

```json
{ "success": true, "session": { "session_id": "uuid", "status": "active" } }
```

**curl example:**

```bash
curl -X POST https://your-cairo.com/v2/agent/session/start \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: your-write-key" \
  -d '{
    "session_id": "s-001",
    "agent_id": "my-agent",
    "agent_type": "support",
    "task": "Handle refund request"
  }'
```

### POST /v2/agent/session/end

End an agent session with accumulated metrics.

**Request body:**

```json
{
  "session_id": "uuid",
  "duration_ms": 45000,
  "total_tokens": 8500,
  "total_cost_usd": 0.025,
  "generation_count": 4,
  "tool_call_count": 2,
  "error_count": 0,
  "exit_reason": "task_complete"
}
```

**Response (200):**

```json
{ "success": true, "session": { "session_id": "uuid", "status": "ended" } }
```

### GET /v2/agent/sessions/:agentId

List sessions for an agent.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `namespace` | `string` | `default` | Namespace filter |
| `limit` | `number` | `50` | Max results |
| `offset` | `number` | `0` | Pagination offset |
| `status` | `string` | (all) | Filter by status (`active`, `ended`) |

**curl example:**

```bash
curl "https://your-cairo.com/v2/agent/sessions/my-agent?limit=10&namespace=production" \
  -H "X-Write-Key: your-write-key"
```

**Response (200):**

```json
{
  "success": true,
  "sessions": [
    {
      "session_id": "uuid",
      "agent_id": "my-agent",
      "agent_type": "customer-support",
      "status": "ended",
      "duration_ms": 45000,
      "total_tokens": 8500,
      "total_cost_usd": 0.025,
      "generation_count": 4,
      "tool_call_count": 2,
      "error_count": 0,
      "exit_reason": "task_complete",
      "started_at": "2026-03-20T10:00:00Z",
      "ended_at": "2026-03-20T10:00:45Z"
    }
  ]
}
```

### GET /v2/agent/metrics/:agentId

Aggregated metrics for an agent over a time range.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `namespace` | `string` | `default` | Namespace |
| `timeRange` | `string` | `24h` | Time window (e.g., `1h`, `24h`, `7d`, `30d`) |

**curl example:**

```bash
curl "https://your-cairo.com/v2/agent/metrics/my-agent?timeRange=7d" \
  -H "X-Write-Key: your-write-key"
```

### GET /v2/agent/compare

Compare metrics across agents.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `namespace` | `string` | `default` | Namespace |
| `timeRange` | `string` | `24h` | Time window |
| `groupBy` | `string` | `agent_id` | Group by field (`agent_id`, `agent_type`, `model`) |

**curl example:**

```bash
curl "https://your-cairo.com/v2/agent/compare?timeRange=7d&groupBy=model" \
  -H "X-Write-Key: your-write-key"
```

---

## CDP Pipeline

### Identity Resolution

Manage the identity graph.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v2/identities/:id` | Look up identity by canonical ID |
| POST | `/v2/identities/resolve` | Resolve an identity (userId, anonymousId, or email) to its canonical ID |
| GET | `/v2/identities/:id/graph` | Get the full identity graph for a canonical ID |

### Transformations

CRUD for JavaScript transformations that run on events before destination delivery.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v2/transformations` | List all transformations |
| POST | `/v2/transformations` | Create a transformation |
| GET | `/v2/transformations/:id` | Get a transformation |
| PUT | `/v2/transformations/:id` | Update a transformation |
| DELETE | `/v2/transformations/:id` | Delete a transformation |

**Create transformation example:**

```bash
curl -X POST https://your-cairo.com/v2/transformations \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: your-write-key" \
  -d '{
    "name": "Strip PII from tool calls",
    "code": "function transform(event) { if (event.properties.input) delete event.properties.input.email; return event; }",
    "enabled": true,
    "execution_order": 1
  }'
```

### Tracking Plans

CRUD for event validation schemas.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v2/tracking-plans` | List tracking plans |
| POST | `/v2/tracking-plans` | Create a tracking plan |
| GET | `/v2/tracking-plans/:id` | Get a tracking plan |
| PUT | `/v2/tracking-plans/:id` | Update a tracking plan |
| DELETE | `/v2/tracking-plans/:id` | Delete a tracking plan |
| GET | `/v2/tracking-plans/:id/violations` | List violations for a plan |

Enforcement modes: `allow` (log violations, forward event), `drop` (reject event), `warn` (forward event, flag violation).

### GDPR

User suppression and deletion endpoints.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v2/gdpr/suppress` | Suppress a user (all future events dropped) |
| POST | `/v2/gdpr/unsuppress` | Remove suppression |
| POST | `/v2/gdpr/delete` | Delete all data for a user |
| GET | `/v2/gdpr/status/:userId` | Check suppression status |

**Suppress a user:**

```bash
curl -X POST https://your-cairo.com/v2/gdpr/suppress \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: your-write-key" \
  -d '{ "userId": "user-123", "reason": "GDPR deletion request" }'
```

### Event Replay

Replay raw events from storage.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v2/replay` | Replay events for a time range and namespace |
| GET | `/v2/replay/status/:jobId` | Check replay job status |

### Destinations

CRUD for destination configurations.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v2/destinations` | List configured destinations |
| POST | `/v2/destinations` | Create a destination |
| GET | `/v2/destinations/:id` | Get a destination |
| PUT | `/v2/destinations/:id` | Update a destination |
| DELETE | `/v2/destinations/:id` | Delete a destination |
| POST | `/v2/destinations/:id/test` | Test destination connectivity |

Available destination types: `slack`, `mixpanel`, `discord`, `resend`, `webhook`, `bigquery`, `hubspot`, `salesforce`, `ga4`, `amplitude`, `posthog`, `braze`, `customerio`, `sendgrid`, `kafka`, `elasticsearch`, `snowflake`, `s3`, `intercom`, `pipedrive`.

---

## Health

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Full health check (database, destinations) |
| `GET /health/simple` | Returns `200 OK` if server is running |
| `GET /health/detailed` | Detailed status of all subsystems |

**curl example:**

```bash
curl https://your-cairo.com/health/detailed
```

**Response:**

```json
{
  "status": "healthy",
  "uptime": 86400,
  "database": { "connected": true, "latency_ms": 2 },
  "destinations": {
    "slack": { "enabled": true, "healthy": true },
    "bigquery": { "enabled": true, "healthy": true }
  }
}
```
