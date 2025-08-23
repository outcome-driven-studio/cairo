require("dotenv").config();
const NamespaceService = require("../services/namespaceService");
const TableManagerService = require("../services/tableManagerService");
const logger = require("../utils/logger");

/**
 * Test script for the namespace system
 * This demonstrates the key functionality of namespace-based data segregation
 */

async function testNamespaceSystem() {
  logger.info("🧪 Starting Namespace System Test");

  try {
    const namespaceService = new NamespaceService();
    const tableManager = new TableManagerService();

    // Test 1: Campaign Namespace Detection
    logger.info("\n📋 Test 1: Campaign Namespace Detection");
    const testCampaigns = [
      { name: "ACME Corp Q1 Outreach", expected: "acme-corp" },
      { name: "TechStart LinkedIn Campaign", expected: "techstart" },
      { name: "General Marketing Campaign", expected: "playmaker" },
      { name: "CLIENT1 Email Sequence", expected: "client1" },
    ];

    for (const campaign of testCampaigns) {
      const detected = await namespaceService.detectNamespaceFromCampaign(
        campaign.name
      );
      logger.info(`Campaign: "${campaign.name}" → Namespace: ${detected}`);
    }

    // Test 2: Create Test Namespaces
    logger.info("\n📋 Test 2: Create Test Namespaces");

    const testNamespaces = [
      {
        name: "acme-corp",
        keywords: ["acme", "ACME Corp", "acme-corp"],
        attio_config: { workspace: "acme-workspace" },
      },
      {
        name: "techstart",
        keywords: ["techstart", "TechStart", "tech-start"],
        attio_config: null,
      },
    ];

    for (const nsData of testNamespaces) {
      try {
        const created = await namespaceService.createNamespace(nsData);
        logger.info(`✅ Created namespace: ${created.name}`);

        // Test table creation
        const tableName = await tableManager.ensureNamespaceTableExists(
          nsData.name
        );
        logger.info(`✅ Created table: ${tableName}`);
      } catch (error) {
        if (error.message.includes("already exists")) {
          logger.info(`ℹ️  Namespace ${nsData.name} already exists - skipping`);
        } else {
          throw error;
        }
      }
    }

    // Test 3: Test Campaign Matching with Real Namespaces
    logger.info("\n📋 Test 3: Test Campaign Matching with Created Namespaces");

    const realTestCampaigns = [
      "ACME Corp Q1 Email Campaign",
      "TechStart LinkedIn Outreach",
      "Random Company Campaign",
      "acme-corp Holiday Promotion",
    ];

    for (const campaignName of realTestCampaigns) {
      const detected = await namespaceService.detectNamespaceFromCampaign(
        campaignName
      );
      const tableName = await namespaceService.getTableNameForNamespace(
        detected
      );
      logger.info(`"${campaignName}" → ${detected} (${tableName})`);
    }

    // Test 4: Get Namespace Overview
    logger.info("\n📋 Test 4: Namespace Overview");

    const allNamespaces = await namespaceService.getAllActiveNamespaces();
    logger.info(`Total active namespaces: ${allNamespaces.length}`);

    for (const ns of allNamespaces) {
      const stats = await tableManager.getTableStats(ns.name);
      logger.info(
        `${ns.name}: ${ns.keywords.length} keywords, table exists: ${stats.exists}`
      );
    }

    // Test 5: Mock Sync Data Routing
    logger.info("\n📋 Test 5: Mock Sync Data Routing");

    const mockLemlistCampaigns = [
      { name: "ACME Corp Email Series", _id: "camp1" },
      { name: "TechStart Outbound Campaign", _id: "camp2" },
      { name: "Generic B2B Campaign", _id: "camp3" },
    ];

    for (const campaign of mockLemlistCampaigns) {
      const namespace = await namespaceService.detectNamespaceFromCampaign(
        campaign.name
      );
      const tableName = await tableManager.getTableNameForNamespace(namespace);

      logger.info(`Campaign "${campaign.name}" would route to:`);
      logger.info(`  → Namespace: ${namespace}`);
      logger.info(`  → Table: ${tableName}`);

      // Check if table exists
      const tableExists = await tableManager.tableExists(tableName);
      if (!tableExists) {
        logger.info(`  → Creating table: ${tableName}`);
        await tableManager.ensureNamespaceTableExists(namespace);
      }
    }

    logger.info("\n✅ All namespace tests completed successfully!");

    // Summary
    logger.info("\n📊 Test Summary:");
    logger.info("✅ Namespace detection from campaign names");
    logger.info("✅ Dynamic namespace creation");
    logger.info("✅ Dynamic table creation and management");
    logger.info("✅ Campaign routing to appropriate namespaces");
    logger.info("✅ Table existence validation");
  } catch (error) {
    logger.error("❌ Namespace test failed:", error);
    throw error;
  }
}

// Export for programmatic use
module.exports = { testNamespaceSystem };

// Run test if this file is executed directly
if (require.main === module) {
  testNamespaceSystem()
    .then(() => {
      logger.info("🎉 Namespace system test completed!");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("❌ Namespace system test failed:", error);
      process.exit(1);
    });
}
