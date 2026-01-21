// Load environment variables (prioritizes .env.local for local dev, uses Railway env vars in cloud)
const { loadEnv } = require('../utils/envLoader');
loadEnv();

const fs = require('fs');
const path = require('path');
const { query } = require('../utils/db');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    logger.info('🔧 Starting database migrations...');
    
    // Log environment info
    const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL or POSTGRES_URL is not set!');
    }
    
    // Mask password in logs
    const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':***@');
    logger.info(`📡 Connecting to database: ${maskedUrl}`);
    
    // Test connection first
    try {
      await query('SELECT NOW()');
      logger.info('✅ Database connection successful');
    } catch (err) {
      logger.error('❌ Database connection failed:', err.message);
      throw err;
    }

    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    logger.info('✅ Migrations tracking table ready');

    const { rows: executedMigrations } = await query('SELECT name FROM migrations');
    const executedSet = new Set(executedMigrations.map(m => m.name));
    logger.info(`📋 Found ${executedMigrations.length} previously executed migrations`);

    const migrationsDir = __dirname;
    logger.info(`📂 Reading migrations from: ${migrationsDir}`);
    
    const allFiles = fs.readdirSync(migrationsDir);
    logger.info(`📄 Found ${allFiles.length} files in migrations directory`);
    
    const files = allFiles
      .filter(f => (f.endsWith('.sql') || f.endsWith('.js')) && f !== 'run_migrations.js')
      .sort((a, b) => {
        // Ensure core tables migration runs first
        if (a.includes('000_create_core_tables')) return -1;
        if (b.includes('000_create_core_tables')) return 1;
        return a.localeCompare(b);
      });
    
    logger.info(`🔄 Found ${files.length} migration files to process: ${files.join(', ')}`);

    for (const file of files) {
      const migrationName = path.basename(file);

      if (executedSet.has(migrationName)) {
        logger.debug(`Migration ${migrationName} already executed, skipping.`);
        continue;
      }

      logger.info(`⏳ Running migration: ${migrationName}`);

      await query('BEGIN');
      logger.debug(`Started transaction for ${migrationName}`);
      try {
        if (migrationName.endsWith('.sql')) {
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          await query(sql);
        } else if (migrationName.endsWith('.js')) {
          const migration = require(path.join(migrationsDir, file));
          if (typeof migration.up === 'function') {
            await migration.up(query);
          } else {
            throw new Error(`Migration ${migrationName} does not have an 'up' function.`);
          }
        }

        await query('INSERT INTO migrations (name) VALUES ($1)', [migrationName]);
        await query('COMMIT');
        logger.info(`Successfully executed migration: ${migrationName}`);
      } catch (error) {
        await query('ROLLBACK');
        logger.error(`Failed to run migration ${migrationName}`, error);
        throw error;
      }
    }

    logger.info('✅ All migrations completed successfully!');
  } catch (error) {
    logger.error('Error running migrations:', error);
    throw error;
  }
}

// Export for programmatic use
module.exports = { runMigrations };

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('🎉 Database setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Database setup failed:', error);
      process.exit(1);
    });
} 