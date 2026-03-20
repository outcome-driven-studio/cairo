const logger = require('../utils/logger');

async function up(query) {
  logger.info('Creating raw events and destination config tables...');

  try {
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
    await query('CREATE INDEX IF NOT EXISTS idx_raw_events_time ON raw_events(namespace, received_at)');
    await query('CREATE INDEX IF NOT EXISTS idx_raw_events_type ON raw_events(event_type, received_at)');

    await query(`
      CREATE TABLE IF NOT EXISTS destination_configs_v2 (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        namespace VARCHAR(100) DEFAULT 'default',
        config JSONB NOT NULL DEFAULT '{}',
        enabled BOOLEAN DEFAULT true,
        event_types TEXT[] DEFAULT ARRAY['track','identify','page','screen','group','alias'],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_dest_configs_v2_ns ON destination_configs_v2(namespace, enabled)');

    await query(`
      CREATE TABLE IF NOT EXISTS dead_letter_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        destination_config_id UUID,
        destination_type VARCHAR(50),
        event_type VARCHAR(20),
        event_payload JSONB NOT NULL,
        error_message TEXT,
        retry_count INT DEFAULT 0,
        max_retries INT DEFAULT 3,
        namespace VARCHAR(100) DEFAULT 'default',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_retry_at TIMESTAMPTZ
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_dead_letter_dest ON dead_letter_events(destination_type, created_at)');

    logger.info('Raw events and destination config tables created successfully');
  } catch (error) {
    logger.error('Failed to create tables:', error);
    throw error;
  }
}

async function down(query) {
  await query('DROP TABLE IF EXISTS dead_letter_events CASCADE');
  await query('DROP TABLE IF EXISTS destination_configs_v2 CASCADE');
  await query('DROP TABLE IF EXISTS raw_events CASCADE');
}

module.exports = { up, down };
