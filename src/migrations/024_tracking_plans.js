// Tracking Plans migration for Cairo CDP
// Creates tables for schema validation and violation tracking

const logger = require('../utils/logger');

async function up(query) {
  logger.info('Creating tracking plans tables...');

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS tracking_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        namespace VARCHAR(100) DEFAULT 'default',
        enforcement_mode VARCHAR(20) DEFAULT 'allow',
        schema JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    logger.info('tracking_plans table created');

    await query(`
      CREATE TABLE IF NOT EXISTS tracking_plan_violations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tracking_plan_id UUID REFERENCES tracking_plans(id) ON DELETE CASCADE,
        event_name VARCHAR(255),
        violation_type VARCHAR(50),
        violation_details JSONB,
        event_payload JSONB,
        namespace VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    logger.info('tracking_plan_violations table created');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_violations_plan ON tracking_plan_violations(tracking_plan_id);
      CREATE INDEX IF NOT EXISTS idx_violations_time ON tracking_plan_violations(namespace, created_at);
    `);
    logger.info('Tracking plan indexes created');

    logger.info('Tracking plans migration completed successfully');
  } catch (error) {
    logger.error('Tracking plans migration failed:', error);
    throw error;
  }
}

async function down(query) {
  logger.info('Rolling back tracking plans tables...');

  try {
    await query('DROP TABLE IF EXISTS tracking_plan_violations CASCADE');
    await query('DROP TABLE IF EXISTS tracking_plans CASCADE');
    logger.info('Tracking plans tables rolled back successfully');
  } catch (error) {
    logger.error('Tracking plans rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };
