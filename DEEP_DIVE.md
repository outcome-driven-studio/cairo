# Cairo CDP — Full Deep Dive

This document is a technical deep dive into the Cairo codebase: what it is, how it’s built, and how the pieces fit together.

---

## 1. What Cairo Is

**Cairo** is an open-source **Customer Data Platform (CDP)** that:

1. **Ingests** lead and event data from:
   - Outbound sales tools: **Lemlist**, **Smartlead** (campaigns, email/LinkedIn events)
   - Your product: **REST API** (`/api/events/track`, batch, identify) and **SDKs** (Node, React, browser) that send events into the same pipeline
   - Webhooks: Lemlist, Smartlead, and generic bridges (e.g. Notion → Discord)

2. **Enriches** leads using:
   - **Apollo** and **Hunter** (company/contact data)
   - **AI-first enrichment** (Google Gemini) for cost-effective company data, with fallback to Hunter/Apollo when confidence is low

3. **Scores** leads with a dual model:
   - **ICP score**: company fit (funding stage, headcount, revenue, etc.) from configurable rules and DB config
   - **Behavior score**: engagement (email opened/clicked/replied, LinkedIn, website visits)
   - Optional **AI-enhanced** scoring via Gemini

4. **Syncs** data to:
   - **PostgreSQL** (primary store: users, events, campaigns, namespaces)
   - **Attio** (CRM: lead scores, metadata)
   - **Mixpanel** (analytics)
   - **Slack** / **Discord** (alerts for important events)
   - **Webhooks** and other **destination plugins**

5. **Segments** data by **namespaces** (multi-tenant): campaign keywords map to per-tenant tables (e.g. `acme_corp_user_source`) so agencies or teams can keep client data isolated.

