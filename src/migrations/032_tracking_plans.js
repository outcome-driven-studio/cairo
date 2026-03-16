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
    await query('CREATE INDEX IF NOT EXISTS idx_violations_plan ON tracking_plan_violations(tracking_plan_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_violations_time ON tracking_plan_violations(namespace, created_at)');

    logger.info('Tracking plans tables created successfully');
  } catch (error) {
    logger.error('Failed to create tracking plans tables:', error);
    throw error;
  }
}

async function down(query) {
  await query('DROP TABLE IF EXISTS tracking_plan_violations CASCADE');
  await query('DROP TABLE IF EXISTS tracking_plans CASCADE');
}

module.exports = { up, down };
