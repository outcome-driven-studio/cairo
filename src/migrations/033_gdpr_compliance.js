const logger = require('../utils/logger');

async function up(query) {
  logger.info('Creating GDPR compliance tables...');

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS user_suppressions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(500) NOT NULL,
        namespace VARCHAR(100) DEFAULT 'default',
        suppressed_at TIMESTAMPTZ DEFAULT NOW(),
        suppressed_by VARCHAR(255),
        reason TEXT,
        UNIQUE(user_id, namespace)
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_suppressions_lookup ON user_suppressions(user_id, namespace)');

    await query(`
      CREATE TABLE IF NOT EXISTS deletion_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(500) NOT NULL,
        namespace VARCHAR(100),
        action VARCHAR(20) NOT NULL,
        tables_affected TEXT[],
        rows_deleted INT,
        performed_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_deletion_audit ON deletion_audit_log(user_id, created_at)');

    logger.info('GDPR compliance tables created successfully');
  } catch (error) {
    logger.error('Failed to create GDPR compliance tables:', error);
    throw error;
  }
}

async function down(query) {
  await query('DROP TABLE IF EXISTS deletion_audit_log CASCADE');
  await query('DROP TABLE IF EXISTS user_suppressions CASCADE');
}

module.exports = { up, down };