So in one sentence: **Cairo is a CDP that pulls in leads and product events, enriches and scores leads (with optional AI), and syncs everything to your database, CRM, analytics, and notifications, with optional multi-tenant namespacing.**

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INGESTION LAYER                                 │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│ Lemlist      │ Smartlead    │ Product      │ Webhooks     │ SDKs            │
│ (sync +      │ (sync +      │ REST API    │ (Lemlist,    │ (Node/React/     │
│  webhook)    │  webhook)    │ /api/events  │  Smartlead,  │  Browser)        │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴────────┬────────┘
       │              │              │              │                 │
       ▼              ▼              ▼              ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXPRESS API (server.js)                              │
│  /sync, /api/v1/sync, /api/events, /api/bridge, /webhook/*, /api/full-sync   │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
       ┌───────────────────────────────┼───────────────────────────────┐
       ▼                               ▼                               ▼
┌──────────────┐            ┌──────────────────┐            ┌─────────────────┐
│ Sync &       │            │ Event &          │            │ Full sync &      │
│ namespace    │            │ product events   │            │ periodic sync    │
│ (Lemlist,    │            │ (store, Mixpanel, │            │ (bulk historical│
│  Smartlead,  │            │  Attio, Slack,   │            │  + rate limits)   │
│  Attio)      │            │  Discord)         │            │                  │
└──────┬───────┘            └────────┬─────────┘            └────────┬────────┘
       │                              │                               │
       ▼                              ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL                                           │
│  playmaker_user_source, {namespace}_user_source, event_source, campaigns,    │
│  sent_events, sync_state, namespaces, scoring_config, background_jobs, ...     │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Attio        │  │ Mixpanel     │  │ Slack /      │  │ Webhooks /   │
│ (CRM sync)   │  │ (analytics)  │  │ Discord      │  │ Resend       │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

- **One Express app** serves all HTTP (and, after startup, WebSockets for live events). Routes are mounted in `server.js`.
- **Env** is loaded first via `src/utils/envLoader` (`.env.local` / `.env` / GCP Secret Manager on Cloud Run).
- **Sentry** is initialized early for errors and breadcrumbs.
- **PostgreSQL** is the single source of truth for users, events, campaigns, namespaces, and job state; external systems are targets of sync and forwarding.

---

## 3. Entry Point and Route Map

- **Entry:** `server.js`
  - Loads env, inits Sentry, creates Express app.
  - Serves static UI from `public/` (built from `ui/` by `build-ui.js`).
  - Mounts all API routes, then starts HTTP server and in-process periodic sync (if enabled).

**Main route groups:**

| Prefix / area | Purpose |
|---------------|--------|
| `GET /health`, `/health/simple`, `/health/detailed` | Health checks |
| `GET/POST /debug/*` | Integration and data-status debugging |
| `GET /` (static) | Dashboard SPA (React) |
| `/sync` | Legacy sync (initial/delta by source) |
| `/api/v1/sync` | New sync API (Lemlist/Smartlead users and events) |
| `/api/events` | Product events: track, batch, identify; used by SDKs and direct API |
| `/api/bridge` | Event bridge (e.g. Notion → Discord, non-persisted) |
| `/webhook/lemlist`, `/webhook/smartlead` | Inbound webhooks from campaigns |
| `/api/full-sync` | Bulk historical sync (execute, execute-async, status, jobs, health, config validate, namespaces) |
| `/api/periodic-sync` | Periodic sync control (status, start, stop, sync-now, history, config) |
| `/api/scoring` | Lead scoring (calculate, sync-to-attio, score-and-sync, master-score-all) |
| `/api/namespaces` | Multi-tenant namespace CRUD and stats |
| `/api/jobs` | Background job list, status, logs, stop |
| `/api/sync/*` | Destination sync (e.g. Mixpanel/Attio sync triggers) |
| `/api/dashboard` | Dashboard data (overview, stats) |
| `/api/system` | System status (for UI) |
| `/api/config`, `/api/config/*` | Sources/destinations and env config |
| `/api/ai/query` | Natural-language AI queries (Gemini) |
| `/api/test/*` | Test endpoints (Apollo, Hunter, DB, health) |
| `/api/process-linkedin-profiles`, `/api/external-profiles/status` | External profile processing |
| `/api/destinations` | Destination list and config (in destinationSyncRoutes) |

**Note:** Segment-style SDK routes (e.g. `/v2/batch`, `/v2/track`) are implemented in `src/routes/sdkRoutes.js` but are **not** mounted in `server.js`; the product event flow today is via `/api/events/*`.

---

## 4. Core Data Model (PostgreSQL)

- **Users (leads)**  
  - Default table: `playmaker_user_source`.  
  - Per-tenant: `{namespace}_user_source` (same schema).  
  - Key columns: `email`, `first_name`, `last_name`, `company`, `linkedin_profile`, `enrichment_profile` / `apollo_data` / `hunter_data`, `icp_score`, `behaviour_score`, `lead_score`, `lead_grade`, `enrichment_status`, `last_scored_at`, `apollo_enriched_at`, etc.

- **Events**  
  - `event_source`: `event_key` (unique), `event_type`, `platform`, `user_id`, `metadata`, `created_at`.  
  - Used for product events, and for campaign events from Lemlist/Smartlead.

- **Deduplication**  
  - `sent_events`: `event_key`, `platform`, etc., used to avoid re-sending the same event.

- **Campaigns**  
  - `campaigns`: `external_id`, `platform`, `name`, `status`, etc., from Lemlist/Smartlead.

- **Multi-tenant**  
  - `namespaces`: `name`, `keywords` (array for campaign matching), `table_name` (e.g. `acme_corp_user_source`).  
  - Sync and scoring logic uses `NamespaceService` / `tableManagerService` to resolve the correct user table.

- **Sync and jobs**  
  - `sync_state`: last sync time per platform/type.  
  - `background_jobs`, `periodic_sync_history`, full-sync job state for async runs.

- **Scoring**  
  - `playmaker_lead_scoring`: rules (e.g. funding_stage, headcount, event_type) and points; `LeadScoringService` also has hardcoded defaults.

Migrations live in `src/migrations/` (e.g. `000_create_core_tables.js`, namespaces, sent_events, config tables). Run with `npm run setup` or `node src/migrations/run_migrations.js`.

---

## 5. Key Services (Logic Layer)

- **Lead scoring** (`src/services/leadScoringService.js`)  
  - Loads rules from DB or uses built-in defaults.  
  - Computes ICP (company) and behavior (events) scores, optional Gemini-based enhancement.  
  - Writes `icp_score`, `behaviour_score`, `lead_score`, `lead_grade` to user tables.

- **Enrichment**  
  - `enrichmentService.js`: orchestration; can use Apollo, Hunter, and/or AI.  
  - `aiEnrichmentService.js`: Gemini-based company enrichment; confidence threshold triggers fallback to Hunter/Apollo.  
  - `apolloService.js`, `hunterService.js`: external APIs.

- **Sync from outbound tools**  
  - `src/services/sync/lemlistSync.js`, `smartleadSync.js`: fetch users and events from Lemlist/Smartlead, respect namespaces and write to the right user table and `event_source`.  
  - `fullSyncService.js`: bulk historical sync with configurable mode (full, date range, reset from date), platforms, namespaces, batch size, and rate limiting.  
  - `fullSyncJobService.js`: runs full sync as background jobs and tracks status.

- **Periodic sync** (`periodicSyncService.js`)  
  - Timer-based (e.g. every 4 hours): behavior scoring, optional ICP run, optional Attio sync (e.g. only leads with behavior score &gt; 0).  
  - Can be disabled on Cloud Run and replaced by Cloud Scheduler calling the same logic via API.

- **Product events** (`productEventRoutes.js`, `eventTrackingService.js`)  
  - Receive track/identify/batch from API.  
  - Persist to DB, forward to Mixpanel, Attio, Slack, Discord as configured.  
  - Optional WebSocket stream for live debugging (if `websocketService` is enabled).

- **Destinations** (`destinationService.js`, `src/destinations/*`)  
  - Plugin-style: each destination implements track/identify/page/group/alias (or subset).  
  - Examples: Slack, Mixpanel, Webhook, Discord, Resend.  
  - Destination sync routes expose which destinations exist and trigger syncs.

- **Namespaces** (`namespaceService.js`, `tableManagerService.js`)  
  - Resolve namespace from campaign keywords, create/find per-tenant tables, ensure schema alignment.

- **AI**  
  - `geminiService.js`: Gemini client.  
  - `aiEnrichmentService.js`, `aiInsightsService.js`, `aiDataTransformer.js`, `aiEventRouter.js`, `aiQueryRoutes.js`: enrichment, insights, and natural-language query.

---

## 6. Event Flow (Product Events)

1. Client sends **POST /api/events/track** (or batch/identify) with `user_email`, `event`, `properties`.
2. **ProductEventRoutes** finds or creates the user in `playmaker_user_source` (or namespace table if you add namespace to the API later).
3. Event is stored in `event_source` with a unique `event_key` and `platform: 'product'`.
4. **EventTrackingService** and destination logic send to Mixpanel, Attio (if configured), and Slack/Discord (if alert rules match).
5. If WebSocket server is up, the same event can be pushed to connected dashboard clients for live view.

SDKs (Node, React, browser) are designed to call the same track/identify/batch semantics (Segment-like); they are not yet mounted on a dedicated `/v2` path in the repo; the documented integration is via `/api/events/*`.

---

## 7. Full Sync and Periodic Sync

- **Full sync** (`/api/full-sync/*`)  
  - For large backfills: pull all (or date-range) users and events from Lemlist/Smartlead, dedupe, write to DB and optionally push to Attio/Mixpanel.  
  - Modes: full historical, date range, reset from date.  
  - Uses `FullSyncConfig` and platform-specific rate limiters to avoid blowing API quotas.  
  - Can run synchronously or async (job ID returned, status polled).

- **Periodic sync**  
  - In-process scheduler (e.g. every 4 hours) when `USE_PERIODIC_SYNC=true` and not on Cloud Run.  
  - Steps: behavior-only scoring (DB-only), then optional ICP scoring (with enrichment), then Attio sync for qualified leads.  
  - On GCP, same behavior can be driven by Cloud Scheduler hitting the periodic-sync API.

---

## 8. UI (Dashboard)

- **Stack:** React, Vite, React Router, TanStack Query, Tailwind; built by `build-ui.js` into `public/` and served at `/`.
- **Pages:** System (status), Integrations, Database (tables), Live Events (WebSocket), Connections (sources/destinations), Event Notifications.
- **API:** UI calls `/api/system/status`, `/api/dashboard/*`, `/api/config/*`, etc., and optionally connects to the event WebSocket for live events.

---

## 9. SDKs (packages/)

- **node-sdk**, **react-sdk**, **browser-sdk**: TypeScript, Segment-like API (track, identify, page, group, alias, batch).  
- Built with `npm run build:sdks`; not published to npm yet; use via `npm link` or `file:` in package.json.  
- They are intended to send events to the Cairo backend (e.g. `/api/events` or a future `/v2` endpoint).  
- See `packages/README.md` and `SDK_QUICK_START.md`.

---

## 10. Configuration and Deployment

- **Config:** Environment variables (see `.env.example`). Key ones: `POSTGRES_URL`/`DATABASE_URL`, `ATTIO_API_KEY`, `APOLLO_API_KEY`, `HUNTER_API_KEY`, `GEMINI_API_KEY`, `MIXPANEL_PROJECT_TOKEN`, `SLACK_WEBHOOK_URL`, `USE_PERIODIC_SYNC`, `SYNC_INTERVAL_HOURS`, etc.  
- **Secrets:** Optional GCP Secret Manager on Cloud Run; `envLoader` and `gcpSecrets.js` handle loading.  
- **Deploy:** Railway (recommended), Docker, or GCP (Cloud Run + Cloud Scheduler); see README and `GCP_DEPLOYMENT_GUIDE.md`.

---

## 11. Summary

Cairo is a **single-repo CDP**: Express backend, PostgreSQL, React dashboard, and TypeScript SDKs. It ingests from Lemlist, Smartlead, product API/SDKs, and webhooks; enriches and scores leads (with optional AI); stores everything in Postgres with optional namespaced tables; and syncs to Attio, Mixpanel, Slack, Discord, and other destinations. Full-sync and periodic-sync provide bulk and scheduled pipelines with rate limiting and job tracking. The deep dive above should give you a clear map of where each concern lives and how data flows from ingestion to storage and downstream systems.
