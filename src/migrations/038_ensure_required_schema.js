/**
 * Healing migration: create every table the current app needs.
 * Safe on fresh installs and on older DBs where earlier migrations
 * were skipped, failed, or left tables behind after the agent-first pivot.
 */

const logger = require("../utils/logger");
const { ensurePgcrypto } = require("./requiredTables");

async function ensureColumn(query, table, column, definition) {
  await query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`
  );
}

async function up(query) {
  logger.info("[038] Ensuring required agent-first schema...");
  await ensurePgcrypto(query);

  await query(`
    CREATE TABLE IF NOT EXISTS event_source (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_key VARCHAR(255) UNIQUE NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      platform VARCHAR(50) NOT NULL,
      user_id TEXT,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS playmaker_user_source (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE,
      original_user_id VARCHAR(255),
      name VARCHAR(255),
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      company VARCHAR(255),
      title VARCHAR(255),
      meta JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS write_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT UNIQUE NOT NULL,
      name TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      revoked_at TIMESTAMP WITH TIME ZONE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_channels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('telegram', 'discord', 'whatsapp', 'slack', 'other')),
      address TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (user_id, channel, namespace)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notification_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      event_name TEXT NOT NULL,
      property_match JSONB,
      target_type TEXT NOT NULL DEFAULT 'agent' CHECK (target_type = 'agent'),
      channel TEXT,
      destination TEXT,
      agent_id TEXT NOT NULL,
      message_template TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_id UUID,
      event_name TEXT,
      user_id TEXT,
      channel TEXT NOT NULL,
      destination TEXT,
      message TEXT,
      payload JSONB DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'acked')),
      error TEXT,
      agent_id TEXT,
      namespace TEXT NOT NULL DEFAULT 'default',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS agent_endpoints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id TEXT NOT NULL,
      webhook_url TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (agent_id, namespace)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS identity_graph (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_id UUID NOT NULL,
      identity_type VARCHAR(50) NOT NULL,
      identity_value VARCHAR(500) NOT NULL,
      namespace VARCHAR(100) DEFAULT 'default',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(identity_type, identity_value, namespace)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS raw_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id VARCHAR(255),
      event_type VARCHAR(20),
      payload JSONB NOT NULL,
      namespace VARCHAR(100) DEFAULT 'default',
      write_key VARCHAR(255),
      received_at TIMESTAMPTZ DEFAULT NOW(),
      replayed BOOLEAN DEFAULT false
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_suppressions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(500) NOT NULL,
      namespace VARCHAR(100) DEFAULT 'default',
      suppressed_at TIMESTAMPTZ DEFAULT NOW(),
      suppressed_by VARCHAR(255),
      reason TEXT,
      UNIQUE(user_id, namespace)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS deletion_audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(500) NOT NULL,
      namespace VARCHAR(100),
      action VARCHAR(20) NOT NULL,
      tables_affected TEXT[],
      rows_deleted INT,
      performed_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS error_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fingerprint VARCHAR(64) UNIQUE NOT NULL,
      title TEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'error',
      level VARCHAR(20) DEFAULT 'error',
      status VARCHAR(20) DEFAULT 'open',
      namespace VARCHAR(100) DEFAULT 'default',
      source_file TEXT,
      first_seen_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      event_count INTEGER DEFAULT 1,
      assigned_to VARCHAR(255),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS error_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fingerprint VARCHAR(64) NOT NULL REFERENCES error_groups(fingerprint) ON DELETE CASCADE,
      type VARCHAR(50) DEFAULT 'error',
      level VARCHAR(20) DEFAULT 'error',
      message TEXT NOT NULL,
      stack_trace TEXT,
      source_file TEXT,
      source_line INTEGER,
      source_column INTEGER,
      namespace VARCHAR(100) DEFAULT 'default',
      user_id TEXT,
      user_email VARCHAR(255),
      context JSONB DEFAULT '{}',
      tags JSONB DEFAULT '{}',
      release VARCHAR(255),
      environment VARCHAR(100),
      sdk_name VARCHAR(100),
      sdk_version VARCHAR(50),
      os_name VARCHAR(100),
      os_version VARCHAR(100),
      browser_name VARCHAR(100),
      browser_version VARCHAR(100),
      url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR(255) UNIQUE NOT NULL,
      agent_id VARCHAR(255) NOT NULL,
      instance_id VARCHAR(255),
      agent_type VARCHAR(100),
      model VARCHAR(100),
      task TEXT,
      config JSONB DEFAULT '{}',
      namespace VARCHAR(100) DEFAULT 'default',
      status VARCHAR(20) DEFAULT 'active',
      total_tokens INTEGER DEFAULT 0,
      total_cost_usd NUMERIC(10, 6) DEFAULT 0,
      generation_count INTEGER DEFAULT 0,
      tool_call_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      duration_ms INTEGER,
      exit_reason VARCHAR(100),
      started_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ensureColumn(query, "event_source", "user_id", "TEXT");
  await ensureColumn(query, "event_source", "metadata", "JSONB");
  await ensureColumn(
    query,
    "playmaker_user_source",
    "original_user_id",
    "VARCHAR(255)"
  );
  await ensureColumn(query, "playmaker_user_source", "meta", "JSONB NOT NULL DEFAULT '[]'::jsonb");
  await ensureColumn(query, "write_keys", "name", "TEXT");
  await ensureColumn(query, "write_keys", "revoked_at", "TIMESTAMP WITH TIME ZONE");
  await ensureColumn(query, "notifications", "payload", "JSONB DEFAULT '{}'::jsonb");
  await ensureColumn(query, "notifications", "agent_id", "TEXT");
  await ensureColumn(query, "notifications", "error", "TEXT");
  await ensureColumn(
    query,
    "agent_sessions",
    "namespace",
    "VARCHAR(100) DEFAULT 'default'"
  );

  await query(
    "CREATE INDEX IF NOT EXISTS idx_event_source_user_id ON event_source(user_id)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_event_source_event_type ON event_source(event_type)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_event_source_created_at ON event_source(created_at)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_playmaker_user_source_email ON playmaker_user_source(email)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_user_channels_user ON user_channels(user_id, namespace)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_notification_rules_event ON notification_rules(event_name, namespace) WHERE enabled = true"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_notifications_pending ON notifications(status, agent_id, created_at) WHERE status = 'pending'"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_identity_canonical ON identity_graph(canonical_id)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_identity_lookup ON identity_graph(identity_type, identity_value, namespace)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_raw_events_time ON raw_events(namespace, received_at)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_suppressions_lookup ON user_suppressions(user_id, namespace)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_deletion_audit ON deletion_audit_log(user_id, created_at)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_error_groups_status ON error_groups(status, namespace)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_error_events_fingerprint ON error_events(fingerprint, created_at DESC)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id, started_at DESC)"
  );

  logger.info("[038] Required schema is present");
}

module.exports = { up };
