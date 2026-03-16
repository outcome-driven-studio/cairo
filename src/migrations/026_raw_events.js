// Raw events migration for Cairo CDP
// Creates table for storing raw event payloads for replay

const logger = require('../utils/logger');

async function up(query) {
  logger.info('Creating raw events table...');

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
    logger.info('raw_events table created');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_raw_events_time ON raw_events(namespace, received_at);
      CREATE INDEX IF NOT EXISTS idx_raw_events_type ON raw_events(event_type, received_at);
    `);
    logger.info('Raw events indexes created');

    logger.info('Raw events migration completed successfully');
  } catch (error) {
    logger.error('Raw events migration failed:', error);
    throw error;
  }
}

async function down(query) {
  logger.info('Rolling back raw events table...');

  try {
    await query('DROP TABLE IF EXISTS raw_events CASCADE');
    logger.info('Raw events table rolled back successfully');
  } catch (error) {
    logger.error('Raw events rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };
