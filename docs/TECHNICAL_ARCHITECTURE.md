# Cairo CDP - Technical Architecture

**Version:** 1.0
**Date:** 2026-03-17

---

## 1. System Architecture

### 1.1 Current Architecture

```
  Lemlist ─────┐
  Smartlead ───┤
  Webhooks ────┤
  SDK (REST) ──┘
       │
       ▼
  ┌─────────────────────────────────────────┐
  │           Express Server (server.js)     │
  │                                          │
  │  Routes ──▶ Services ──▶ Destinations    │
  │    │            │            │            │
  │    │            ▼            ▼            │
  │    │     ┌──────────┐  ┌──────────┐      │
  │    │     │ AI Enrich│  │ Slack    │      │
  │    │     │ Scoring  │  │ Mixpanel │      │
  │    │     │ Sync     │  │ Discord  │      │
  │    │     └──────────┘  │ Resend   │      │
  │    │                   │ Webhook  │      │
  │    ▼                   └──────────┘      │
  │  PostgreSQL                              │
  └─────────────────────────────────────────┘
```

### 1.2 Target Architecture

```
  ┌─────────────────────────────────────────────────────────────┐
  │                        INGESTION LAYER                       │
  │                                                              │
  │  Node SDK ──┐   Browser SDK ──┐   React SDK ──┐             │
  │  Webhooks ──┤   REST API ─────┤   Sources ────┘             │
  │             ▼                 ▼                              │
  │       ┌───────────────────────────────┐                     │
  │       │  Event Validation & Auth      │                     │
  │       │  (Write Key + JSON Schema)    │                     │
  │       └──────────────┬────────────────┘                     │
  └──────────────────────┼──────────────────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                     PROCESSING LAYER                         │
  │                                                              │
  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
  │  │  Identity    │  │ Tracking     │  │  Transformation   │   │
  │  │  Resolution  │  │ Plan Check   │  │  Engine (JS VM)   │   │
  │  │  (stitch IDs)│  │ (validate)   │  │  + AI Builder     │   │
  │  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘   │
  │         │                 │                    │              │
  │         ▼                 ▼                    ▼              │
  │  ┌──────────────────────────────────────────────────┐        │
  │  │              Event Router                         │        │
  │  │  (fan-out to destinations based on config)        │        │
  │  └──────────────────────┬───────────────────────────┘        │
  └─────────────────────────┼────────────────────────────────────┘
                            │
                            ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                     DESTINATION LAYER                         │
  │                                                              │
  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
  │  │ CRM     │ │Analytics│ │Warehouse│ │ Comms   │           │
  │  │ Attio   │ │Mixpanel │ │BigQuery │ │ Slack   │           │
  │  │ HubSpot │ │GA4      │ │Snowflake│ │ Discord │           │
  │  │Salesforce│ │Amplitude│ │Postgres │ │ Resend  │           │
  │  │Pipedrive│ │PostHog  │ │S3/GCS   │ │ Teams   │           │
  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
  │                                                              │
  │  ┌─────────┐ ┌─────────┐                                    │
  │  │Marketing│ │ Stream  │                                    │
  │  │ Braze   │ │ Kafka   │                                    │
  │  │Customer │ │ Redis   │                                    │
  │  │ .io     │ │ Elastic │                                    │
  │  └─────────┘ └─────────┘                                    │
  └──────────────────────────────────────────────────────────────┘
                            │
                            ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                    AI / ENRICHMENT LAYER                      │
  │                                                              │
  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐    │
  │  │ AI Enrichment│  │ Lead Scoring│  │ Data Quality Agent│    │
  │  │ (Gemini,     │  │ (ICP+Behav  │  │ (Schema drift,   │    │
  │  │  Apollo,     │  │  +ML)       │  │  anomaly detect) │    │
  │  │  Hunter)     │  │             │  │                   │    │
  │  └─────────────┘  └─────────────┘  └───────────────────┘    │
  │                                                              │
  │  ┌─────────────────┐  ┌───────────────────────┐             │
  │  │ NL Query Engine │  │ AI Transform Builder  │             │
  │  │ (/api/ai/query) │  │ (natural language     │             │
  │  │                 │  │  to JS transforms)    │             │
  │  └─────────────────┘  └───────────────────────┘             │
  └──────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model

### 2.1 Core Event Schema

All events follow the Segment-compatible spec:

```javascript
{
  // Common fields (all event types)
  "type": "track|identify|page|screen|group|alias",
  "messageId": "uuid-v4",                    // generated by SDK or server
  "timestamp": "2026-03-17T10:30:00.000Z",   // client-side timestamp
  "sentAt": "2026-03-17T10:30:00.500Z",      // when SDK sent it
  "receivedAt": "2026-03-17T10:30:01.000Z",  // server-side timestamp
  "writeKey": "wk_abc123",                   // source authentication
  "context": {
    "library": { "name": "@cairo-cdp/node-sdk", "version": "1.0.0" },
    "ip": "203.0.113.1",
    "userAgent": "...",
    "locale": "en-US",
    "page": { "url": "...", "referrer": "...", "title": "..." }
  },

  // Identity fields
  "userId": "user_123",         // known user ID
  "anonymousId": "anon_456",    // anonymous/device ID

  // Type-specific fields
  "event": "Product Viewed",                  // track only
  "properties": { ... },                      // track, page, screen
  "traits": { ... },                          // identify, group
  "groupId": "company_789",                   // group only
  "previousId": "old_user_id",                // alias only
  "name": "Home",                             // page, screen
  "category": "Landing"                       // page, screen
}
```

### 2.2 Database Schema (New Tables)

```sql
-- Identity graph
CREATE TABLE identity_graph (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id UUID NOT NULL,           -- the "merged" identity
  identity_type VARCHAR(50) NOT NULL,   -- 'userId', 'anonymousId', 'email'
  identity_value VARCHAR(500) NOT NULL,
  namespace VARCHAR(100) DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identity_type, identity_value, namespace)
);
CREATE INDEX idx_identity_canonical ON identity_graph(canonical_id);
CREATE INDEX idx_identity_lookup ON identity_graph(identity_type, identity_value, namespace);

-- Tracking plans
CREATE TABLE tracking_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  namespace VARCHAR(100) DEFAULT 'default',
  enforcement_mode VARCHAR(20) DEFAULT 'allow',  -- 'allow', 'drop', 'warn'
  schema JSONB NOT NULL,                          -- JSON Schema per event name
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tracking plan violations
CREATE TABLE tracking_plan_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_plan_id UUID REFERENCES tracking_plans(id),
  event_name VARCHAR(255),
  violation_type VARCHAR(50),        -- 'missing_field', 'wrong_type', 'unknown_event'
  violation_details JSONB,
  event_payload JSONB,
  namespace VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transformations
CREATE TABLE transformations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  namespace VARCHAR(100) DEFAULT 'default',
  destination_id UUID,                 -- NULL = applies to all
  code TEXT NOT NULL,                  -- JavaScript transformation code
  enabled BOOLEAN DEFAULT true,
  execution_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Destination configs (formalize existing pattern)
CREATE TABLE destination_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,           -- 'bigquery', 'hubspot', 'slack', etc.
  namespace VARCHAR(100) DEFAULT 'default',
  config JSONB NOT NULL,               -- encrypted credentials + settings
  enabled BOOLEAN DEFAULT true,
  event_types TEXT[],                  -- which event types to send
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User suppression list
CREATE TABLE user_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(500) NOT NULL,
  namespace VARCHAR(100) DEFAULT 'default',
  suppressed_at TIMESTAMPTZ DEFAULT NOW(),
  suppressed_by VARCHAR(255),
  reason TEXT,
  UNIQUE(user_id, namespace)
);

-- Deletion audit log
CREATE TABLE deletion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(500) NOT NULL,
  namespace VARCHAR(100),
  action VARCHAR(20) NOT NULL,         -- 'delete', 'suppress', 'unsuppress'
  tables_affected TEXT[],
  rows_deleted INT,
  performed_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw event backup (for replay)
CREATE TABLE raw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(255),
  event_type VARCHAR(20),
  payload JSONB NOT NULL,
  namespace VARCHAR(100),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  replayed BOOLEAN DEFAULT false
);
CREATE INDEX idx_raw_events_time ON raw_events(namespace, received_at);
```

---

## 3. Processing Pipeline

### 3.1 Event Flow (Happy Path)

```
  SDK/API ──▶ [1] Auth ──▶ [2] Validate ──▶ [3] Suppress Check
                                                     │
                                                     ▼
  [7] Destination Fan-out ◀── [6] Transform ◀── [5] Identity Resolution
         │                                           │
         ▼                                      [4] Tracking Plan Check
  ┌──────────────┐                                   │
  │ Per-dest queue│                                   ▼
  │ (in-memory   │                              Store raw event
  │  or Redis)   │                              (for replay)
  └──────┬───────┘
         │
         ▼
  Destination API call
  (retry on failure,
   dead-letter on exhaust)
