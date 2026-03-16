// GDPR compliance migration for Cairo CDP
// Creates tables for user suppression and deletion audit logging

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
    logger.info('user_suppressions table created');

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
    logger.info('deletion_audit_log table created');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_suppressions_lookup ON user_suppressions(user_id, namespace);
      CREATE INDEX IF NOT EXISTS idx_deletion_audit ON deletion_audit_log(user_id, created_at);
    `);
    logger.info('GDPR compliance indexes created');

    logger.info('GDPR compliance migration completed successfully');
  } catch (error) {
    logger.error('GDPR compliance migration failed:', error);
    throw error;
  }
}

async function down(query) {
  logger.info('Rolling back GDPR compliance tables...');

  try {
    await query('DROP TABLE IF EXISTS deletion_audit_log CASCADE');
    await query('DROP TABLE IF EXISTS user_suppressions CASCADE');
    logger.info('GDPR compliance tables rolled back successfully');
  } catch (error) {
    logger.error('GDPR compliance rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };
