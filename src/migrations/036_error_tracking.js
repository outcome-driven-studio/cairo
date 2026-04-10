const logger = require('../utils/logger');

async function up(query) {
  logger.info('Creating error tracking tables...');

  try {
    // Error groups: deduplicated by fingerprint
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

    await query('CREATE INDEX IF NOT EXISTS idx_error_groups_status ON error_groups(status, namespace)');
    await query('CREATE INDEX IF NOT EXISTS idx_error_groups_last_seen ON error_groups(last_seen_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_error_groups_namespace ON error_groups(namespace, last_seen_at DESC)');

    // Individual error events
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

    await query('CREATE INDEX IF NOT EXISTS idx_error_events_fingerprint ON error_events(fingerprint, created_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_error_events_namespace ON error_events(namespace, created_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_error_events_user ON error_events(user_email, created_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_error_events_created ON error_events(created_at DESC)');

    logger.info('Error tracking tables created successfully');
  } catch (error) {
    logger.error('Failed to create error tracking tables:', error);
    throw error;
  }
}

async function down(query) {
  await query('DROP TABLE IF EXISTS error_events CASCADE');
  await query('DROP TABLE IF EXISTS error_groups CASCADE');
}

module.exports = { up, down };
