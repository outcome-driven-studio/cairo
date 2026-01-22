# Google Cloud Platform (GCP) Deployment Guide

This guide covers deploying Cairo CDP to Google Cloud Platform, including handling background jobs and scheduled tasks.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Cloud Platform                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Cloud Run (Main Application)              │  │
│  │  • Express.js server                                  │  │
│  │  • API endpoints                                      │  │
│  │  • WebSocket connections                              │  │
│  │  • Health checks                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          │ HTTP requests                     │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Cloud Scheduler (Cron Jobs)                │  │
│  │  • Periodic sync (every 4 hours)                     │  │
│  │  • Replaces node-cron                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          │ HTTP requests                     │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Cloud Tasks (Background Jobs)                 │  │
│  │  • Long-running sync operations                      │  │
│  │  • Attio sync jobs                                    │  │
│  │  • Scoring jobs                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          │ SQL queries                       │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Cloud SQL (PostgreSQL)                   │  │
│  │  • User data                                          │  │
│  │  • Event data                                         │  │
│  │  • Sync state                                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Cloud Build (CI/CD)                           │  │
│  │  • Builds Docker image                                │  │
│  │  • Deploys to Cloud Run                               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed and configured
3. **Docker** installed (for local testing)
4. **Git** repository access

## Step 1: Initial Setup

### 1.1 Install Google Cloud SDK

```bash
# macOS
brew install google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install

# Initialize and login
gcloud init
gcloud auth login
```

### 1.2 Create a GCP Project

```bash
# Create a new project
gcloud projects create cairo-cdp --name="Cairo CDP"

# Set as default project
gcloud config set project cairo-cdp

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudtasks.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

### 1.3 Set Project ID Variable

```bash
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1  # Change to your preferred region
```

## Step 2: Database Setup (Cloud SQL)

### 2.1 Create Cloud SQL PostgreSQL Instance

```bash
# Create PostgreSQL instance
gcloud sql instances create cairo-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=$REGION \
  --root-password=$(openssl rand -base64 32) \
  --storage-type=SSD \
  --storage-size=20GB \
  --backup-start-time=03:00 \
  --enable-bin-log

# Note: Save the root password securely!
```

### 2.2 Create Database and User

```bash
# Get instance connection name
export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe cairo-db \
  --format="value(connectionName)")

# Create database
gcloud sql databases create cairo_db --instance=cairo-db

# Create application user
gcloud sql users create cairo_app \
  --instance=cairo-db \
  --password=$(openssl rand -base64 32)

# Note: Save the password securely!
```

### 2.3 Get Connection String

```bash
# Get the connection string
echo "postgresql://cairo_app:PASSWORD@/cairo_db?host=/cloudsql/$INSTANCE_CONNECTION_NAME&sslmode=disable"
```

**For Cloud Run**, you'll use Unix socket connection:
```
postgresql://cairo_app:PASSWORD@/cairo_db?host=/cloudsql/$INSTANCE_CONNECTION_NAME
```

## Step 3: Store Secrets in Secret Manager

### 3.1 Create Secrets

```bash
# Database password
echo -n "YOUR_DB_PASSWORD" | gcloud secrets create db-password --data-file=-

# API keys and other secrets
echo -n "YOUR_LEMLIST_API_KEY" | gcloud secrets create lemlist-api-key --data-file=-
echo -n "YOUR_SMARTLEAD_API_KEY" | gcloud secrets create smartlead-api-key --data-file=-
echo -n "YOUR_ATTIO_API_KEY" | gcloud secrets create attio-api-key --data-file=-
echo -n "YOUR_MIXPANEL_TOKEN" | gcloud secrets create mixpanel-token --data-file=-
echo -n "YOUR_SENTRY_DSN" | gcloud secrets create sentry-dsn --data-file=-

# Add more secrets as needed
```

### 3.2 Grant Cloud Run Access to Secrets

```bash
# Get Cloud Run service account
export SERVICE_ACCOUNT=$(gcloud iam service-accounts list \
  --filter="displayName:Compute Engine default service account" \
  --format="value(email)")

# Grant secret access
gcloud secrets add-iam-policy-binding db-password \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"

