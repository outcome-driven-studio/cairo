#!/usr/bin/env node

require('dotenv').config();
const logger = require('../src/utils/logger');
const { pool, query, healthCheck } = require('../src/utils/db');
const { runMigrations } = require('../src/migrations/run_migrations');

async function resetDatabase() {
  try {
    logger.info('🔥 STARTING COMPLETE DATABASE RESET...');
    logger.info('⚠️  This will DELETE ALL DATA and recreate the database schema');

    // 1. Test database connection
    logger.info('\n1️⃣ Testing database connection...');
    const health = await healthCheck();

    if (!health.healthy) {
      throw new Error(`Database connection failed: ${health.error}`);
    }

    logger.info('✅ Database connection successful');
    logger.info(`   Database: ${health.database}`);
    logger.info(`   Response time: ${health.responseTime}`);

    // 2. Drop all existing tables (CASCADE to handle dependencies)
    logger.info('\n2️⃣ Dropping all existing tables...');

    // Get all table names
    const tablesResult = await query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `);

    for (const row of tablesResult.rows) {
      const tableName = row.tablename;
      logger.info(`   Dropping table: ${tableName}`);
      await query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
    }

    // Also drop any functions
    const functionsResult = await query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_type = 'FUNCTION'
    `);

    for (const row of functionsResult.rows) {
      const functionName = row.routine_name;
      logger.info(`   Dropping function: ${functionName}`);
      await query(`DROP FUNCTION IF EXISTS ${functionName} CASCADE`);
    }

    logger.info('✅ All existing tables and functions dropped');

    // 3. Run all migrations to recreate schema
    logger.info('\n3️⃣ Running database migrations...');
    await runMigrations();
    logger.info('✅ Database migrations completed');

    // 4. Verify core tables exist
    logger.info('\n4️⃣ Verifying core tables...');
    const tables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tableNames = tables.rows.map(row => row.table_name);
    logger.info(`✅ Created ${tableNames.length} tables:`);
    tableNames.forEach(name => logger.info(`   - ${name}`));

    // 5. Check namespace configuration
    logger.info('\n5️⃣ Checking namespace configuration...');
    const namespaces = await query('SELECT name, keywords, table_name FROM namespaces WHERE is_active = true');

    logger.info(`✅ Found ${namespaces.rows.length} active namespaces:`);
    for (const ns of namespaces.rows) {
      logger.info(`   - ${ns.name}: ${ns.table_name} (keywords: ${JSON.stringify(ns.keywords)})`);
    }

    // 6. Create namespace tables for default namespace
    logger.info('\n6️⃣ Creating namespace user tables...');
    for (const ns of namespaces.rows) {
      const tableName = ns.table_name;

      // Create the user_source table for this namespace
      await query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) NOT NULL,
          user_source VARCHAR(50) NOT NULL,
          namespace VARCHAR(50) DEFAULT '${ns.name}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create indexes
      await query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_email ON ${tableName}(email)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_source ON ${tableName}(user_source)`);

      logger.info(`   ✅ Created table: ${tableName}`);
    }

    // 7. Test Mixpanel configuration
    logger.info('\n7️⃣ Testing Mixpanel configuration...');
    if (process.env.MIXPANEL_PROJECT_TOKEN) {
      const MixpanelService = require('../src/services/mixpanelService');
      const mixpanel = new MixpanelService(process.env.MIXPANEL_PROJECT_TOKEN);

      // Send a test event
      const testResult = await mixpanel.track(
        'system@cairo.com',
        'Database Reset Completed',
        {
          source: 'reset_script',
          timestamp: new Date().toISOString(),
          tables_created: tableNames.length,
          namespaces_active: namespaces.rows.length,
          default_namespace: namespaces.rows[0]?.name || 'none'
        }
      );

      if (testResult.success) {
        logger.info('✅ Mixpanel integration working - event sent successfully');
        logger.info('   Check your Mixpanel dashboard for the "Database Reset Completed" event');
      } else {
        logger.warn('⚠️  Mixpanel event failed:', testResult.error);
        logger.info('   Project Token:', process.env.MIXPANEL_PROJECT_TOKEN.substring(0, 10) + '...');
      }
    } else {
      logger.warn('⚠️  Mixpanel not configured (MIXPANEL_PROJECT_TOKEN missing)');
    }

    // 8. Final health check
    logger.info('\n8️⃣ Final system health check...');
    const finalHealth = await healthCheck();

    logger.info('\n' + '='.repeat(60));
    logger.info('✨ DATABASE RESET COMPLETED SUCCESSFULLY!');
    logger.info('='.repeat(60));
    logger.info('📊 Final Status:');
    logger.info(`   ✅ Database: ${finalHealth.healthy ? 'Healthy' : 'Unhealthy'}`);
    logger.info(`   ✅ Response Time: ${finalHealth.responseTime}`);
    logger.info(`   ✅ Tables Created: ${tableNames.length}`);
    logger.info(`   ✅ Default Namespace: ${namespaces.rows[0]?.name || 'auto-generated'}`);
    logger.info(`   ✅ Namespace Format: {greekmyth}-{verb}-{adjective}-{spaceobject}`);
    logger.info(`   ✅ Mixpanel: ${process.env.MIXPANEL_PROJECT_TOKEN ? 'Configured' : 'Not configured'}`);
    logger.info('\n🚀 System is ready for use!');

    // Close the database pool
    await pool.end();
    process.exit(0);

  } catch (error) {
    logger.error('❌ Database reset failed:', error);
    logger.error('Stack trace:', error.stack);

    // Provide troubleshooting guidance
    logger.info('\n🔧 Troubleshooting steps:');
    logger.info('1. Verify POSTGRES_URL is correct in your .env file');
    logger.info('2. Ensure the database exists and is accessible');
    logger.info('3. Check Neon console for database status');
    logger.info('4. Verify MIXPANEL_PROJECT_TOKEN is correct');
    logger.info('5. Make sure you have proper database permissions');

    await pool.end();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Confirmation prompt
if (require.main === module) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n⚠️  WARNING: This will DELETE ALL DATA in your database!');
  console.log('   Database:', process.env.POSTGRES_URL?.split('@')[1]?.split('/')[0] || 'unknown');

  rl.question('\n❓ Are you sure you want to continue? (yes/no): ', (answer) => {
    rl.close();

    if (answer.toLowerCase() === 'yes') {
      resetDatabase();
    } else {
      console.log('❌ Database reset cancelled');
      process.exit(0);
    }
  });
}

module.exports = { resetDatabase };