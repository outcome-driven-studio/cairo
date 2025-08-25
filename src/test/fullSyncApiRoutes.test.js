#!/usr/bin/env node
/**
 * Full Sync API Routes Tests
 *
 * Tests the REST API endpoints for full sync operations
 * including validation, error handling, and response formats.
 */

const FullSyncRoutes = require("../routes/fullSyncRoutes");
const { SYNC_MODES, PLATFORMS } = require("../config/fullSyncConfig");

console.log("🧪 Full Sync API Routes Tests");
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
 * Mock Express Request/Response objects for testing
 */
function createMockReq(body = {}, params = {}, query = {}, headers = {}) {
  return {
    body,
    params,
    query,
    headers,
    get: (name) => headers[name.toLowerCase()],
    ip: "127.0.0.1",
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      this.body = data;
      return this;
    },
    header: function (name, value) {
      this.headers[name] = value;
      return this;
    },
  };
  return res;
}

async function runTests() {
  // Test Route Setup
  console.log("\n🏗️  Route Setup Tests:");

  await test("Create FullSyncRoutes instance", async () => {
    const routes = new FullSyncRoutes();
    return routes.fullSyncService && routes.jobService;
  });

  await test("Setup routes returns Express router", async () => {
    const routes = new FullSyncRoutes();
    const router = routes.setupRoutes();

    // Check if it has router-like properties
    return router && typeof router.use === "function";
  });

  // Test Validation Functions
  console.log("\n⚙️  Validation Tests:");

  await test("Estimate job duration", async () => {
    const routes = new FullSyncRoutes();
    const mockConfig = {
      mode: SYNC_MODES.DATE_RANGE,
      platforms: [PLATFORMS.SMARTLEAD],
      namespaces: ["test"],
    };

    const estimate = routes.estimateJobDuration(mockConfig);
    return (
      estimate.estimated > 0 && estimate.unit === "minutes" && estimate.note
    );
  });

  await test("Generate configuration warnings", async () => {
    const routes = new FullSyncRoutes();
    const config = { mode: SYNC_MODES.FULL_HISTORICAL };
    const namespaces = [];

    const warnings = routes.generateConfigWarnings(config, namespaces);
    return Array.isArray(warnings) && warnings.length > 0;
  });

  await test("Generate warnings for large namespace count", async () => {
    const routes = new FullSyncRoutes();
    const config = { mode: SYNC_MODES.DATE_RANGE };
    const namespaces = Array.from({ length: 10 }, (_, i) => `ns${i}`);

    const warnings = routes.generateConfigWarnings(config, namespaces);
    return warnings.some((w) => w.includes("considerable time"));
  });

  // Test Health Endpoint
  console.log("\n🏥 Health Endpoint Tests:");

  await test("Health endpoint handles errors gracefully", async () => {
    const routes = new FullSyncRoutes();

    // Mock the getSyncStatus to throw an error
    routes.fullSyncService.getSyncStatus = async () => {
      throw new Error("Database connection failed");
    };

    const req = createMockReq();
    const res = createMockRes();

    await routes.getHealth(req, res);

    return (
      res.statusCode === 500 &&
      res.body.success === false &&
      res.body.data.status === "unhealthy"
    );
  });

  await test("Health endpoint returns proper structure", async () => {
    const routes = new FullSyncRoutes();

    // Mock successful health check
    routes.fullSyncService.getSyncStatus = async () => ({
      systemHealth: { database: true },
      rateLimiters: {
        smartlead: {
          apiType: "smartlead",
          backoffDelay: 0,
          consecutiveErrors: 0,
          requestCount: 5,
        },
      },
      recentActivity: [],
    });

    const req = createMockReq();
    const res = createMockRes();

    await routes.getHealth(req, res);

    return (
      res.statusCode === 200 &&
      res.body.success === true &&
      res.body.data.status === "healthy" &&
      res.body.data.rateLimiters.smartlead
    );
  });

  // Test Job Status Endpoint
  console.log("\n📋 Job Status Tests:");

  await test("Job status returns 404 for non-existent job", async () => {
    const routes = new FullSyncRoutes();

    const req = createMockReq({}, { jobId: "non-existent-job" });
    const res = createMockRes();

    await routes.getJobStatus(req, res);

    return (
      res.statusCode === 404 &&
      res.body.success === false &&
      res.body.error === "Job not found"
    );
  });

  await test("Job status returns job data when found", async () => {
    const routes = new FullSyncRoutes();

    // Mock job service to return a job
    routes.jobService.getJobStatus = (jobId) => ({
      id: jobId,
      status: "completed",
      result: { success: true },
    });

    const req = createMockReq({}, { jobId: "test-job-123" });
    const res = createMockRes();

    await routes.getJobStatus(req, res);

    return (
      res.statusCode === 200 &&
      res.body.success === true &&
      res.body.data.status === "completed"
    );
  });

  // Test Configuration Validation
  console.log("\n✅ Configuration Validation Tests:");

  await test("Config validation handles invalid mode", async () => {
    const routes = new FullSyncRoutes();

    const req = createMockReq({
      mode: "INVALID_MODE",
      platforms: [PLATFORMS.SMARTLEAD],
    });
    const res = createMockRes();

    await routes.validateConfig(req, res);

    return (
      res.statusCode === 400 &&
      res.body.success === false &&
      res.body.data.valid === false
    );
  });

  await test("Config validation succeeds with valid config", async () => {
    const routes = new FullSyncRoutes();

    // Mock the getTargetNamespaces method
    routes.fullSyncService.getTargetNamespaces = async () => ["test"];

    const req = createMockReq({
      mode: SYNC_MODES.FULL_HISTORICAL,
      platforms: [PLATFORMS.SMARTLEAD],
      namespaces: ["test"],
    });
    const res = createMockRes();

    await routes.validateConfig(req, res);

    return (
      res.statusCode === 200 &&
      res.body.success === true &&
      res.body.data.valid === true &&
      res.body.data.targetNamespaces.length === 1
    );
  });

  // Test Job Queue Functions
  console.log("\n🔄 Job Queue Tests:");

  await test("Queue full sync job creates job record", async () => {
    const routes = new FullSyncRoutes();

    const mockConfig = {
      getSummary: () => ({
        mode: SYNC_MODES.FULL_HISTORICAL,
        platforms: [PLATFORMS.SMARTLEAD],
      }),
    };

    const job = await routes.queueFullSyncJob("test-job", mockConfig, null);

    return (
      job.id === "test-job" &&
      job.status === "queued" &&
      job.createdAt instanceof Date
    );
  });

  await test("Jobs endpoint returns job list", async () => {
    const routes = new FullSyncRoutes();

    // Mock job service
    routes.jobService.getActiveJobs = () => [
      {
        id: "job1",
        status: "running",
        createdAt: new Date(),
      },
    ];

    routes.jobService.getJobHistory = () => [
      {
        id: "job2",
        status: "completed",
        createdAt: new Date(),
      },
    ];

    routes.jobService.getJobStats = () => ({
      active: { total: 1 },
      completed: { total: 1 },
    });

    const req = createMockReq({}, {}, { limit: "10", status: "all" });
    const res = createMockRes();

    await routes.getJobs(req, res);

    return (
      res.statusCode === 200 &&
      res.body.success === true &&
      res.body.data.jobs.length >= 1 &&
      res.body.data.stats
    );
  });

  // Test Error Handling
  console.log("\n🚨 Error Handling Tests:");

  await test("Validation errors return proper format", async () => {
    const routes = new FullSyncRoutes();

    const req = createMockReq({
      // Missing mode - should trigger validation error
    });
    const res = createMockRes();
    const next = () => {};

    routes.validateSyncRequest(req, res, next);

    return (
      res.statusCode === 400 &&
      res.body.success === false &&
      res.body.error === "Validation failed" &&
      res.body.details.length > 0
    );
  });

  await test("Async error handler catches promises", async () => {
    const routes = new FullSyncRoutes();

    let errorCaught = false;
    const asyncFn = async () => {
      throw new Error("Test error");
    };

    const wrappedFn = routes.handleAsyncErrors(asyncFn);

    await wrappedFn({}, {}, (error) => {
      errorCaught = error.message === "Test error";
    });

    return errorCaught;
  });

  // Integration Tests
  console.log("\n🔗 Integration Tests:");

  await test("Full sync execution flow (mocked)", async () => {
    const routes = new FullSyncRoutes();

    // Mock successful execution
    routes.fullSyncService.executeFullSync = async () => ({
      success: true,
      summary: {
        totalUsers: 100,
        totalEvents: 500,
        totalErrors: 0,
      },
    });

    const req = createMockReq(
      {
        mode: SYNC_MODES.FULL_HISTORICAL,
        platforms: [PLATFORMS.SMARTLEAD],
        namespaces: ["test"],
      },
      {},
      {},
      { "user-agent": "test" }
    );
    const res = createMockRes();

    await routes.executeFullSync(req, res);

    return (
      res.statusCode === 200 &&
      res.body.success === true &&
      res.body.data.success === true &&
      res.body.meta.duration >= 0
    );
  });

  await test("Async execution returns job info", async () => {
    const routes = new FullSyncRoutes();

    const req = createMockReq({
      mode: SYNC_MODES.DATE_RANGE,
      platforms: [PLATFORMS.LEMLIST],
      dateRange: { start: "2024-01-01", end: "2024-01-31" },
    });
    const res = createMockRes();

    await routes.executeFullSyncAsync(req, res);

    return (
      res.statusCode === 200 &&
      res.body.success === true &&
      res.body.data.jobId &&
      res.body.data.status === "queued" &&
      res.body.data.statusUrl
    );
  });

  // Test Results Summary
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("🎉 All tests passed! Full Sync API Routes are ready.");
    process.exit(0);
  } else {
    console.log(
      `⚠️  ${failed} test(s) failed. Please check the implementation.`
    );
    process.exit(1);
  }
}

runTests();
