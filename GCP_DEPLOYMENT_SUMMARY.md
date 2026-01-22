# GCP Deployment - Summary

This document summarizes the Google Cloud Platform deployment setup for Cairo CDP.

## What Was Created

### Documentation
1. **GCP_DEPLOYMENT_GUIDE.md** - Comprehensive deployment guide with:
   - Architecture overview
   - Step-by-step setup instructions
   - Cloud Run, Cloud SQL, Cloud Scheduler, Cloud Tasks configuration
   - Environment variables and secrets management
   - CI/CD setup
   - Monitoring and troubleshooting

2. **GCP_QUICK_START.md** - Quick reference guide for fast deployment

3. **GCP_DEPLOYMENT_SUMMARY.md** - This file

### Configuration Files
1. **cloudbuild.yaml** - Cloud Build configuration for automated deployments
2. **scripts/setup-gcp.sh** - Automated GCP infrastructure setup script
3. **scripts/deploy-gcp.sh** - Deployment script for Cloud Run

### Code Changes
1. **src/utils/gcpSecrets.js** - Utility for loading secrets from Secret Manager
2. **src/utils/envLoader.js** - Updated to support GCP secret loading
3. **server.js** - Updated to:
   - Load GCP secrets on startup
   - Disable node-cron on Cloud Run (Cloud Scheduler handles scheduling)
4. **package.json** - Added GCP dependencies:
   - `@google-cloud/secret-manager`
   - `@google-cloud/tasks`

## Architecture Overview

### Components

1. **Cloud Run** - Main application server
   - Runs Express.js application
   - Handles API requests
   - Auto-scales based on traffic
   - Connects to Cloud SQL via Unix socket

2. **Cloud SQL (PostgreSQL)** - Database
   - Stores all application data
   - Managed PostgreSQL instance
   - Automatic backups configured

3. **Cloud Scheduler** - Scheduled tasks
   - Replaces `node-cron` for periodic sync
   - Runs every 4 hours (configurable)
   - Triggers HTTP endpoints on Cloud Run

4. **Cloud Tasks** - Background jobs
   - Handles long-running operations
   - Replaces child process spawning
   - Queue-based job processing

5. **Secret Manager** - Secrets storage
   - Stores API keys and passwords
   - Secure access control
   - Automatic rotation support

## Key Features

### Automatic Secret Loading
- Secrets are automatically loaded from Secret Manager when running on Cloud Run
- Database connection string is constructed from secrets
- Falls back to environment variables if secrets unavailable

### Scheduled Tasks
- Cloud Scheduler replaces `node-cron`
- More reliable for serverless environments
- Can scale independently

### Background Jobs
- Cloud Tasks replaces child process spawning
- Better resource management
- Built-in retry logic

### Database Migrations
- Run automatically on deployment via `start.sh`
- Same process as Railway deployment
- Migrations run on Cloud Run, connect to Cloud SQL

## Deployment Flow

```
1. Setup (one-time)
   ./scripts/setup-gcp.sh
   ↓
2. Build & Deploy
   ./scripts/deploy-gcp.sh
   ↓
3. Configure Scheduled Jobs
   gcloud scheduler jobs create ...
   ↓
4. Application Running
   Cloud Run → Cloud SQL
   Cloud Scheduler → Cloud Run
```

## Environment Variables

### Automatically Set
- `NODE_ENV=production`
- `PORT=8080`
- `GOOGLE_CLOUD_PROJECT` (from GCP)
- `GCP_REGION` (from deployment)
- `INSTANCE_CONNECTION_NAME` (Cloud SQL connection)
- `K_SERVICE` (Cloud Run service name)

### From Secret Manager
- `DB_PASSWORD` → Used to construct `POSTGRES_URL`
- `LEMLIST_API_KEY`
- `SMARTLEAD_API_KEY`
- `ATTIO_API_KEY`
- `MIXPANEL_PROJECT_TOKEN`
- `SENTRY_DSN`

### Configuration
- `USE_PERIODIC_SYNC=false` (Cloud Scheduler handles this)
- `ENABLE_CRON_JOBS=false` (Cloud Scheduler handles this)

## Differences from Railway Deployment

| Feature | Railway | GCP |
|---------|---------|-----|
| Scheduled Tasks | node-cron | Cloud Scheduler |
| Background Jobs | Child processes | Cloud Tasks |
| Secrets | Environment variables | Secret Manager |
| Database | External (Neon) | Cloud SQL |
| Scaling | Manual | Automatic |
| Cost | Usage-based | Pay-per-use |

## Next Steps

1. **Review Documentation**
   - Read `GCP_DEPLOYMENT_GUIDE.md` for detailed instructions
   - Check `GCP_QUICK_START.md` for quick reference

2. **Run Setup**
   ```bash
   ./scripts/setup-gcp.sh
   ```

3. **Deploy**
   ```bash
   ./scripts/deploy-gcp.sh
   ```

4. **Configure Scheduled Jobs**
   - Follow instructions in deployment guide
   - Set up Cloud Scheduler jobs

5. **Test**
   - Verify health endpoint
   - Test database connection
   - Check logs

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check `INSTANCE_CONNECTION_NAME` is set correctly
   - Verify Cloud SQL instance is running
   - Check service account has Cloud SQL Client role

2. **Secrets Not Loading**
   - Verify secrets exist in Secret Manager
   - Check service account has Secret Accessor role
   - Review logs for secret loading errors

3. **Scheduled Jobs Not Running**
   - Verify Cloud Scheduler jobs are created
   - Check job status in Cloud Console
   - Verify service URL is correct

4. **Build Failures**
   - Check Cloud Build logs
   - Verify Dockerfile is correct
   - Check resource quotas

## Cost Optimization

- Use `min-instances=0` to scale to zero when idle
- Start with `db-f1-micro` for Cloud SQL
- Use Cloud Scheduler free tier (3 jobs)
- Monitor usage and adjust resources

## Security Considerations

- Secrets stored in Secret Manager (not in code)
- Cloud SQL uses private IP (Unix socket)
- Service accounts with minimal permissions
- HTTPS enforced on Cloud Run
- No public database access

## Support

For issues or questions:
1. Check the detailed deployment guide
2. Review Cloud Run logs
3. Check GCP documentation
4. Review application logs

## Files Modified/Created

### New Files
- `GCP_DEPLOYMENT_GUIDE.md`
- `GCP_QUICK_START.md`
- `GCP_DEPLOYMENT_SUMMARY.md`
- `cloudbuild.yaml`
- `scripts/setup-gcp.sh`
- `scripts/deploy-gcp.sh`
- `src/utils/gcpSecrets.js`

### Modified Files
- `src/utils/envLoader.js` - Added GCP secret loading support
- `server.js` - Added GCP secret loading, disabled cron on Cloud Run
- `package.json` - Added GCP dependencies
