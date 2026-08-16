#!/usr/bin/env node

require("dotenv").config();
const logger = require("../src/utils/logger");
const { runMigrations } = require("../src/migrations/run_migrations");
const { query, healthCheck, close } = require("../src/utils/db");
const { REQUIRED_TABLES } = require("../src/migrations/requiredTables");

async function restoreDatabase() {
  try {
    logger.info("🚀 Starting database restoration...");

    const health = await healthCheck();
    if (!health.healthy) {
      throw new Error(`Database connection failed: ${health.error}`);
    }
    logger.info("✅ Database connection successful");

    await runMigrations();

    const tables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tableNames = tables.rows.map((row) => row.table_name);
    const missing = REQUIRED_TABLES.filter((t) => !tableNames.includes(t));
    if (missing.length) {
      throw new Error(`Required tables still missing: ${missing.join(", ")}`);
    }

    logger.info(`✅ Found ${tableNames.length} tables:`, tableNames);
    logger.info("✅ Database restoration completed successfully!");
    await close();
    process.exit(0);
  } catch (error) {
    logger.error("❌ Database restoration failed:", error);
    logger.info("1. Verify POSTGRES_URL or DATABASE_URL");
    logger.info("2. Ensure the Postgres instance is reachable");
    logger.info("3. Confirm the role can CREATE TABLE");
    process.exit(1);
  }
}

if (require.main === module) {
  restoreDatabase();
}

module.exports = { restoreDatabase };
