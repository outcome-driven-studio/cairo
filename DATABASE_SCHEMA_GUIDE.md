# Database Schema & Table Naming Guide

## User Source Tables

Cairo uses a namespace-based multi-tenant system for user data segregation.

### Table Naming Convention

**Default namespace:**
- Table name: `playmaker_user_source`
- Used when no specific namespace matches campaign keywords

**Custom namespaces:**
- Table name pattern: `{namespace}_user_source`
- Example: `acme_corp_user_source` for namespace "acme-corp"
- Automatically created when namespace is registered

### Historical Context

The codebase has evolved through several naming conventions:
- **Legacy**: `user_source` (deprecated, kept for backward compatibility)
- **Current**: `playmaker_user_source` (default namespace)
- **Multi-tenant**: `{namespace}_user_source` (per-client tables)

## Core Tables

### Primary Tables
- `playmaker_user_source` - Default user profiles with enrichment data and scores
- `event_source` - All tracked events (product, email, LinkedIn)
- `campaigns` - Campaign metadata from Lemlist/Smartlead
- `namespaces` - Namespace configuration and keyword routing

### Support Tables
- `sent_events` - Event deduplication tracking
- `sync_state` - Last sync timestamps per source
- `linkedin_mappings` - LinkedIn URL to email mappings
- `scoring_config` - Lead scoring rules and weights
- `migrations_log` - Migration execution tracking

### Sync & Job Tables
- `sync_logs` - Sync operation history
- `background_jobs` - Async job status tracking
- `periodic_sync_history` - Periodic sync execution logs

## Multi-Tenant Architecture

### How It Works

1. **Campaign Analysis**: System analyzes campaign names from sync sources
2. **Keyword Matching**: Matches against configured namespace keywords
3. **Automatic Routing**: Creates and routes data to namespace-specific tables
4. **Isolated Storage**: Each client gets their own `{namespace}_user_source` table

### Example

```sql
-- Default namespace
SELECT * FROM playmaker_user_source WHERE email = 'user@example.com';

-- Client-specific namespace (auto-created)
SELECT * FROM acme_corp_user_source WHERE email = 'user@acmecorp.com';
```

### Managing Namespaces

```bash
# Create new namespace
curl -X POST http://localhost:8080/api/namespaces \
  -H "Content-Type: application/json" \
  -d '{
    "name": "acme-corp",
    "keywords": ["ACME", "Acme Corp", "acme-corp"]
  }'

# System automatically creates: acme_corp_user_source table
```

## Schema Consistency Rules

1. **All user_source tables** (regardless of namespace) share the same schema:
   - `id` (UUID, primary key)
   - `email` (VARCHAR, unique)
   - `first_name`, `last_name` (VARCHAR)
   - `company` (VARCHAR)
   - `linkedin_profile` (TEXT)
   - `platform` (VARCHAR) - lemlist, smartlead, attio
   - `enrichment_data` (JSONB) - Apollo/Hunter enrichment
   - `icp_score`, `behaviour_score`, `lead_score` (INTEGER)
   - `apollo_enriched_at`, `last_scored_at` (TIMESTAMP)
   - `meta` (JSONB) - Additional metadata
   - `created_at`, `updated_at` (TIMESTAMP)

2. **Never query `user_source` directly** - always use:
   - `playmaker_user_source` for default namespace
   - `{namespace}_user_source` for specific namespaces
   - Use `NamespaceService` to determine correct table

## Migration Strategy

If you're migrating from old table names:

1. **Check for legacy tables:**
   ```sql
   SELECT tablename FROM pg_tables 
   WHERE tablename IN ('user_source', 'source_users');
   ```

2. **Migrate data if needed:**
   ```sql
   -- Example: Migrate user_source to playmaker_user_source
   INSERT INTO playmaker_user_source 
   SELECT * FROM user_source 
   ON CONFLICT (email) DO NOTHING;
   ```

3. **Drop legacy tables after verification:**
   ```sql
   DROP TABLE IF EXISTS user_source;
   DROP TABLE IF EXISTS source_users;
   ```

## Best Practices

1. **Use NamespaceService** for table name resolution
2. **Never hardcode table names** - use `getTableName(namespace)` 
3. **Test namespace routing** before production deployment
4. **Backup data** before running migrations
5. **Monitor namespace creation** in production logs

## Troubleshooting

### Issue: Data not appearing in expected table

**Check:**
1. Verify namespace keywords match campaign names
2. Check namespace service logs for routing decisions
3. Query correct namespace table, not default

### Issue: Migration fails with "table already exists"

**Solution:**
Migrations are idempotent. The error is expected if table already exists.
Check `migrations_log` table to see what's been executed.

### Issue: Duplicate data across namespaces

**Cause:**
Campaign keyword overlap or incorrect namespace configuration.

**Solution:**
Review namespace keywords, ensure they're mutually exclusive.
