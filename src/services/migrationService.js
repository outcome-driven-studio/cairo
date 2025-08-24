/**
 * Migration Service
 *
 * Manages database migrations for Cairo CDP including:
 * - Running migrations in order
 * - Tracking migration status
 * - Rollback capabilities
 * - Migration validation
 */

const fs = require("fs");
const path = require("path");
const { query } = require("../utils/db");
const logger = require("../utils/logger");

class MigrationService {
  constructor() {
    this.migrationsDir = path.join(__dirname, "../migrations");
    this.initialized = false;
  }

  /**
   * Initialize migration tracking table
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create migrations table to track applied migrations
      await query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          description TEXT,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          success BOOLEAN DEFAULT true,
          execution_time_ms INTEGER,
          error_message TEXT
        )
      `);

      // Create index for quick lookups
      await query(`
        CREATE INDEX IF NOT EXISTS idx_migrations_filename 
        ON migrations(filename)
      `);

      logger.info("[Migration Service] ✅ Migration tracking initialized");
      this.initialized = true;
    } catch (error) {
      logger.error(
        "[Migration Service] ❌ Failed to initialize migration tracking:",
        error
      );
      throw error;
    }
  }

  /**
   * Get all available migration files
   */
  getAvailableMigrations() {
    try {
      const files = fs
        .readdirSync(this.migrationsDir)
        .filter((file) => file.endsWith(".js"))
        .sort(); // Ensure order by filename

      return files.map((filename) => ({
        filename,
        path: path.join(this.migrationsDir, filename),
      }));
    } catch (error) {
      logger.error(
        "[Migration Service] Failed to read migrations directory:",
        error
      );
      return [];
    }
  }

  /**
   * Get applied migrations from database
   */
  async getAppliedMigrations() {
    try {
      const result = await query(`
        SELECT filename, applied_at, success, execution_time_ms, error_message
        FROM migrations 
        ORDER BY applied_at
      `);

      return result.rows;
    } catch (error) {
      logger.error(
        "[Migration Service] Failed to get applied migrations:",
        error
      );
      return [];
    }
  }

  /**
   * Get pending migrations that need to be run
   */
  async getPendingMigrations() {
    const available = this.getAvailableMigrations();
    const applied = await this.getAppliedMigrations();

    const appliedFilenames = new Set(
      applied.filter((m) => m.success).map((m) => m.filename)
    );

    return available.filter((m) => !appliedFilenames.has(m.filename));
  }

