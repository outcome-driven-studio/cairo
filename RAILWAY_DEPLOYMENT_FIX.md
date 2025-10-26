# Railway Deployment Fix Guide

This document outlines the fixes applied to resolve critical deployment errors on Railway.

## Issues Identified

### 1. ❌ Missing AttioService Methods
**Error:** `this.attioService.listPeople is not a function` and `this.attioService.createEvent is not a function`

**Root Cause:** AttioService was missing the `listPeople()` and `createEvent()` methods that were being called by PeriodicSyncService and EventTrackingService.

**Fix Applied:** ✅ Added both methods to `src/services/attioService.js` matching Attio API v2 docs
- `listPeople(limit, offset)` - Lists people using POST `/v2/objects/people/records/query` (max 500 records)
- `createEvent(eventData, userId)` - Creates timeline notes via POST `/v2/notes` with proper `data` wrapper

**Important Notes:**
- Attio API v2 uses **POST** for querying records (not GET)
- The notes API requires a `data` wrapper object
- `userId` must be the Attio `record_id` (UUID), not email address

### 2. ❌ Missing Database Table: playmaker_user_source
**Error:** `relation "playmaker_user_source" does not exist`

**Root Cause:** Core migration wasn't run on Railway deployment, causing the main user table to be missing.

**Fix Applied:** ✅ The table is defined in `src/migrations/000_create_core_tables.js`
**Action Required:** Run migrations on Railway (see deployment steps below)

### 3. ❌ Missing API Route: GET /api/sources
**Error:** `API route not found: GET /api/sources`

**Root Cause:** ConfigRoutes class existed but was never registered in server.js

**Fix Applied:** ✅ 
- Added `ConfigRoutes` import to server.js
- Registered route: `app.use("/api", configRoutes.setupRoutes())`

### 4. ❌ Missing Database Tables: sources & destinations
**Error:** These tables didn't exist for ConfigRoutes to query

**Fix Applied:** ✅ Created migration `src/migrations/022_create_sources_destinations.js`
**Action Required:** Run migrations on Railway

### 5. ⚠️ Neon Database Connection Pool Errors
**Error:** `Connection terminated unexpectedly` and pool timeout errors

**Status:** ⚠️ Already optimized
The `src/utils/db.js` file already contains Neon-specific optimizations:
- Reduced pool size (max: 5, min: 1) for cloud databases
- Shorter timeouts for Neon
- Retry logic with exponential backoff
- Better error handling for connection interruptions

**Additional Recommendations:**
1. Check Neon dashboard for connection limits on your plan
2. Ensure Railway environment has `POSTGRES_URL` or `DATABASE_URL` set correctly
3. Monitor Neon compute usage - free tier has compute limits

### 6. ⚠️ Lemlist 402 Payment Error
**Error:** `Request failed with status code 402`

**Root Cause:** Lemlist account quota exceeded or payment issue

**Fix Required:** 🔴 Action needed
- Check your Lemlist account billing status
- Verify API key has not expired
- Review campaign limits on your Lemlist plan
- Consider disabling Lemlist sync temporarily: `USE_PERIODIC_SYNC=false` or remove `LEMLIST_API_KEY`

## Deployment Steps

### Step 1: Push Code Changes
```bash
git add .
git commit -m "fix: Add missing AttioService methods and ConfigRoutes registration

- Add listPeople and createEvent methods to AttioService
- Register ConfigRoutes in server.js for /api/sources endpoint
- Create migration for sources and destinations tables
- Improve error handling for Neon database connections

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"

git push origin ani-contrib/ui-refactor-v2
```

### Step 2: Run Migrations on Railway

Railway should run migrations automatically on deployment if configured. To ensure migrations run:

**Option A: Via Railway CLI**
```bash
# Install Railway CLI if not installed
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run migrations
railway run node src/migrations/run_migrations.js
```

**Option B: Via Railway Dashboard**
1. Go to your Railway project dashboard
2. Go to Settings → Variables
3. Add a new variable: `RUN_MIGRATIONS=true`
4. Redeploy the service