# Repeat for other secrets
for secret in lemlist-api-key smartlead-api-key attio-api-key mixpanel-token sentry-dsn; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor"
done
```

## Step 4: Build and Deploy to Cloud Run

### 4.1 Create Cloud Build Configuration

Create `cloudbuild.yaml`:

```yaml
steps:
  # Build the container image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/cairo-cdp:$COMMIT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/cairo-cdp:latest'
      - '.'

  # Push the container image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/cairo-cdp:$COMMIT_SHA']
  
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/cairo-cdp:latest']

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'cairo-cdp'
      - '--image'
      - 'gcr.io/$PROJECT_ID/cairo-cdp:$COMMIT_SHA'
      - '--region'
      - '${_REGION}'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--add-cloudsql-instances'
      - '${_INSTANCE_CONNECTION_NAME}'
      - '--set-env-vars'
      - '${_ENV_VARS}'
      - '--set-secrets'
      - '${_SECRETS}'
      - '--memory'
      - '2Gi'
      - '--cpu'
      - '2'
      - '--timeout'
      - '3600'
      - '--max-instances'
      - '10'
      - '--min-instances'
      - '1'

substitutions:
  _REGION: us-central1
  _INSTANCE_CONNECTION_NAME: ''  # Will be set during build
  _ENV_VARS: ''  # Will be set during build
  _SECRETS: ''  # Will be set during build

images:
  - 'gcr.io/$PROJECT_ID/cairo-cdp:$COMMIT_SHA'
  - 'gcr.io/$PROJECT_ID/cairo-cdp:latest'

options:
  machineType: 'E2_HIGHCPU_8'
  logging: CLOUD_LOGGING_ONLY
```

### 4.2 Create Deployment Script

Create `deploy.sh`:

```bash
#!/bin/bash

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION=${REGION:-us-central1}
INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe cairo-db \
  --format="value(connectionName)")

# Build environment variables string
ENV_VARS="NODE_ENV=production,PORT=8080,USE_PERIODIC_SYNC=false"

# Build secrets string (Cloud Run will inject these as env vars)
SECRETS="POSTGRES_URL=db-password:latest,LEMLIST_API_KEY=lemlist-api-key:latest,SMARTLEAD_API_KEY=smartlead-api-key:latest,ATTIO_API_KEY=attio-api-key:latest,MIXPANEL_PROJECT_TOKEN=mixpanel-token:latest,SENTRY_DSN=sentry-dsn:latest"

# Get Cloud Run service URL for BASE_URL
SERVICE_URL=$(gcloud run services describe cairo-cdp \
  --region=$REGION \
  --format="value(status.url)" 2>/dev/null || echo "")

if [ -n "$SERVICE_URL" ]; then
  ENV_VARS="$ENV_VARS,BASE_URL=$SERVICE_URL"
fi

# Submit build
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION=$REGION,_INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME,_ENV_VARS="$ENV_VARS",_SECRETS="$SECRETS"

echo "Deployment complete!"
```

**Note:** The secrets approach above needs adjustment. Cloud Run secrets need to be accessed via the Secret Manager API. See Step 4.3 for the correct approach.

### 4.3 Update Dockerfile for Cloud Run

The existing Dockerfile should work, but ensure it:

1. Exposes the correct port (8080 or from PORT env var)
2. Runs migrations on startup (already handled by start.sh)
3. Handles Cloud SQL connections properly

Update `Dockerfile` if needed:

```dockerfile
# ... existing content ...

# Health check for Cloud Run
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/health/simple || exit 1

# ... rest of content ...
```

### 4.4 Deploy Manually (First Time)

```bash
# Build and push image
gcloud builds submit --tag gcr.io/$PROJECT_ID/cairo-cdp

# Deploy to Cloud Run
gcloud run deploy cairo-cdp \
  --image gcr.io/$PROJECT_ID/cairo-cdp \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --add-cloudsql-instances $INSTANCE_CONNECTION_NAME \
  --set-env-vars "NODE_ENV=production,PORT=8080,USE_PERIODIC_SYNC=false" \
  --set-secrets "POSTGRES_URL=db-password:latest" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --max-instances 10 \
  --min-instances 1
```

**Important:** You'll need to construct the full POSTGRES_URL in your application code or use a startup script that reads from Secret Manager.

## Step 5: Handle Scheduled Tasks (Cloud Scheduler)

Since Cloud Run instances can scale to zero, `node-cron` won't work reliably. Use Cloud Scheduler instead.

### 5.1 Create Cloud Scheduler Job for Periodic Sync

```bash
# Get your Cloud Run service URL
SERVICE_URL=$(gcloud run services describe cairo-cdp \
  --region=$REGION \
  --format="value(status.url)")

# Create scheduler job (runs every 4 hours)
gcloud scheduler jobs create http periodic-sync \
  --location=$REGION \
  --schedule="0 */4 * * *" \
  --uri="$SERVICE_URL/api/periodic-sync/sync-now" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{"force": true}' \
  --time-zone="UTC" \
  --attempt-deadline=3600s