```

**Step details:**

1. **Auth**: Validate write key against `destination_configs` or source config. Reject 401.
2. **Validate**: Check event structure against base schema. Reject 400 on malformed.
3. **Suppress Check**: Look up `user_suppressions`. If suppressed, return 202 and drop.
4. **Tracking Plan Check**: If tracking plan exists for this source/namespace, validate properties. Handle per enforcement mode.
5. **Identity Resolution**: Look up/create identity graph entry. Merge if `alias`. Attach `canonical_id`.
6. **Transform**: Run user-defined transformations in order. If transform returns null, drop event.
7. **Destination Fan-out**: Route event to all enabled destinations for this namespace. Queue per destination.

### 3.2 Error Handling

| Step | Error | Behavior |
|------|-------|----------|
| Auth | Invalid write key | 401, event dropped, logged |
| Validate | Malformed event | 400 with validation errors, event dropped |
| Suppress | DB lookup fails | Fail-open (process event), log error |
| Tracking Plan | Violation | Per enforcement mode (allow/drop/warn) |
| Identity | Graph query fails | Fail-open (skip resolution), log error |
| Transform | JS execution error | Fail-open (forward original), log error with transform ID |
| Transform | Timeout (>500ms) | Kill transform, forward original, log |
| Destination | API error (4xx) | Log, do not retry (client error) |
| Destination | API error (5xx/timeout) | Retry 3x with exponential backoff (1s, 4s, 16s) |
| Destination | Retry exhausted | Write to dead-letter table, alert |

### 3.3 Transformation Engine

```
  ┌───────────────────────────────────────┐
  │         Transformation Engine          │
  │                                        │
  │  Event ──▶ [Sandbox VM] ──▶ Result     │
  │              │                         │
  │              │  - isolated-vm (V8)     │
  │              │  - 500ms timeout        │
  │              │  - 64MB memory limit    │
  │              │  - no network access    │
  │              │  - no filesystem access │
  │              │                         │
  │  Result types:                         │
  │    - Modified event (object returned)  │
  │    - Drop event (null returned)        │
  │    - Error (original event forwarded)  │
  └───────────────────────────────────────┘
```

---

## 4. Destination Plugin Architecture

### 4.1 Plugin Interface

Every destination implements this interface:

```javascript
class BaseDestination {
  constructor(config) {
    this.config = config;
    this.name = '';        // e.g., 'hubspot'
    this.displayName = ''; // e.g., 'HubSpot'
    this.supportedEvents = ['track', 'identify', 'page', 'screen', 'group'];
  }

  // Lifecycle
  async initialize() {}          // called once on startup
  async test() {}                // connection test, returns { success, message }
  async validateConfig() {}      // validate config shape

  // Event handlers
  async track(event) {}
  async identify(event) {}
  async page(event) {}
  async screen(event) {}
  async group(event) {}
  async alias(event) {}

  // Batch support (optional)
  async batch(events) {}         // default: loop + individual calls
  get supportsBatch() { return false; }
  get batchSize() { return 100; }
}
```

### 4.2 Destination Registry

```javascript
// src/destinations/registry.js
const registry = {
  slack: require('./slackDestination'),
  mixpanel: require('./mixpanelDestination'),
  discord: require('./discordDestination'),
  resend: require('./resendDestination'),
  webhook: require('./webhookDestination'),
  bigquery: require('./bigqueryDestination'),
  hubspot: require('./hubspotDestination'),
  // ... etc
};
```

### 4.3 Warehouse Destination Pattern

Warehouse destinations differ from API destinations:

```
  Events ──▶ Buffer (in-memory, time or size trigger)
                │
                ▼
         Batch Writer
                │
                ├── Schema check (create table / add columns if needed)
                │
                ├── Write batch (INSERT or streaming API)
                │
                └── Confirm / retry / dead-letter
```

- **Buffer**: Accumulate events (default: 1000 events or 60 seconds)
- **Schema evolution**: Additive only (new columns, never drop/rename)
- **Table naming**: `{namespace}_{event_type}` (e.g., `default_track`, `default_identify`)

---

## 5. Identity Resolution

### 5.1 Identity Graph Model

```
  ┌──────────────────────────────────────────┐
  │            Identity Graph                 │
  │                                           │
  │  canonical_id: "c_001"                    │
  │    ├── userId: "user_123"                 │
  │    ├── anonymousId: "anon_456"            │
  │    ├── anonymousId: "anon_789"            │
  │    └── email: "jane@acme.com"             │
  │                                           │
  │  canonical_id: "c_002"                    │
  │    ├── userId: "user_456"                 │
  │    └── email: "john@acme.com"             │
  └──────────────────────────────────────────┘
