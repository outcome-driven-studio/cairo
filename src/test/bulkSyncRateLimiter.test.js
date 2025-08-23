#!/usr/bin/env node
/**
 * Bulk Sync Rate Limiter Tests
 *
 * Tests the rate limiting, batching, and progress tracking
 * functionality for bulk sync operations.
 */

const {
  BulkSyncRateLimiter,
  ProgressTracker,
  BatchQueue,
  createRateLimiter,
  API_LIMITS,
} = require("../utils/bulkSyncRateLimiter");

console.log("🧪 Bulk Sync Rate Limiter Tests");
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
  // Test Progress Tracker
  console.log("\n📊 Progress Tracker Tests:");

  await test("Create progress tracker", async () => {
    const tracker = new ProgressTracker(100, "Test Operation");
    return (
      tracker.totalItems === 100 && tracker.operationName === "Test Operation"
    );
  });

  await test("Update progress", async () => {
    const tracker = new ProgressTracker(100, "Test");
    tracker.update(25);
    return tracker.processedItems === 25;
  });

  await test("Calculate progress percentage", async () => {
    const tracker = new ProgressTracker(100, "Test");
    tracker.update(50);
    const summary = tracker.getSummary();
    return (
      summary.processedItems === 50 && parseFloat(summary.successRate) === 50.0
    );
  });

  // Test Batch Queue
  console.log("\n📦 Batch Queue Tests:");

  await test("Create batch queue", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const queue = new BatchQueue(items, 3);
    return queue.currentBatchSize === 3 && queue.hasMore();
  });

  await test("Get next batch", async () => {
    const items = [1, 2, 3, 4, 5];
    const queue = new BatchQueue(items, 2);
    const batch = queue.getNextBatch();
    return batch && batch.items.length === 2 && batch.items[0] === 1;
  });

  await test("Report batch success increases batch size", async () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const queue = new BatchQueue(items, 3);
    const initialSize = queue.currentBatchSize;

    // Directly call reportSuccess 3 times to trigger increase
    queue.reportSuccess(3); // successfulBatches = 1
    queue.reportSuccess(3); // successfulBatches = 2
    queue.reportSuccess(3); // successfulBatches = 3 - should increase size (3 % 3 === 0)

    return queue.currentBatchSize > initialSize;
  });

  await test("Report batch failure decreases batch size", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const queue = new BatchQueue(items, 10);
    const initialSize = queue.currentBatchSize;

    const batch = queue.getNextBatch();
    queue.reportFailure(batch.items);

    return queue.currentBatchSize < initialSize;
  });

  // Test Rate Limiter
  console.log("\n🔄 Rate Limiter Tests:");

  await test("Create rate limiter", async () => {
    const limiter = createRateLimiter("smartlead");
    return (
      limiter.apiType === "smartlead" && limiter.limits.requestsPerSecond > 0
    );
  });

  await test("Initialize bulk operation", async () => {
    const limiter = createRateLimiter("lemlist");
    const items = Array.from({ length: 50 }, (_, i) => i);
    limiter.initializeBulkOperation(items, "Test Sync");

    return (
      limiter.progressTracker.totalItems === 50 && limiter.batchQueue.hasMore()
    );
  });

  await test("Rate limiting delays requests", async () => {
    const limiter = createRateLimiter("lemlist", { requestsPerSecond: 2 });

    const startTime = Date.now();

    // Make 3 requests quickly - should cause delays
    await limiter.waitForRateLimit();
    await limiter.waitForRateLimit();
    await limiter.waitForRateLimit(); // This should be delayed

    const elapsed = Date.now() - startTime;

    // Should take at least 500ms due to rate limiting
    return elapsed >= 400; // Allow some tolerance
  });

  await test("Make rate limited API call", async () => {
    const limiter = createRateLimiter("mixpanel");

    let callCount = 0;
    const mockApiCall = async () => {
      callCount++;
      return { success: true, callNumber: callCount };
    };

    const result = await limiter.makeRateLimitedCall(mockApiCall);
    return result.success && result.callNumber === 1;
  });

  await test("Handle API call errors with backoff", async () => {
    const limiter = createRateLimiter("attio");

    let callCount = 0;
    const mockFailingCall = async () => {
      callCount++;
      throw new Error("API Error");
    };

    try {
      await limiter.makeRateLimitedCall(mockFailingCall);
      return false; // Should have thrown
    } catch (error) {
      // Should have backoff delay after error
      return limiter.backoffDelay > 0 && limiter.consecutiveErrors === 1;
    }
  });

  await test("Process single batch", async () => {
    const limiter = createRateLimiter("database");
    const items = ["item1", "item2", "item3"];
    limiter.initializeBulkOperation(items, "Test");

    let processedItems = [];
    const batchProcessor = async (batch) => {
      processedItems.push(...batch);
      return { processed: batch.length };
    };

    const result = await limiter.processBatch(batchProcessor);
    return result.success && processedItems.length === 3;
  });

  await test("Process all batches", async () => {
    const limiter = createRateLimiter("database");
    const items = Array.from({ length: 10 }, (_, i) => `item${i}`);
    limiter.initializeBulkOperation(items, "Batch Test");

    let totalProcessed = 0;
    const batchProcessor = async (batch) => {
      totalProcessed += batch.length;
      return { processed: batch.length };
    };

    const result = await limiter.processAllBatches(batchProcessor);
    return totalProcessed === 10 && result.summary.completed;
  });

  // Test API Limits Configuration
  console.log("\n⚙️  API Limits Configuration Tests:");

  await test("All APIs have valid limits", async () => {
    for (const [apiName, limits] of Object.entries(API_LIMITS)) {
      if (!limits.requestsPerSecond || !limits.maxBatchSize) {
        console.log(`Invalid limits for ${apiName}`);
        return false;
      }
    }
    return true;
  });

  await test("Smartlead limits are conservative", async () => {
    const limits = API_LIMITS.smartlead;
    return limits.requestsPerSecond <= 10 && limits.maxBatchSize <= 100;
  });

  await test("Lemlist limits respect 20/2sec rule", async () => {
    const limits = API_LIMITS.lemlist;
    return limits.requestsPerSecond <= 10; // 20 per 2 seconds = 10 per second
  });

  await test("Database limits are most generous", async () => {
    const dbLimits = API_LIMITS.database;
    const smartleadLimits = API_LIMITS.smartlead;

    return (
      dbLimits.requestsPerSecond > smartleadLimits.requestsPerSecond &&
      dbLimits.maxBatchSize > smartleadLimits.maxBatchSize
    );
  });

  // Integration Test
  console.log("\n🔗 Integration Tests:");

  await test("Full workflow simulation", async () => {
    const limiter = createRateLimiter("smartlead");
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      name: `item${i}`,
    }));
    limiter.initializeBulkOperation(items, "Integration Test");

    let processedCount = 0;
    const batchProcessor = async (batch) => {
      // Simulate API processing time
      await new Promise((resolve) => setTimeout(resolve, 50));
      processedCount += batch.length;
      return { success: true, processed: batch.length };
    };

    const startTime = Date.now();
    const result = await limiter.processAllBatches(batchProcessor);
    const elapsed = Date.now() - startTime;

    return processedCount === 25 && result.summary.completed && elapsed >= 50; // Should have taken at least processing time
  });

  // Performance Test
  await test("Handle large dataset efficiently", async () => {
    const limiter = createRateLimiter("database"); // Fastest limits
    const items = Array.from({ length: 1000 }, (_, i) => i);
    limiter.initializeBulkOperation(items, "Performance Test");

    let batchCount = 0;
    const batchProcessor = async (batch) => {
      batchCount++;
      return { processed: batch.length };
    };

    const startTime = Date.now();
    const result = await limiter.processAllBatches(batchProcessor);
    const elapsed = Date.now() - startTime;

    // Should process 1000 items relatively quickly with database limits
    return (
      result.summary.totalItems === 1000 &&
      result.summary.completed &&
      elapsed < 10000
    ); // Under 10 seconds
  });

  // Test Results Summary
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("🎉 All tests passed! Rate limiter system is ready.");
    process.exit(0);
  } else {
    console.log(
      `⚠️  ${failed} test(s) failed. Please check the implementation.`
    );
    process.exit(1);
  }
}

runTests();
