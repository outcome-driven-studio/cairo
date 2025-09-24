<div align="center">
  <img src="./logo.svg" alt="Cairo" width="200" height="auto">
  <br/><br/>
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
</div>

## 🚀 Overview

Cairo CDP is an open-source Customer Data Platform that collects, processes, and routes customer data from any source to any destination. Transform your applications into a comprehensive data ecosystem with real-time event tracking, intelligent routing, and powerful analytics.

## 📖 Documentation

- **👤 [User Guide](./USER_GUIDE.md)** - Complete guide for non-technical users
- **⚡ [Quick Start](./SDK_QUICK_START.md)** - Get started with SDKs in 5 minutes
- **🛣️ [Roadmap](./CAIRO_CDP_ROADMAP.md)** - Platform evolution and features
- **📚 [Technical Docs](./docs/README.md)** - API references and advanced guides

### 🌟 Key Features

**🔌 Universal SDK Support**
- Node.js, React/Next.js, and Browser JavaScript SDKs
- Segment-compatible API for easy migration
- TypeScript support with full type definitions
- Event batching, retries, and queue management

**🎯 Intelligent Routing**
- Plugin-based destination architecture
- Pre-built integrations: Slack, Mixpanel, Webhooks
- Custom transformation rules
- Real-time and batch processing

**📊 Real-Time Analytics**
- Live event debugging with WebSocket streaming
- Modern React dashboard with dark/light themes
- Advanced filtering and search capabilities
- Export functionality for analysis

**🏢 Enterprise Ready**
- Multi-tenant data segregation via namespaces
- GDPR/CCPA compliant with consent management
- Auto-scaling with intelligent rate limiting
- Comprehensive monitoring and health checks

**🤖 AI-Powered Enrichment**
- Cost-effective lead enrichment ($0.005/lead)
- Intelligent lead scoring (ICP + behavioral)
- Smart CRM sync for engaged leads only
- Background job processing with status monitoring

## 🎯 How to Use Cairo CDP

### For Non-Technical Users
1. **Access the Dashboard** - Open Cairo CDP in your browser
2. **Monitor Live Events** - See customer actions in real-time
3. **Configure Destinations** - Set up Slack notifications and analytics
4. **Review Analytics** - Use charts and reports to understand customer behavior

👉 **[Complete User Guide](./USER_GUIDE.md)** - Step-by-step instructions

### For Developers
1. **Install SDK** - Choose Node.js, React, or Browser SDK
2. **Track Events** - Add customer action tracking to your app
3. **Configure Routing** - Set up data destinations
4. **Monitor & Debug** - Use real-time debugging tools

👉 **[SDK Quick Start](./SDK_QUICK_START.md)** - Get coding in 5 minutes

## 📋 Table of Contents

