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

**Discord webhook name and avatar** (for `/api/bridge` messages in Discord): set env vars so the bot name and picture are yours, not "Event Bridge":
- `DISCORD_USERNAME` – e.g. `VibeTM HQ` or `Notion Tasks`
- `DISCORD_AVATAR_URL` – direct URL to an image (e.g. your logo; must be a public image URL)
Set via Cloud Run: `gcloud run services update cairo-cdp --region=us-central1 --set-env-vars "DISCORD_USERNAME=VibeTM HQ,DISCORD_AVATAR_URL=https://example.com/your-logo.png"`  
Or when deploying: `DISCORD_USERNAME="VibeTM" DISCORD_AVATAR_URL="https://..." ./scripts/deploy-gcp.sh`

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

## CI/CD: Deploy on push or merge to main

Each push or merge to `main` can deploy to Cloud Run automatically using `cloudbuild.ci.yaml` (no manual substitution variables needed).

### 1. Connect your GitHub repo (one-time)

1. Open [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers).
2. Click **Connect repository** and choose **GitHub (Cloud Build GitHub App)** or **GitHub (Mirror)**.
3. Authenticate and select the repository (e.g. `outcome-driven-studio/cairo` or your fork).

### 2. Create the trigger

**In the Console:**

1. In Cloud Build → Triggers, click **Create trigger**.
2. Name: e.g. `deploy-main`.
3. Event: **Push to a branch**.
4. Source: the repo you connected; Branch: `^main$`.
5. Configuration: **Cloud Build configuration file (yaml or json)**; path: `cloudbuild.ci.yaml`.
6. Click **Create**.

**Or via gcloud** (after repo is connected):

```bash
# List repos to get REPO_NAME if needed
gcloud builds repositories list

# Create trigger (replace REPO_NAME with your connected repo resource name, e.g. github_OWNER_REPO)
gcloud builds triggers create github \
  --name="deploy-main" \
  --repo-name="REPO_NAME" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.ci.yaml"
```

After this, every push or merge to `main` will build the image and deploy to Cloud Run with the same env and secrets as `./scripts/deploy-gcp.sh`. Manual deploys still work: run `./scripts/deploy-gcp.sh` (uses `cloudbuild.yaml`).

## Next Steps

1. Set up custom domain
2. Configure SSL
3. Set up monitoring alerts
4. Configure backups
5. Set up staging environment

For detailed information, see [GCP_DEPLOYMENT_GUIDE.md](./GCP_DEPLOYMENT_GUIDE.md).
