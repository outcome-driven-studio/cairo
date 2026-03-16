const logger = require('../utils/logger');

async function up(query) {
  logger.info('Creating identity graph tables...');

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS identity_graph (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        canonical_id UUID NOT NULL,
        identity_type VARCHAR(50) NOT NULL,
        identity_value VARCHAR(500) NOT NULL,
        namespace VARCHAR(100) DEFAULT 'default',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(identity_type, identity_value, namespace)
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_identity_canonical ON identity_graph(canonical_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_identity_lookup ON identity_graph(identity_type, identity_value, namespace)');

    logger.info('Identity graph tables created successfully');
  } catch (error) {
    logger.error('Failed to create identity graph tables:', error);
    throw error;
  }
}

async function down(query) {
  await query('DROP TABLE IF EXISTS identity_graph CASCADE');
}

module.exports = { up, down };