```

### 5.2 Resolution Rules

1. **identify** with both `userId` and `anonymousId`: link them under same canonical ID
2. **identify** with `userId` and `traits.email`: link userId to email
3. **alias** with `previousId` and `userId`: merge the two canonical IDs (and all their linked identities)
4. **track** with only `anonymousId`: create or lookup canonical ID for that anonymousId
5. **Conflict resolution**: If an alias would merge two canonical IDs that each have different userIds, log a conflict and do not merge (prevent accidental identity collapse)

---

## 6. Security Architecture

### 6.1 Authentication

| Layer | Method | Details |
|-------|--------|---------|
| SDK → Server | Write Key | `Authorization: Bearer wk_xxx` or `X-Write-Key: wk_xxx` |
| Dashboard UI | Session cookie | Express session with secure, httpOnly, sameSite |
| Admin API | API Key | `X-API-Key: ak_xxx` for management endpoints |
| Destination credentials | Encrypted at rest | AES-256-GCM, key in env var |

### 6.2 Input Validation

- All event properties validated against JSON Schema at ingestion
- SQL injection prevention: parameterized queries only (existing pattern via `pg`)
- XSS prevention: no user input rendered as HTML (API-only server)
- Request size limit: 1MB per request, 500KB per event
- Rate limiting: per write key (configurable, default 1000 req/min)

### 6.3 Data Privacy

- User suppression/deletion API (GDPR Article 17)
- PII fields configurable per tracking plan
- Transformation engine can mask PII before forwarding to destinations
- Audit log for all deletion/suppression actions

---

## 7. Deployment Architecture

### 7.1 Single Node (Current + Phase 1)

```
  ┌─────────────────────────────────────┐
  │         GCP Cloud Run               │
  │                                      │
  │  ┌──────────────────────────┐        │
  │  │  Cairo Server (Express)  │        │
  │  │  + React UI (static)     │        │
  │  └──────────┬───────────────┘        │
  │             │                        │
  │             ▼                        │
  │  ┌──────────────────────────┐        │
  │  │  PostgreSQL (Cloud SQL)  │        │
  │  └──────────────────────────┘        │
  └─────────────────────────────────────┘
```

### 7.2 Scaled (Phase 2+)

```
  ┌──────────────────────────────────────────────┐
  │                  Load Balancer                │
  │                                               │
  │  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
  │  │ Ingestion│  │ Ingestion│  │ Ingestion│      │
  │  │ Node 1   │  │ Node 2   │  │ Node N   │      │
  │  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
  │       │              │              │            │
  │       └──────────────┼──────────────┘            │
  │                      ▼                           │
  │              ┌──────────────┐                    │
  │              │  Redis Queue │                    │
  │              └──────┬───────┘                    │
  │                     │                            │
  │       ┌─────────────┼─────────────┐              │
  │       ▼             ▼             ▼              │
  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
  │  │ Worker 1 │  │ Worker 2 │  │ Worker N │         │
  │  │ (process │  │ (process │  │ (process │         │
  │  │  +route) │  │  +route) │  │  +route) │         │
  │  └─────────┘  └─────────┘  └─────────┘         │
  │                      │                           │
  │                      ▼                           │
  │              ┌──────────────┐                    │
  │              │  PostgreSQL  │                    │
  │              │  (Primary +  │                    │
  │              │   Read       │                    │
  │              │   Replicas)  │                    │
  │              └──────────────┘                    │
  └──────────────────────────────────────────────────┘
```

---

## 8. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Node.js (Express) | Existing stack, team expertise |
| Database | PostgreSQL | Existing, proven, supports JSONB |
| Queue (Phase 2) | Redis (BullMQ) | Simple, already in infra plan, sufficient to 50K events/sec |
| JS Sandbox | isolated-vm | V8 isolates, secure, fast startup |
| Warehouse writes | Native SDKs | @google-cloud/bigquery, snowflake-sdk |
| Identity graph | PostgreSQL | Start simple, migrate to graph DB if needed |
| Object storage | GCS (S3 compatible) | Already on GCP |
| SDK build | TypeScript + Rollup | Type safety, tree-shakeable bundles |
