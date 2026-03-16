# Cairo CDP - Engineering Plan

**Version:** 1.0
**Date:** 2026-03-17

---

## Phase 1: Core CDP Parity (Weeks 1-6)

### Week 1-2: Foundation & Event Spec

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Set up test infrastructure (Jest + Supertest) | - | 1d | None |
| Refactor `server.js` into modular route mounting | - | 2d | None |
| Implement `page` event type + route | - | 1d | None |
| Implement `screen` event type + route | - | 0.5d | page (same shape) |
| Implement `group` event type + route + DB table | - | 1d | None |
| Implement `alias` event type + route | - | 1d | None |
| Add JSON Schema validation at ingestion | - | 1d | All event types |
| Add `receivedAt` / `sentAt` / `timestamp` handling | - | 0.5d | None |
| Create `/v2/*` API routes (parallel to existing) | - | 1d | All event types |
| Write tests for all event types | - | 1d | All above |

**Deliverable:** All 6 event types accepted and validated at `/v2/{type}`.

### Week 2-3: SDK Polish & Publish

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Audit `packages/node-sdk` - fix issues, add retry logic | - | 2d | None |
| Audit `packages/react-sdk` - fix issues, add hooks | - | 1d | None |
| Audit `packages/browser-sdk` - fix issues, minimize bundle | - | 2d | None |
| Add exponential backoff retry to all SDKs | - | 1d | SDK audit |
| Add configurable batching to all SDKs | - | 1d | SDK audit |
| Add write key authentication to all SDKs | - | 0.5d | SDK audit |
| Write SDK integration tests (against local server) | - | 1d | All above |
| Set up npm org `@cairo-cdp` | - | 0.5d | None |
| Publish all 3 SDKs to npm | - | 0.5d | All above |
| Write SDK quick start guide updates | - | 0.5d | Publish |

**Deliverable:** `npm install @cairo-cdp/node-sdk` works, sends events, handles failures.

### Week 3-4: Warehouse Destinations

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Create `BaseDestination` class (formalize existing pattern) | - | 1d | None |
| Refactor existing 5 destinations to extend `BaseDestination` | - | 1d | BaseDestination |
| Create destination registry with auto-discovery | - | 0.5d | BaseDestination |
| Implement BigQuery destination | - | 3d | BaseDestination |
| - Schema auto-creation from first event | - | (included) | - |
| - Additive schema migration on new properties | - | (included) | - |
| - Batch buffering (1000 events / 60s) | - | (included) | - |
| - Retry with dead-letter | - | (included) | - |
| Implement external PostgreSQL destination | - | 2d | BaseDestination |
| Implement S3/GCS destination (JSON files) | - | 2d | BaseDestination |
| Destination connection test UI in dashboard | - | 1d | Destinations |
| Write integration tests for warehouse destinations | - | 1d | All above |

**Deliverable:** Events flow to BigQuery and external Postgres within 60 seconds.

### Week 5-6: GDPR & Suppression + Stabilization

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Create `user_suppressions` table + migration | - | 0.5d | None |
| Create `deletion_audit_log` table + migration | - | 0.5d | None |
| Implement `DELETE /v2/users/:userId` | - | 1d | Tables |
| Implement `POST /v2/users/:userId/suppress` | - | 0.5d | Tables |
| Implement `POST /v2/users/:userId/unsuppress` | - | 0.5d | Tables |
| Add suppression check in event ingestion pipeline | - | 0.5d | Suppress API |
| Write GDPR compliance tests | - | 1d | All above |
| Store raw events to `raw_events` table (for replay) | - | 1d | None |
| End-to-end testing of full pipeline | - | 2d | Everything |
| Performance testing (target: 1K events/sec single node) | - | 1d | Everything |
| Bug fixes and stabilization | - | 2d | Everything |

**Deliverable:** GDPR deletion/suppression working, raw events stored, pipeline stable.

---

## Phase 2: Data Infrastructure (Weeks 7-14)

### Week 7-8: Transformation Engine

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Add `isolated-vm` dependency | - | 0.5d | None |
| Create `transformations` table + migration | - | 0.5d | None |
| Build transformation execution engine | - | 3d | isolated-vm |
| - V8 sandbox with 500ms timeout, 64MB memory | - | (included) | - |
| - Event in, modified event out (or null to drop) | - | (included) | - |
| - Error handling: fail-open with logging | - | (included) | - |
| Build transformation CRUD API | - | 1d | Engine |
| Build transformation test endpoint (dry run) | - | 1d | Engine |
| Integrate transforms into event processing pipeline | - | 1d | Engine |
| AI transformation builder (Gemini generates JS) | - | 2d | Engine |
| Write transformation engine tests | - | 1d | All above |

**Deliverable:** Users can write JS transforms that run on events in-flight.

### Week 9-10: Identity Resolution

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Create `identity_graph` table + migration | - | 0.5d | None |
| Build identity resolution service | - | 3d | Table |
| - Deterministic stitching (userId, email, anonymousId) | - | (included) | - |
| - Alias handling (merge canonical IDs) | - | (included) | - |
| - Conflict detection (prevent bad merges) | - | (included) | - |
| Integrate identity resolution into pipeline | - | 1d | Service |
| Build identity API (`GET /v2/users/:id/identities`) | - | 0.5d | Service |
| Build identity debug UI in dashboard | - | 1d | API |
| Write identity resolution tests | - | 1d | All above |

**Deliverable:** Cross-device identity stitching working for deterministic matches.

