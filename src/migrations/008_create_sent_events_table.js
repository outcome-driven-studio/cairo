const { query } = require('../utils/db');

async function up() {
  await query(`
    CREATE TABLE IF NOT EXISTS sent_events (
      id SERIAL PRIMARY KEY,
      event_key VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) NOT NULL,
      linkedin_profile VARCHAR(255),
      event_type VARCHAR(100) NOT NULL,
      platform VARCHAR(50) NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Migration 008_create_sent_events_table up applied');
}

async function down() {
  await query('DROP TABLE IF EXISTS sent_events;');
  console.log('Migration 008_create_sent_events_table down applied');
}

module.exports = { up, down }; 