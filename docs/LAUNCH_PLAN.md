# Cairo CDP - Launch Plan

**Version:** 1.0
**Date:** 2026-03-17

---

## 1. Launch Phases

### Phase A: Internal Dogfooding (Weeks 1-6)

**Goal:** Use Cairo CDP on our own products. Every bug found internally is a bug users never see.

| Action | Details |
|--------|---------|
| Install Cairo SDKs on our own products | Track real events through the full pipeline |
| Route events to BigQuery | Validate warehouse destination with real data |
| Test enrichment + scoring on real leads | Confirm AI enrichment works at scale |
| Break things intentionally | Edge cases: high volume bursts, malformed events, destination outages |
| Fix everything that breaks | Polish based on real usage |

**Exit criteria:**
- 7 consecutive days of stable operation
- 10K+ events processed without data loss
- All 6 event types working end-to-end
- SDKs published to npm (can be unlisted/beta)

---

### Phase B: Private Beta (Weeks 7-10)

**Goal:** 5-10 external users running Cairo in production. Get real feedback.

| Action | Details |
|--------|---------|
| Recruit 5-10 beta users | Target: startups currently on Segment Free/RudderStack OSS |
| Provide white-glove onboarding | 1:1 setup calls, dedicated Slack channel |
| Collect structured feedback weekly | What works, what's broken, what's missing |
| Track "time to first event" metric | Target: < 5 minutes |
| Iterate based on feedback | Fix top 3 issues each week |

**Beta user criteria:**
- Running a production web app with event tracking needs
- Currently using Segment, RudderStack, or raw API calls
- Willing to give weekly feedback for 4 weeks
- Ideally sending 1K-100K events/day

**Recruiting channels:**
- Direct outreach to engineers at seed/Series A startups
- Indie Hackers, relevant Discord communities
- X/Twitter DMs to devs who've complained about Segment pricing

**Exit criteria:**
- 5+ beta users running in production
- NPS > 7 from beta users
- No critical bugs reported in final week
- Time to first event < 5 minutes consistently

---

### Phase C: Public Launch (Week 12)

**Goal:** Public awareness. Get Cairo on the radar of engineers evaluating CDPs.

#### Launch Day Sequence

| Time | Action |
|------|--------|
| T-7 days | Final QA pass, README polish, demo video recorded |
| T-3 days | Write HN post draft, ProductHunt listing draft |
| T-1 day | Queue ProductHunt launch, prep HN post |
| Launch Day AM | ProductHunt goes live |
| Launch Day (10am PT) | Post on Hacker News: "Show HN: Cairo - Open-source CDP with AI enrichment" |
| Launch Day | Share on X/Twitter, LinkedIn, relevant Discords |
| Launch Day | Monitor HN comments and respond to every question |
| T+1 day | Follow-up blog post: "Why we built Cairo" |
| T+3 days | Reach out to dev tool newsletters |
| T+7 days | Post launch retrospective, plan next sprint based on feedback |

#### Launch Assets Required

| Asset | Status | Owner |
|-------|--------|-------|
| README with clear value prop and quick start | TODO | - |
| 2-minute demo video (Loom or recorded) | TODO | - |
| Landing page (can be GitHub README initially) | TODO | - |
| "Why Cairo" blog post | TODO | - |
| Comparison page: Cairo vs Segment vs RudderStack | TODO | - |
| Quick start guide (5 minutes to first event) | Exists (needs update) | - |
| Docker one-liner for local setup | TODO | - |
| ProductHunt listing | TODO | - |
| Show HN post | TODO | - |

---

## 2. Positioning & Messaging

### One-Liner

> Cairo is the open-source CDP with built-in AI enrichment. Collect, enrich, score, and route customer data for free.

### Key Messages

| Audience | Message |
|----------|---------|
| **vs Segment** | "Segment charges by event volume. Cairo is free and self-hosted. Plus, built-in AI enrichment at $0.005/lead vs $0.15." |
| **vs RudderStack** | "RudderStack is great plumbing. Cairo adds AI enrichment, lead scoring, and a dashboard out of the box." |
| **vs building from scratch** | "Stop duct-taping together webhooks, Zapier, and spreadsheets. Cairo gives you SDKs, a pipeline, and 20+ destinations in one deploy." |

### Feature Hierarchy (what to lead with)

1. **Free, self-hosted CDP** (the hook)
2. **AI enrichment at 30x lower cost** (the differentiator)
3. **20+ destinations out of the box** (the credibility)
4. **Multi-tenant by default** (for agencies)
5. **Published SDKs** (developer experience)
6. **Lead scoring built in** (unique feature)

---

## 3. Growth Plan (Post-Launch)

### Month 1-2: Content + SEO

| Action | Details |
|--------|---------|
| Blog: "Migrating from Segment to Cairo in 30 minutes" | Migration guide with code examples |
| Blog: "How we enriched 50K leads for $250 with Cairo" | Cost comparison story |
| Blog: "Self-hosted CDP on a $50/month server" | Infrastructure guide |
| SEO: Target "open source CDP", "Segment alternative", "free CDP" | Long-tail content |
| Respond to every GitHub issue within 24 hours | Community trust |

### Month 3-4: Integrations + Partnerships

| Action | Details |
|--------|---------|
| Publish to Railway, Render, Heroku marketplaces | One-click deploy buttons |
| Docker Hub official image | `docker run cairo-cdp/cairo` |
| Write integration guides for popular frameworks | Next.js, Remix, SvelteKit, Express |
| Partner with complementary tools | PostHog, Plausible, Cal.com |

### Month 5-6: Community + Enterprise

| Action | Details |
|--------|---------|
| Discord community | Support, feature requests, showcase |
| Monthly release cycle | Predictable cadence builds trust |
| Contributor program | Good first issues, contributor guide, swag |
| Enterprise inquiry page | Managed hosting, custom integrations, SLA |

---

## 4. Launch Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| HN post flops | Low awareness | Medium | Have backup channels (newsletters, communities) |
| Critical bug on launch day | Reputation damage | Medium | 7-day dogfood period + beta testing catches most issues |
| "Why not just use RudderStack?" | Positioning weakness | High | Clear differentiation messaging: AI enrichment, scoring, dashboard |
| Scale issues with real traffic | User churn | Low | Start with <100K events/day users, scale later |
| Security vulnerability found publicly | Trust damage | Low | Security audit before launch, responsible disclosure policy |

---

## 5. Success Metrics (30/60/90 days)

### 30 Days Post-Launch

| Metric | Target |
|--------|--------|
| GitHub stars | 200+ |
| npm installs (combined SDKs) | 500+ |
| Production deployments (that we know of) | 10+ |
| GitHub issues (signal of engagement) | 30+ |
| Time to first event (new users) | < 5 min |

### 60 Days Post-Launch

| Metric | Target |
|--------|--------|
| GitHub stars | 500+ |
| npm installs/week | 100+ |
| Active contributors (non-team) | 3+ |
| Blog posts/mentions by others | 5+ |
| Enterprise inquiries | 2+ |

### 90 Days Post-Launch

| Metric | Target |
|--------|--------|
| GitHub stars | 1000+ |
| Monthly active deployments | 50+ |
| Destinations available | 25+ |
| Community Discord members | 100+ |
| Revenue (enterprise/managed) | First paying customer |
