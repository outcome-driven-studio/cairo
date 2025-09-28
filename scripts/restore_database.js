#!/usr/bin/env node

require('dotenv').config();
const logger = require('../src/utils/logger');
const { runMigrations } = require('../src/migrations/run_migrations');
const { query, healthCheck } = require('../src/utils/db');

async function restoreDatabase() {
  try {
    logger.info('🚀 Starting database restoration...');

    // 1. Test database connection
    logger.info('1️⃣ Testing database connection...');
    const health = await healthCheck();

    if (!health.healthy) {
      throw new Error(`Database connection failed: ${health.error}`);
    }

    logger.info('✅ Database connection successful');
    logger.info(`   Database: ${health.database}`);
    logger.info(`   Response time: ${health.responseTime}`);

    // 2. Run all migrations
    logger.info('2️⃣ Running database migrations...');
    await runMigrations();
    logger.info('✅ Database migrations completed');

    // 3. Verify core tables exist
    logger.info('3️⃣ Verifying core tables...');
    const tables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tableNames = tables.rows.map(row => row.table_name);
    logger.info(`✅ Found ${tableNames.length} tables:`, tableNames);

    // 4. Check namespace configuration
    logger.info('4️⃣ Checking namespace configuration...');
    const namespaces = await query('SELECT name, keywords, table_name FROM namespaces WHERE is_active = true');

    logger.info(`✅ Found ${namespaces.rows.length} active namespaces:`);
    for (const ns of namespaces.rows) {
      logger.info(`   - ${ns.name}: ${ns.table_name} (keywords: ${JSON.stringify(ns.keywords)})`);
    }

    // 5. Final health check
    logger.info('5️⃣ Final system health check...');
    const finalHealth = await healthCheck();
    logger.info('✅ Database restoration completed successfully!');
    logger.info('📊 Final Status:', {
      healthy: finalHealth.healthy,
      responseTime: finalHealth.responseTime,
      poolSize: finalHealth.poolSize,
      tablesCreated: tableNames.length,
      namespacesActive: namespaces.rows.length
    });

    process.exit(0);

  } catch (error) {
    logger.error('❌ Database restoration failed:', error);
    logger.error('Stack trace:', error.stack);

    // Provide troubleshooting guidance
    logger.info('\n🔧 Troubleshooting steps:');
    logger.info('1. Verify POSTGRES_URL is correct in your .env file');
    logger.info('2. Ensure the database exists and is accessible');
    logger.info('3. Check Neon console for database status');
    logger.info('4. Verify network connectivity to database host');

    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  restoreDatabase();
}

module.exports = { restoreDatabase };