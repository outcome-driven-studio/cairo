/**
 * Agent-first pivot schema:
 * - write_keys (auth)
 * - user_channels (telegram/discord/whatsapp addresses)
 * - notification_rules
 * - notifications (delivery log + agent pull queue)
 * - agent_endpoints (webhook push)
 * - drop orphaned CDP / sync tables
 */

const logger = require('../utils/logger');

async function up(query) {
  logger.info('[037] Applying agent-first notification schema...');

  await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  // Core event + user tables (lightweight)
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

  // Auth
  await query(`
    CREATE TABLE IF NOT EXISTS write_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT UNIQUE NOT NULL,
      name TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      revoked_at TIMESTAMP WITH TIME ZONE
    )
  `);

  // Channel address book
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
  await query(`CREATE INDEX IF NOT EXISTS idx_user_channels_user ON user_channels(user_id, namespace)`);

  // Rules
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
  await query(`CREATE INDEX IF NOT EXISTS idx_notification_rules_event ON notification_rules(event_name, namespace) WHERE enabled = true`);

  // Delivery log / agent queue
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
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_pending ON notifications(status, agent_id, created_at) WHERE status = 'pending'`);

  // Agent webhook endpoints
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

  // Drop orphaned CDP / sync tables (IF EXISTS — safe on fresh installs)
  const dropTables = [
    'transformations',
    'tracking_plans',
    'tracking_plan_events',
    'tracking_plan_violations',
    'destination_configs_v2',
    'destination_configs',
    'destinations',
    'sources',
    'dead_letter_events',
    'sent_events',
    'campaigns',
    'sync_state',
    'namespaces',
    'app_settings',
    'config_sources',
    'config_destinations',
  ];

  for (const table of dropTables) {
    try {
      await query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      logger.info(`[037] dropped ${table}`);
    } catch (e) {
      logger.warn(`[037] could not drop ${table}: ${e.message}`);
    }
  }

  logger.info('[037] Agent-first schema applied');
}

async function down(query) {
  await query(`DROP TABLE IF EXISTS notifications CASCADE`);
  await query(`DROP TABLE IF EXISTS notification_rules CASCADE`);
  await query(`DROP TABLE IF EXISTS user_channels CASCADE`);
  await query(`DROP TABLE IF EXISTS agent_endpoints CASCADE`);
  await query(`DROP TABLE IF EXISTS write_keys CASCADE`);
}

module.exports = { up, down };
