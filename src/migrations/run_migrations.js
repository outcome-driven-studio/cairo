// Load environment variables (process env in cloud, .env.local locally)
const { loadEnv } = require("../utils/envLoader");
loadEnv();

const fs = require("fs");
const path = require("path");
const { query, pool } = require("../utils/db");
const logger = require("../utils/logger");
const { verifyRequiredTables } = require("./requiredTables");

async function runMigrations() {
  try {
    logger.info("🔧 Starting database migrations...");

    const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL or POSTGRES_URL is not set!");
    }

    const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ":***@");
    logger.info(`📡 Connecting to database: ${maskedUrl}`);

    try {
      await query("SELECT NOW()");
      logger.info("✅ Database connection successful");
    } catch (err) {
      logger.error("❌ Database connection failed:", err.message);
      throw err;
    }

    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    logger.info("✅ Migrations tracking table ready");

    const { rows: executedMigrations } = await query(
      "SELECT name FROM migrations"
    );
    const executedSet = new Set(executedMigrations.map((m) => m.name));
    logger.info(
      `📋 Found ${executedMigrations.length} previously executed migrations`
    );

    const migrationsDir = __dirname;
    const allFiles = fs.readdirSync(migrationsDir);
    const files = allFiles
      .filter(
        (f) =>
          (f.endsWith(".sql") || f.endsWith(".js")) &&
          f !== "run_migrations.js" &&
          f !== "requiredTables.js"
      )
      .sort((a, b) => {
        if (a.includes("000_create_core_tables")) return -1;
        if (b.includes("000_create_core_tables")) return 1;
        return a.localeCompare(b);
      });

    logger.info(
      `🔄 Found ${files.length} migration files to process: ${files.join(", ")}`
    );

    for (const file of files) {
      const migrationName = path.basename(file);

      if (executedSet.has(migrationName)) {
        logger.debug(`Migration ${migrationName} already executed, skipping.`);
        continue;
      }

      logger.info(`⏳ Running migration: ${migrationName}`);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txQuery = (text, params) => client.query(text, params);

        if (migrationName.endsWith(".sql")) {
          const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
          await txQuery(sql);
        } else {
          const migration = require(path.join(migrationsDir, file));
          if (typeof migration.up !== "function") {
            throw new Error(
              `Migration ${migrationName} does not have an 'up' function.`
            );
          }
          await migration.up(txQuery);
        }

        await txQuery("INSERT INTO migrations (name) VALUES ($1)", [
          migrationName,
        ]);
        await client.query("COMMIT");
        logger.info(`Successfully executed migration: ${migrationName}`);
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch (_) {
          // ignore rollback errors
        }
        logger.error(`Failed to run migration ${migrationName}`, error);
        throw error;
      } finally {
        client.release();
      }
    }

    const missing = await verifyRequiredTables(query);
    if (missing.length) {
      throw new Error(
        `Required tables missing after migrations: ${missing.join(", ")}`
      );
    }
    logger.info("✅ All required tables are present");
    logger.info("✅ All migrations completed successfully!");
  } catch (error) {
    logger.error("Error running migrations:", error);
    throw error;
  }
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info("🎉 Database setup completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("❌ Database setup failed:", error);
      process.exit(1);
    });
}
