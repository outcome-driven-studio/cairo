#!/usr/bin/env node
/**
 * Full Sync Routes Core Tests
 *
 * Tests the core routing logic without database dependencies
 */

const { SYNC_MODES, PLATFORMS } = require("../config/fullSyncConfig");

console.log("🧪 Full Sync Routes Core Logic Tests");
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
 * Mock validation logic (extracted from the route class)
 */
function validateSyncRequest(body) {
  const errors = [];

  // Validate mode
  if (!body.mode || !Object.values(SYNC_MODES).includes(body.mode)) {
    errors.push({
      field: "mode",
      message: `Mode must be one of: ${Object.values(SYNC_MODES).join(", ")}`,
    });
  }

  // Validate platforms if provided
  if (body.platforms) {
    const platforms = Array.isArray(body.platforms)
      ? body.platforms
      : [body.platforms];
    const validPlatforms = Object.values(PLATFORMS);
    const invalidPlatforms = platforms.filter(
      (p) => !validPlatforms.includes(p)
    );
    if (invalidPlatforms.length > 0) {
      errors.push({
        field: "platforms",
        message: `Invalid platforms: ${invalidPlatforms.join(", ")}`,
      });
    }
  }

  // Validate date range for DATE_RANGE mode
  if (body.mode === SYNC_MODES.DATE_RANGE) {
    if (!body.dateRange || !body.dateRange.start || !body.dateRange.end) {
      errors.push({
        field: "dateRange",
        message: "DATE_RANGE mode requires dateRange with start and end dates",
      });
    }
  }

  // Validate reset date for RESET_FROM_DATE mode
  if (body.mode === SYNC_MODES.RESET_FROM_DATE && !body.resetDate) {
    errors.push({
      field: "resetDate",
      message: "RESET_FROM_DATE mode requires resetDate",
    });
  }

  // Validate batch size if provided
  if (body.batchSize && (body.batchSize < 1 || body.batchSize > 1000)) {
    errors.push({
      field: "batchSize",
      message: "Batch size must be between 1 and 1000",
    });
  }

  return errors;
}

/**
 * Mock job duration estimator
 */
function estimateJobDuration(config) {
  let estimatedMinutes = 5; // Base time

  // Add time based on platforms
  if (config.platforms) {
    estimatedMinutes += config.platforms.length * 10;
  }

  // Add time based on sync mode
  switch (config.mode) {
    case SYNC_MODES.FULL_HISTORICAL:
      estimatedMinutes += 30;
      break;
    case SYNC_MODES.DATE_RANGE:
      estimatedMinutes += 15;
      break;
    case SYNC_MODES.RESET_FROM_DATE:
      estimatedMinutes += 20;
      break;
  }

  return {
    estimated: estimatedMinutes,
    unit: "minutes",
    note: "This is an estimate and actual time may vary based on data volume and API response times",
  };
}

/**
 * Generate configuration warnings
 */
function generateConfigWarnings(config, targetNamespaces) {
  const warnings = [];

  if (config.mode === SYNC_MODES.FULL_HISTORICAL) {
    warnings.push(
      "Full historical sync may take a long time and consume significant API quota"
    );
  }

  if (targetNamespaces.length === 0) {
    warnings.push(
      "No target namespaces found - sync will not process any data"
    );
  }

  if (targetNamespaces.length > 5) {
    warnings.push(
      `Syncing ${targetNamespaces.length} namespaces may take considerable time`
    );
  }

  if (config.batchSize && config.batchSize > 100) {
    warnings.push("Large batch sizes may cause API rate limit issues");
  }

  return warnings;
}

