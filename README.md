<div align="center">
  <img src="./logo.svg" alt="Cairo" width="200" height="auto">
  <br/><br/>
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
</div>

## 🚀 Overview

Cairo is an open-source Customer Data Platform (CDP) that unifies lead data from multiple sources, enriches it with company information, calculates lead scores, and syncs everything to your CRM and analytics tools.

### Key Features

- 📊 **Multi-Source Data Integration** - Pull data from Lemlist, Smartlead, and your product
- 🤖 **AI-First Enrichment** - Cost-effective lead enrichment with AI ($0.005/lead) + fallbacks
- 📈 **Intelligent Lead Scoring** - Combine ICP (Ideal Customer Profile) and behavioral scores
- 🔄 **Smart CRM Sync** - Only sync engaged leads (behavior > 0) to Attio CRM
- 📱 **Event Tracking** - Send events to Mixpanel and your database
- 🎯 **Webhook Support** - Real-time data ingestion via webhooks
- ⏰ **Periodic Auto-Sync** - Intelligent 4-hour behavior + weekly ICP scoring
- 📦 **REST API** - Complete API for all operations
- 🔧 **Background Jobs** - Async processing with status monitoring
- 🎛️ **Dashboard UI** - Built-in dashboard for monitoring and control

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [API Documentation](#-api-documentation)
- [Lead Scoring](#-lead-scoring)
- [Periodic Sync & Automation](#-periodic-sync--automation)
- [AI-First Enrichment](#-ai-first-enrichment)
- [Integrations](#-integrations)
- [Deployment](#-deployment)
- [Configuration](#-configuration)
- [Development](#-development)
- [Monitoring](#-monitoring)
- [Contributing](#-contributing)
- [License](#-license)

## 🎯 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14
- npm or yarn

### 1. Clone the Repository

```bash
git clone git@github.com:outcome-driven-studio/cairo.git
cd cairo
npm install
```

### 2. Set Up Environment Variables

Copy the environment template and configure it:

```bash
cp .env.example .env
# Edit .env with your actual values
```

Key environment variables you need to configure:

```env
# Database (Required)
DATABASE_URL=postgresql://user:password@localhost:5432/cairo
# OR for NeonDB:
# POSTGRES_URL=postgresql://user:password@host.neon.tech/db?sslmode=require

# Lead Enrichment APIs (at least one required for ICP scoring)
APOLLO_API_KEY=your_apollo_api_key  # Primary enrichment service
HUNTER_API_KEY=your_hunter_api_key  # Fallback enrichment service

# AI Enrichment (Cost-effective alternatives - optional)
PERPLEXITY_API_KEY=your_perplexity_key  # $0.005/lead
OPENAI_API_KEY=your_openai_key          # $0.01/lead
ANTHROPIC_API_KEY=your_anthropic_key    # $0.008/lead

# CRM Integration (Required for lead sync)
ATTIO_API_KEY=your_attio_api_key

# Analytics & Email Marketing (Optional)
MIXPANEL_PROJECT_TOKEN=your_mixpanel_token
LEMLIST_API_KEY=your_lemlist_api_key
SMARTLEAD_API_KEY=your_smartlead_api_key

# Server Configuration
PORT=3001
NODE_ENV=development

# Periodic Sync (Optional - auto-sync every 4 hours)
USE_PERIODIC_SYNC=true
SYNC_INTERVAL_HOURS=4
MIN_BEHAVIOR_SCORE_FOR_ATTIO=1
```

For a complete list of all environment variables, see [.env.example](.env.example).

### 3. Initialize Database

```bash
# Run migrations (creates all required tables)
npm run setup
```

Alternatively, you can run migrations directly:

```bash
node src/migrations/run_migrations.js
```

### 4. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3001`

### 5. Test the Setup

```bash
# Check health
curl http://localhost:3001/health

# Test integrations via API
curl -X POST http://localhost:3001/api/test/apollo \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "company": "Test Company"}'

# Check all service integrations
curl http://localhost:3001/api/test/health
```

## 📖 API Documentation

### Core Endpoints

#### Health & Status

| Endpoint           | Method | Description                        |
| ------------------ | ------ | ---------------------------------- |
| `/health`          | GET    | Basic health check                 |
| `/health/detailed` | GET    | Detailed health with dependencies  |
| `/health/simple`   | GET    | Simple health check for containers |

#### Lead Scoring

| Endpoint                        | Method | Description                                    |
| ------------------------------- | ------ | ---------------------------------------------- |
| `/api/scoring/calculate`        | POST   | Calculate lead scores for all users            |
| `/api/scoring/sync-to-attio`    | POST   | Sync existing scores to Attio CRM              |
| `/api/scoring/score-and-sync`   | POST   | Calculate scores and sync to Attio             |
| `/api/scoring/master-score-all` | POST   | Complete pipeline: Import, enrich, score, sync |

#### Event Tracking

| Endpoint               | Method | Description                         |
| ---------------------- | ------ | ----------------------------------- |
| `/api/events/track`    | POST   | Track single product event          |
| `/api/events/batch`    | POST   | Track multiple events in batch      |
| `/api/events/identify` | POST   | Identify/update user properties     |
| `/api/events/stats`    | GET    | Get event tracking statistics       |
| `/api/events/health`   | GET    | Check event tracking service health |

#### Periodic Sync Management

| Endpoint                       | Method | Description                          |
| ------------------------------ | ------ | ------------------------------------ |
| `/api/periodic-sync/status`    | GET    | Get periodic sync status & schedule  |
| `/api/periodic-sync/start`     | POST   | Start periodic sync                  |
| `/api/periodic-sync/stop`      | POST   | Stop periodic sync                   |
| `/api/periodic-sync/sync-now`  | POST   | Force sync now (supports type param) |
| `/api/periodic-sync/history`   | GET    | View sync history                    |
| `/api/periodic-sync/schedules` | GET    | View sync schedules                  |
| `/api/periodic-sync/config`    | PUT    | Update sync configuration            |

#### Background Jobs & Processing

| Endpoint                      | Method | Description                              |
| ----------------------------- | ------ | ---------------------------------------- |
| `/api/jobs`                   | GET    | List all background jobs                 |
| `/api/jobs/status/:jobName`   | GET    | Get specific job status                  |
| `/api/jobs/logs/:jobName`     | GET    | Get job logs                             |
| `/api/jobs/stop/:jobName`     | POST   | Stop running job                         |
| `/api/sync/users-background`  | POST   | Sync users to Attio in background        |
| `/api/sync/events-background` | POST   | Sync events to Attio in background       |
| `/api/sync/full-background`   | POST   | Full sync (users + events) in background |

#### Data Sync (Legacy & V1)

| Endpoint                        | Method | Description                     |
| ------------------------------- | ------ | ------------------------------- |
| `/api/v1/sync/lemlist/users`    | POST   | Sync users from Lemlist         |
| `/api/v1/sync/lemlist/events`   | POST   | Sync events from Lemlist        |
| `/api/v1/sync/smartlead/users`  | POST   | Sync users from Smartlead       |
| `/api/v1/sync/smartlead/events` | POST   | Sync events from Smartlead      |
| `/initial-sync`                 | GET    | Run initial sync (all sources)  |
| `/delta-sync`                   | GET    | Run delta sync (recent changes) |
| `/sync-status`                  | GET    | Check sync status               |

#### External Profile Processing

| Endpoint                         | Method | Description                                  |
| -------------------------------- | ------ | -------------------------------------------- |
| `/api/process-linkedin-profiles` | POST   | Process LinkedIn profiles with AI enrichment |
| `/api/external-profiles/status`  | GET    | Get external profile processing status       |

#### Webhooks

| Endpoint             | Method | Description                      |
| -------------------- | ------ | -------------------------------- |
| `/webhook/lemlist`   | POST   | Receive Lemlist webhook events   |
| `/webhook/smartlead` | POST   | Receive Smartlead webhook events |

#### Testing & Debugging

| Endpoint                 | Method | Description                        |
| ------------------------ | ------ | ---------------------------------- |
| `/api/test/apollo`       | POST   | Test Apollo enrichment             |
| `/api/test/apollo/usage` | GET    | Check Apollo credits & rate limits |
| `/api/test/hunter`       | POST   | Test Hunter enrichment             |
| `/api/test/enrichment`   | POST   | Test enrichment with fallback      |
| `/api/test/database`     | GET    | Test database connection           |
| `/api/test/health`       | GET    | Check all service integrations     |

#### Dashboard & Stats

| Endpoint           | Method | Description                   |
| ------------------ | ------ | ----------------------------- |
| `/`                | GET    | Dashboard UI                  |
| `/api/stats`       | GET    | Get system statistics         |
| `/api/sync/:type`  | POST   | Run specific sync type        |
| `/api/check/:type` | GET    | Check specific service status |

### Example Requests

#### Calculate Lead Scores with Enrichment

```bash
curl -X POST http://localhost:3001/api/scoring/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "forceReenrich": true,
    "maxEnrichment": 100,
    "maxUsers": 500
  }'
```

#### Track Product Event

```bash
curl -X POST http://localhost:3001/api/events/track \
  -H "Content-Type: application/json" \
  -d '{
    "user_email": "user@company.com",
    "event": "Feature Used",
    "properties": {
      "feature": "Export",
      "format": "CSV"
    }
  }'
```

#### Force Periodic Sync Now

```bash
# Full sync (behavior + ICP + sync to Attio)
curl -X POST http://localhost:3001/api/periodic-sync/sync-now \
  -H "Content-Type: application/json" \
  -d '{"type": "full"}'

# Behavior scoring only (no API calls)
curl -X POST http://localhost:3001/api/periodic-sync/sync-now \
  -H "Content-Type: application/json" \
  -d '{"type": "behavior"}'

# ICP scoring only (uses AI-first enrichment)
curl -X POST http://localhost:3001/api/periodic-sync/sync-now \
  -H "Content-Type: application/json" \
  -d '{"type": "icp"}'
```

#### Check Periodic Sync Status

```bash
curl http://localhost:3001/api/periodic-sync/status
```

#### Background Job Management

```bash
# List all running jobs
curl http://localhost:3001/api/jobs

# Check specific job status
curl http://localhost:3001/api/jobs/status/calculate-lead-scores

# Stop a running job
curl -X POST http://localhost:3001/api/jobs/stop/calculate-lead-scores
```

#### Process External LinkedIn Profiles

```bash
curl -X POST http://localhost:3001/api/process-linkedin-profiles \
  -H "Content-Type: application/json" \
  -d '{
    "profiles": [
      {
        "email": "john@company.com",
        "linkedinUrl": "https://linkedin.com/in/johndoe",
        "firstName": "John",
        "lastName": "Doe"
      }
    ]
  }'
```

### Postman Collection

Import the complete API collection for easy testing:

📥 **[Download Postman Collection](./cairo-complete-postman-collection.json)**

After importing:

1. Update the `base_url` variable to your deployment URL
2. Set any required API keys in the environment variables

## 📊 Lead Scoring

### How It Works

Cairo uses a dual-scoring system:

```
Total Lead Score = ICP Score (max 100) + Behavior Score (unlimited)
```

### ICP Score (Company Fit)

Based on Apollo-enriched company data:

| Criteria           | Points |
| ------------------ | ------ |
| **Company Size**   |        |
| 1-10 employees     | 10     |
| 11-50 employees    | 30     |
| 51-250 employees   | 40     |
| **Annual Revenue** |        |
| $1M - $10M         | 20     |
| $10M - $50M        | 40     |
| **Funding Stage**  |        |
| Seed               | 10     |
| Series A           | 15     |
| Series B           | 20     |

### Behavior Score (Engagement)

Based on user actions:

| Event            | Points |
| ---------------- | ------ |
| Email Opened     | 5      |
| Email Clicked    | 5      |
| Email Replied    | 10     |
| LinkedIn Message | 10     |
| Website Visit    | 5      |

### Lead Grades

| Total Score | Grade |
| ----------- | ----- |
| 90+         | A+    |
| 80-89       | A     |
| 70-79       | B+    |
| 60-69       | B     |
| 50-59       | C+    |
| 40-49       | C     |
| 20-39       | D     |
| <20         | F     |

## ⏰ Periodic Sync & Automation

Cairo includes intelligent periodic sync that optimizes API costs while maintaining data freshness.

### How It Works

1. **Every 4 hours**: Behavior scoring (database-only, no API calls)
2. **Weekly**: ICP scoring for unscored leads (AI-first enrichment)
3. **Smart Attio sync**: Only sync leads with behavior score > 0

### Configuration

Enable periodic sync in your environment:

```env
USE_PERIODIC_SYNC=true
SYNC_INTERVAL_HOURS=4
ENABLE_WEEKLY_ICP_SCORING=true
ICP_SCORING_DAY=0  # Sunday
ICP_SCORING_HOUR=2  # 2 AM
MIN_BEHAVIOR_SCORE_FOR_ATTIO=1
```

### Benefits

- **Cost Optimized**: ICP scoring only for new/unscored leads
- **CRM Quality**: Only engaged leads enter Attio
- **Performance**: Behavior scoring processes 1000+ users quickly
- **Flexibility**: Manual triggers available for all sync types

### Manual Control

```bash
# Check periodic sync status
curl http://localhost:3001/api/periodic-sync/status

# Force different sync types
curl -X POST http://localhost:3001/api/periodic-sync/sync-now \
  -H "Content-Type: application/json" \
  -d '{"type": "behavior"}'  # or "icp" or "full"
```

## 🤖 AI-First Enrichment

Cairo supports cost-effective AI enrichment as the primary method, falling back to traditional APIs when needed.

### Cost Comparison

| Method          | Cost per Lead | Data Quality | Speed  |
| --------------- | ------------- | ------------ | ------ |
| AI (Perplexity) | $0.005        | High         | Fast   |
| AI (OpenAI)     | $0.01         | High         | Fast   |
| AI (Anthropic)  | $0.008        | High         | Fast   |
| Hunter.io       | $0.08         | Medium       | Medium |
| Apollo          | $0.15         | Very High    | Slow   |

### How It Works

1. **AI Primary**: Uses LLM to extract company data from web sources
2. **Confidence Check**: AI scores its own confidence (0-100%)
3. **Smart Fallback**: If confidence < 60%, tries Hunter.io then Apollo
4. **Result**: 95%+ cost reduction with comparable data quality

### Configuration

```env
# Enable AI enrichment
ENABLE_AI_ENRICHMENT=true

# AI API keys (at least one required)
PERPLEXITY_API_KEY=your_key    # Recommended - cheapest
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key

# Fallback enrichment
HUNTER_API_KEY=your_key        # Fallback 1
APOLLO_API_KEY=your_key        # Fallback 2
```

## 🔌 Integrations

### Apollo

Used for lead enrichment with company data:

- Employee count
- Annual revenue
- Funding information
- Technologies used
- Company industry

### Attio CRM

Syncs lead scores and metadata to custom fields:

- `icp_score` - Company fit score
- `behaviour_score` - Engagement score
- `lead_score` - Total score
- `icp` - Letter grade (A+, B, etc.)
- `scoring_meta` - JSON metadata

### Mixpanel

Tracks all events for analytics:

- User properties sync
- Event tracking with properties
- Real-time analytics

### Lemlist & Smartlead

Imports campaign data and tracks engagement:

- Email events (sent, opened, clicked, replied)
- LinkedIn events
- Campaign performance

## 🚀 Deployment

### Railway (Recommended)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Click the button above
2. Add environment variables
3. Deploy

### Docker

```bash
# Build image
docker build -t cairo .

# Run container
docker run -p 3001:3001 --env-file .env cairo
```

### Manual Deployment

1. Set up PostgreSQL database
2. Configure environment variables
3. Run migrations
4. Start with PM2:

```bash
npm install -g pm2
pm2 start server.js --name cairo
pm2 save
pm2 startup
```

## 🔧 Configuration

### Database Schema

The system uses these main tables:

- `playmaker_user_source` - User profiles with scores
- `event_source` - All tracked events
- `campaigns` - Campaign data
- `sent_events` - Deduplication tracking
- `scoring_config` - Scoring rules

### Environment Variables

See [.env.example](./.env.example) for all available options.

### Scoring Configuration

Customize scoring rules in `scoring_config` table or via API.

## 🛠️ Development

### Running Tests

```bash
# Run test suite
npm test
```

### Testing Integrations via API

```bash
# Test Apollo enrichment
curl -X POST http://localhost:3001/api/test/apollo \
  -H "Content-Type: application/json" \
  -d '{"email": "test@company.com", "company": "Test Company"}'

# Test Hunter enrichment
curl -X POST http://localhost:3001/api/test/hunter \
  -H "Content-Type: application/json" \
  -d '{"email": "test@company.com", "company": "Test Company"}'

# Test database connection
curl http://localhost:3001/api/test/database

# Test all service integrations
curl http://localhost:3001/api/test/health
```

### Development Mode

```bash
npm run dev
```

This starts the server with nodemon for auto-reloading and debug logging.

### Database Migrations

```bash
# Run migrations (recommended)
npm run setup

# Or run migrations directly
node src/migrations/run_migrations.js
```

Migrations are automatically run when the server starts, but you can run them manually during development.

## 📈 Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

### Job Status

```bash
# Check scoring job status
curl http://localhost:3001/api/jobs/status/calculate-lead-scores

# View job logs
curl http://localhost:3001/api/jobs/logs/calculate-lead-scores
```

### Error Tracking

Configure Sentry for production error monitoring:

1. Create account at [sentry.io](https://sentry.io)
2. Add `SENTRY_DSN` to environment variables
3. Errors will be automatically tracked

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style

- Use ESLint for code linting
- Follow existing patterns in the codebase
- Add tests for new features
- Update documentation

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with Node.js and Express
- PostgreSQL for data storage
- Apollo.io for enrichment
- Attio for CRM
- Mixpanel for analytics

## 📞 Support

- 🐛 Issues: [GitHub Issues](https://github.com/outcome-driven-studio/cairo/issues)

## 🗺️ Roadmap

- [ ] Add more data sources (HubSpot, Salesforce)
- [ ] Machine learning for score optimization
- [ ] Custom scoring rules UI
- [ ] Data warehouse export (Snowflake, BigQuery)
- [ ] Multi-tenant support
- [ ] GraphQL API
- [ ] Real-time WebSocket updates

---

<div align="center">
  Made with ❤️ by the Cairo Team
  <br>
  <a href="https://github.com/outcome-driven-studio/cairo">⭐ Star us on GitHub</a>
</div>
