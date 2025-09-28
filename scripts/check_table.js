#!/usr/bin/env node

require('dotenv').config();
const { query, pool } = require('../src/utils/db');

async function checkTable() {
  try {
    // Get column names
    const columns = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'playmaker_user_source'
      ORDER BY ordinal_position
    `);

    console.log('Columns in playmaker_user_source:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });

    // Get sample data
    const sample = await query(`
      SELECT * FROM playmaker_user_source LIMIT 2
    `);

    console.log('\nSample data:');
    console.log(JSON.stringify(sample.rows[0], null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTable();