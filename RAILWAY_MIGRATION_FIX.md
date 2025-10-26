# Railway Migration Failure - Action Plan

## 🔴 Critical Issue

**Migrations are NOT running on Railway deployment!**

The `playmaker_user_source` table doesn't exist, causing all these errors:
- `relation "playmaker_user_source" does not exist`
- `[PeriodicSync] Attio sync failed`
- `Database query failed`
- `[Product Event] Error finding/creating user`

## 🎯 Immediate Actions

### Step 1: Push Latest Fixes

```bash
git push origin ani-contrib/ui-refactor-v2
```

**What this includes:**
- ✅ Improved logging in migration runner
- ✅ Dockerfile improvements
- ✅ Diagnostic script (check-migrations.js)

### Step 2: Check Railway Deployment Logs

After pushing, go to Railway dashboard and check the deployment logs for:

```
--- [STEP 2/3] RUNNING DATABASE MIGRATIONS ---

🔧 Starting database migrations...
📡 Connecting to database: postgresql://...
✅ Database connection successful
✅ Migrations tracking table ready
📋 Found X previously executed migrations
📂 Reading migrations from: /app/src/migrations
📄 Found X files in migrations directory
🔄 Found X migration files to process: ...
⏳ Running migration: 000_create_core_tables.js
✅ playmaker_user_source table created
```

### Step 3: If Migrations Still Don't Run

Run the diagnostic script manually on Railway:

```bash
# Option A: Via Railway CLI
railway run node check-migrations.js

# Option B: Via Railway Dashboard
# Go to service → "Run a command" → node check-migrations.js
```

This will tell you EXACTLY what's wrong:
- ✅ Is DATABASE_URL set?
- ✅ Can it connect to Neon?
- ✅ Are migration files present?
- ✅ Do tables exist?

### Step 4: Manual Migration (If Automated Fails)

If migrations still don't run automatically:

```bash
# Force run migrations
railway run node src/migrations/run_migrations.js

# Then restart the service
railway restart
```

## 🔍 Debugging the Issue

### Why Migrations Might Not Be Running

#### Possibility 1: Docker Build Issue
- Migration files not copied to Docker image
- **Fix:** Updated Dockerfile to verify migrations directory

#### Possibility 2: Permission Issues
- start.sh not executable
- **Fix:** Dockerfile runs `chmod +x start.sh`

#### Possibility 3: Script Fails Silently
- Migration errors not visible in logs
- **Fix:** Added comprehensive logging

#### Possibility 4: Wrong Start Command
- Railway not using start.sh
- **Check:** Railway dashboard → Settings → Start Command should be empty (uses Dockerfile CMD)

## 📊 What to Look For in Logs

### ✅ Good Deployment Logs

```
Step 1: Database health check
✅ PRE-FLIGHT CHECK PASSED

Step 2: Running database migrations
🔧 Starting database migrations...
📡 Connecting to database: postgresql://neondb_owner:***@...
✅ Database connection successful
✅ Migrations tracking table ready
📂 Reading migrations from: /app/src/migrations
📄 Found 15 files in migrations directory
🔄 Found 7 migration files to process
⏳ Running migration: 000_create_core_tables.js
✅ playmaker_user_source table created
✅ event_source table created
⏳ Running migration: 022_create_sources_destinations.js
✅ sources table created
✅ destinations table created
✅ All migrations completed successfully!
--- ✅ MIGRATIONS COMPLETED SUCCESSFULLY ---

Step 3: Starting application server
✅ Server listening on http://0.0.0.0:8080
```

### ❌ Bad Deployment Logs

```
Step 1: Database health check
⚠️ WARNING: Database connection test failed

Step 2: Running database migrations
❌ Database connection failed: connection timeout
--- ❌ CRITICAL: Database migrations failed ---
```

OR

```
Step 2: Running database migrations
📂 Reading migrations from: /app/src/migrations
📄 Found 0 files in migrations directory  ← PROBLEM!
```

## 🛠️ Emergency Fix Options

### Option 1: Run Migrations via SQL Editor (Neon Dashboard)

If all else fails, create tables manually in Neon:

1. Go to [Neon Console](https://console.neon.tech)
2. Open SQL Editor
3. Run the migration manually:

```sql
-- From 000_create_core_tables.js
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS playmaker_user_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  original_user_id VARCHAR(255),
  name VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  company VARCHAR(255),
  title VARCHAR(255),
  linkedin_profile TEXT,
  enrichment_profile JSONB,
  meta JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Lead scoring columns
  icp_score INTEGER DEFAULT 0,
  behaviour_score INTEGER DEFAULT 0,
  lead_score INTEGER DEFAULT 0,
  lead_grade VARCHAR(5),
  last_scored_at TIMESTAMP WITH TIME ZONE,
  
  -- Enrichment tracking
  apollo_enriched_at TIMESTAMP WITH TIME ZONE,
  apollo_data JSONB,
  hunter_data JSONB DEFAULT NULL,
  hunter_enriched_at TIMESTAMP DEFAULT NULL,
  enrichment_source VARCHAR(50) DEFAULT 'apollo',
  enrichment_status VARCHAR(50) DEFAULT 'pending',
  last_enrichment_attempt TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  user_id TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add other tables from 022_create_sources_destinations.js
CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  write_key VARCHAR(255) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS destinations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

4. Restart Railway service

### Option 2: Disable Periodic Sync Temporarily

While debugging, you can disable the problematic services:

Set in Railway environment variables:
```
USE_PERIODIC_SYNC=false
```

This will stop the errors until tables are created.

## 📝 Checklist

After deploying, verify:

- [ ] Railway deployment succeeded
- [ ] Logs show "MIGRATIONS COMPLETED SUCCESSFULLY"
- [ ] Check endpoint: `https://your-app.railway.app/health`
- [ ] No more "relation does not exist" errors in Sentry
- [ ] Run diagnostic: `railway run node check-migrations.js`
- [ ] Verify tables in Neon SQL Editor

## 🆘 If Nothing Works

Contact me with:
1. Railway deployment logs (full output)
2. Output of: `railway run node check-migrations.js`
3. Screenshot of Railway environment variables (mask sensitive values)

## 📚 Related Documentation

- DEPLOYMENT_ARCHITECTURE.md - Explains Railway + Neon setup
- RAILWAY_DEPLOYMENT_FIX.md - Original deployment fixes
- check-migrations.js - Diagnostic script

## 🎯 Expected Resolution

After pushing and deploying:
1. ✅ Migrations run automatically
2. ✅ All tables created in Neon
3. ✅ No more "relation does not exist" errors
4. ✅ Application runs normally

**Time to fix:** 5-10 minutes after deployment completes
