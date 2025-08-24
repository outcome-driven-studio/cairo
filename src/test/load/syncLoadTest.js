/**
 * Full Sync System Load Testing
 *
 * Simulates high-load scenarios to validate system performance,
 * stability, and resource usage under stress conditions.
 */

const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../../config/fullSyncConfig");
const { eventKeyGenerator } = require("../../utils/eventKeyGenerator");

console.log("⚡ Full Sync System Load Testing");
console.log("=================================\n");

class SyncLoadTester {
  constructor() {
    this.testResults = [];
    this.metrics = {
      requests: 0,
      successes: 0,
      failures: 0,
      avgResponseTime: 0,
      peakMemory: 0,
      errors: [],
    };
  }

  async runLoadTestSuite() {
    console.log("🚀 Starting Load Test Suite...\n");

    try {
      // Test 1: High-Volume Event Key Generation
      await this.testHighVolumeEventKeys();

      // Test 2: Concurrent Configuration Creation
      await this.testConcurrentConfigurations();

      // Test 3: Memory Stress Test
      await this.testMemoryStress();

      // Test 4: Sustained Load Test
      await this.testSustainedLoad();

      // Test 5: Spike Load Test
      await this.testSpikeLoad();

      // Test 6: Error Recovery Test
      await this.testErrorRecovery();

      // Generate load test report
      this.generateLoadTestReport();
    } catch (error) {
      console.error("❌ Load test suite failed:", error.message);
      throw error;
    }
  }

  async testHighVolumeEventKeys() {
    console.log("📊 Test 1: High-Volume Event Key Generation...");

    const volumes = [10000, 50000, 100000, 250000];

    for (const volume of volumes) {
      console.log(
        `   Testing ${volume.toLocaleString()} event key generations...`
      );

      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      // Clear cache to start fresh
      eventKeyGenerator.clearCache();

      let successful = 0;
      let failed = 0;
      const errors = [];

      // Generate event keys in batches to manage memory
      const batchSize = 1000;
      const batches = Math.ceil(volume / batchSize);

      for (let batch = 0; batch < batches; batch++) {
        const batchStart = batch * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, volume);

        for (let i = batchStart; i < batchEnd; i++) {
          try {
            const key = eventKeyGenerator.generateEventKey({
              platform: i % 2 === 0 ? "lemlist" : "smartlead",
              campaignId: `load_test_${Math.floor(i / 1000)}`,
              eventType: ["sent", "opened", "clicked", "replied"][i % 4],
              email: `loadtest${i}@example.com`,
              activityId: `load_act_${i}`,
              timestamp: new Date(Date.now() + i),
            });

            if (key) successful++;
            else failed++;
          } catch (error) {
            failed++;
            errors.push(error.message);
          }
        }

        // Memory check every 10 batches
        if (batch % 10 === 0) {
          const currentMemory = process.memoryUsage().heapUsed;
          this.metrics.peakMemory = Math.max(
            this.metrics.peakMemory,
            currentMemory
          );
        }
      }

      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      const stats = eventKeyGenerator.getStats();

      const result = {
        volume,
        duration: endTime - startTime,
        successful,
        failed,
        keysPerSecond: successful / ((endTime - startTime) / 1000),
        memoryUsed: endMemory.heapUsed - startMemory.heapUsed,
        collisionRate: stats.collision_rate,
        cacheSize: stats.cache_size,
        errors: errors.slice(0, 5), // First 5 errors
      };

      this.testResults.push({
        testName: "High-Volume Event Keys",
        ...result,
      });

      console.log(`     Duration: ${result.duration.toLocaleString()}ms`);
      console.log(
        `     Success Rate: ${((successful / volume) * 100).toFixed(2)}%`
      );
      console.log(`     Keys/sec: ${result.keysPerSecond.toLocaleString()}`);
      console.log(
        `     Memory Used: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`
      );
      console.log(`     Collision Rate: ${result.collisionRate}`);
      console.log("");
    }

