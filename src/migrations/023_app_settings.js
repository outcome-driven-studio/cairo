// Migration: app_settings table for UI-managed config (e.g. Notion bridge)
const logger = require("../utils/logger");

async function up(query) {
  logger.info("Creating app_settings table...");
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  logger.info("✅ app_settings table created");
}

module.exports = { up };
