# Cairo CDP - Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-17
**Status:** Draft
**Owner:** Cairo Team

---

## 1. Product Overview

Cairo is an open-source Customer Data Platform (CDP) that collects, enriches, scores, and routes customer data across destinations. It competes with RudderStack and Segment by offering built-in AI enrichment, lead scoring, and multi-tenancy at a fraction of the cost.

### 1.1 Vision

The open-source CDP that every growth team can self-host, with AI-powered enrichment and scoring that commercial CDPs charge enterprise prices for.

### 1.2 Current State

| Capability | Status | Details |
|-----------|--------|---------|
| Event Ingestion | Partial | `track`, `identify`, `batch` only |
| Sources | 2 | Lemlist, Smartlead + webhooks |
| Destinations | 5 | Attio, Mixpanel, Slack, Discord, Resend |
| SDKs | 3 (unpublished) | Node.js, React, Browser |
| AI Enrichment | Strong | Apollo, Hunter, Gemini ($0.005/lead) |
| Lead Scoring | Strong | ICP + Behavior dual model with AI |
| Multi-tenant | Good | Namespace-based routing |
| Transformations | None | No user-defined pipeline |
| Identity Resolution | None | No identity graph |
| Warehouse Destinations | None | No Snowflake/BigQuery/S3 |
| Tracking Plans | None | No schema validation |
| GDPR Compliance | None | No suppression/deletion API |

### 1.3 Target Users

| Persona | Description | Primary Need |
|---------|-------------|-------------|
| **Growth Engineer** | Startup engineer (seed to Series B) who owns the data stack | Self-hosted CDP that's cheaper than Segment, richer than raw event tracking |
| **Sales Ops Lead** | Manages lead flow from campaigns to CRM | AI enrichment + scoring that plugs into their existing tools |
| **Agency Tech Lead** | Runs campaigns for multiple clients | Multi-tenant CDP with per-client namespaces and routing |
| **Data Engineer** | Owns the warehouse and analytics pipeline | CDP that reliably lands events in BigQuery/Snowflake with schema guarantees |

---

## 2. Requirements by Phase

### Phase 1: Core CDP Parity (Foundation)

**Goal:** A credible open-source CDP that a startup can replace Segment/RudderStack with.

#### P1.1 Complete Event Spec

| Requirement | Priority | Details |
|------------|----------|---------|
| `page` event type | P1 | Page view tracking with `name`, `category`, `properties` |
| `screen` event type | P1 | Mobile screen view (same shape as `page`) |
| `group` event type | P1 | Associate user with company/org. Fields: `groupId`, `traits` |
| `alias` event type | P1 | Merge two user identities. Fields: `previousId`, `userId` |
| Event validation | P1 | JSON Schema validation on all event types at ingestion |
| Timestamp handling | P1 | Accept `timestamp` and `sentAt`, compute `receivedAt` server-side |

**Acceptance criteria:**
- All 6 event types (`track`, `identify`, `page`, `screen`, `group`, `alias`) accepted at `/v2/{type}`
- Invalid events return 400 with specific validation errors
- Existing `/api/events/track` continues to work (backward compat)

#### P1.2 Publish SDKs

| Requirement | Priority | Details |
|------------|----------|---------|
| Publish `@cairo-cdp/node-sdk` to npm | P1 | Existing package in `packages/node-sdk`, needs polish + publish |
| Publish `@cairo-cdp/react-sdk` to npm | P1 | Existing package in `packages/react-sdk` |
| Publish `@cairo-cdp/browser-sdk` to npm | P1 | Existing package in `packages/browser-sdk` |
| SDK auto-retry with backoff | P1 | Exponential backoff on 429/5xx |
| SDK event batching | P1 | Configurable batch size and flush interval |
| SDK write key auth | P1 | Authenticate via write key header |

**Acceptance criteria:**
- `npm install @cairo-cdp/node-sdk` works
- SDK sends events to Cairo server, receives 200
- Failed events are retried up to 3x with exponential backoff
- Events are batched (default: 20 events or 10s interval)

#### P1.3 Warehouse Destinations

