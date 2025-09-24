#!/usr/bin/env node

/**
 * Database Connection Pre-flight Check
 * Tests database connectivity before starting the main application
 */

const { Pool } = require('pg');

async function checkDatabase() {
  // Check if database URL is provided
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  if (!dbUrl) {
    console.log('⚠️  No database URL provided (POSTGRES_URL or DATABASE_URL)');
    console.log('   The application will run with limited functionality');
    console.log('   Some features like event storage will be disabled');
    // Exit with 0 - this is not a critical error
    process.exit(0);
  }

  console.log('🔍 Testing database connection...');

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000, // 5 second timeout
  });

  try {
    // Try to connect and run a simple query
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();

    console.log('✅ Database connection successful!');
    console.log(`   Connected at: ${result.rows[0].current_time}`);

    // Test if we can create tables (check permissions)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS connection_test (
          id SERIAL PRIMARY KEY,
          test_time TIMESTAMP DEFAULT NOW()
        );
      `);
      await pool.query('DROP TABLE IF EXISTS connection_test;');
      console.log('✅ Database permissions verified (CREATE/DROP)');
    } catch (permError) {
      console.log('⚠️  Limited database permissions - some features may not work');
      console.log(`   Error: ${permError.message}`);
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error(`   Error: ${error.message}`);

    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.error('   → Database server is not reachable');
      console.error('   → Check your database host and network settings');
    } else if (error.message.includes('password authentication failed')) {
      console.error('   → Authentication failed');
      console.error('   → Check your database credentials');
    } else if (error.message.includes('does not exist')) {
      console.error('   → Database does not exist');
      console.error('   → Create the database or check the database name');
    } else if (error.message.includes('SSL')) {
      console.error('   → SSL connection issue');
      console.error('   → Add ?sslmode=require to your connection string');
    }

    console.log('\n💡 Tips:');
    console.log('   1. Verify POSTGRES_URL environment variable is set correctly');
    console.log('   2. Format: postgresql://user:pass@host:5432/database?sslmode=require');
    console.log('   3. The app will still start but with limited functionality');

    await pool.end();
    // Exit with non-zero to indicate failure (but start.sh will continue anyway)
    process.exit(1);
  }
}

// Run the check
checkDatabase().catch(err => {
  console.error('Unexpected error during database check:', err);
  process.exit(1);
});