```

### 5.2 Create Additional Scheduler Jobs (if needed)

```bash
# Delta sync every 10 minutes (if using legacy cron)
gcloud scheduler jobs create http lemlist-delta-sync \
  --location=$REGION \
  --schedule="*/10 * * * *" \
  --uri="$SERVICE_URL/sync/lemlist-delta" \
  --http-method=GET \
  --time-zone="UTC"

# Smartlead delta sync every 15 minutes
gcloud scheduler jobs create http smartlead-delta-sync \
  --location=$REGION \
  --schedule="*/15 * * * *" \
  --uri="$SERVICE_URL/sync/smartlead-delta" \
  --http-method=GET \
  --time-zone="UTC"
```

### 5.3 Update Application Code

Modify `server.js` to disable `node-cron` when running on Cloud Run:

```javascript
// Detect if running on Cloud Run
const isCloudRun = process.env.K_SERVICE !== undefined;

// Only use node-cron if NOT on Cloud Run
if (!isCloudRun && process.env.USE_PERIODIC_SYNC === "true") {
  // Start periodic sync service
  const periodicSync = getInstance();
  await periodicSync.start();
} else if (isCloudRun) {
  logger.info("Running on Cloud Run - periodic sync handled by Cloud Scheduler");
}
```

## Step 6: Handle Background Jobs (Cloud Tasks)

For long-running background jobs, use Cloud Tasks instead of spawning child processes.

### 6.1 Create Cloud Tasks Queue

```bash
# Create queue for background jobs
gcloud tasks queues create background-jobs \
  --location=$REGION \
  --max-attempts=3 \
  --max-retry-duration=3600s \
  --max-concurrent-dispatches=5
```

### 6.2 Update Background Job Routes

Modify `src/routes/backgroundJobRoutes.js` to use Cloud Tasks instead of child processes:

```javascript
const {CloudTasksClient} = require('@google-cloud/tasks');

class BackgroundJobRoutes {
  constructor() {
    this.tasksClient = new CloudTasksClient();
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT;
    this.location = process.env.GCP_REGION || 'us-central1';
    this.queue = 'background-jobs';
  }

  async createBackgroundTask(jobName, payload) {
    const queuePath = this.tasksClient.queuePath(
      this.projectId,
      this.location,
      this.queue
    );

    const serviceUrl = process.env.BASE_URL || process.env.SERVICE_URL;
    const url = `${serviceUrl}/api/jobs/execute/${jobName}`;

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: url,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      },
    };

    const [response] = await this.tasksClient.createTask({
      parent: queuePath,
      task: task,
    });

    return response.name;
  }

  async syncUsersBackground(req, res) {
    const taskId = await this.createBackgroundTask('sync-users', req.body);
    res.json({
      success: true,
      message: 'Background job queued',
      taskId: taskId,
    });
  }
}
```

### 6.3 Install Cloud Tasks Client

```bash
npm install @google-cloud/tasks
```

Add to `package.json`:

```json
{
  "dependencies": {
    "@google-cloud/tasks": "^4.0.0"
  }
}
```

## Step 7: Environment Variables Configuration

### 7.1 Create Environment Configuration File

Create `gcp-env.yaml` for reference:

```yaml
# Core Configuration
NODE_ENV: production
PORT: 8080
BASE_URL: https://cairo-cdp-xxxxx.run.app

# Database (constructed from Secret Manager)
POSTGRES_URL: "postgresql://cairo_app:PASSWORD@/cairo_db?host=/cloudsql/INSTANCE_CONNECTION_NAME"

# Sync Configuration
USE_PERIODIC_SYNC: "false"  # Cloud Scheduler handles this
ENABLE_CRON_JOBS: "false"   # Cloud Scheduler handles this

# Google Cloud
GOOGLE_CLOUD_PROJECT: cairo-cdp
GCP_REGION: us-central1
K_SERVICE: cairo-cdp  # Cloud Run service name

# Secrets (loaded from Secret Manager)
LEMLIST_API_KEY: ""  # From Secret Manager
SMARTLEAD_API_KEY: ""  # From Secret Manager
ATTIO_API_KEY: ""  # From Secret Manager
MIXPANEL_PROJECT_TOKEN: ""  # From Secret Manager
SENTRY_DSN: ""  # From Secret Manager
```

### 7.2 Create Startup Script for Secret Loading

Create `src/utils/gcpSecrets.js`:

```javascript
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const client = new SecretManagerServiceClient();

async function loadSecret(secretName) {
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await client.accessSecretVersion({name});
    return version.payload.data.toString();
  } catch (error) {
    console.error(`Error loading secret ${secretName}:`, error);
    return process.env[secretName] || '';
  }
}

