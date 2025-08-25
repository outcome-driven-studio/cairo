#!/usr/bin/env node
/**
 * Full Sync Configuration System Test
 *
 * Tests the FullSyncConfig class and date utilities to ensure
 * they work correctly for various sync scenarios.
 */

const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../config/fullSyncConfig");
const {
  parseDate,
  validateDateRange,
  getLastNDays,
} = require("../utils/dateUtils");

console.log("🧪 Full Sync Configuration System Tests");
console.log("=".repeat(50));

let passed = 0;
let failed = 0;

function test(name, testFn) {
  try {
    const result = testFn();
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
}

// Test Date Utilities
console.log("\n📅 Date Utilities Tests:");

test("Parse ISO date", () => {
  const date = parseDate("2024-01-15T10:30:00.000Z");
  return date instanceof Date && date.getFullYear() === 2024;
});

test("Parse date-only format", () => {
  const date = parseDate("2024-01-15");
  return date instanceof Date && date.getFullYear() === 2024;
});

test("Validate date range", () => {
  validateDateRange("2024-01-01", "2024-01-31");
  return true; // Should not throw
});

test("Reject invalid date range", () => {
  try {
    validateDateRange("2024-01-31", "2024-01-01"); // End before start
    return false;
  } catch (error) {
    return true; // Should throw
  }
});

test("Get last 30 days", () => {
  const range = getLastNDays(30);
  return (
    range.start && range.end && new Date(range.start) < new Date(range.end)
  );
});

// Test Full Sync Configuration
console.log("\n⚙️  Full Sync Configuration Tests:");

test("Create basic configuration", () => {
  const config = new FullSyncConfig({
    mode: SYNC_MODES.DATE_RANGE,
    platforms: [PLATFORMS.SMARTLEAD],
    dateRange: { start: "2024-01-01", end: "2024-01-31" },
  });
  return config.mode === SYNC_MODES.DATE_RANGE;
});

test("Default to all platforms", () => {
  const config = new FullSyncConfig({
    mode: SYNC_MODES.FULL_HISTORICAL,
  });
  return (
    config.platforms.includes(PLATFORMS.SMARTLEAD) &&
    config.platforms.includes(PLATFORMS.LEMLIST)
  );
});

test("Validate platform selection", () => {
  const config = new FullSyncConfig({
    mode: SYNC_MODES.FULL_HISTORICAL,
    platforms: "smartlead",
  });
  return (
    config.shouldSyncPlatform("smartlead") &&
    !config.shouldSyncPlatform("lemlist")
  );
});

test("Validate namespace selection", () => {
  const config = new FullSyncConfig({
    mode: SYNC_MODES.FULL_HISTORICAL,
    namespaces: ["playmaker", "test"],
  });
  return (
    config.shouldSyncNamespace("playmaker") &&
    config.shouldSyncNamespace("test") &&
    !config.shouldSyncNamespace("other")
  );
});

test("Handle all namespaces", () => {
  const config = new FullSyncConfig({
    mode: SYNC_MODES.FULL_HISTORICAL,
    namespaces: "all",
  });
  return config.shouldSyncNamespace("any-namespace");
});

test("Reject invalid sync mode", () => {
  try {
    new FullSyncConfig({
      mode: "INVALID_MODE",
    });
    return false;
  } catch (error) {
    return true; // Should throw
  }
});

test("Require date range for DATE_RANGE mode", () => {
  try {
    new FullSyncConfig({
      mode: SYNC_MODES.DATE_RANGE,
      // Missing dateRange
    });
    return false;
  } catch (error) {
    return true; // Should throw
  }
});

test("Require reset date for RESET_FROM_DATE mode", () => {
  try {
    new FullSyncConfig({
      mode: SYNC_MODES.RESET_FROM_DATE,
      // Missing resetDate
    });
    return false;
  } catch (error) {
    return true; // Should throw
  }
});

test("Create config from API request", () => {
  const config = FullSyncConfig.fromApiRequest({
    mode: "DATE_RANGE",
    platforms: "smartlead,lemlist",
    namespaces: "playmaker,test",
    startDate: "2024-01-01",
    endDate: "2024-01-31",
    batchSize: "50",
    enableMixpanelTracking: "true",
  });
  return (
    config.mode === SYNC_MODES.DATE_RANGE &&
    config.batchSize === 50 &&
    config.enableMixpanelTracking === true
  );
});

test("Get date filter for different modes", () => {
  // Full historical - no filter
  const fullConfig = new FullSyncConfig({
    mode: SYNC_MODES.FULL_HISTORICAL,
  });

  // Date range - has filter
  const rangeConfig = new FullSyncConfig({
    mode: SYNC_MODES.DATE_RANGE,
    dateRange: { start: "2024-01-01", end: "2024-01-31" },
  });

  // Reset from date - has start only
  const resetConfig = new FullSyncConfig({
    mode: SYNC_MODES.RESET_FROM_DATE,
    resetDate: "2024-01-15",
  });

  return (
    fullConfig.getDateFilter() === null &&
    rangeConfig.getDateFilter().start instanceof Date &&
    rangeConfig.getDateFilter().end instanceof Date &&
    resetConfig.getDateFilter().start instanceof Date &&
    resetConfig.getDateFilter().end === null
  );
});

// Test Results Summary
console.log("\n" + "=".repeat(50));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("🎉 All tests passed! Configuration system is ready.");
  process.exit(0);
} else {
  console.log(`⚠️  ${failed} test(s) failed. Please check the implementation.`);
  process.exit(1);
}
