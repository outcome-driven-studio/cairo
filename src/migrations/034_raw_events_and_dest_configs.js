const logger = require("../utils/logger");

async function up(query) {
  logger.info("Ensuring raw_events table...");

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
  await query(
    "CREATE INDEX IF NOT EXISTS idx_raw_events_time ON raw_events(namespace, received_at)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_raw_events_type ON raw_events(event_type, received_at)"
  );

  logger.info("raw_events table ready");
}

async function down(query) {
  await query("DROP TABLE IF EXISTS raw_events CASCADE");
}

module.exports = { up, down };