- [How to Use](#-how-to-use-cairo-cdp)
- [Quick Start](#-quick-start)
- [Multi-Tenant Namespaces](#-multi-tenant-namespaces)
- [API Documentation](#-api-documentation)
- [🔄 Full Sync System](#-full-sync-system)
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

You can set up your environment variables in two ways:

**Option A: Interactive Setup (Recommended)**

```bash
# Run the interactive setup script
npm run setup-env
# OR
./setup-env.sh
```

**Option B: Manual Setup**

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
PORT=8080
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

This command will:

- ✅ Create all core database tables (`playmaker_user_source`, `event_source`, `campaigns`, etc.)
- ✅ Initialize namespace system (`namespaces` table with default namespace)
- ✅ Set up proper indexes for performance
- ✅ Insert default lead scoring configurations
- ✅ Handle existing tables gracefully (no data loss)

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

The API will be available at `http://localhost:8080`

### 5. Test the Setup

```bash
# Check health
curl http://localhost:8080/health

# Test integrations via API
curl -X POST http://localhost:8080/api/test/apollo \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "company": "Test Company"}'

# Check all service integrations
curl http://localhost:8080/api/test/health

# Test namespace system
curl http://localhost:8080/api/namespaces
```

## 🏢 Multi-Tenant Namespaces

Cairo supports **multi-tenant data segregation** through namespaces, allowing agencies and service providers to separate data for different customers/clients automatically based on campaign keywords.

### How It Works

1. **Campaign Detection**: Cairo analyzes campaign names from Lemlist and Smartlead
2. **Keyword Matching**: Matches campaigns against configured keywords per namespace
3. **Automatic Routing**: Routes data to separate `{namespace}_user_source` tables
4. **Isolated CRM Sync**: Each namespace can have its own Attio configuration

### Example Use Cases

- **Marketing Agency**: Separate data for "ACME Corp", "TechStart", "Startup Co" clients
- **SaaS Company**: Segment data by product lines or customer tiers
- **Consulting Firm**: Isolate client data for compliance and reporting

### Quick Example

```bash
# Create a new namespace for ACME Corp
curl -X POST http://localhost:8080/api/namespaces \
  -H "Content-Type: application/json" \
  -d '{
    "name": "acme-corp",
    "keywords": ["ACME", "ACME Corp", "acme-corp"]
  }'

# Now any Lemlist/Smartlead campaigns with "ACME Corp Q1 Campaign"
# will automatically route to the acme_corp_user_source table
```

### Namespace Management

| Endpoint                       | Method | Description              |
| ------------------------------ | ------ | ------------------------ |
| `/api/namespaces`              | GET    | List all namespaces      |
| `/api/namespaces`              | POST   | Create new namespace     |
| `/api/namespaces/{name}`       | GET    | Get specific namespace   |
| `/api/namespaces/{name}`       | PUT    | Update namespace         |
| `/api/namespaces/{name}/stats` | GET    | Get namespace statistics |

### Key Benefits

✅ **Zero Configuration**: Works immediately with existing sync processes  
✅ **Automatic Detection**: Smart keyword matching for campaign routing  
✅ **Complete Isolation**: Each customer gets their own database table  
✅ **Scalable**: Add unlimited customer namespaces via API  
✅ **Backward Compatible**: No changes to existing functionality

### Examples

```bash
# List all namespaces
curl http://localhost:8080/api/namespaces

# Get namespace statistics
curl http://localhost:8080/api/namespaces/acme-corp/stats

# Update namespace keywords
curl -X PUT http://localhost:8080/api/namespaces/acme-corp \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["ACME", "ACME Corp", "acme-corp", "Acme Corporation"]
  }'
```

## 📖 API Documentation

### Core Endpoints

#### Health & Status

| Endpoint           | Method | Description                        |
| ------------------ | ------ | ---------------------------------- |
| `/health`          | GET    | Basic health check                 |
| `/health/detailed` | GET    | Detailed health with dependencies  |
| `/health/simple`   | GET    | Simple health check for containers |

#### Namespace Management

| Endpoint                       | Method | Description                    |
| ------------------------------ | ------ | ------------------------------ |
| `/api/namespaces`              | GET    | List all active namespaces     |
| `/api/namespaces`              | POST   | Create new namespace           |
| `/api/namespaces/{name}`       | GET    | Get specific namespace details |
| `/api/namespaces/{name}`       | PUT    | Update namespace configuration |
| `/api/namespaces/{name}/stats` | GET    | Get namespace usage statistics |

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

**New:** Event tracking now supports automatic Slack alerts for important events like signups, payments, and high-value actions. See [Event Tracking Guide](./docs/EVENT_TRACKING_GUIDE.md#slack-alerts) for configuration.

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

#### Create and Manage Namespaces

```bash
# Create a new namespace for a client
curl -X POST http://localhost:8080/api/namespaces \
  -H "Content-Type: application/json" \
  -d '{
    "name": "tech-startup",
    "keywords": ["TechStartup", "Tech Startup Inc", "TSI"],
    "attio_config": {
      "workspace": "tech-startup-workspace"
    }
  }'

# List all namespaces
curl http://localhost:8080/api/namespaces

# Get specific namespace details
curl http://localhost:8080/api/namespaces/tech-startup

# Update namespace keywords
curl -X PUT http://localhost:8080/api/namespaces/tech-startup \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["TechStartup", "Tech Startup Inc", "TSI", "TechStart"]
  }'

# Get namespace usage statistics
curl http://localhost:8080/api/namespaces/tech-startup/stats
```

#### Calculate Lead Scores with Enrichment

```bash
curl -X POST http://localhost:8080/api/scoring/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "forceReenrich": true,
    "maxEnrichment": 100,
    "maxUsers": 500
  }'
```

#### Track Product Event

```bash
curl -X POST http://localhost:8080/api/events/track \
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
curl -X POST http://localhost:8080/api/periodic-sync/sync-now \
  -H "Content-Type: application/json" \
  -d '{"type": "full"}'

# Behavior scoring only (no API calls)
curl -X POST http://localhost:8080/api/periodic-sync/sync-now \
  -H "Content-Type: application/json" \
  -d '{"type": "behavior"}'

# ICP scoring only (uses AI-first enrichment)
curl -X POST http://localhost:8080/api/periodic-sync/sync-now \
  -H "Content-Type: application/json" \
  -d '{"type": "icp"}'
```

#### Check Periodic Sync Status

```bash
curl http://localhost:8080/api/periodic-sync/status
```

#### Background Job Management

```bash
# List all running jobs
curl http://localhost:8080/api/jobs

# Check specific job status
curl http://localhost:8080/api/jobs/status/calculate-lead-scores

# Stop a running job
curl -X POST http://localhost:8080/api/jobs/stop/calculate-lead-scores
```

#### Process External LinkedIn Profiles

```bash
curl -X POST http://localhost:8080/api/process-linkedin-profiles \
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

Import the complete API collection for easy testing and development:

📥 **[Download Postman Collection](./cairo-api-collection.json)**

**What's Included:**

- 🏥 **Health & System** - Health checks and monitoring
- 🏢 **Namespace Management** - Multi-tenant data segregation
- 📊 **Dashboard** - Dashboard UI and stats endpoints
- 🔄 **Legacy Sync** - Original sync endpoints
- 🆕 **New Sync API (v1)** - Enhanced sync with better performance
- 🚀 **Full Sync System** - Bulk sync with intelligent rate limiting
- ⚙️ **Background Jobs** - Asynchronous processing endpoints
- 👥 **External Profiles** - LinkedIn profile processing
- 📱 **Product Events** - Event tracking and analytics
- ⏰ **Periodic Sync** - Automated sync scheduling
- 🧪 **Testing** - API testing and integration validation
- 📊 **Scoring** - Lead scoring and calculation endpoints

**Setup Instructions:**

1. Import the collection file into Postman
2. Update the `base_url` variable to your deployment URL (default: `http://localhost:8080`)
3. Configure environment variables for API keys if testing external integrations
4. Each endpoint includes detailed descriptions and example request bodies

## 🔄 Full Sync System

Cairo includes a powerful **full synchronization system** designed to handle massive data imports and historical syncs from Smartlead and Lemlist while preventing duplicates and maintaining data integrity.

### 🎯 Key Capabilities

- ✅ **Massive Scale** - Sync hundreds of thousands of records efficiently
- ✅ **3 Sync Modes** - Full historical, date range, and reset from date
- ✅ **Smart Rate Limiting** - API-specific limits prevent quota exhaustion
- ✅ **Deduplication Built-In** - Events by key, users by email
- ✅ **Namespace Control** - Sync all or specific client partitions
- ✅ **Progress Tracking** - Real-time updates with ETA calculations
- ✅ **Background Processing** - Async jobs with webhook callbacks
- ✅ **Mixpanel Integration** - Automatic analytics tracking

### 📋 API Endpoints

| Endpoint                         | Method | Description                       |
| -------------------------------- | ------ | --------------------------------- |
| `/api/full-sync/execute`         | POST   | Execute synchronous full sync     |
| `/api/full-sync/execute-async`   | POST   | Execute asynchronous full sync    |
| `/api/full-sync/status/:jobId`   | GET    | Get job status and progress       |
| `/api/full-sync/health`          | GET    | Check full sync system health     |
| `/api/full-sync/config/validate` | POST   | Validate sync configuration       |
| `/api/full-sync/namespaces`      | GET    | Get available namespaces for sync |
| `/api/full-sync/jobs`            | GET    | List job history and management   |

### 🎮 Sync Modes

#### 1. Full Historical Sync

Syncs all historical data, ignoring `last_sync_time` timestamps.

```bash
curl -X POST http://localhost:8080/api/full-sync/execute-async \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "FULL_HISTORICAL",
    "platforms": ["smartlead", "lemlist"],
    "namespaces": "all",
    "batchSize": 100,
    "enableMixpanelTracking": true
  }'
```

#### 2. Date Range Sync

Syncs data from a specific time period with precise control.

```bash
curl -X POST http://localhost:8080/api/full-sync/execute-async \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "DATE_RANGE",
    "platforms": ["smartlead"],
    "namespaces": ["playmaker"],
    "dateRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-31T23:59:59.999Z"
    },
    "batchSize": 50
  }'
```

#### 3. Reset From Date

Resets sync timestamps and syncs from a specific date forward.

```bash
curl -X POST http://localhost:8080/api/full-sync/execute-async \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "RESET_FROM_DATE",
    "platforms": ["lemlist"],
    "namespaces": ["client1", "client2"],
    "resetDate": "2024-02-01T00:00:00.000Z",
    "batchSize": 75,
    "rateLimitDelay": 1000
  }'
```

### 📊 Configuration Options

| Parameter                | Type         | Description                                             |
| ------------------------ | ------------ | ------------------------------------------------------- |
| `mode`                   | String       | `FULL_HISTORICAL`, `DATE_RANGE`, or `RESET_FROM_DATE`   |
| `platforms`              | Array        | `["smartlead"]`, `["lemlist"]`, or both                 |
| `namespaces`             | String/Array | `"all"` or specific namespaces `["client1", "client2"]` |
| `dateRange`              | Object       | Required for DATE_RANGE mode: `{start, end}`            |
| `resetDate`              | String       | Required for RESET_FROM_DATE mode                       |
| `batchSize`              | Number       | Records per batch (1-1000, default: 100)                |
| `rateLimitDelay`         | Number       | Milliseconds between requests (default: 500)            |
| `enableMixpanelTracking` | Boolean      | Track sync events in Mixpanel                           |
| `callbackUrl`            | String       | Webhook URL for job completion notifications            |

### 🚨 Rate Limits & Performance

The system includes intelligent rate limiting based on API documentation:

| Platform      | Requests/Sec | Max Batch Size | Notes                 |
| ------------- | ------------ | -------------- | --------------------- |
| **Smartlead** | 10           | 100            | Conservative limits   |
| **Lemlist**   | 10           | 50             | Respects 20/2sec rule |
| **Attio**     | 5            | 25             | CRM-specific limits   |
| **Mixpanel**  | 50           | 200            | Analytics-optimized   |
| **Database**  | 100          | 500            | High-performance      |

### 📈 Progress Monitoring

#### Check Job Status

```bash
curl -X GET http://localhost:8080/api/full-sync/status/full-sync-1234567890
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "full-sync-1234567890",
    "status": "running",
    "progress": {
      "processed": 2500,
      "total": 10000,
      "percentage": 25,
      "eta": "15 minutes"
    },
    "result": {
      "platforms": {
        "smartlead": { "users": 1200, "events": 8500 },
        "lemlist": { "users": 800, "events": 4200 }
      }
    }
  }
}
```

#### System Health Check

```bash
curl -X GET http://localhost:8080/api/full-sync/health
```

#### Job History

```bash
curl -X GET "http://localhost:8080/api/full-sync/jobs?limit=20&status=completed"
```

### ⚙️ Configuration Validation

Validate your sync configuration before executing:

```bash
curl -X POST http://localhost:8080/api/full-sync/config/validate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "DATE_RANGE",
    "platforms": ["smartlead"],
    "namespaces": ["playmaker"],
    "dateRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-31T23:59:59.999Z"
    }
  }'
```

### 🔧 Production Best Practices

1. **Start Small**: Begin with `batchSize: 25-50` for testing
2. **Monitor Health**: Use `/api/full-sync/health` for system monitoring
3. **Use Date Range**: For regular syncs, avoid `FULL_HISTORICAL`
4. **Namespace Filtering**: Sync specific clients instead of "all" when possible
5. **Async Jobs**: Use `/execute-async` for large datasets
6. **Rate Limiting**: Adjust `rateLimitDelay` based on API responses

### 🚨 Error Handling & Recovery

The system includes comprehensive error handling:

- **Automatic Retry**: Failed batches are retried with exponential backoff
- **Partial Success**: Completed portions are preserved if sync fails
- **Rate Limit Recovery**: Automatic delay adjustments when limits are hit
- **Progress Preservation**: Jobs can be resumed from the last successful batch

### 💡 Use Cases

#### Marketing Agency Full Client Onboarding

```bash
# Sync all historical data for a new client
curl -X POST http://localhost:8080/api/full-sync/execute-async \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "FULL_HISTORICAL",
    "platforms": ["smartlead", "lemlist"],
    "namespaces": ["new-client"],
    "batchSize": 100,
    "callbackUrl": "https://mycrm.com/webhooks/sync-complete"
  }'
```

#### Data Recovery After Sync Issues

```bash
# Reset sync timestamps and re-sync from specific date
curl -X POST http://localhost:8080/api/full-sync/execute-async \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "RESET_FROM_DATE",
    "platforms": ["smartlead", "lemlist"],
    "namespaces": "all",
    "resetDate": "2024-01-01T00:00:00.000Z"
  }'
```

#### Monthly Reporting Data Sync

```bash
# Sync specific month for reporting
curl -X POST http://localhost:8080/api/full-sync/execute-async \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "DATE_RANGE",
    "platforms": ["smartlead", "lemlist"],
    "namespaces": "all",
    "dateRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-31T23:59:59.999Z"
    },
    "enableMixpanelTracking": true
  }'
```

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
curl http://localhost:8080/api/periodic-sync/status

# Force different sync types
curl -X POST http://localhost:8080/api/periodic-sync/sync-now \
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
docker run -p 8080:8080 --env-file .env cairo
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

- `playmaker_user_source` - Default user profiles with scores
- `{namespace}_user_source` - Namespace-specific user tables (auto-created)
- `namespaces` - Namespace configurations and keywords
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
curl -X POST http://localhost:8080/api/test/apollo \
  -H "Content-Type: application/json" \
  -d '{"email": "test@company.com", "company": "Test Company"}'

# Test Hunter enrichment
curl -X POST http://localhost:8080/api/test/hunter \
  -H "Content-Type: application/json" \
  -d '{"email": "test@company.com", "company": "Test Company"}'

# Test database connection
curl http://localhost:8080/api/test/database

# Test all service integrations
curl http://localhost:8080/api/test/health
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
curl http://localhost:8080/health
```

### Job Status

```bash
# Check scoring job status
curl http://localhost:8080/api/jobs/status/calculate-lead-scores

# View job logs
curl http://localhost:8080/api/jobs/logs/calculate-lead-scores
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
- [x] **Multi-tenant support** - Complete namespace-based data segregation
- [x] **Full Sync System** - Bulk sync with intelligent rate limiting for hundreds of thousands of records
- [ ] GraphQL API
- [ ] Real-time WebSocket updates
- [ ] Namespace-specific dashboard views

---

<div align="center">
  Made with ❤️ by the Cairo Team
  <br>
  <a href="https://github.com/outcome-driven-studio/cairo">⭐ Star us on GitHub</a>
</div>
