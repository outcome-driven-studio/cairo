# Cairo CDP Deployment Architecture

## Understanding the Architecture

### The Setup

```
┌─────────────────────────────────────────┐
│           Railway (Compute)             │
│  ┌───────────────────────────────────┐  │
│  │   Cairo CDP Application           │  │
│  │                                   │  │
│  │  • Node.js + Express              │  │
│  │  • server.js                      │  │
│  │  • API routes                     │  │
│  │  • Migration scripts              │  │
│  │                                   │  │
│  │  Environment Variables:           │  │
│  │  DATABASE_URL=postgresql://...   │  │
│  └───────────────┬───────────────────┘  │
└──────────────────┼──────────────────────┘
                   │
                   │ Connects via
                   │ DATABASE_URL
                   │
                   ▼
┌─────────────────────────────────────────┐
│         Neon (Database)                 │
│  ┌───────────────────────────────────┐  │
│  │   PostgreSQL Database             │  │
│  │                                   │  │
│  │  • playmaker_user_source          │  │
│  │  • event_source                   │  │
│  │  • sources                        │  │
│  │  • destinations                   │  │
│  │  • campaigns                      │  │
│  │  • sent_events                    │  │
│  │  • ... other tables               │  │
│  │                                   │  │
│  │  Host:                            │  │
│  │  ep-cool-pond-a5f37fbc-pooler... │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Why Migrations Run on Railway

### ❓ The Question
"We're using Neon for the database, why run migrations on Railway?"

### ✅ The Answer

**Migrations run WHERE YOUR CODE LIVES, not where your data lives.**

1. **Railway = Your Application Server**
   - Runs your Node.js code
   - Has your migration scripts (`src/migrations/*.js`)
   - Has the `DATABASE_URL` connection string
   - Knows how to connect to Neon

2. **Neon = Your Database Server**
   - Stores your data
   - Receives SQL commands from Railway
   - Has no knowledge of your application code

3. **Migrations = Just SQL Commands**
   - Migration scripts run on Railway
   - They connect to Neon using `DATABASE_URL`
   - They execute SQL: `CREATE TABLE`, `ALTER TABLE`, etc.
   - Tables are created **in Neon**, but commands come **from Railway**

### The Flow

```
┌──────────────────────────────────────────────────────────┐
│  Step 1: Railway Deployment Starts                       │
│  ────────────────────────────────────────────            │
│  • Railway pulls your code from GitHub                   │
│  • Installs dependencies (npm install)                   │
│  • Runs start.sh script                                  │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  Step 2: Startup Script Runs (start.sh)                  │
│  ────────────────────────────────────────                │
│                                                           │
│  [STEP 1/3] Database health check                        │
│  node db-check.js                                        │
│  → Tests connection to Neon                              │
│                                                           │
│  [STEP 2/3] Run migrations                               │
│  node src/migrations/run_migrations.js  ◄── THIS STEP    │
│  → Connects to Neon via DATABASE_URL                     │
│  → Runs SQL commands to create/update tables             │
│  → Tables created in Neon database                       │
│                                                           │
│  [STEP 3/3] Start server                                 │
│  node server.js                                          │
│  → Application starts and accepts requests               │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  Step 3: Application Running                             │
│  ────────────────────────────────────────                │
│  • Railway runs your Node.js server                      │
│  • Server connects to Neon for all queries               │
│  • Tables already exist (created by migrations)          │
└──────────────────────────────────────────────────────────┘
```

## What Happens During Migration

### On Railway:
```javascript
// src/migrations/run_migrations.js (running on Railway)

const { query } = require('../utils/db'); // Uses DATABASE_URL

// This connects to Neon and runs SQL
await query(`
  CREATE TABLE IF NOT EXISTS playmaker_user_source (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    ...
  )
`);
```

### What Neon Receives:
```sql
-- SQL command sent from Railway to Neon
CREATE TABLE IF NOT EXISTS playmaker_user_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  ...
);
```

### Result:
- **Table created:** ✅ In Neon database
- **Command executed from:** Railway
- **Code lives on:** Railway
- **Data lives in:** Neon

## Common Misconceptions

### ❌ Misconception 1
"Migrations should run on Neon because that's where the database is"

**Reality:** Neon is just PostgreSQL. It doesn't have your migration scripts. It only receives SQL commands from clients (like Railway).

### ❌ Misconception 2
"I need to SSH into Neon to run migrations"

**Reality:** You never SSH into Neon. You connect via PostgreSQL protocol from Railway (or your local machine) and send SQL commands.

### ❌ Misconception 3
"Railway and Neon are the same thing"

**Reality:**
- Railway = Compute platform (runs your code)
- Neon = Database platform (stores your data)
- They're separate services that talk to each other

## How to Run Migrations

### Option 1: Automatic (Recommended) ✅

**Now configured in `start.sh`:**

```bash
# Railway automatically runs this on every deployment
./start.sh
  ↓
  1. Check database connection
  2. Run migrations ← Creates tables in Neon
  3. Start server
```

**You don't need to do anything!** Just push your code:

```bash
git push origin ani-contrib/ui-refactor-v2
```

Railway will automatically:
1. Deploy your code
2. Run `start.sh`
3. Execute migrations
4. Start your server

### Option 2: Manual (If Needed)

```bash
# From your local machine
railway run node src/migrations/run_migrations.js

# What this does:
# 1. Railway CLI reads DATABASE_URL from your Railway project
# 2. Connects to Neon database
# 3. Runs migration scripts
# 4. Tables created in Neon
```

### Option 3: Via Railway Dashboard

1. Go to Railway project
2. Click on your service
3. Go to "Settings" → "Deploy"
4. Set start command to: `./start.sh` (already done)

## Verifying Migrations Ran

### Check Railway Logs

After deployment, look for:

```
--- [STEP 2/3] RUNNING DATABASE MIGRATIONS ---

🔧 Starting database migrations...
Running migration: 000_create_core_tables.js
✅ playmaker_user_source table created
✅ event_source table created
Running migration: 022_create_sources_destinations.js
✅ sources table created
✅ destinations table created
✅ All migrations completed successfully!

--- ✅ MIGRATIONS COMPLETED SUCCESSFULLY ---

--- [STEP 3/3] STARTING APPLICATION SERVER ---
✅ Server listening on http://0.0.0.0:8080
```

### Check Neon Dashboard

1. Go to [Neon Console](https://console.neon.tech)
2. Select your project
3. Go to "SQL Editor"
4. Run: `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`
5. You should see all tables listed

## Environment Variables

### On Railway:

```bash
# This is how Railway knows where your database is
DATABASE_URL=postgresql://neondb_owner:***@ep-cool-pond-a5f37fbc-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### What Railway does with it:

```javascript
// In your code (src/utils/db.js)
const connectionString = process.env.DATABASE_URL;
// Railway sets this from env vars ↑

const pool = new Pool({ connectionString });
// Connects to Neon ↑

// Now you can run migrations
await pool.query('CREATE TABLE ...');
// SQL sent to Neon ↑
```

## Analogy

Think of it like a remote control:

- **Railway** = You holding the remote control
- **Neon** = The TV
- **Migrations** = Buttons you press on the remote
- **DATABASE_URL** = The infrared signal

You press buttons on the remote (Railway runs migrations), and the TV (Neon) responds by changing channels (creating tables).

The remote control needs to be in your hand (Railway), not inside the TV (Neon).

## Summary

| Question | Answer |
|----------|--------|
| Where do migrations run? | On Railway (where your code lives) |
| Where are tables created? | In Neon (where your data lives) |
| How do they connect? | Via `DATABASE_URL` environment variable |
| When do migrations run? | Automatically on every Railway deployment |
| Do I need to SSH into Neon? | No, never needed |
| Can I run migrations locally? | Yes, if you set `DATABASE_URL` locally |

## Next Steps

1. ✅ **Push your code** - Migrations will run automatically
2. ✅ **Check Railway logs** - Verify migrations succeeded
3. ✅ **Test your endpoints** - Tables should exist now
4. ✅ **No manual steps needed** - Everything is automated!

```bash
git push origin ani-contrib/ui-refactor-v2
# Railway automatically:
# 1. Deploys your code
# 2. Runs migrations (creates tables in Neon)
# 3. Starts your server
```

That's it! 🎉