    console.log("   ✅ High-volume event key generation test complete\n");
  }

  async testConcurrentConfigurations() {
    console.log("⚙️  Test 2: Concurrent Configuration Creation...");

    const concurrencyLevels = [10, 50, 100, 200];

    for (const concurrency of concurrencyLevels) {
      console.log(
        `   Testing ${concurrency} concurrent configuration creations...`
      );

      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      let successful = 0;
      let failed = 0;
      const errors = [];

      // Create concurrent workers
      const workers = Array.from(
        { length: concurrency },
        (_, workerId) => this.configWorker(workerId, 100, errors) // 100 configs per worker
      );

      const results = await Promise.allSettled(workers);

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successful += result.value.successful;
          failed += result.value.failed;
        } else {
          failed += 100; // Assume all failed if worker failed
          errors.push(result.reason.message);
        }
      });

      const endTime = Date.now();
      const endMemory = process.memoryUsage();

      const result = {
        concurrency,
        totalConfigs: concurrency * 100,
        duration: endTime - startTime,
        successful,
        failed,
        configsPerSecond: successful / ((endTime - startTime) / 1000),
        memoryUsed: endMemory.heapUsed - startMemory.heapUsed,
        successRate:
          ((successful / (concurrency * 100)) * 100).toFixed(2) + "%",
        errors: errors.slice(0, 3),
      };

      this.testResults.push({
        testName: "Concurrent Configurations",
        ...result,
      });

      console.log(`     Duration: ${result.duration}ms`);
      console.log(`     Success Rate: ${result.successRate}`);
      console.log(`     Configs/sec: ${result.configsPerSecond.toFixed(0)}`);
      console.log(
        `     Memory Used: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`
      );
    }

    console.log("   ✅ Concurrent configuration test complete\n");
  }

  async configWorker(workerId, configCount, errorArray) {
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < configCount; i++) {
      try {
        const config = new FullSyncConfig({
          platforms: [PLATFORMS.LEMLIST, PLATFORMS.SMARTLEAD][i % 2]
            ? [PLATFORMS.LEMLIST]
            : [PLATFORMS.SMARTLEAD],
          namespaces: [`worker_${workerId}_ns_${i % 5}`],
          syncMode:
            Object.values(SYNC_MODES)[i % Object.values(SYNC_MODES).length],
          batchSize: 10 + (i % 90),
          startDate: new Date(2024, i % 12, (i % 28) + 1)
            .toISOString()
            .split("T")[0],
        });

        if (config) successful++;
        else failed++;
      } catch (error) {
        failed++;
        errorArray.push(`Worker ${workerId}: ${error.message}`);
      }
    }

    return { workerId, successful, failed };
  }

  async testMemoryStress() {
    console.log("🧠 Test 3: Memory Stress Test...");

    const phases = [
      { name: "Warmup", operations: 1000 },
      { name: "Ramp Up", operations: 10000 },
      { name: "Peak Load", operations: 50000 },
      { name: "Sustained", operations: 25000 },
      { name: "Cool Down", operations: 5000 },
    ];

    const memorySnapshots = [];
    let totalOperations = 0;

    for (const phase of phases) {
      console.log(
        `   Phase: ${
          phase.name
        } (${phase.operations.toLocaleString()} operations)...`
      );

      const phaseStart = Date.now();
      const memoryBefore = process.memoryUsage();

      // Generate event keys for this phase
      for (let i = 0; i < phase.operations; i++) {
        eventKeyGenerator.generateEventKey({
          platform: "lemlist",
          campaignId: `memory_stress_${totalOperations + i}`,
          eventType: "memory_test",
          email: `memtest${totalOperations + i}@example.com`,
          activityId: `mem_act_${totalOperations + i}`,
        });
      }

      const phaseEnd = Date.now();
      const memoryAfter = process.memoryUsage();

      const snapshot = {
        phase: phase.name,
        operations: phase.operations,
        duration: phaseEnd - phaseStart,
        memoryBefore: memoryBefore.heapUsed,
        memoryAfter: memoryAfter.heapUsed,
        memoryDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
        rss: memoryAfter.rss,
        external: memoryAfter.external,
      };

      memorySnapshots.push(snapshot);
      totalOperations += phase.operations;

      console.log(
        `     Memory Delta: ${(snapshot.memoryDelta / 1024 / 1024).toFixed(
          2
        )}MB`
      );
      console.log(
        `     Total Memory: ${(snapshot.memoryAfter / 1024 / 1024).toFixed(
          2
        )}MB`
      );
      console.log(`     RSS: ${(snapshot.rss / 1024 / 1024).toFixed(2)}MB`);

      // Small delay between phases
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Try to force garbage collection
    if (global.gc) {
      console.log("   Forcing garbage collection...");
      global.gc();
      const gcMemory = process.memoryUsage();
      console.log(
        `   After GC: ${(gcMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`
      );
    }

    const stats = eventKeyGenerator.getStats();

    this.testResults.push({
      testName: "Memory Stress Test",
      phases: memorySnapshots,
      totalOperations,
      finalStats: stats,
      peakMemory: Math.max(...memorySnapshots.map((s) => s.memoryAfter)),
      memoryEfficiency:
        totalOperations /
        Math.max(...memorySnapshots.map((s) => s.memoryAfter)),
    });

    console.log("   ✅ Memory stress test complete\n");
  }

  async testSustainedLoad() {
    console.log("⏳ Test 4: Sustained Load Test...");

    const duration = 60000; // 60 seconds
    const targetRate = 1000; // 1000 operations per second
    const intervalMs = 1000 / targetRate;

    console.log(
      `   Running sustained load for ${
        duration / 1000
      } seconds at ${targetRate} ops/sec...`
    );

    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    let operations = 0;
    let successful = 0;
    let failed = 0;
    const errors = [];
    const performanceSnapshots = [];

    const interval = setInterval(() => {
      const snapshotTime = Date.now();

      try {
        eventKeyGenerator.generateEventKey({
          platform: operations % 2 === 0 ? "lemlist" : "smartlead",
          campaignId: `sustained_${Math.floor(operations / 1000)}`,
          eventType: "sustained_load",
          email: `sustained${operations}@example.com`,
          activityId: `sust_${operations}`,
        });
        successful++;
      } catch (error) {
        failed++;
        errors.push(error.message);
      }

      operations++;

      // Performance snapshot every 10 seconds
      if (operations % (targetRate * 10) === 0) {
        const currentMemory = process.memoryUsage();
        performanceSnapshots.push({
          timestamp: snapshotTime,
          operations,
          memory: currentMemory.heapUsed,
          elapsedTime: snapshotTime - startTime,
        });
      }
    }, intervalMs);

    // Wait for the duration
    await new Promise((resolve) => setTimeout(resolve, duration));
    clearInterval(interval);

    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    const actualDuration = endTime - startTime;

    const result = {
      targetDuration: duration,
      actualDuration,
      targetRate,
      actualRate: operations / (actualDuration / 1000),
      operations,
      successful,
      failed,
      successRate: ((successful / operations) * 100).toFixed(2) + "%",
      memoryUsed: endMemory.heapUsed - startMemory.heapUsed,
      memoryStability: this.calculateMemoryStability(performanceSnapshots),
      performanceSnapshots,
      errors: errors.slice(0, 5),
    };

    this.testResults.push({
      testName: "Sustained Load Test",
      ...result,
    });

    console.log(`     Actual Duration: ${actualDuration}ms`);
    console.log(`     Operations: ${operations.toLocaleString()}`);
    console.log(`     Actual Rate: ${result.actualRate.toFixed(0)} ops/sec`);
    console.log(`     Success Rate: ${result.successRate}`);
    console.log(`     Memory Stability: ${result.memoryStability}`);

    console.log("   ✅ Sustained load test complete\n");
  }

  async testSpikeLoad() {
    console.log("📈 Test 5: Spike Load Test...");

    const spikes = [
      { name: "Small Spike", operations: 5000, duration: 1000 },
      { name: "Medium Spike", operations: 15000, duration: 2000 },
      { name: "Large Spike", operations: 30000, duration: 3000 },
      { name: "Extreme Spike", operations: 50000, duration: 1000 },
    ];

    for (const spike of spikes) {
      console.log(
        `   ${spike.name}: ${spike.operations.toLocaleString()} ops in ${
          spike.duration
        }ms...`
      );

      const spikeStart = Date.now();
      const memoryBefore = process.memoryUsage();

      let successful = 0;
      let failed = 0;
      const errors = [];

      // Create burst of operations
      const promises = [];
      const operationsPerBatch = Math.ceil(spike.operations / 10);

      for (let batch = 0; batch < 10; batch++) {
        promises.push(this.batchOperation(batch, operationsPerBatch, errors));
      }

      const batchResults = await Promise.allSettled(promises);

      batchResults.forEach((result) => {
        if (result.status === "fulfilled") {
          successful += result.value.successful;
          failed += result.value.failed;
        } else {
          failed += operationsPerBatch;
          errors.push(result.reason.message);
        }
      });

      const spikeEnd = Date.now();
      const memoryAfter = process.memoryUsage();
      const actualDuration = spikeEnd - spikeStart;

      const result = {
        spike: spike.name,
        targetOperations: spike.operations,
        targetDuration: spike.duration,
        actualDuration,
        successful,
        failed,
        operationsPerSecond: successful / (actualDuration / 1000),
        successRate: ((successful / spike.operations) * 100).toFixed(2) + "%",
        memoryUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
        errors: errors.slice(0, 3),
      };

      console.log(`     Actual Duration: ${actualDuration}ms`);
      console.log(`     Success Rate: ${result.successRate}`);
      console.log(`     Ops/sec: ${result.operationsPerSecond.toFixed(0)}`);
      console.log(
        `     Memory Used: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`
      );
      console.log("");

      // Recovery period between spikes
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log("   ✅ Spike load test complete\n");
  }

  async batchOperation(batchId, operationCount, errorArray) {
    let successful = 0;
    let failed = 0;

    const batchPromises = [];

    for (let i = 0; i < operationCount; i++) {
      batchPromises.push(
        new Promise((resolve) => {
          try {
            const key = eventKeyGenerator.generateEventKey({
              platform: "lemlist",
              campaignId: `spike_${batchId}`,
              eventType: "spike_load",
              email: `spike${batchId}.${i}@example.com`,
              activityId: `spike_${batchId}_${i}`,
            });
            resolve({ success: !!key });
          } catch (error) {
            errorArray.push(`Batch ${batchId}: ${error.message}`);
            resolve({ success: false });
          }
        })
      );
    }

    const results = await Promise.all(batchPromises);

    results.forEach((result) => {
      if (result.success) successful++;
      else failed++;
    });

    return { batchId, successful, failed };
  }

  async testErrorRecovery() {
    console.log("🔄 Test 6: Error Recovery Test...");

    console.log("   Testing error conditions and recovery...");

    const errorTests = [
      {
        name: "Invalid Platform",
        errorCondition: () =>
          eventKeyGenerator.generateEventKey({
            platform: "invalid_platform",
            campaignId: "test",
            eventType: "test",
            email: "test@example.com",
          }),
      },
      {
        name: "Missing Required Fields",
        errorCondition: () =>
          eventKeyGenerator.generateEventKey({
            platform: "lemlist",
            // Missing required fields
          }),
      },
      {
        name: "Invalid Email Format",
        errorCondition: () =>
          eventKeyGenerator.generateEventKey({
            platform: "lemlist",
            campaignId: "test",
            eventType: "test",
            email: "invalid-email-format",
          }),
      },
    ];

    const errorResults = [];

    for (const test of errorTests) {
      console.log(`     Testing: ${test.name}...`);

      let successful = 0;
      let failed = 0;
      const errors = [];

      // Run error condition 100 times
      for (let i = 0; i < 100; i++) {
        try {
          const result = test.errorCondition();
          if (result) successful++;
          else failed++;
        } catch (error) {
          failed++;
          if (errors.length < 3) {
            errors.push(error.message);
          }
        }
      }

      errorResults.push({
        testName: test.name,
        successful,
        failed,
        recoveryRate: ((successful / 100) * 100).toFixed(2) + "%",
        errors,
      });

      console.log(
        `       Recovery Rate: ${((successful / 100) * 100).toFixed(2)}%`
      );
    }

    // Test system recovery after errors
    console.log("   Testing system recovery after errors...");

    const recoveryStart = Date.now();
    let recoverySuccessful = 0;

    // Generate normal operations to test recovery
    for (let i = 0; i < 1000; i++) {
      try {
        const key = eventKeyGenerator.generateEventKey({
          platform: "lemlist",
          campaignId: "recovery_test",
          eventType: "recovery",
          email: `recovery${i}@example.com`,
          activityId: `recovery_${i}`,
        });
        if (key) recoverySuccessful++;
      } catch (error) {
        // Should not happen in recovery phase
      }
    }

    const recoveryEnd = Date.now();

    const recoveryResult = {
      operations: 1000,
      successful: recoverySuccessful,
      duration: recoveryEnd - recoveryStart,
      recoveryRate: ((recoverySuccessful / 1000) * 100).toFixed(2) + "%",
    };

    this.testResults.push({
      testName: "Error Recovery Test",
      errorTests: errorResults,
      systemRecovery: recoveryResult,
    });

    console.log(`     System Recovery Rate: ${recoveryResult.recoveryRate}`);
    console.log("   ✅ Error recovery test complete\n");
  }

  calculateMemoryStability(snapshots) {
    if (snapshots.length < 2) return "Insufficient data";

    const memoryValues = snapshots.map((s) => s.memory);
    const avg =
      memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length;
    const variance =
      memoryValues.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
      memoryValues.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = (stdDev / avg) * 100;

    if (coefficientOfVariation < 10) return "Very Stable";
    if (coefficientOfVariation < 25) return "Stable";
    if (coefficientOfVariation < 50) return "Moderately Stable";
    return "Unstable";
  }

  generateLoadTestReport() {
    console.log("📋 Load Test Report");
    console.log("===================\n");

    const report = {
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage(),
        cpus: require("os").cpus().length,
      },
      overallMetrics: this.metrics,
      testResults: this.testResults,
    };

    // Calculate overall metrics
    let totalOperations = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let peakMemoryUsage = 0;

    this.testResults.forEach((test) => {
      if (test.operations) totalOperations += test.operations;
      if (test.successful) totalSuccessful += test.successful;
      if (test.failed) totalFailed += test.failed;
      if (test.memoryUsed)
        peakMemoryUsage = Math.max(peakMemoryUsage, test.memoryUsed);
    });

    console.log("📊 Overall Load Test Results:");
    console.log(`   Total Operations: ${totalOperations.toLocaleString()}`);
    console.log(`   Successful: ${totalSuccessful.toLocaleString()}`);
    console.log(`   Failed: ${totalFailed.toLocaleString()}`);
    console.log(
      `   Success Rate: ${((totalSuccessful / totalOperations) * 100).toFixed(
        2
      )}%`
    );
    console.log(
      `   Peak Memory Usage: ${(peakMemoryUsage / 1024 / 1024).toFixed(2)}MB`
    );

    // Test-specific highlights
    console.log("\n🎯 Test Highlights:");

    const highVolumeTest = this.testResults.find(
      (t) => t.testName === "High-Volume Event Keys"
    );
    if (highVolumeTest) {
      console.log(
        `   • Highest Key Generation Rate: ${Math.max(
          ...this.testResults
            .filter((t) => t.keysPerSecond)
            .map((t) => t.keysPerSecond)
        ).toLocaleString()} keys/sec`
      );
    }

    const sustainedTest = this.testResults.find(
      (t) => t.testName === "Sustained Load Test"
    );
    if (sustainedTest) {
      console.log(
        `   • Sustained Load Performance: ${sustainedTest.actualRate?.toFixed(
          0
        )} ops/sec over ${sustainedTest.actualDuration / 1000}s`
      );
      console.log(`   • Memory Stability: ${sustainedTest.memoryStability}`);
    }

    // Load test grade
    const grade = this.calculateLoadTestGrade();
    console.log(`\n🏆 Load Test Grade: ${grade.grade} (${grade.score}/100)`);
    console.log(`📝 ${grade.description}`);

    if (grade.issues.length > 0) {
      console.log("\n⚠️  Issues Identified:");
      grade.issues.forEach((issue) => console.log(`   • ${issue}`));
    }

    if (grade.recommendations.length > 0) {
      console.log("\n💡 Recommendations:");
      grade.recommendations.forEach((rec) => console.log(`   • ${rec}`));
    }

    console.log("\n✨ Load Testing Complete!");

    return report;
  }

  calculateLoadTestGrade() {
    let score = 100;
    const issues = [];
    const recommendations = [];

    // Check success rates
    const overallSuccessRate =
      this.testResults.reduce((sum, test) => {
        const rate = test.successRate ? parseFloat(test.successRate) : 100;
        return sum + rate;
      }, 0) / this.testResults.length;

    if (overallSuccessRate < 95) {
      score -= 15;
      issues.push(
        `Low overall success rate: ${overallSuccessRate.toFixed(2)}%`
      );
      recommendations.push("Investigate and fix causes of operation failures");
    }

    // Check memory stability
    const sustainedTest = this.testResults.find(
      (t) => t.testName === "Sustained Load Test"
    );
    if (sustainedTest && sustainedTest.memoryStability === "Unstable") {
      score -= 10;
      issues.push("Unstable memory usage during sustained load");
      recommendations.push(
        "Optimize memory management and implement proper garbage collection"
      );
    }

    // Check error recovery
    const errorTest = this.testResults.find(
      (t) => t.testName === "Error Recovery Test"
    );
    if (errorTest) {
      const avgRecoveryRate =
        errorTest.errorTests.reduce(
          (sum, test) => sum + parseFloat(test.recoveryRate),
          0
        ) / errorTest.errorTests.length;

      if (avgRecoveryRate < 50) {
        score -= 10;
        issues.push("Poor error recovery rate");
        recommendations.push("Improve error handling and recovery mechanisms");
      }
    }

    // Performance thresholds
    const highVolumeTests = this.testResults.filter((t) => t.keysPerSecond);
    const avgKeysPerSecond =
      highVolumeTests.reduce((sum, t) => sum + t.keysPerSecond, 0) /
      highVolumeTests.length;

    if (avgKeysPerSecond < 5000) {
      score -= 5;
      issues.push("Below expected performance threshold");
      recommendations.push("Optimize event key generation algorithms");
    }

    let grade, description;

    if (score >= 95) {
      grade = "A+";
      description = "Excellent load handling with no significant issues";
    } else if (score >= 90) {
      grade = "A";
      description = "Very good performance under load with minor issues";
    } else if (score >= 85) {
      grade = "B+";
      description = "Good performance with some areas for improvement";
    } else if (score >= 80) {
      grade = "B";
      description = "Acceptable performance but optimization needed";
    } else if (score >= 70) {
      grade = "C";
      description = "Below expectations, significant improvements required";
    } else {
      grade = "D";
      description = "Poor performance under load, major optimizations needed";
    }

    return { score, grade, description, issues, recommendations };
  }
}

// Run load tests if called directly
if (require.main === module) {
  const loadTester = new SyncLoadTester();

  loadTester
    .runLoadTestSuite()
    .then(() => {
      console.log("🎉 Load test suite completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Load test suite failed:", error.message);
      process.exit(1);
    });
}

module.exports = SyncLoadTester;