async function loadSecrets() {
  if (process.env.K_SERVICE) {
    // Running on Cloud Run
    const secrets = {
      LEMLIST_API_KEY: await loadSecret('lemlist-api-key'),
      SMARTLEAD_API_KEY: await loadSecret('smartlead-api-key'),
      ATTIO_API_KEY: await loadSecret('attio-api-key'),
      MIXPANEL_PROJECT_TOKEN: await loadSecret('mixpanel-token'),
      SENTRY_DSN: await loadSecret('sentry-dsn'),
    };

    // Construct database URL
    const dbPassword = await loadSecret('db-password');
    const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
    process.env.POSTGRES_URL = 
      `postgresql://cairo_app:${dbPassword}@/cairo_db?host=/cloudsql/${instanceConnectionName}`;

    // Set other secrets
    Object.assign(process.env, secrets);
  }
}

module.exports = {loadSecrets, loadSecret};
```

Update `server.js` to load secrets on startup:

```javascript
// At the top of server.js, before other requires
if (process.env.K_SERVICE) {
  const {loadSecrets} = require('./src/utils/gcpSecrets');
  await loadSecrets();
}
```

## Step 8: CI/CD Setup

### 8.1 Create Cloud Build Trigger

```bash
# Connect repository (first time)
gcloud source repos create cairo-cdp

# Or connect external repository
gcloud builds triggers create github \
  --name="deploy-on-push" \
  --repo-name="cairo-cdp" \
  --repo-owner="YOUR_GITHUB_USERNAME" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml"
```

### 8.2 Update cloudbuild.yaml with Substitutions

```yaml
# ... existing content ...

substitutions:
  _REGION: us-central1
  _INSTANCE_CONNECTION_NAME: 'PROJECT_ID:REGION:INSTANCE_NAME'  # Update this
  _ENV_VARS: 'NODE_ENV=production,PORT=8080,USE_PERIODIC_SYNC=false'
  _SECRETS: 'POSTGRES_URL=db-password:latest'

# ... rest of content ...
```

## Step 9: Testing and Verification

### 9.1 Test Health Endpoint

```bash
SERVICE_URL=$(gcloud run services describe cairo-cdp \
  --region=$REGION \
  --format="value(status.url)")

curl $SERVICE_URL/health
```

### 9.2 Test Database Connection

```bash
curl $SERVICE_URL/debug/test-integrations
```

### 9.3 Test Scheduled Jobs

```bash
# Manually trigger scheduler job
gcloud scheduler jobs run periodic-sync --location=$REGION
```

### 9.4 View Logs

```bash
# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=cairo-cdp" \
  --limit 50 \
  --format json
```

## Step 10: Monitoring and Alerts

### 10.1 Create Uptime Check

```bash
gcloud monitoring uptime create cairo-cdp-health \
  --display-name="Cairo CDP Health Check" \
  --http-check-path="/health" \
  --resource-type=uptime-url
```

### 10.2 Set Up Alerts

```bash
# Create alert policy for high error rate
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

## Migration Checklist

- [ ] GCP project created and APIs enabled
- [ ] Cloud SQL instance created and configured
- [ ] Secrets stored in Secret Manager
- [ ] Cloud Run service deployed
- [ ] Database migrations run successfully
- [ ] Cloud Scheduler jobs created for cron tasks
- [ ] Cloud Tasks queue created for background jobs
- [ ] Environment variables configured
- [ ] Health checks passing
- [ ] Logs accessible and monitored
- [ ] CI/CD pipeline configured
- [ ] Domain/SSL configured (if needed)

## Cost Optimization Tips

1. **Cloud Run**: Use min-instances=0 to scale to zero when idle
2. **Cloud SQL**: Start with db-f1-micro, scale up as needed
3. **Cloud Scheduler**: Free tier includes 3 jobs
4. **Cloud Tasks**: Free tier includes 1 million operations/month
5. **Cloud Build**: Free tier includes 120 build-minutes/day

## Troubleshooting

### Database Connection Issues

```bash
# Test connection from local machine
gcloud sql connect cairo-db --user=cairo_app --database=cairo_db
```

### Cloud Run Timeout Issues

Increase timeout:
```bash
gcloud run services update cairo-cdp \
  --timeout=3600 \
  --region=$REGION
```

### Secret Access Issues

```bash
# Verify service account has access
gcloud secrets get-iam-policy db-password
```

## Next Steps

1. Set up custom domain
2. Configure SSL certificates
3. Set up monitoring dashboards
4. Configure backup policies for Cloud SQL
5. Set up staging environment
6. Implement blue-green deployments

## Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)
- [Cloud Tasks Documentation](https://cloud.google.com/tasks/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
