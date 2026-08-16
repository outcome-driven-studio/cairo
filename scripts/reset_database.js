#!/usr/bin/env node

require("dotenv").config();
const logger = require("../src/utils/logger");
const { pool, query, healthCheck } = require("../src/utils/db");
const { runMigrations } = require("../src/migrations/run_migrations");
const { REQUIRED_TABLES } = require("../src/migrations/requiredTables");

async function resetDatabase() {
  try {
    logger.info("🔥 STARTING COMPLETE DATABASE RESET...");
    logger.info("⚠️  This will DELETE ALL DATA and recreate the schema");

    const health = await healthCheck();
    if (!health.healthy) {
      throw new Error(`Database connection failed: ${health.error}`);
    }
    logger.info("✅ Database connection successful");

    const tablesResult = await query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `);

    for (const row of tablesResult.rows) {
      logger.info(`   Dropping table: ${row.tablename}`);
      await query(`DROP TABLE IF EXISTS ${row.tablename} CASCADE`);
    }

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

    logger.info(`✅ Created ${tableNames.length} tables`);
    tableNames.forEach((name) => logger.info(`   - ${name}`));
    logger.info("✨ DATABASE RESET COMPLETED SUCCESSFULLY!");

    await pool.end();
    process.exit(0);
  } catch (error) {
    logger.error("❌ Database reset failed:", error);
    logger.info("1. Verify POSTGRES_URL or DATABASE_URL");
    logger.info("2. Ensure the Postgres instance is reachable");
    logger.info("3. Confirm the role can CREATE TABLE");
    await pool.end();
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

if (require.main === module) {
  resetDatabase();
}

module.exports = { resetDatabase };
