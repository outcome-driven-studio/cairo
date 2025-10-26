// Migration to create sources and destinations tables for Config API
const logger = require('../utils/logger');

async function up(query) {
  logger.info('Creating sources and destinations tables...');

  try {
    // Create sources table for managing data sources
    await query(`
      CREATE TABLE IF NOT EXISTS sources (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        write_key VARCHAR(255) UNIQUE NOT NULL,
        enabled BOOLEAN DEFAULT true,
        settings JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('✅ sources table created');

    // Create destinations table for managing data destinations
    await query(`
      CREATE TABLE IF NOT EXISTS destinations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        settings JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('✅ destinations table created');

    // Create indexes
    await query('CREATE INDEX IF NOT EXISTS idx_sources_write_key ON sources(write_key)');
    await query('CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type)');
    await query('CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled)');
    await query('CREATE INDEX IF NOT EXISTS idx_destinations_type ON destinations(type)');
    await query('CREATE INDEX IF NOT EXISTS idx_destinations_enabled ON destinations(enabled)');
    logger.info('✅ Indexes created');

    logger.info('🎉 Sources and destinations migration completed successfully!');

  } catch (error) {
    logger.error('❌ Failed to create sources/destinations tables:', error);
    throw error;
  }
}

module.exports = { up };
