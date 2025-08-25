/**
 * Database Optimizations for Sync Operations
 *
 * This module provides optimizations specifically for sync operations:
 * - Bulk insert/update operations
 * - Sync-specific database indexes
 * - Connection pool monitoring
 * - Query performance optimizations
 */

const { query } = require("./db");
const logger = require("./logger");

/**
 * Database Optimization Service
 */
class DatabaseOptimizations {
  constructor() {
    this.initialized = false;
    this.indexCreationInProgress = false;
    this.bulkOperationStats = {
      bulkInserts: 0,
      bulkUpdates: 0,
      totalRecordsProcessed: 0,
      averageProcessingTime: 0,
    };
  }

  /**
   * Initialize all database optimizations
   */
  async initialize() {
    if (this.initialized) {
      logger.info("[DB Optimizations] Already initialized");
      return;
    }

    logger.info("[DB Optimizations] Initializing database optimizations...");

    try {
      // Create sync-specific indexes
      await this.createSyncIndexes();

      // Validate existing indexes
      await this.validateIndexes();

      // Initialize bulk operation prepared statements
      await this.initializeBulkOperations();

      this.initialized = true;
      logger.info("[DB Optimizations] ✅ Database optimizations initialized");
    } catch (error) {
      logger.error(
        "[DB Optimizations] ❌ Failed to initialize optimizations:",
        error
      );
      throw error;
    }
  }

  /**
   * Create indexes specifically optimized for sync operations
   */
  async createSyncIndexes() {
    if (this.indexCreationInProgress) {
      logger.info("[DB Optimizations] Index creation already in progress");
      return;
    }

    this.indexCreationInProgress = true;
    logger.info("[DB Optimizations] Creating sync-optimized indexes...");

    // Sync-specific indexes for event_source table
    const syncIndexes = [
      // Composite index for sync queries (platform + created_at)
      {
        name: "idx_event_source_sync_platform_date",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_source_sync_platform_date 
                ON event_source(platform, created_at DESC)`,
        description: "Optimizes platform-specific date range sync queries",
      },

      // Index for deduplication (event_key with hash for faster lookups)
      {
        name: "idx_event_source_event_key_hash",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_source_event_key_hash 
                ON event_source USING hash(event_key)`,
        description: "Optimizes event_key deduplication during sync",
      },

      // Composite index for user-specific sync queries
      {
        name: "idx_event_source_user_platform_date",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_source_user_platform_date 
                ON event_source(user_id, platform, created_at DESC)`,
        description: "Optimizes user-specific sync queries",
      },

      // Index for full sync operations (metadata namespace filtering)
      {
        name: "idx_event_source_metadata_namespace",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_source_metadata_namespace 
                ON event_source USING gin((metadata -> 'namespace'))`,
        description: "Optimizes namespace-based filtering for full sync",
      },

      // Partial index for recent events (last 30 days) - most sync operations
      {
        name: "idx_event_source_recent_events",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_source_recent_events 
                ON event_source(platform, event_type, created_at DESC) 
                WHERE created_at >= NOW() - INTERVAL '30 days'`,
        description:
          "Optimizes queries for recent events (most sync operations)",
      },

      // Index for event type filtering with metadata
      {
        name: "idx_event_source_type_metadata",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_source_type_metadata
                ON event_source(event_type, platform) 
                INCLUDE (metadata, created_at)`,
        description: "Optimizes event type filtering with metadata access",
      },
    ];

    // Indexes for user tables (including namespace tables)
    const userSyncIndexes = [
      // Composite index for email + platform lookups
      {
        name: "idx_user_source_email_platform",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_source_email_platform 
                ON user_source(email, platform)`,
        description: "Optimizes user deduplication during sync",
      },

      // Index for sync timestamp tracking
      {
        name: "idx_user_source_sync_tracking",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_source_sync_tracking 
                ON user_source(platform, updated_at DESC) 
                INCLUDE (email, created_at)`,
        description: "Optimizes sync progress tracking for users",
      },
    ];

    const allIndexes = [...syncIndexes, ...userSyncIndexes];

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const index of allIndexes) {
      try {
        logger.debug(`[DB Optimizations] Creating index: ${index.name}`);
        await query(index.query);
        logger.debug(
          `[DB Optimizations] ✅ ${index.name}: ${index.description}`
        );
        created++;

        // Small delay to prevent overwhelming the database
        await this.sleep(100);
      } catch (error) {
        if (error.message.includes("already exists")) {
          logger.debug(`[DB Optimizations] ⏭️ ${index.name}: Already exists`);
          skipped++;
        } else {
          logger.warn(
            `[DB Optimizations] ❌ Failed to create ${index.name}:`,
            error.message
          );
          failed++;
        }
      }
    }