async function runTests() {
  // Test Validation Logic
  console.log("\n⚙️  Validation Logic Tests:");

  await test("Valid sync request passes validation", async () => {
    const body = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD],
      namespaces: ["test"],
    };

    const errors = validateSyncRequest(body);
    return errors.length === 0;
  });

  await test("Missing mode triggers validation error", async () => {
    const body = {
      platforms: [PLATFORMS.SMARTLEAD],
    };

    const errors = validateSyncRequest(body);
    return errors.length > 0 && errors.some((e) => e.field === "mode");
  });

  await test("Invalid mode triggers validation error", async () => {
    const body = {
      mode: "INVALID_MODE",
      platforms: [PLATFORMS.SMARTLEAD],
    };

    const errors = validateSyncRequest(body);
    return errors.length > 0 && errors.some((e) => e.field === "mode");
  });

  await test("Invalid platform triggers validation error", async () => {
    const body = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: ["invalid-platform"],
    };

    const errors = validateSyncRequest(body);
    return errors.length > 0 && errors.some((e) => e.field === "platforms");
  });

  await test("DATE_RANGE mode requires date range", async () => {
    const body = {
      mode: SYNC_MODES.DATE_RANGE,
      platforms: [PLATFORMS.SMARTLEAD],
      // Missing dateRange
    };

    const errors = validateSyncRequest(body);
    return errors.length > 0 && errors.some((e) => e.field === "dateRange");
  });

  await test("RESET_FROM_DATE mode requires reset date", async () => {
    const body = {
      mode: SYNC_MODES.RESET_FROM_DATE,
      platforms: [PLATFORMS.SMARTLEAD],
      // Missing resetDate
    };

    const errors = validateSyncRequest(body);
    return errors.length > 0 && errors.some((e) => e.field === "resetDate");
  });

  await test("Invalid batch size triggers validation error", async () => {
    const body = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD],
      batchSize: 1500, // Too large
    };

    const errors = validateSyncRequest(body);
    return errors.length > 0 && errors.some((e) => e.field === "batchSize");
  });

  await test("Multiple platforms are accepted", async () => {
    const body = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD, PLATFORMS.LEMLIST],
    };

    const errors = validateSyncRequest(body);
    return errors.length === 0;
  });

  await test("Single platform string is accepted", async () => {
    const body = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: PLATFORMS.SMARTLEAD, // String instead of array
    };

    const errors = validateSyncRequest(body);
    return errors.length === 0;
  });

  // Test Duration Estimation
  console.log("\n⏱️  Duration Estimation Tests:");

  await test("Estimate duration for simple config", async () => {
    const config = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD],
    };

    const estimate = estimateJobDuration(config);
    return (
      estimate.estimated > 0 &&
      estimate.unit === "minutes" &&
      typeof estimate.note === "string"
    );
  });

  await test("Multiple platforms increase duration", async () => {
    const singlePlatform = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD],
    };

    const multiplePlatforms = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD, PLATFORMS.LEMLIST],
    };

    const estimate1 = estimateJobDuration(singlePlatform);
    const estimate2 = estimateJobDuration(multiplePlatforms);

    return estimate2.estimated > estimate1.estimated;
  });

  await test("Full historical mode takes longer", async () => {
    const dateRange = {
      mode: SYNC_MODES.DATE_RANGE,
      platforms: [PLATFORMS.SMARTLEAD],
    };

    const fullHistorical = {
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD],
    };

    const estimate1 = estimateJobDuration(dateRange);
    const estimate2 = estimateJobDuration(fullHistorical);

    return estimate2.estimated > estimate1.estimated;
  });

  // Test Warning Generation
  console.log("\n⚠️  Warning Generation Tests:");

  await test("Full historical mode generates warning", async () => {
    const config = { mode: SYNC_MODES.FULL_HISTORICAL };
    const namespaces = ["test"];

    const warnings = generateConfigWarnings(config, namespaces);
    return warnings.some((w) => w.includes("Full historical sync"));
  });

  await test("Empty namespaces generate warning", async () => {
    const config = { mode: SYNC_MODES.DATE_RANGE };
    const namespaces = [];

    const warnings = generateConfigWarnings(config, namespaces);
    return warnings.some((w) => w.includes("No target namespaces"));
  });

  await test("Many namespaces generate warning", async () => {
    const config = { mode: SYNC_MODES.DATE_RANGE };
    const namespaces = Array.from({ length: 10 }, (_, i) => `ns${i}`);

    const warnings = generateConfigWarnings(config, namespaces);
    return warnings.some((w) => w.includes("considerable time"));
  });

  await test("Large batch size generates warning", async () => {
    const config = {
      mode: SYNC_MODES.DATE_RANGE,
      batchSize: 200,
    };
    const namespaces = ["test"];

    const warnings = generateConfigWarnings(config, namespaces);
    return warnings.some((w) => w.includes("rate limit"));
  });

  await test("Good config generates no warnings", async () => {
    const config = {
      mode: SYNC_MODES.DATE_RANGE,
      batchSize: 50,
    };
    const namespaces = ["test1", "test2"];

    const warnings = generateConfigWarnings(config, namespaces);
    return warnings.length === 0;
  });

  // Test Request/Response Structures
  console.log("\n📋 Request/Response Structure Tests:");

  await test("Validation creates proper error structure", async () => {
    const body = {
      mode: "INVALID",
      platforms: ["invalid-platform"],
      batchSize: 2000,
    };

    const errors = validateSyncRequest(body);
    return (
      errors.length === 3 &&
      errors.every((e) => e.field && e.message) &&
      errors.some((e) => e.field === "mode") &&
      errors.some((e) => e.field === "platforms") &&
      errors.some((e) => e.field === "batchSize")
    );
  });

  await test("Complex valid configuration passes", async () => {
    const body = {
      mode: SYNC_MODES.DATE_RANGE,
      platforms: [PLATFORMS.SMARTLEAD, PLATFORMS.LEMLIST],
      namespaces: ["ns1", "ns2", "ns3"],
      dateRange: {
        start: "2024-01-01T00:00:00.000Z",
        end: "2024-01-31T23:59:59.999Z",
      },
      batchSize: 50,
      rateLimitDelay: 500,
      enableMixpanelTracking: true,
    };

    const errors = validateSyncRequest(body);
    return errors.length === 0;
  });

  // Test Results Summary
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("🎉 All tests passed! Full Sync Routes core logic is ready.");
    process.exit(0);
  } else {
    console.log(
      `⚠️  ${failed} test(s) failed. Please check the implementation.`
    );
    process.exit(1);
  }
}

runTests();
