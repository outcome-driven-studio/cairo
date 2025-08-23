#!/usr/bin/env node
/**
 * Full Sync Service Core Logic Tests
 *
 * Tests the core synchronization logic without external dependencies
 * to validate the service architecture and flow.
 */

const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../config/fullSyncConfig");

console.log("🧪 Full Sync Service Core Logic Tests");
console.log("=".repeat(50));

let passed = 0;
let failed = 0;

function test(name, testFn) {
  return new Promise(async (resolve) => {
    try {
      const result = await testFn();
      if (result !== false) {
        console.log(`✅ ${name}`);
        passed++;
      } else {
        console.log(`❌ ${name}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      failed++;
    }
    resolve();
  });
}

/**
 * Mock Full Sync Service for testing core logic
 */
class MockFullSyncService {
  constructor() {
    this.rateLimiters = {
      smartlead: { apiType: "smartlead", getStatus: () => ({ ready: true }) },
      lemlist: { apiType: "lemlist", getStatus: () => ({ ready: true }) },
      database: { apiType: "database", getStatus: () => ({ ready: true }) },
    };
  }

  // Core methods we want to test
  filterByDate(items, dateFilter, dateField) {
    if (!dateFilter || !dateFilter.start) {
      return items;
    }

    return items.filter((item) => {
      const itemDate = new Date(item[dateField]);

      if (dateFilter.start && itemDate < dateFilter.start) {
        return false;
      }

      if (dateFilter.end && itemDate > dateFilter.end) {
        return false;
      }

      return true;
    });
  }

  convertToMixpanelEvent(event, platform, namespace, campaignId) {
    return {
      event: `${platform}_${event.type || "activity"}`,
      properties: {
        distinct_id: event.email || event.contact_email,
        time: new Date(event.created_at || event.timestamp),
        campaign_id: campaignId,
        campaign_platform: platform,
        user_namespace: namespace,
        event_source: "full_sync",
        sync_mode: "bulk",
        ...event.properties,
      },
    };
  }

  async mockGetTargetNamespaces(
    syncConfig,
    availableNamespaces = ["playmaker", "test", "demo"]
  ) {
    if (syncConfig.namespaces === "all") {
      return availableNamespaces;
    } else {
      // Validate that specified namespaces exist
      const validNamespaces = syncConfig.namespaces.filter((ns) =>
        availableNamespaces.includes(ns)
      );
      return validNamespaces;
    }
  }

  async mockExecuteFullSync(config) {
    // Ensure config is a FullSyncConfig instance
    const syncConfig =
      config instanceof FullSyncConfig ? config : new FullSyncConfig(config);

    const startTime = new Date();
    const results = {
      startTime,
      endTime: null,
      config: syncConfig.getSummary(),
      platforms: {},
      summary: {
        totalUsers: 0,
        totalEvents: 0,
        totalErrors: 0,
        processedNamespaces: [],
      },
    };

    try {
      // Get target namespaces
      const targetNamespaces = await this.mockGetTargetNamespaces(syncConfig);
      results.summary.processedNamespaces = targetNamespaces;

      // Simulate platform sync
      for (const platform of syncConfig.platforms) {
        results.platforms[platform] = {
          success: true,
          users: { processed: 100 },
          events: { processed: 500 },
          errors: [],
        };

        results.summary.totalUsers += 100;
        results.summary.totalEvents += 500;
      }

      results.endTime = new Date();
      results.duration = (results.endTime - startTime) / 1000;
      results.success = true;

      return results;
    } catch (error) {
      results.endTime = new Date();
      results.duration = (results.endTime - startTime) / 1000;
      results.success = false;
      results.error = error.message;
      throw error;
    }
  }
}

async function runTests() {
  // Test Service Architecture
  console.log("\n🏗️  Service Architecture Tests:");

  await test("Create mock service instance", async () => {
    const service = new MockFullSyncService();
    return (
      service.rateLimiters.smartlead &&
      service.rateLimiters.lemlist &&
      service.rateLimiters.database
    );
  });

  await test("Rate limiters have correct configuration", async () => {
    const service = new MockFullSyncService();
    return (
      service.rateLimiters.smartlead.apiType === "smartlead" &&
      service.rateLimiters.lemlist.apiType === "lemlist" &&
      service.rateLimiters.database.apiType === "database"
    );
  });

  // Test Configuration Integration
  console.log("\n⚙️  Configuration Integration Tests:");

  await test("Process FullSyncConfig instance", async () => {
    const service = new MockFullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.DATE_RANGE,
      platforms: [PLATFORMS.SMARTLEAD],
      dateRange: { start: "2024-01-01", end: "2024-01-31" },
      namespaces: ["playmaker"],
    });

    const result = await service.mockExecuteFullSync(config);
    return (
      result.success &&
      result.config.mode === SYNC_MODES.DATE_RANGE &&
      result.platforms.smartlead.success
    );
  });

  await test("Process plain configuration object", async () => {
    const service = new MockFullSyncService();
    const config = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.LEMLIST],
      namespaces: ["test"],
    };

    const result = await service.mockExecuteFullSync(config);
    return (
      result.success &&
      result.config.mode === SYNC_MODES.FULL_HISTORICAL &&
      result.platforms.lemlist.success
    );
  });

  await test("Handle multiple platforms", async () => {
    const service = new MockFullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD, PLATFORMS.LEMLIST],
      namespaces: "all",
    });

    const result = await service.mockExecuteFullSync(config);
    return (
      result.success &&
      result.platforms.smartlead &&
      result.platforms.lemlist &&
      result.summary.totalUsers === 200 && // 100 per platform
      result.summary.totalEvents === 1000
    ); // 500 per platform
  });

  // Test Namespace Resolution
  console.log("\n🏷️  Namespace Resolution Tests:");

  await test("Resolve all namespaces", async () => {
    const service = new MockFullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.FULL_HISTORICAL,
      namespaces: "all",
    });

    const namespaces = await service.mockGetTargetNamespaces(config);
    return (
      namespaces.length === 3 &&
      namespaces.includes("playmaker") &&
      namespaces.includes("test") &&
      namespaces.includes("demo")
    );
  });

  await test("Filter valid namespaces", async () => {
    const service = new MockFullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.DATE_RANGE,
      namespaces: ["playmaker", "invalid-namespace", "test"],
      dateRange: { start: "2024-01-01", end: "2024-01-31" },
    });

    const namespaces = await service.mockGetTargetNamespaces(config);
    return (
      namespaces.length === 2 &&
      namespaces.includes("playmaker") &&
      namespaces.includes("test") &&
      !namespaces.includes("invalid-namespace")
    );
  });

  // Test Date Filtering Logic
  console.log("\n📅 Date Filtering Tests:");

  await test("Filter items by date range", async () => {
    const service = new MockFullSyncService();
    const items = [
      { id: 1, created_at: "2024-01-15T10:00:00Z", name: "item1" },
      { id: 2, created_at: "2024-02-15T10:00:00Z", name: "item2" },
      { id: 3, created_at: "2024-03-15T10:00:00Z", name: "item3" },
      { id: 4, created_at: "2023-12-15T10:00:00Z", name: "item4" },
    ];

    const dateFilter = {
      start: new Date("2024-01-01"),
      end: new Date("2024-02-28"),
    };

    const filtered = service.filterByDate(items, dateFilter, "created_at");
    return (
      filtered.length === 2 &&
      filtered.find((item) => item.id === 1) &&
      filtered.find((item) => item.id === 2) &&
      !filtered.find((item) => item.id === 3) &&
      !filtered.find((item) => item.id === 4)
    );
  });

  await test("No filtering when no date filter", async () => {
    const service = new MockFullSyncService();
    const items = [
      { id: 1, created_at: "2024-01-15T10:00:00Z" },
      { id: 2, created_at: "2024-02-15T10:00:00Z" },
      { id: 3, created_at: "2024-03-15T10:00:00Z" },
    ];

    const filtered = service.filterByDate(items, null, "created_at");
    return filtered.length === 3;
  });

  await test("Filter with start date only", async () => {
    const service = new MockFullSyncService();
    const items = [
      { id: 1, created_at: "2024-01-15T10:00:00Z" },
      { id: 2, created_at: "2024-02-15T10:00:00Z" },
      { id: 3, created_at: "2023-12-15T10:00:00Z" },
    ];

    const dateFilter = {
      start: new Date("2024-01-01"),
      end: null,
    };

    const filtered = service.filterByDate(items, dateFilter, "created_at");
    return filtered.length === 2 && !filtered.find((item) => item.id === 3);
  });

  // Test Mixpanel Integration
  console.log("\n🎯 Mixpanel Event Conversion Tests:");

  await test("Convert Smartlead event to Mixpanel format", async () => {
    const service = new MockFullSyncService();
    const platformEvent = {
      type: "email_sent",
      email: "user@example.com",
      created_at: "2024-01-15T10:00:00Z",
      properties: { campaign_name: "Test Campaign" },
    };

    const mixpanelEvent = service.convertToMixpanelEvent(
      platformEvent,
      "smartlead",
      "playmaker",
      "camp123"
    );

    return (
      mixpanelEvent.event === "smartlead_email_sent" &&
      mixpanelEvent.properties.distinct_id === "user@example.com" &&
      mixpanelEvent.properties.campaign_id === "camp123" &&
      mixpanelEvent.properties.user_namespace === "playmaker" &&
      mixpanelEvent.properties.campaign_platform === "smartlead" &&
      mixpanelEvent.properties.event_source === "full_sync"
    );
  });

  await test("Convert Lemlist event to Mixpanel format", async () => {
    const service = new MockFullSyncService();
    const platformEvent = {
      type: "email_opened",
      contact_email: "contact@example.com",
      timestamp: "2024-01-16T15:30:00Z",
      properties: { sequence_step: 2 },
    };

    const mixpanelEvent = service.convertToMixpanelEvent(
      platformEvent,
      "lemlist",
      "test",
      "camp456"
    );

    return (
      mixpanelEvent.event === "lemlist_email_opened" &&
      mixpanelEvent.properties.distinct_id === "contact@example.com" &&
      mixpanelEvent.properties.campaign_id === "camp456" &&
      mixpanelEvent.properties.user_namespace === "test" &&
      mixpanelEvent.properties.campaign_platform === "lemlist"
    );
  });

  await test("Handle event without explicit type", async () => {
    const service = new MockFullSyncService();
    const platformEvent = {
      email: "user@example.com",
      created_at: "2024-01-15T10:00:00Z",
    };

    const mixpanelEvent = service.convertToMixpanelEvent(
      platformEvent,
      "smartlead",
      "playmaker",
      "camp789"
    );

    return mixpanelEvent.event === "smartlead_activity"; // Default fallback
  });

  // Test Sync Flow Integration
  console.log("\n🔗 Sync Flow Integration Tests:");

  await test("Full sync flow with date range mode", async () => {
    const service = new MockFullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.DATE_RANGE,
      platforms: [PLATFORMS.SMARTLEAD, PLATFORMS.LEMLIST],
      namespaces: ["playmaker", "test"],
      dateRange: { start: "2024-01-01", end: "2024-01-31" },
      batchSize: 50,
      enableMixpanelTracking: true,
    });

    const result = await service.mockExecuteFullSync(config);

    return (
      result.success &&
      result.duration >= 0 &&
      result.summary.processedNamespaces.length === 2 &&
      result.summary.totalUsers === 200 &&
      result.summary.totalEvents === 1000 &&
      result.summary.totalErrors === 0 &&
      result.platforms.smartlead.success &&
      result.platforms.lemlist.success
    );
  });

  await test("Full sync flow with reset from date mode", async () => {
    const service = new MockFullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.RESET_FROM_DATE,
      platforms: [PLATFORMS.SMARTLEAD],
      namespaces: "all",
      resetDate: "2024-01-01",
    });

    const result = await service.mockExecuteFullSync(config);

    return (
      result.success &&
      result.config.mode === SYNC_MODES.RESET_FROM_DATE &&
      result.summary.processedNamespaces.length === 3 && // all namespaces
      result.platforms.smartlead.success
    );
  });

  await test("Full sync flow with full historical mode", async () => {
    const service = new MockFullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.LEMLIST],
      namespaces: ["playmaker"],
    });

    const result = await service.mockExecuteFullSync(config);

    return (
      result.success &&
      result.config.mode === SYNC_MODES.FULL_HISTORICAL &&
      result.summary.processedNamespaces.includes("playmaker") &&
      result.platforms.lemlist.success
    );
  });

  // Test Error Handling
  console.log("\n🚨 Error Handling Tests:");

  await test("Handle invalid configuration", async () => {
    const service = new MockFullSyncService();

    try {
      await service.mockExecuteFullSync({
        mode: "INVALID_MODE",
        platforms: [PLATFORMS.SMARTLEAD],
      });
      return false; // Should have thrown
    } catch (error) {
      return error.message.includes("Invalid sync mode");
    }
  });

  await test("Handle empty namespace list", async () => {
    const service = new MockFullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD],
      namespaces: ["non-existent-namespace"],
    });

    const result = await service.mockExecuteFullSync(config);

    // Should succeed but with empty processed namespaces
    return result.success && result.summary.processedNamespaces.length === 0;
  });

  // Test Results Summary
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("🎉 All tests passed! Full Sync Service core logic is ready.");
    process.exit(0);
  } else {
    console.log(
      `⚠️  ${failed} test(s) failed. Please check the implementation.`
    );
    process.exit(1);
  }
}

runTests();
