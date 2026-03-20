const logger = require('../utils/logger');

async function up(query) {
  logger.info('Creating agent tracking tables...');

  try {
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

    await query('CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id, started_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status, namespace)');
    await query('CREATE INDEX IF NOT EXISTS idx_agent_sessions_namespace ON agent_sessions(namespace, started_at DESC)');

    logger.info('Agent tracking tables created successfully');
  } catch (error) {
    logger.error('Failed to create agent tracking tables:', error);
    throw error;
  }
}

async function down(query) {
  await query('DROP TABLE IF EXISTS agent_sessions CASCADE');
}

module.exports = { up, down };