    this.indexCreationInProgress = false;

    logger.info(`[DB Optimizations] Index creation summary:`, {
      created,
      skipped,
      failed,
      total: allIndexes.length,
    });
  }

  /**
   * Validate that critical indexes exist
   */
  async validateIndexes() {
    logger.info("[DB Optimizations] Validating critical indexes...");

    const criticalIndexes = [
      "idx_event_source_sync_platform_date",
      "idx_event_source_event_key_hash",
      "idx_event_source_user_platform_date",
    ];

    const missingIndexes = [];

    for (const indexName of criticalIndexes) {
      try {
        const result = await query(
          `
          SELECT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE indexname = $1
          )
        `,
          [indexName]
        );

        if (!result.rows[0].exists) {
          missingIndexes.push(indexName);
        }
      } catch (error) {
        logger.warn(
          `[DB Optimizations] Failed to check index ${indexName}:`,
          error.message
        );
      }
    }

    if (missingIndexes.length > 0) {
      logger.warn(
        "[DB Optimizations] Missing critical indexes:",
        missingIndexes
      );
    } else {
      logger.info("[DB Optimizations] ✅ All critical indexes validated");
    }

    return missingIndexes;
  }

  /**
   * Initialize bulk operations for better sync performance
   */
  async initializeBulkOperations() {
    logger.info("[DB Optimizations] Initializing bulk operations...");

    // Prepare batch insert statement for events
    await query(`
      PREPARE bulk_insert_events AS
      INSERT INTO event_source (event_key, user_id, event_type, platform, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (event_key) DO NOTHING
    `);

    // Prepare batch upsert statement for users
    await query(`
      PREPARE bulk_upsert_users AS
      INSERT INTO user_source (email, name, platform, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, user_source.name),
        platform = EXCLUDED.platform,
        updated_at = EXCLUDED.updated_at
    `);

    logger.info("[DB Optimizations] ✅ Bulk operations initialized");
  }

  /**
   * Bulk insert events with optimized performance
   * @param {Array} events - Array of event objects
   * @param {Object} options - Options for bulk operation
   */
  async bulkInsertEvents(events, options = {}) {
    const startTime = Date.now();
    const batchSize = options.batchSize || 100;
    const batches = this.chunkArray(events, batchSize);

    let totalInserted = 0;
    let totalSkipped = 0;

    logger.info(
      `[DB Optimizations] Starting bulk insert of ${events.length} events in ${batches.length} batches`
    );

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        // Use transaction for each batch
        await query("BEGIN");

        let batchInserted = 0;
        for (const event of batch) {
          const result = await query(
            `
            INSERT INTO event_source (event_key, user_id, event_type, platform, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (event_key) DO NOTHING
            RETURNING id
          `,
            [
              event.event_key,
              event.user_id,
              event.event_type,
              event.platform,
              JSON.stringify(event.metadata),
              event.created_at || new Date(),
            ]
          );

          if (result.rows.length > 0) {
            batchInserted++;
          }
        }

        await query("COMMIT");

        totalInserted += batchInserted;
        totalSkipped += batch.length - batchInserted;

        logger.debug(
          `[DB Optimizations] Batch ${i + 1}/${
            batches.length
          }: ${batchInserted} inserted, ${batch.length - batchInserted} skipped`
        );
      } catch (error) {
        await query("ROLLBACK");
        logger.error(
          `[DB Optimizations] Batch ${i + 1} failed:`,
          error.message
        );
        throw error;
      }
    }

    const duration = Date.now() - startTime;

    // Update stats
    this.bulkOperationStats.bulkInserts++;
    this.bulkOperationStats.totalRecordsProcessed += events.length;
    this.bulkOperationStats.averageProcessingTime =
      (this.bulkOperationStats.averageProcessingTime + duration) / 2;

    logger.info(`[DB Optimizations] ✅ Bulk insert completed:`, {
      totalEvents: events.length,
      inserted: totalInserted,
      skipped: totalSkipped,
      duration: `${duration}ms`,
      rate: `${Math.round(events.length / (duration / 1000))} events/sec`,
    });

    return {
      success: true,
      inserted: totalInserted,
      skipped: totalSkipped,
      duration,
      rate: Math.round(events.length / (duration / 1000)),
    };
  }

  /**
   * Bulk upsert users with optimized performance
   * @param {Array} users - Array of user objects
   * @param {string} tableName - Target table name (for namespace tables)
   * @param {Object} options - Options for bulk operation
   */
  async bulkUpsertUsers(users, tableName = "user_source", options = {}) {
    const startTime = Date.now();
    const batchSize = options.batchSize || 50; // Smaller batches for upserts
    const batches = this.chunkArray(users, batchSize);

    let totalUpserted = 0;

    logger.info(
      `[DB Optimizations] Starting bulk upsert of ${users.length} users to ${tableName} in ${batches.length} batches`
    );

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        await query("BEGIN");

        for (const user of batch) {
          await query(
            `
            INSERT INTO ${tableName} (email, name, platform, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (email) DO UPDATE SET
              name = COALESCE(EXCLUDED.name, ${tableName}.name),
              platform = EXCLUDED.platform,
              updated_at = EXCLUDED.updated_at
          `,
            [
              user.email,
              user.name,
              user.platform,
              user.created_at || new Date(),
              new Date(),
            ]
          );

          totalUpserted++;
        }

        await query("COMMIT");

        logger.debug(
          `[DB Optimizations] Batch ${i + 1}/${batches.length}: ${
            batch.length
          } users processed`
        );
      } catch (error) {
        await query("ROLLBACK");
        logger.error(
          `[DB Optimizations] User batch ${i + 1} failed:`,
          error.message
        );
        throw error;
      }
    }

    const duration = Date.now() - startTime;

    // Update stats
    this.bulkOperationStats.bulkUpdates++;
    this.bulkOperationStats.totalRecordsProcessed += users.length;

    logger.info(`[DB Optimizations] ✅ Bulk upsert completed:`, {
      totalUsers: users.length,
      upserted: totalUpserted,
      tableName,
      duration: `${duration}ms`,
      rate: `${Math.round(users.length / (duration / 1000))} users/sec`,
    });

    return {
      success: true,
      upserted: totalUpserted,
      duration,
      rate: Math.round(users.length / (duration / 1000)),
    };
  }

  /**
   * Get database connection pool statistics
   */
  async getConnectionPoolStats() {
    try {
      const pool = require("./db").pool;

      return {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        maxPoolSize: pool.options.max,
        minPoolSize: pool.options.min,
        connectionTimeoutMillis: pool.options.connectionTimeoutMillis,
        idleTimeoutMillis: pool.options.idleTimeoutMillis,
      };
    } catch (error) {
      logger.warn(
        "[DB Optimizations] Failed to get connection pool stats:",
        error.message
      );
      return null;
    }
  }

  /**
   * Get bulk operation statistics
   */
  getBulkOperationStats() {
    return {
      ...this.bulkOperationStats,
      initialized: this.initialized,
    };
  }

  /**
   * Analyze query performance for sync operations
   */
  async analyzeSyncQueryPerformance() {
    logger.info("[DB Optimizations] Analyzing sync query performance...");

    const queries = [
      {
        name: "Recent events by platform",
        query: `
          EXPLAIN (ANALYZE, BUFFERS) 
          SELECT * FROM event_source 
          WHERE platform = 'smartlead' 
            AND created_at >= NOW() - INTERVAL '24 hours' 
          ORDER BY created_at DESC 
          LIMIT 1000
        `,
      },
      {
        name: "Event deduplication check",
        query: `
          EXPLAIN (ANALYZE, BUFFERS)
          SELECT EXISTS(
            SELECT 1 FROM event_source 
            WHERE event_key = 'test-key-123'
          )
        `,
      },
      {
        name: "User platform lookup",
        query: `
          EXPLAIN (ANALYZE, BUFFERS)
          SELECT * FROM user_source 
          WHERE email = 'test@example.com' 
            AND platform = 'smartlead'
        `,
      },
    ];

    const results = {};

    for (const queryTest of queries) {
      try {
        const result = await query(queryTest.query);
        results[queryTest.name] = result.rows;
        logger.debug(
          `[DB Optimizations] ✅ ${queryTest.name} analysis completed`
        );
      } catch (error) {
        logger.warn(
          `[DB Optimizations] ❌ ${queryTest.name} analysis failed:`,
          error.message
        );
        results[queryTest.name] = { error: error.message };
      }
    }

    return results;
  }

  /**
   * Utility: Split array into chunks
   * @private
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Utility: Sleep for specified milliseconds
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up old events for performance (optional maintenance)
   */
  async cleanupOldEvents(daysToKeep = 90) {
    logger.info(
      `[DB Optimizations] Starting cleanup of events older than ${daysToKeep} days...`
    );

    try {
      const result = await query(`
        DELETE FROM event_source 
        WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
        AND platform IN ('smartlead', 'lemlist')
      `);

      logger.info(
        `[DB Optimizations] ✅ Cleanup completed: ${result.rowCount} old events removed`
      );
      return result.rowCount;
    } catch (error) {
      logger.error("[DB Optimizations] ❌ Cleanup failed:", error);
      throw error;
    }
  }
}

// Export singleton instance
const dbOptimizations = new DatabaseOptimizations();

module.exports = {
  DatabaseOptimizations,
  dbOptimizations,
};
