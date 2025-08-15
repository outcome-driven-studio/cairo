const fs = require('fs');
const path = require('path');
const { query } = require('../utils/db');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const { rows: executedMigrations } = await query('SELECT name FROM migrations');
    const executedSet = new Set(executedMigrations.map(m => m.name));

    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => (f.endsWith('.sql') || f.endsWith('.js')) && f !== 'run_migrations.js')
      .sort();

    for (const file of files) {
      const migrationName = path.basename(file);

      if (executedSet.has(migrationName)) {
        logger.debug(`Migration ${migrationName} already executed, skipping.`);
        continue;
      }

      logger.info(`Running migration: ${migrationName}`);

      await query('BEGIN');
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

    logger.info('All migrations checked and up-to-date.');
  } catch (error) {
    logger.error('Error running migrations:', error);
    throw error;
  }
}

module.exports = { runMigrations }; 