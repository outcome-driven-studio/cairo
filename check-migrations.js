#!/usr/bin/env node

/**
 * Diagnostic: connection, migration files, and required tables.
 *   node check-migrations.js
 */

require("dotenv").config();
const { REQUIRED_TABLES } = require("./src/migrations/requiredTables");

async function checkMigrations() {
  console.log("🔍 Checking migration setup...\n");

  console.log("📌 Step 1: Check Environment Variables");
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ CRITICAL: No DATABASE_URL or POSTGRES_URL found!");
    process.exit(1);
  }
  const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ":***@");
  console.log(`✅ Database URL found: ${maskedUrl}\n`);

  console.log("📌 Step 2: Test Database Connection");
  try {
    const { query } = require("./src/utils/db");
    const result = await query("SELECT NOW() as time, version() as version");
    console.log(`✅ Connected to database successfully`);
    console.log(`   Time: ${result.rows[0].time}`);
    console.log(`   Version: ${result.rows[0].version}\n`);
  } catch (err) {
    console.error("❌ CRITICAL: Cannot connect to database!");
    console.error(`   Error: ${err.message}\n`);
    process.exit(1);
  }

  console.log("📌 Step 3: Check Migrations Directory");
  const fs = require("fs");
  const path = require("path");
  const migrationsDir = path.join(__dirname, "src", "migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.error(
      `❌ CRITICAL: Migrations directory not found at: ${migrationsDir}`
    );
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter(
      (f) =>
        (f.endsWith(".sql") || f.endsWith(".js")) &&
        f !== "run_migrations.js" &&
        f !== "requiredTables.js"
    )
    .sort();

  console.log(`✅ Found migrations directory: ${migrationsDir}`);
  console.log(`✅ Found ${files.length} migration files:`);
  files.forEach((f) => console.log(`   - ${f}`));
  console.log("");

  console.log("📌 Step 4: Check Migrations Tracking Table");
  try {
    const { query } = require("./src/utils/db");
    const result = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'migrations'
      ) as exists
    `);

    if (result.rows[0].exists) {
      const executed = await query(
        "SELECT name, executed_at FROM migrations ORDER BY executed_at"
      );
      console.log(`✅ Migrations table exists`);
      console.log(`✅ ${executed.rows.length} migrations have been executed:`);
      executed.rows.forEach((m) =>
        console.log(`   - ${m.name} (${m.executed_at})`)
      );
    } else {
      console.log(
        `⚠️  Migrations table does not exist yet (will be created on first run)`
      );
    }
  } catch (err) {
    console.error("⚠️  Could not check migrations table:", err.message);
  }
  console.log("");

  console.log("📌 Step 5: Check Required Tables");
  try {
    const { query } = require("./src/utils/db");
    const result = await query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
      ORDER BY table_name
    `,
      [REQUIRED_TABLES]
    );

    const existingTables = result.rows.map((r) => r.table_name);
    const missingTables = REQUIRED_TABLES.filter(
      (t) => !existingTables.includes(t)
    );

    if (existingTables.length > 0) {
      console.log(`✅ Found ${existingTables.length} required tables:`);
      existingTables.forEach((t) => console.log(`   - ${t}`));
    }

    if (missingTables.length > 0) {
      console.log(
        `\n⚠️  Missing ${missingTables.length} tables (run npm run migrate):`
      );
      missingTables.forEach((t) => console.log(`   - ${t}`));
    }
  } catch (err) {
    console.error("❌ Error checking tables:", err.message);
  }
  console.log("");

  console.log("📊 Summary:");
  console.log("─".repeat(50));
  console.log("💡 To run migrations:");
  console.log("   npm run migrate");
  console.log("");

  process.exit(0);
}

checkMigrations().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