**Option C: Add to start script**
Update your `start.sh` or create a deployment script:
```bash
#!/bin/bash
# Run migrations before starting server
node src/migrations/run_migrations.js

# Start the server
node server.js
```

### Step 3: Verify Deployment

After deployment, check the following endpoints:

1. **Health Check:**
   ```bash
   curl https://your-railway-app.railway.app/health/simple
   ```

2. **Database Health:**
   ```bash
   curl https://your-railway-app.railway.app/health
   ```

3. **Sources API:**
   ```bash
   curl https://your-railway-app.railway.app/api/sources
   ```

4. **Check Logs:**
   - Go to Railway dashboard
   - View deployment logs
   - Look for:
     - ✅ "All migrations completed successfully"
     - ✅ "playmaker_user_source table created"
     - ✅ "sources table created"
     - ✅ "Server listening on..."

## Environment Variables to Verify

Ensure these are set correctly in Railway:

### Required
- `POSTGRES_URL` or `DATABASE_URL` - Neon database connection string
- `NODE_ENV=production`
- `PORT=8080` (or your preferred port)

### Optional (for full functionality)
- `ATTIO_API_KEY` - For CRM sync
- `LEMLIST_API_KEY` - For email campaign sync (check 402 error)
- `SMARTLEAD_API_KEY` - For email campaign sync
- `MIXPANEL_PROJECT_TOKEN` - For analytics
- `SLACK_WEBHOOK_URL` - For notifications
- `APOLLO_API_KEY` - For enrichment
- `HUNTER_API_KEY` - For enrichment
- `USE_PERIODIC_SYNC=true` - Enable periodic syncing

### Neon-Specific (should be auto-configured)
Connection pooling is already optimized for Neon in `src/utils/db.js`

## Monitoring Post-Deployment

### Watch for These Success Indicators:
- ✅ No more "playmaker_user_source" errors
- ✅ No more "listPeople is not a function" errors
- ✅ No more "createEvent is not a function" errors
- ✅ /api/sources endpoint returns 200
- ✅ Periodic sync runs without Attio errors

### Expected Warnings (OK to ignore):
- ⚠️ Lemlist 402 errors (if not subscribed)
- ⚠️ Occasional Neon connection warnings (auto-recovers)
- ⚠️ Missing optional services (if env vars not set)

## Rollback Plan

If deployment fails:

1. **Revert code changes:**
   ```bash
   git revert HEAD
   git push
   ```

2. **Check Railway logs** for specific error messages

3. **Contact support** if database connection issues persist

## Additional Notes

### About Neon Connection Errors
The "Connection terminated unexpectedly" warnings are common with Neon due to:
- Serverless compute that scales down when idle
- Connection pooling behavior
- Network latency

The application already handles these gracefully with:
- Automatic reconnection
- Retry logic with backoff
- Pool health monitoring

These warnings are expected and don't indicate a critical issue.

### About Lemlist 402 Errors
This is a billing/quota issue with Lemlist service:
- Check if your Lemlist subscription is active
- Verify you haven't exceeded API limits
- Consider upgrading your Lemlist plan
- Or disable Lemlist integration temporarily

## Summary of Changes

| Issue | Status | Action Required |
|-------|--------|-----------------|
| Missing AttioService methods | ✅ Fixed | Push code |
| Missing playmaker_user_source table | ✅ Migration exists | Run migrations |
| Missing /api/sources route | ✅ Fixed | Push code |
| Missing sources/destinations tables | ✅ Migration created | Run migrations |
| Neon connection pool errors | ⚠️ Optimized | Monitor logs |
| Lemlist 402 error | 🔴 External issue | Check Lemlist account |

## Next Steps

1. ✅ Review this document
2. 🚀 Push code changes to Railway
3. 🔧 Run migrations (via Railway CLI or deployment script)
4. 👀 Monitor logs for 5-10 minutes
5. ✅ Verify all endpoints work
6. 💰 Address Lemlist billing if needed

---

**Questions or Issues?**
Check Railway logs and the error patterns. Most issues will be resolved after running migrations.
