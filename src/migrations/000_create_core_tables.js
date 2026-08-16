// Core event + user tables. Later migrations add identity, errors, auth, etc.
// CREATE TABLE IF NOT EXISTS — safe if an older install already has these.

const logger = require("../utils/logger");
const { ensurePgcrypto } = require("./requiredTables");

async function up(query) {
  logger.info("Creating core tables...");
  await ensurePgcrypto(query);

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

  await query(
    "CREATE INDEX IF NOT EXISTS idx_playmaker_user_source_email ON playmaker_user_source(email)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_event_source_user_id ON event_source(user_id)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_event_source_event_type ON event_source(event_type)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_event_source_platform ON event_source(platform)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_event_source_created_at ON event_source(created_at)"
  );

  logger.info("Core tables ready");
}

module.exports = { up };