### Week 11-12: Tracking Plans

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Create `tracking_plans` + `tracking_plan_violations` tables | - | 0.5d | None |
| Build tracking plan CRUD API | - | 1d | Tables |
| Build schema validation engine (JSON Schema) | - | 2d | API |
| Implement enforcement modes (allow/drop/warn) | - | 1d | Engine |
| Integrate tracking plan checks into pipeline | - | 1d | Engine |
| Build tracking plan UI in dashboard | - | 2d | API |
| AI anomaly detection (schema drift, volume spikes) | - | 2d | Engine |
| Auto-generate tracking plan from existing events | - | 1d | Engine |
| Write tracking plan tests | - | 1d | All above |

**Deliverable:** Schema validation on events with configurable enforcement.

### Week 13-14: Destination Expansion

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| HubSpot destination | - | 2d | BaseDestination |
| Salesforce destination | - | 3d | BaseDestination |
| Google Analytics 4 destination | - | 2d | BaseDestination |
| Amplitude destination | - | 1d | BaseDestination |
| PostHog destination | - | 1d | BaseDestination |
| Braze destination | - | 2d | BaseDestination |
| Customer.io destination | - | 1d | BaseDestination |
| Intercom destination | - | 1d | BaseDestination |
| SendGrid destination | - | 1d | BaseDestination |
| Snowflake destination | - | 2d | BaseDestination |
| Kafka destination | - | 2d | BaseDestination |
| Elasticsearch destination | - | 1d | BaseDestination |
| Destination config UI (add/edit/test/enable) | - | 3d | All destinations |
| Write destination tests (mock API responses) | - | 2d | All destinations |

**Deliverable:** 15+ new destinations, configurable via dashboard.

---

## Phase 3: AI Differentiation (Weeks 15-20)

### Week 15-16: AI Transform Builder + Agent API

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Natural language transform builder in dashboard | - | 3d | Transform engine |
| Iterative refinement ("also mask emails") | - | 1d | Builder |
| Agent tools API (`GET /api/agent/tools`) | - | 1d | None |
| Agent tools execute (`POST /api/agent/tools/execute`) | - | 2d | Tools API |
| Agent context endpoints (lead, pipeline, stats) | - | 2d | None |
| NL action endpoint (query + act) | - | 2d | Agent API |

### Week 17-18: Data Quality Agent + Predictive Scoring

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Schema drift detection agent | - | 3d | Tracking plans |
| Volume anomaly detection | - | 2d | Event stream |
| Auto-fix suggestions for drift | - | 1d | Detection |
| ML-based lead scoring model | - | 3d | Scoring service |
| Explainable score UI ("why this score?") | - | 1d | ML scoring |

### Week 19-20: Self-Healing Destinations + Polish

| Task | Owner | Estimate | Dependencies |
|------|-------|----------|-------------|
| Destination error pattern detection | - | 2d | Destinations |
| Auto-retry with adaptive backoff | - | 1d | Detection |
| Event queueing during outages | - | 2d | Redis/BullMQ |
| Replay on recovery | - | 1d | Queueing |
| End-to-end system testing | - | 3d | Everything |
| Performance optimization | - | 2d | Everything |

---

## Testing Strategy

### Test Pyramid

```
       ┌─────────┐
       │  E2E    │  5-10 tests: full pipeline (SDK → destination)
       │  Tests  │
      ┌┴─────────┴┐
      │ Integration │  50+ tests: service + DB, API endpoints
      │   Tests     │
    ┌─┴─────────────┴─┐
    │   Unit Tests      │  200+ tests: services, transforms, identity
    │                   │
    └───────────────────┘
```

### Test Categories

| Category | What | Tools | Count Target |
|----------|------|-------|-------------|
| Unit | Individual services, identity resolution, transforms | Jest | 200+ |
| Integration | API endpoints, DB operations, destination plugins | Jest + Supertest | 50+ |
| E2E | SDK → ingestion → processing → destination | Jest + test server | 10+ |
| Load | Throughput, latency, memory under load | k6 or artillery | 5 scenarios |

### Critical Test Scenarios

1. Event ingestion for all 6 types (valid + invalid payloads)
2. Identity resolution: anonymous → identified → aliased
3. Transformation: modify, drop, error, timeout
4. Tracking plan: allow, drop, warn modes
5. Suppression: suppressed user events silently dropped
6. Deletion: user data removed from all tables
7. Warehouse destination: batch write, schema evolution, retry
8. SDK: batching, retry, offline queue

---

## Infrastructure Requirements

### Phase 1 (Current)

| Service | Purpose | Estimated Cost |
|---------|---------|---------------|
| GCP Cloud Run | Server hosting | $50-200/mo |
| Cloud SQL (PostgreSQL) | Primary database | $50-100/mo |
| GCS | Raw event backup | $5-20/mo |

### Phase 2 (Add)

| Service | Purpose | Estimated Cost |
|---------|---------|---------------|
| Redis (Memorystore) | Event queue, caching | $50-100/mo |
| Cloud Build | CI/CD | $10-30/mo |

### Phase 3 (Add)

| Service | Purpose | Estimated Cost |
|---------|---------|---------------|
| Cloud Run (workers) | Background processing | $100-300/mo |
| Vertex AI / Gemini | AI features | $50-200/mo |

---

## Definition of Done (per task)

- [ ] Code written and self-reviewed
- [ ] Unit tests passing
- [ ] Integration tests passing (where applicable)
- [ ] No new lint warnings
- [ ] Database migrations are backward-compatible
- [ ] API changes are backward-compatible
- [ ] Error paths logged with structured context
- [ ] PR reviewed and approved
