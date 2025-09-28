#!/usr/bin/env node

require('dotenv').config();
const logger = require('../src/utils/logger');
const namespaceGenerator = require('../src/utils/namespaceGenerator');
const NamespaceService = require('../src/services/namespaceService');
const { query, pool } = require('../src/utils/db');

async function createNewNamespace(customName = null, keywords = null) {
  try {
    const namespaceService = new NamespaceService();

    // Generate or use custom namespace name
    const namespaceName = customName || namespaceGenerator.generate();
    const tableName = namespaceGenerator.toTableName(namespaceName);

    logger.info('🚀 Creating new namespace...');
    logger.info(`   Name: ${namespaceName}`);
    logger.info(`   Table: ${tableName}`);

    // Default keywords if not provided
    const namespaceKeywords = keywords || [namespaceName.split('-')[0]];

    // Create the namespace in the database
    const namespace = await namespaceService.createNamespace({
      name: namespaceName,
      keywords: namespaceKeywords
    });

    logger.info('✅ Namespace created successfully!');
    logger.info(`   ID: ${namespace.id}`);
    logger.info(`   Keywords: ${JSON.stringify(namespace.keywords)}`);

    // Create the corresponding user_source table
    logger.info('\n📊 Creating user source table...');

    await query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        user_source VARCHAR(50) NOT NULL,
        namespace VARCHAR(100) DEFAULT '${namespaceName}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create indexes for performance
    await query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_email ON ${tableName}(email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_source ON ${tableName}(user_source)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_created ON ${tableName}(created_at DESC)`);

    logger.info(`✅ Table ${tableName} created with indexes`);

    return namespace;
  } catch (error) {
    logger.error('❌ Error creating namespace:', error);
    throw error;
  }
}

async function showNamespaceExamples() {
  logger.info('\n🎲 Sample Namespace Names (format: greekmyth-verb-adjective-spaceobject):');
  logger.info('=' .repeat(70));

  const samples = namespaceGenerator.getSamples(10);
  samples.forEach((sample, index) => {
    logger.info(`   ${index + 1}. ${sample}`);
    logger.info(`      Table: ${namespaceGenerator.toTableName(sample)}`);
  });

  const totalCombinations = namespaceGenerator.getTotalCombinations();
  logger.info('\n📊 Statistics:');
  logger.info(`   Total possible combinations: ${totalCombinations.toLocaleString()}`);
  logger.info(`   Collision probability: ${(1 / totalCombinations * 100).toFixed(6)}%`);
}

async function listExistingNamespaces() {
  try {
    const result = await query(`
      SELECT name, keywords, table_name, is_active, created_at
      FROM namespaces
      ORDER BY created_at DESC
    `);

    if (result.rows.length === 0) {
      logger.info('No namespaces found. Run migrations first.');
      return;
    }

    logger.info('\n📁 Existing Namespaces:');
    logger.info('=' .repeat(70));

    for (const ns of result.rows) {
      const isDefault = ns.keywords && ns.keywords.includes('default');
      logger.info(`\n   ${isDefault ? '⭐' : '📌'} ${ns.name}`);
      logger.info(`      Table: ${ns.table_name}`);
      logger.info(`      Keywords: ${JSON.stringify(ns.keywords)}`);
      logger.info(`      Active: ${ns.is_active ? '✅' : '❌'}`);
      logger.info(`      Created: ${new Date(ns.created_at).toLocaleString()}`);
    }
  } catch (error) {
    logger.error('Error listing namespaces:', error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'generate':
      case 'examples':
        // Show example namespace names
        await showNamespaceExamples();
        break;

      case 'list':
        // List existing namespaces
        await listExistingNamespaces();
        break;

      case 'create':
        // Create a new namespace
        const nameArg = args[1];
        const keywordsArg = args[2] ? args[2].split(',') : null;

        if (nameArg === '--random' || !nameArg) {
          // Generate random namespace
          logger.info('🎲 Generating random namespace...');
          await createNewNamespace(null, keywordsArg);
        } else {
          // Use provided name
          await createNewNamespace(nameArg, keywordsArg);
        }
        break;

      default:
        logger.info('Cairo CDP Namespace Manager');
        logger.info('=' .repeat(50));
        logger.info('\nUsage:');
        logger.info('  node scripts/create_namespace.js <command> [options]');
        logger.info('\nCommands:');
        logger.info('  generate     - Show example namespace names');
        logger.info('  list         - List all existing namespaces');
        logger.info('  create       - Create a new random namespace');
        logger.info('  create NAME  - Create namespace with specific name');
        logger.info('\nExamples:');
        logger.info('  node scripts/create_namespace.js generate');
        logger.info('  node scripts/create_namespace.js list');
        logger.info('  node scripts/create_namespace.js create');
        logger.info('  node scripts/create_namespace.js create my-custom-name keyword1,keyword2');
        logger.info('\nNamespace Format:');
        logger.info('  {greek_mythology}-{verb}-{adjective}-{space_object}');
        logger.info('  Example: apollo-forge-stellar-nebula');
    }
  } catch (error) {
    logger.error('Script failed:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createNewNamespace };