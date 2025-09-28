#!/usr/bin/env node

require('dotenv').config();
const logger = require('../src/utils/logger');
const namespaceGenerator = require('../src/utils/namespaceGenerator');
const { query, pool } = require('../src/utils/db');

async function migrateNamespace() {
  try {
    logger.info('🔄 Starting namespace migration (preserving all data)...\n');

    // 1. Check current namespace configuration
    logger.info('1️⃣ Checking current namespace configuration...');

    const currentNamespaces = await query(`
      SELECT * FROM namespaces
      WHERE name = 'playmaker' OR keywords @> '"default"'
      ORDER BY created_at ASC
      LIMIT 1
    `);

    if (currentNamespaces.rows.length === 0) {
      logger.error('❌ No default/playmaker namespace found!');
      logger.info('Looking for any namespace...');

      const anyNamespace = await query('SELECT * FROM namespaces LIMIT 1');
      if (anyNamespace.rows.length === 0) {
        logger.error('No namespaces found at all. Please run migrations first.');
        process.exit(1);
      }

      currentNamespaces.rows = anyNamespace.rows;
    }

    const oldNamespace = currentNamespaces.rows[0];
    const oldTableName = oldNamespace.table_name;

    logger.info(`   Found namespace: ${oldNamespace.name}`);
    logger.info(`   Current table: ${oldTableName}`);

    // 2. Check if the table exists and has data
    logger.info('\n2️⃣ Checking existing table and data...');

    const tableExists = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = $1
      )
    `, [oldTableName]);

    if (!tableExists.rows[0].exists) {
      logger.warn(`   ⚠️  Table ${oldTableName} doesn't exist`);
      logger.info('   Will only update namespace configuration');
    } else {
      // Count existing data
      const dataCount = await query(`SELECT COUNT(*) FROM ${oldTableName}`);
      logger.info(`   ✅ Table exists with ${dataCount.rows[0].count} records`);

      // Show sample data
      const sampleData = await query(`SELECT id, email, enrichment_profile FROM ${oldTableName} LIMIT 3`);
      if (sampleData.rows.length > 0) {
        logger.info('   Sample data:');
        sampleData.rows.forEach(row => {
          const platform = row.enrichment_profile?.platform || 'unknown';
          logger.info(`      - ${row.email} (${platform})`);
        });
      }
    }

    // 3. Generate new namespace name
    logger.info('\n3️⃣ Generating new random namespace...');
    const newNamespaceName = namespaceGenerator.generate();
    const newTableName = namespaceGenerator.toTableName(newNamespaceName);

    logger.info(`   🎲 New namespace: ${newNamespaceName}`);
    logger.info(`   📊 New table name: ${newTableName}`);

    // 4. Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise((resolve) => {
      rl.question(`\n⚠️  This will rename:\n   ${oldNamespace.name} → ${newNamespaceName}\n   ${oldTableName} → ${newTableName}\n\n❓ Continue? (yes/no): `, (answer) => {
        rl.close();
        if (answer.toLowerCase() !== 'yes') {
          logger.info('❌ Migration cancelled');
          process.exit(0);
        }
        resolve();
      });
    });

    // 5. Start transaction
    logger.info('\n4️⃣ Starting migration transaction...');
    await query('BEGIN');

    try {
      // 6. Rename the actual table if it exists
      if (tableExists.rows[0].exists) {
        logger.info(`   Renaming table ${oldTableName} to ${newTableName}...`);
        await query(`ALTER TABLE ${oldTableName} RENAME TO ${newTableName}`);

        // Rename indexes
        logger.info('   Updating indexes...');
        const indexes = await query(`
          SELECT indexname
          FROM pg_indexes
          WHERE tablename = $1
          AND indexname LIKE 'idx_%'
        `, [newTableName]);

        for (const idx of indexes.rows) {
          const oldIndexName = idx.indexname;
          const newIndexName = oldIndexName.replace(oldTableName, newTableName);
          if (oldIndexName !== newIndexName) {
            await query(`ALTER INDEX ${oldIndexName} RENAME TO ${newIndexName}`);
            logger.info(`      Renamed index: ${oldIndexName} → ${newIndexName}`);
          }
        }
      }

      // 7. Update namespace record
      logger.info('   Updating namespace configuration...');
      await query(`
        UPDATE namespaces
        SET name = $1,
            table_name = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [newNamespaceName, newTableName, oldNamespace.id]);

      // 8. If there's a namespace column in the table, update it
      if (tableExists.rows[0].exists) {
        // Check if namespace column exists
        const hasNamespaceCol = await query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_name = $1
            AND column_name = 'namespace'
          )
        `, [newTableName]);

        if (hasNamespaceCol.rows[0].exists) {
          logger.info('   Updating namespace column in data...');
          await query(`UPDATE ${newTableName} SET namespace = $1`, [newNamespaceName]);
        }
      }

      // 9. Commit transaction
      await query('COMMIT');
      logger.info('✅ Migration transaction committed successfully!');

      // 10. Verify the migration
      logger.info('\n5️⃣ Verifying migration...');

      // Check namespace
      const verifyNamespace = await query('SELECT * FROM namespaces WHERE id = $1', [oldNamespace.id]);
      logger.info(`   ✅ Namespace updated: ${verifyNamespace.rows[0].name}`);

      // Check table
      if (tableExists.rows[0].exists) {
        const verifyTable = await query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = $1
          )
        `, [newTableName]);

        if (verifyTable.rows[0].exists) {
          const newDataCount = await query(`SELECT COUNT(*) FROM ${newTableName}`);
          logger.info(`   ✅ Table renamed: ${newTableName}`);
          logger.info(`   ✅ Data preserved: ${newDataCount.rows[0].count} records`);
        }
      }

      // 11. Show summary
      logger.info('\n' + '='.repeat(60));
      logger.info('✨ NAMESPACE MIGRATION COMPLETED SUCCESSFULLY!');
      logger.info('='.repeat(60));
      logger.info('\n📊 Migration Summary:');
      logger.info(`   Old Namespace: ${oldNamespace.name}`);
      logger.info(`   New Namespace: ${newNamespaceName}`);
      logger.info(`   Old Table: ${oldTableName}`);
      logger.info(`   New Table: ${newTableName}`);
      logger.info(`   Data Status: ✅ All data preserved`);
      logger.info('\n🚀 Your system is now using the new namespace!');
      logger.info('   All existing data and enrichments have been preserved.');

    } catch (error) {
      // Rollback on error
      await query('ROLLBACK');
      logger.error('❌ Migration failed, rolled back changes:', error);
      throw error;
    }

  } catch (error) {
    logger.error('❌ Migration script failed:', error);
    logger.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  migrateNamespace();
}

module.exports = { migrateNamespace };