| Requirement | Priority | Details |
|------------|----------|---------|
| BigQuery destination | P1 | Stream events to BigQuery tables (one table per event type) |
| PostgreSQL destination (external) | P1 | Write events to an external Postgres (not Cairo's own DB) |
| S3/GCS destination | P2 | Write events as JSON/Parquet files to object storage |
| Snowflake destination | P2 | Stream events to Snowflake tables |

**Acceptance criteria:**
- Events arrive in BigQuery within 60 seconds of ingestion
- Schema is auto-created on first event, auto-migrated on new properties
- Failed writes are retried with dead-letter logging
- Configurable via destination settings (project, dataset, credentials)

#### P1.4 User Suppression & Deletion API

| Requirement | Priority | Details |
|------------|----------|---------|
| `DELETE /v2/users/{userId}` | P1 | Delete all data for a user across all tables |
| `POST /v2/users/{userId}/suppress` | P1 | Stop processing events for this user, keep data |
| `POST /v2/users/{userId}/unsuppress` | P2 | Resume processing |
| Deletion propagation to destinations | P2 | Forward deletion requests to destinations that support it |
| Audit log for deletions | P1 | Log who deleted what and when |

**Acceptance criteria:**
- DELETE removes user from `source_users`, `product_events`, and all related tables
- Suppressed users' events are silently dropped at ingestion (202 response, no processing)
- Audit log entry created for every deletion/suppression

---

### Phase 2: Data Infrastructure

#### P2.1 User-Defined Transformations

| Requirement | Priority | Details |
|------------|----------|---------|
| JavaScript transformation engine | P1 | Users write JS functions that transform events in-flight |
| Transformation UI editor | P2 | Monaco-based editor in dashboard with syntax highlighting |
| AI transformation builder | P2 (differentiator) | Describe transformation in natural language, AI generates JS |
| Transformation testing | P1 | Test with sample events before deploying |
| Per-destination transforms | P1 | Different transform for each destination |

**Acceptance criteria:**
- User can write a JS function that receives an event and returns a modified event (or null to drop)
- Transformations run in a sandboxed V8 isolate (vm2 or isolated-vm)
- Transform errors are logged, original event is forwarded (fail-open configurable)
- AI builder generates working transform from natural language 80%+ of the time

#### P2.2 Identity Resolution

| Requirement | Priority | Details |
|------------|----------|---------|
| Identity graph storage | P1 | Store identity mappings: anonymousId <-> userId <-> email |
| Deterministic stitching | P1 | Merge on exact match of userId, email, or anonymousId |
| `alias` event handling | P1 | Merge identity graph nodes on alias |
| AI-enhanced matching | P2 (differentiator) | Fuzzy name matching, email domain clustering via Gemini |
| Cross-device resolution | P2 | Link identities across devices using identity graph |
| Identity API | P1 | `GET /v2/users/{id}/identities` - return all known identities |

**Acceptance criteria:**
- When user identifies with email on web, then logs in on mobile with userId, both are linked
- `alias` merges two identity graph nodes and all associated events
- Identity graph queryable via API

#### P2.3 Tracking Plans & Schema Validation

| Requirement | Priority | Details |
|------------|----------|---------|
| Define tracking plan (JSON Schema per event) | P1 | Specify required/optional properties per event name |
| Schema enforcement modes | P1 | `allow` (log violations), `drop` (reject violating events), `warn` (pass + alert) |
| AI anomaly detection | P2 (differentiator) | Detect schema drift, volume spikes, missing fields automatically |
| Tracking plan UI | P2 | Visual editor for tracking plans |
| Auto-generated tracking plan | P2 | Generate plan from existing event stream |

**Acceptance criteria:**
- Tracking plan defined as JSON Schema per event name per source
- Events violating plan are handled per enforcement mode
- Violations logged with event details and violation specifics

#### P2.4 Key Destination Connectors (20-30)

| Category | Destinations | Priority |
|----------|-------------|----------|
| CRM | Salesforce, HubSpot, Pipedrive | P1 |
| Analytics | Google Analytics 4, Amplitude, PostHog | P1 |
| Marketing | Braze, Customer.io, Mailchimp, Intercom | P1 |
| Communication | SendGrid, Twilio, Microsoft Teams | P2 |
| Data | Kafka, Elasticsearch, Redis | P2 |
| Warehouse | Redshift, ClickHouse, Databricks | P2 |

**Acceptance criteria:**
- Each destination follows the existing plugin architecture (`src/destinations/`)
- Each supports relevant event types (track, identify, page, group)
- Each has connection testing (`test()` method)
- Each has configuration validation

#### P2.5 Event Replay & Backup

| Requirement | Priority | Details |
|------------|----------|---------|
| Raw event storage | P1 | Store raw event payloads to object storage (S3/GCS) |
| Event replay API | P2 | `POST /v2/replay` with time range and destination filter |
| Retention policies | P1 | Configurable retention period per namespace |

---

### Phase 3: AI-Native Differentiation

These are Cairo's moat. No other open-source CDP has these.

#### P3.1 AI Transformation Builder

| Requirement | Details |
|------------|---------|
| Natural language to JS transform | User describes: "Drop events from internal IPs, enrich with company data, route enterprise leads to Salesforce" |
| AI validates generated transform | Run against sample events, show before/after |
| Iterative refinement | User says "also mask email addresses" and AI updates |

#### P3.2 Autonomous Data Quality Agent

| Requirement | Details |
|------------|---------|
| Schema drift detection | AI monitors event stream, detects new/missing fields |
| Volume anomaly detection | Alert on unusual volume spikes or drops |
| Auto-fix suggestions | AI suggests tracking plan updates when drift is detected |
| Learning over time | Agent improves detection based on confirmed alerts |

#### P3.3 Self-Healing Destinations

| Requirement | Details |
|------------|---------|
| API change detection | Detect when a destination API returns new errors |
| Auto-adaptation | AI adjusts field mappings when destination API changes |
| Fallback behavior | Queue events during outages, replay on recovery |

#### P3.4 Predictive Lead Scoring

| Requirement | Details |
|------------|---------|
| ML-based scoring | Train on conversion data to predict lead quality |
| Explainable scores | "This lead scored 87 because: Series B company, 5 page views in 2 days, matches ICP" |
| Score decay | Scores decrease over time without new activity |

#### P3.5 Conversational Analytics

| Requirement | Details |
|------------|---------|
| Expand existing `/api/ai/query` | Support complex multi-table queries |
| Action intents | "Enrich all A+ leads" executes, not just queries |
| Agent tools API | OpenAI-compatible tools endpoint per `AI_AGENT_NATIVE_ROADMAP.md` |

---

## 3. Non-Functional Requirements

| Requirement | Target | Details |
|------------|--------|---------|
| **Ingestion latency** | < 100ms p99 | Time from SDK send to event stored |
| **Destination delivery** | < 5s p99 | Time from ingestion to destination delivery (real-time mode) |
| **Throughput** | 10K events/sec | Single node; horizontally scalable |
| **Availability** | 99.9% | Health checks, graceful degradation |
| **SDK bundle size** | < 15KB gzipped | Browser SDK |
| **API backward compat** | 6 months | Old `/api/events/*` endpoints maintained |
| **Security** | OWASP Top 10 | Input validation, auth on all endpoints, no credential exposure |

---

## 4. Out of Scope (Deferred)

| Item | Reason |
|------|--------|
| Mobile SDKs (iOS/Android) | Wait for web SDKs to stabilize |
| Reverse ETL | Requires warehouse destinations to ship first |
| Profiles / Customer 360 UI | Requires identity resolution to ship first |
| Audience builder | Requires profiles to ship first |
| Pixel API (GET-based tracking) | Niche use case, defer |
| Consent management framework | Build after GDPR deletion API ships |
| GraphQL API | REST is sufficient for now |
| Marketplace / plugin store | Community too small to justify |

---

## 5. Success Criteria

| Phase | Metric | Target |
|-------|--------|--------|
| Phase 1 | SDKs published to npm | 3 packages live |
| Phase 1 | Event types supported | 6 (track, identify, page, screen, group, alias) |
| Phase 1 | Warehouse destinations | 2+ (BigQuery, Postgres) |
| Phase 2 | Destination connectors | 20+ |
| Phase 2 | Identity resolution | Working cross-device stitching |
| Phase 2 | Transformations | JS engine + AI builder |
| Phase 3 | AI features | 3+ shipped (transform builder, data quality agent, scoring) |
| Overall | Time to first event | < 5 minutes from install |
| Overall | GitHub stars | 500+ within 6 months of public launch |

---

## 6. Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| No test suite exists | High - regressions on every change | Phase 1 includes test infrastructure setup |
| `server.js` is a monolith (900+ lines) | Medium - hard to maintain | Refactor into modular route mounting |
| AI enrichment depends on Gemini API | Medium - single provider | Abstract AI provider, add OpenAI fallback |
| Warehouse schema evolution is complex | Medium - schema drift breaks pipelines | Auto-migration with additive-only schema changes |
| SDK quality unknown (never published) | Medium - first impression matters | Thorough manual testing before npm publish |
