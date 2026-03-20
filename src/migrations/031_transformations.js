const logger = require('../utils/logger');

async function up(query) {
  logger.info('Creating transformations table...');

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS transformations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        namespace VARCHAR(100) DEFAULT 'default',
        destination_id VARCHAR(255),
        code TEXT NOT NULL,
        enabled BOOLEAN DEFAULT true,
        execution_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    logger.info('Transformations table created successfully');
  } catch (error) {
    logger.error('Failed to create transformations table:', error);
    throw error;
  }
}

async function down(query) {
  await query('DROP TABLE IF EXISTS transformations CASCADE');
}

module.exports = { up, down };
