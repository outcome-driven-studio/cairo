/**
 * Migration: Sync Performance Optimizations
 *
 * Applies database optimizations specifically for sync operations:
 * - Creates sync-optimized indexes
 * - Adds performance monitoring capabilities
 * - Optimizes for bulk operations
 */

const logger = require("../utils/logger");

/**
 * Apply sync performance optimizations
 * @param {Function} query - Database query function
 */
async function up(query) {
  logger.info("Applying sync performance optimizations...");

  try {
    // 1. Create sync-optimized indexes for event_source table
    logger.info("Creating sync-optimized indexes for event_source...");

    const eventSourceIndexes = [
      {
        name: "idx_event_source_sync_platform_date",
        query: `CREATE INDEX IF NOT EXISTS idx_event_source_sync_platform_date 
                ON event_source(platform, created_at DESC)`,
        description: "Optimizes platform-specific date range sync queries",
      },
      {
        name: "idx_event_source_event_key_hash",
        query: `CREATE INDEX IF NOT EXISTS idx_event_source_event_key_hash 
                ON event_source USING hash(event_key)`,
        description: "Optimizes event_key deduplication during sync",
      },
      {
        name: "idx_event_source_user_platform_date",
        query: `CREATE INDEX IF NOT EXISTS idx_event_source_user_platform_date 
                ON event_source(user_id, platform, created_at DESC)`,
        description: "Optimizes user-specific sync queries",
      },
      {
        name: "idx_event_source_metadata_namespace",
        query: `CREATE INDEX IF NOT EXISTS idx_event_source_metadata_namespace 
                ON event_source USING gin((metadata -> 'namespace'))`,
        description: "Optimizes namespace-based filtering for full sync",
      },
      {
        name: "idx_event_source_recent_events",
        query: `CREATE INDEX IF NOT EXISTS idx_event_source_recent_events 
                ON event_source(platform, event_type, created_at DESC)`,
        description:
          "Optimizes queries for recent events (most sync operations)",
      },
    ];

    for (const index of eventSourceIndexes) {
      try {
        await query(index.query);
        logger.info(`✅ ${index.name}: ${index.description}`);
      } catch (error) {
        if (error.message.includes("already exists")) {
          logger.info(`⏭️ ${index.name}: Already exists`);
        } else {
          logger.warn(`❌ Failed to create ${index.name}:`, error.message);
        }
      }
    }

    // 2. Create sync-optimized indexes for user tables
    logger.info("Creating sync-optimized indexes for user tables...");

    const userSourceIndexes = [
      {
        name: "idx_user_source_email_platform",
        query: `CREATE INDEX IF NOT EXISTS idx_user_source_email_platform 
                ON user_source(email, platform)`,
        description: "Optimizes user deduplication during sync",
      },
      {
        name: "idx_user_source_sync_tracking",
        query: `CREATE INDEX IF NOT EXISTS idx_user_source_sync_tracking 
                ON user_source(platform, updated_at DESC) 
                INCLUDE (email, created_at)`,
        description: "Optimizes sync progress tracking for users",
      },
    ];

    if (!hasPlatformColumn) {
      logger.info('⏭️ Skipping user_source platform indexes (platform column does not exist)');
    } else {
      const userSourceIndexes = [
        {
          name: "idx_user_source_email_platform",
          query: `CREATE INDEX IF NOT EXISTS idx_user_source_email_platform 
                  ON user_source(email, platform)`,
          description: "Optimizes user deduplication during sync",
        },
        {
          name: "idx_user_source_sync_tracking",
          query: `CREATE INDEX IF NOT EXISTS idx_user_source_sync_tracking 
                  ON user_source(platform, updated_at DESC) 
                  INCLUDE (email, created_at)`,
          description: "Optimizes sync progress tracking for users",
        },
      ];

      for (const index of userSourceIndexes) {
        try {
          await query(index.query);
          logger.info(`✅ ${index.name}: ${index.description}`);
        } catch (error) {
          if (error.message.includes("already exists")) {
            logger.info(`⏭️ ${index.name}: Already exists`);
          } else {
            logger.warn(`❌ Failed to create ${index.name}:`, error.message);
          }
        }
      }
    }

    // 3. Create performance monitoring table for sync operations
    logger.info("Creating sync performance monitoring table...");

    await query(`
      CREATE TABLE IF NOT EXISTS sync_performance_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sync_type VARCHAR(50) NOT NULL, -- 'periodic', 'full', 'manual'
        platform VARCHAR(50) NOT NULL,
        namespace VARCHAR(100),
        operation VARCHAR(50) NOT NULL, -- 'users', 'events', 'mixed'
        records_processed INTEGER DEFAULT 0,
        records_inserted INTEGER DEFAULT 0,
        records_updated INTEGER DEFAULT 0,
        records_skipped INTEGER DEFAULT 0,
        duration_ms INTEGER NOT NULL,
        memory_usage_mb DECIMAL(10,2),
        error_message TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on sync performance log
    await query(`
      CREATE INDEX IF NOT EXISTS idx_sync_performance_log_lookup
      ON sync_performance_log(platform, sync_type, created_at DESC)
    `);

    logger.info("✅ Sync performance monitoring table created");

    // 4. Create function to track sync performance
    await query(`
      CREATE OR REPLACE FUNCTION log_sync_performance(
        p_sync_type VARCHAR,
        p_platform VARCHAR,
        p_namespace VARCHAR DEFAULT NULL,
        p_operation VARCHAR DEFAULT 'mixed',
        p_records_processed INTEGER DEFAULT 0,
        p_records_inserted INTEGER DEFAULT 0,
        p_records_updated INTEGER DEFAULT 0,
        p_records_skipped INTEGER DEFAULT 0,
        p_duration_ms INTEGER DEFAULT 0,
        p_memory_usage_mb DECIMAL DEFAULT NULL,
        p_error_message TEXT DEFAULT NULL,
        p_metadata JSONB DEFAULT '{}'
      ) RETURNS UUID AS $$
      DECLARE
        log_id UUID;
      BEGIN
        INSERT INTO sync_performance_log (
          sync_type, platform, namespace, operation,
          records_processed, records_inserted, records_updated, records_skipped,
          duration_ms, memory_usage_mb, error_message, metadata
        ) VALUES (
          p_sync_type, p_platform, p_namespace, p_operation,
          p_records_processed, p_records_inserted, p_records_updated, p_records_skipped,
          p_duration_ms, p_memory_usage_mb, p_error_message, p_metadata
        ) RETURNING id INTO log_id;
        
        RETURN log_id;
      END;
      $$ LANGUAGE plpgsql;
    `);

    logger.info("✅ Sync performance logging function created");

    // 5. Create view for sync performance analytics
    await query(`
      CREATE OR REPLACE VIEW sync_performance_analytics AS
      SELECT 
        platform,
        sync_type,
        DATE_TRUNC('hour', created_at) as hour_bucket,
        COUNT(*) as sync_count,
        AVG(duration_ms) as avg_duration_ms,
        AVG(records_processed) as avg_records_processed,
        AVG(memory_usage_mb) as avg_memory_usage_mb,
        SUM(records_inserted) as total_records_inserted,
        SUM(records_updated) as total_records_updated,
        COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as error_count,
        (COUNT(CASE WHEN error_message IS NULL THEN 1 END) * 100.0 / COUNT(*)) as success_rate
      FROM sync_performance_log
      GROUP BY platform, sync_type, DATE_TRUNC('hour', created_at)
      ORDER BY hour_bucket DESC, platform, sync_type
    `);

    logger.info("✅ Sync performance analytics view created");

    // 6. Update database configuration for better sync performance
    logger.info("Applying database configuration optimizations...");

    const dbOptimizations = [
      `ALTER SYSTEM SET work_mem = '16MB'`, // Increase work memory for sorting/hashing
      `ALTER SYSTEM SET maintenance_work_mem = '256MB'`, // Better for index creation
      `ALTER SYSTEM SET effective_cache_size = '1GB'`, // Assume reasonable cache
      `ALTER SYSTEM SET random_page_cost = 1.1`, // Assume SSD storage
      `ALTER SYSTEM SET checkpoint_completion_target = 0.9`, // Spread checkpoints
    ];

    for (const optimization of dbOptimizations) {
      try {
        await query(optimization);
        logger.info(`✅ Applied: ${optimization}`);
      } catch (error) {
        logger.warn(
          `⚠️ Could not apply optimization (may require superuser): ${optimization}`,
          error.message
        );
      }
    }

    // 7. Analyze tables to update statistics
    logger.info("Updating table statistics for query optimizer...");

    const tablesToAnalyze = ["event_source", "user_source"];

    for (const table of tablesToAnalyze) {
      try {
        await query(`ANALYZE ${table}`);
        logger.info(`✅ Analyzed table: ${table}`);
      } catch (error) {
        logger.warn(`❌ Failed to analyze table ${table}:`, error.message);
      }
    }

    logger.info("🎉 Sync performance optimizations completed successfully!");

    // Return summary
    return {
      success: true,
      indexes_created: eventSourceIndexes.length + userSourceIndexes.length,
      monitoring_enabled: true,
      performance_tuning_applied: true,
    };
  } catch (error) {
    logger.error("❌ Failed to apply sync performance optimizations:", error);
    throw error;
  }
}

/**
 * Rollback sync performance optimizations (if needed)
 * @param {Function} query - Database query function
 */
async function down(query) {
  logger.info("Rolling back sync performance optimizations...");

  const indexesToDrop = [
    "idx_event_source_sync_platform_date",
    "idx_event_source_event_key_hash",
    "idx_event_source_user_platform_date",
    "idx_event_source_metadata_namespace",
    "idx_event_source_recent_events",
    "idx_user_source_email_platform",
    "idx_user_source_sync_tracking",
    "idx_sync_performance_log_lookup",
  ];

  // Drop indexes
  for (const indexName of indexesToDrop) {
    try {
      await query(`DROP INDEX IF EXISTS ${indexName}`);
      logger.info(`✅ Dropped index: ${indexName}`);
    } catch (error) {
      logger.warn(`❌ Failed to drop index ${indexName}:`, error.message);
    }
  }

  // Drop performance monitoring objects
  try {
    await query("DROP VIEW IF EXISTS sync_performance_analytics");
    await query("DROP FUNCTION IF EXISTS log_sync_performance");
    await query("DROP TABLE IF EXISTS sync_performance_log");
    logger.info("✅ Dropped sync performance monitoring objects");
  } catch (error) {
    logger.warn(
      "❌ Failed to drop performance monitoring objects:",
      error.message
    );
  }

  logger.info("🔄 Sync performance optimizations rollback completed");
}

module.exports = {
  up,
  down,
  description: "Apply database optimizations for sync operations",
};
