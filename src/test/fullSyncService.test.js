#!/usr/bin/env node
/**
 * Full Sync Service Tests
 *
 * Tests the complete full sync orchestration including configuration,
 * rate limiting, and integration with existing services.
 */

const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../config/fullSyncConfig");
const FullSyncService = require("../services/fullSyncService");

// Mock database to avoid real DB calls in tests
jest.mock("../utils/db", () => ({
  query: jest.fn(),
}));

// Mock existing services to avoid real API calls
jest.mock("../services/smartleadService");
jest.mock("../services/lemlistService");
jest.mock("../services/attioService");
jest.mock("../services/mixpanelService");
jest.mock("../services/namespaceService");

const { query } = require("../utils/db");

console.log("🧪 Full Sync Service Tests");
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

async function runTests() {
  // Test Service Initialization
  console.log("\n🏗️  Service Initialization Tests:");

  await test("Create FullSyncService instance", async () => {
    const service = new FullSyncService();
    return (
      service.smartleadService &&
      service.lemlistService &&
      service.rateLimiters.smartlead &&
      service.rateLimiters.lemlist
    );
  });

  await test("Rate limiters are properly configured", async () => {
    const service = new FullSyncService();
    return (
      service.rateLimiters.smartlead.apiType === "smartlead" &&
      service.rateLimiters.lemlist.apiType === "lemlist" &&
      service.rateLimiters.database.apiType === "database"
    );
  });

  // Test Configuration Integration
  console.log("\n⚙️  Configuration Integration Tests:");

  await test("Accept FullSyncConfig instance", async () => {
    const service = new FullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.DATE_RANGE,
      platforms: [PLATFORMS.SMARTLEAD],
      dateRange: { start: "2024-01-01", end: "2024-01-31" },
    });

    // Mock database calls
    query.mockResolvedValue({ rows: [{ namespace: "test" }] });

    // This should not throw
    try {
      // We'll just test the setup, not the full execution to avoid complex mocking
      const targetNamespaces = await service.getTargetNamespaces(config);
      return Array.isArray(targetNamespaces);
    } catch (error) {
      console.log("Error in test:", error.message);
      return false;
    }
  });

  await test("Accept plain configuration object", async () => {
    const service = new FullSyncService();
    const config = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.LEMLIST],
      namespaces: ["test-namespace"],
    };

    // Mock database calls
    query.mockResolvedValue({ rows: [{ namespace: "test-namespace" }] });

    try {
      const fullConfig = new FullSyncConfig(config);
      const targetNamespaces = await service.getTargetNamespaces(fullConfig);
      return targetNamespaces.includes("test-namespace");
    } catch (error) {
      return false;
    }
  });

  // Test Namespace Resolution
  console.log("\n🏷️  Namespace Resolution Tests:");

  await test("Get all active namespaces", async () => {
    const service = new FullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.FULL_HISTORICAL,
      namespaces: "all",
    });

    query.mockResolvedValue({
      rows: [
        { namespace: "playmaker" },
        { namespace: "test" },
        { namespace: "demo" },
      ],
    });

    const namespaces = await service.getTargetNamespaces(config);
    return (
      namespaces.length === 3 &&
      namespaces.includes("playmaker") &&
      namespaces.includes("test")
    );
  });

  await test("Validate specific namespaces exist", async () => {
    const service = new FullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.DATE_RANGE,
      namespaces: ["playmaker", "invalid-namespace"],
      dateRange: { start: "2024-01-01", end: "2024-01-31" },
    });

    query.mockResolvedValue({
      rows: [{ namespace: "playmaker" }], // Only playmaker exists
    });

    const namespaces = await service.getTargetNamespaces(config);
    return namespaces.length === 1 && namespaces[0] === "playmaker";
  });

  // Test Date Filtering
  console.log("\n📅 Date Filtering Tests:");

  await test("Filter items by date range", async () => {
    const service = new FullSyncService();
    const items = [
      { id: 1, created_at: "2024-01-15T10:00:00Z", name: "item1" },
      { id: 2, created_at: "2024-02-15T10:00:00Z", name: "item2" },
      { id: 3, created_at: "2024-03-15T10:00:00Z", name: "item3" },
    ];

    const dateFilter = {
      start: new Date("2024-01-01"),
      end: new Date("2024-02-28"),
    };

    const filtered = service.filterByDate(items, dateFilter, "created_at");
    return (
      filtered.length === 2 &&
      filtered.find((item) => item.id === 1) &&
      filtered.find((item) => item.id === 2)
    );
  });

  await test("No filtering when no date filter", async () => {
    const service = new FullSyncService();
    const items = [
      { id: 1, created_at: "2024-01-15T10:00:00Z" },
      { id: 2, created_at: "2024-02-15T10:00:00Z" },
    ];

    const filtered = service.filterByDate(items, null, "created_at");
    return filtered.length === 2;
  });

  // Test Mixpanel Event Conversion
  console.log("\n🎯 Mixpanel Integration Tests:");

  await test("Convert platform event to Mixpanel format", async () => {
    const service = new FullSyncService();
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
      mixpanelEvent.properties.user_namespace === "playmaker"
    );
  });

  // Test System Status
  console.log("\n📊 System Status Tests:");

  await test("Get sync status includes rate limiters", async () => {
    const service = new FullSyncService();

    // Mock the database calls for status
    query.mockResolvedValue({ rows: [] });

    const status = await service.getSyncStatus();
    return (
      status.rateLimiters &&
      status.rateLimiters.smartlead &&
      status.rateLimiters.lemlist &&
      status.recentActivity !== undefined &&
      status.systemHealth !== undefined
    );
  });

  await test("System health check handles database errors", async () => {
    const service = new FullSyncService();

    // Mock database failure
    query.mockRejectedValue(new Error("Database connection failed"));

    const health = await service.checkSystemHealth();
    return health.database === false; // Should handle the error gracefully
  });

  // Test Error Handling
  console.log("\n🚨 Error Handling Tests:");

  await test("Handle invalid configuration gracefully", async () => {
    const service = new FullSyncService();

    try {
      // This should throw due to invalid config
      await service.executeFullSync({
        mode: "INVALID_MODE",
        platforms: ["invalid-platform"],
      });
      return false; // Should have thrown
    } catch (error) {
      return error.message.includes("Invalid sync mode");
    }
  });

  await test("Handle database connection errors in namespace resolution", async () => {
    const service = new FullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.FULL_HISTORICAL,
      namespaces: "all",
    });

    // Mock database failure
    query.mockRejectedValue(new Error("Connection timeout"));

    try {
      await service.getTargetNamespaces(config);
      return false; // Should have thrown
    } catch (error) {
      return error.message.includes("Connection timeout");
    }
  });

  // Integration Test (Limited)
  console.log("\n🔗 Integration Tests:");

  await test("Full sync configuration validation flow", async () => {
    const service = new FullSyncService();
    const config = new FullSyncConfig({
      mode: SYNC_MODES.DATE_RANGE,
      platforms: [PLATFORMS.SMARTLEAD, PLATFORMS.LEMLIST],
      namespaces: ["playmaker"],
      dateRange: { start: "2024-01-01", end: "2024-01-31" },
      batchSize: 50,
      enableMixpanelTracking: true,
    });

    // Mock successful namespace lookup
    query.mockResolvedValue({ rows: [{ namespace: "playmaker" }] });

    // Test that the configuration flows through correctly
    const namespaces = await service.getTargetNamespaces(config);
    const dateFilter = config.getDateFilter();

    return (
      namespaces.length === 1 &&
      namespaces[0] === "playmaker" &&
      dateFilter.start instanceof Date &&
      dateFilter.end instanceof Date &&
      config.shouldSyncPlatform(PLATFORMS.SMARTLEAD) &&
      config.shouldSyncPlatform(PLATFORMS.LEMLIST) &&
      config.enableMixpanelTracking === true
    );
  });

  // Test Results Summary
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("🎉 All tests passed! Full Sync Service is ready.");
    process.exit(0);
  } else {
    console.log(
      `⚠️  ${failed} test(s) failed. Please check the implementation.`
    );
    process.exit(1);
  }
}

// Handle the case where jest is not available (running without jest)
if (typeof jest === "undefined") {
  global.jest = {
    fn: () => ({
      mockResolvedValue: (value) => Promise.resolve(value),
      mockRejectedValue: (error) => Promise.reject(error),
    }),
  };

  // Simple mock implementations
  require.cache[require.resolve("../utils/db")] = {
    exports: {
      query: {
        mockResolvedValue: (value) => {
          this._mockValue = value;
          return Promise.resolve(this._mockValue);
        },
        mockRejectedValue: (error) => {
          this._mockError = error;
          return Promise.reject(this._mockError);
        },
      },
    },
  };
}

runTests();
