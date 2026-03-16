# Cairo CDP - Success Metrics & KPIs

**Version:** 1.0
**Date:** 2026-03-17

---

## 1. Engineering Metrics (per phase)

### Phase 1: Core CDP Parity

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Event types supported | 6/6 | Automated test suite |
| SDKs published to npm | 3/3 | npm registry check |
| SDK "time to first event" | < 5 min | Manual test with stopwatch |
| Ingestion latency (p99) | < 100ms | Prometheus / application logs |
| Warehouse delivery latency | < 60s | BigQuery arrival timestamp - receivedAt |
| Event validation accuracy | 100% invalid events rejected | Test suite |
| Test coverage | > 60% | Jest coverage report |
| Uptime (dogfood period) | 99.9% (< 43 min downtime/month) | GCP Cloud Run monitoring |
| Throughput (single node) | > 1K events/sec | k6 load test |

### Phase 2: Data Infrastructure

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Destination count | 20+ | Count in registry |
| Identity resolution accuracy | > 95% deterministic match | Test suite with known identity sets |
| Transformation execution time (p99) | < 50ms | Application metrics |
| Transformation sandbox escapes | 0 | Security test suite |
| Tracking plan violation detection rate | > 99% | Test with known-bad events |
| Dead-letter rate (destination failures) | < 0.1% | Dead-letter table count / total events |

### Phase 3: AI Differentiation

| Metric | Target | How to Measure |
|--------|--------|---------------|
| AI transform builder accuracy | > 80% working on first try | Manual evaluation on 20 prompts |
| Schema drift detection recall | > 90% | Inject known drift, measure detection |
| Predictive scoring AUC | > 0.75 | Model evaluation on holdout set |
| Agent API response time | < 2s | Endpoint monitoring |

---

## 2. Product Metrics

### Adoption

| Metric | 30 Day | 60 Day | 90 Day |
|--------|--------|--------|--------|
| GitHub stars | 200 | 500 | 1000 |
| npm installs (total) | 500 | 2000 | 5000 |
| npm installs (weekly) | 50 | 100 | 200 |
| Production deployments | 10 | 30 | 50 |
| Docker pulls | 100 | 500 | 1000 |

### Engagement

| Metric | Target | Frequency |
|--------|--------|-----------|
| Weekly active deployments (sending events) | 50% of total installs | Weekly |
| Events processed per deployment (median) | > 1K/day | Weekly |
| Destinations configured per deployment (median) | > 2 | Monthly |
| Dashboard DAU / Total deployments | > 30% | Weekly |
| Return users (used Cairo 2+ weeks in a row) | > 60% | Monthly |

### Developer Experience

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Time to first event (new user) | < 5 min | User testing sessions |
| Setup success rate (no errors) | > 80% | Onboarding funnel tracking |
| SDK integration effort | < 10 lines of code | Code sample review |
| Documentation satisfaction | > 4/5 | Survey beta users |
| GitHub issue response time | < 24 hours | GitHub metrics |
| GitHub issue resolution time | < 7 days (median) | GitHub metrics |

---

## 3. Reliability Metrics

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Uptime | 99.9% | < 99.5% in rolling 7 days |
| Ingestion error rate | < 0.1% | > 1% in 5 minutes |
| Destination delivery success rate | > 99% | < 95% per destination in 1 hour |
| Memory usage | < 512MB per instance | > 400MB |
| CPU usage (sustained) | < 70% | > 85% for 5 minutes |
| DB connection pool utilization | < 80% | > 90% |
| Event processing backlog | < 1000 events | > 5000 events |
| Dead-letter queue size | < 100 events/day | > 500 events/day |

---

## 4. Business Metrics

| Metric | 90 Day | 6 Month | 12 Month |
|--------|--------|---------|----------|
| Enterprise inquiries | 2 | 10 | 25 |
| Paying customers (managed hosting) | 0 | 1 | 5 |
| MRR | $0 | $500 | $5K |
| Community contributors | 3 | 10 | 25 |
| Blog mentions / external write-ups | 5 | 15 | 30 |

---

## 5. Competitive Benchmarks

### vs RudderStack OSS

| Dimension | RudderStack | Cairo Target | Notes |
|-----------|-------------|-------------|-------|
| Destinations | 200+ | 25+ | Quality over quantity; AI connector builder closes gap |
| SDKs | 10+ | 3 (web) | Mobile SDKs deferred |
| Event types | 6 | 6 | Full parity |
| AI enrichment | None | Built-in | Cairo unique |
| Lead scoring | None | Built-in | Cairo unique |
| Multi-tenant | No | Yes | Cairo unique |
| Self-hosted setup time | 30 min | 5 min | One-liner Docker |
| Stars (GitHub) | 7K+ | 1K (12 mo) | Different maturity |

### vs Segment

| Dimension | Segment | Cairo Target | Notes |
|-----------|---------|-------------|-------|
| Pricing | $120/mo+ (10K MTU) | Free (self-hosted) | Cairo advantage |
| Enrichment cost | $0.15/lead (via partners) | $0.005/lead (Gemini) | 30x cheaper |
| Destinations | 400+ | 25+ | Segment wins on breadth |
| Setup time | 5 min | 5 min | Parity |
| Warehouse support | Yes | Yes (Phase 1) | Parity |
| Identity resolution | Yes | Yes (Phase 2) | Parity |

---

## 6. Measurement Infrastructure

### What to Instrument

| Layer | Metrics | Tool |
|-------|---------|------|
| Application | Request latency, error rate, event throughput | Winston structured logs + Sentry |
| Database | Query latency, connection pool, table sizes | pg_stat_statements + Cloud SQL metrics |
| Destinations | Success/failure rate per destination, latency | Application metrics (per-destination counters) |
| SDKs | Batch size, retry count, error types | SDK telemetry (opt-in) |
| AI | Token usage, cost, response quality | Application logs |
| Business | Stars, installs, deployments | GitHub API, npm API, manual tracking |

### Dashboards to Build

1. **Operations Dashboard**: Event throughput, error rates, destination health, DB metrics
2. **Product Dashboard**: Active deployments, events per deployment, destination usage
3. **AI Dashboard**: Enrichment costs, scoring distribution, transform builder success rate
4. **Growth Dashboard**: Stars, installs, issues, contributors (weekly snapshot)
