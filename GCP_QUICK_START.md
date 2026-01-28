# GCP Deployment Quick Start

This is a condensed guide for deploying Cairo CDP to Google Cloud Platform. For detailed information, see [GCP_DEPLOYMENT_GUIDE.md](./GCP_DEPLOYMENT_GUIDE.md).

## Prerequisites

```bash
# Install gcloud CLI
brew install google-cloud-sdk  # macOS
# Or: https://cloud.google.com/sdk/docs/install

# Login and set project
gcloud init
gcloud auth login
```

## Quick Deployment (5 Steps)

### 1. Initial Setup

```bash
# Run setup script
./scripts/setup-gcp.sh

# This will:
# - Enable required APIs
# - Create Cloud SQL instance
# - Create database and user
# - Set up Secret Manager
# - Grant permissions
```

### 2. Install GCP Dependencies

```bash
npm install @google-cloud/secret-manager @google-cloud/tasks
```

### 3. Update Configuration

Edit `cloudbuild.yaml` and set:
- `_INSTANCE_CONNECTION_NAME`: Your Cloud SQL connection name (from setup script output)

### 4. Deploy

```bash
# Deploy to Cloud Run
./scripts/deploy-gcp.sh
```

### 5. Set Up Scheduled Jobs

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe cairo-cdp \
  --region=us-central1 \
  --format="value(status.url)")

# Create Cloud Scheduler job for periodic sync (every 4 hours)
gcloud scheduler jobs create http periodic-sync \
  --location=us-central1 \
  --schedule="0 */4 * * *" \
  --uri="$SERVICE_URL/api/periodic-sync/sync-now" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{"force": true}' \
  --time-zone="UTC"
```

## Environment Variables

The following environment variables are automatically configured:

- `NODE_ENV=production`
- `PORT=8080`
- `USE_PERIODIC_SYNC=false` (Cloud Scheduler handles this)
- `GOOGLE_CLOUD_PROJECT` (auto-set)
- `GCP_REGION` (auto-set)
- `INSTANCE_CONNECTION_NAME` (auto-set)

Secrets are loaded from Secret Manager:
- `DB_PASSWORD` → `db-password` secret
- `LEMLIST_API_KEY` → `lemlist-api-key` secret
- `SMARTLEAD_API_KEY` → `smartlead-api-key` secret
- `ATTIO_API_KEY` → `attio-api-key` secret
- `MIXPANEL_PROJECT_TOKEN` → `mixpanel-token` secret
- `SENTRY_DSN` → `sentry-dsn` secret
- `SLACK_WEBHOOK_URL` → `slack-webhook-url` secret
- `DISCORD_WEBHOOK_URL` → `discord-webhook-url` secret (for event bridge / Notion → Discord)

**Add or update Discord webhook** (e.g. for `/api/bridge`):
```bash
# If secret doesn't exist: create it
echo -n "https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN" | \
  gcloud secrets create discord-webhook-url --data-file=-
# If it already exists: add a new version
echo -n "https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN" | \
  gcloud secrets versions add discord-webhook-url --data-file=-
# Then redeploy so Cloud Run picks it up
./scripts/deploy-gcp.sh
```

## Architecture

```
Cloud Scheduler (Cron) → Cloud Run (API) → Cloud SQL (Database)
                              ↓
                        Cloud Tasks (Background Jobs)
```

## Key Differences from Railway

1. **Scheduled Tasks**: Use Cloud Scheduler instead of `node-cron`
2. **Background Jobs**: Use Cloud Tasks instead of child processes
3. **Secrets**: Use Secret Manager instead of environment variables
4. **Database**: Cloud SQL with Unix socket connection

## Testing

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe cairo-cdp \
  --region=us-central1 \
  --format="value(status.url)")

# Test health endpoint
curl $SERVICE_URL/health

# Test integrations
curl $SERVICE_URL/debug/test-integrations
```

## Troubleshooting

### View Logs
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=cairo-cdp" --limit 50
```

### Check Service Status
```bash
gcloud run services describe cairo-cdp --region=us-central1
```

### Test Database Connection
```bash
gcloud sql connect cairo-db --user=cairo_app --database=cairo_db
```

## Cost Estimate

- **Cloud Run**: ~$0.40/month (with 1 min instance, 2GB RAM)
- **Cloud SQL**: ~$7/month (db-f1-micro)
- **Cloud Scheduler**: Free (3 jobs)
- **Cloud Tasks**: Free (1M operations/month)
- **Cloud Build**: Free (120 build-minutes/day)

**Total**: ~$7-10/month for small deployments

## Next Steps

1. Set up custom domain
2. Configure SSL
3. Set up monitoring alerts
4. Configure backups
5. Set up staging environment

For detailed information, see [GCP_DEPLOYMENT_GUIDE.md](./GCP_DEPLOYMENT_GUIDE.md).