  /**
   * Run a single migration
   */
  async runMigration(migrationPath, filename) {
    const startTime = Date.now();

    logger.info(`[Migration Service] Running migration: ${filename}`);

    try {
      // Require the migration module
      delete require.cache[require.resolve(migrationPath)]; // Clear cache
      const migration = require(migrationPath);

      if (typeof migration.up !== "function") {
        throw new Error(
          `Migration ${filename} does not export an 'up' function`
        );
      }

      // Run the migration
      const result = await migration.up(query);

      const executionTime = Date.now() - startTime;

      // Record successful migration
      await query(
        `
        INSERT INTO migrations (filename, description, applied_at, success, execution_time_ms)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (filename) DO UPDATE SET
          applied_at = EXCLUDED.applied_at,
          success = EXCLUDED.success,
          execution_time_ms = EXCLUDED.execution_time_ms,
          error_message = NULL
      `,
        [
          filename,
          migration.description || `Migration: ${filename}`,
          new Date(),
          true,
          executionTime,
        ]
      );

      logger.info(
        `[Migration Service] ✅ Migration ${filename} completed in ${executionTime}ms`
      );

      return {
        success: true,
        filename,
        executionTime,
        result,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error(
        `[Migration Service] ❌ Migration ${filename} failed after ${executionTime}ms:`,
        error
      );

      // Record failed migration
      await query(
        `
        INSERT INTO migrations (filename, description, applied_at, success, execution_time_ms, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (filename) DO UPDATE SET
          applied_at = EXCLUDED.applied_at,
          success = EXCLUDED.success,
          execution_time_ms = EXCLUDED.execution_time_ms,
          error_message = EXCLUDED.error_message
      `,
        [
          filename,
          `Failed migration: ${filename}`,
          new Date(),
          false,
          executionTime,
          error.message,
        ]
      );

      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runPendingMigrations() {
    await this.initialize();

    const pending = await this.getPendingMigrations();

    if (pending.length === 0) {
      logger.info("[Migration Service] ✅ No pending migrations");
      return { success: true, migrationsRun: 0 };
    }

    logger.info(
      `[Migration Service] Found ${pending.length} pending migrations`
    );

    const results = [];
    let successCount = 0;

    for (const migration of pending) {
      try {
        const result = await this.runMigration(
          migration.path,
          migration.filename
        );
        results.push(result);
        successCount++;
      } catch (error) {
        logger.error(
          `[Migration Service] Migration batch stopped at ${migration.filename} due to error`
        );
        results.push({
          success: false,
          filename: migration.filename,
          error: error.message,
        });
        break; // Stop on first failure to maintain consistency
      }
    }

    const summary = {
      success: successCount === pending.length,
      migrationsRun: successCount,
      totalPending: pending.length,
      results,
    };

    if (summary.success) {
      logger.info(
        `[Migration Service] 🎉 All ${successCount} migrations completed successfully`
      );
    } else {
      logger.error(
        `[Migration Service] ❌ Migration batch failed: ${successCount}/${pending.length} successful`
      );
    }

    return summary;
  }

  /**
   * Get migration status for monitoring
   */
  async getStatus() {
    await this.initialize();

    const available = this.getAvailableMigrations();
    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();

    const lastMigration =
      applied.length > 0 ? applied[applied.length - 1] : null;

    const failedMigrations = applied.filter((m) => !m.success);

    return {
      totalMigrations: available.length,
      appliedMigrations: applied.filter((m) => m.success).length,
      pendingMigrations: pending.length,
      failedMigrations: failedMigrations.length,
      lastMigration: lastMigration
        ? {
            filename: lastMigration.filename,
            appliedAt: lastMigration.applied_at,
            executionTime: lastMigration.execution_time_ms,
          }
        : null,
      status: pending.length === 0 ? "up-to-date" : "pending-migrations",
      errors: failedMigrations.map((m) => ({
        filename: m.filename,
        error: m.error_message,
        appliedAt: m.applied_at,
      })),
    };
  }

  /**
   * Rollback the last migration (if it supports rollback)
   */
  async rollbackLastMigration() {
    const applied = await this.getAppliedMigrations();
    const successful = applied.filter((m) => m.success);

    if (successful.length === 0) {
      throw new Error("No successful migrations to rollback");
    }

    const lastMigration = successful[successful.length - 1];
    const migrationPath = path.join(this.migrationsDir, lastMigration.filename);

    logger.info(
      `[Migration Service] Rolling back migration: ${lastMigration.filename}`
    );

    try {
      // Require the migration module
      delete require.cache[require.resolve(migrationPath)];
      const migration = require(migrationPath);

      if (typeof migration.down !== "function") {
        throw new Error(
          `Migration ${lastMigration.filename} does not support rollback (no 'down' function)`
        );
      }

      // Run rollback
      const startTime = Date.now();
      await migration.down(query);
      const executionTime = Date.now() - startTime;

      // Remove migration record
      await query(
        `
        DELETE FROM migrations WHERE filename = $1
      `,
        [lastMigration.filename]
      );

      logger.info(
        `[Migration Service] ✅ Migration ${lastMigration.filename} rolled back successfully`
      );

      return {
        success: true,
        filename: lastMigration.filename,
        executionTime,
      };
    } catch (error) {
      logger.error(
        `[Migration Service] ❌ Failed to rollback migration ${lastMigration.filename}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Validate all migration files
   */
  validateMigrations() {
    const migrations = this.getAvailableMigrations();
    const issues = [];

    for (const migration of migrations) {
      try {
        // Try to require the migration
        delete require.cache[require.resolve(migration.path)];
        const migrationModule = require(migration.path);

        // Check for required functions
        if (typeof migrationModule.up !== "function") {
          issues.push({
            filename: migration.filename,
            issue: 'Missing required "up" function',
          });
        }

        // Optional: check for down function (rollback support)
        if (typeof migrationModule.down !== "function") {
          issues.push({
            filename: migration.filename,
            issue: 'No "down" function (rollback not supported)',
            severity: "warning",
          });
        }
      } catch (error) {
        issues.push({
          filename: migration.filename,
          issue: `Failed to load migration: ${error.message}`,
          severity: "error",
        });
      }
    }

    return {
      valid: issues.filter((i) => i.severity !== "warning").length === 0,
      issues,
      totalMigrations: migrations.length,
    };
  }
}

// Export singleton instance
const migrationService = new MigrationService();

module.exports = {
  MigrationService,
  migrationService,
};
