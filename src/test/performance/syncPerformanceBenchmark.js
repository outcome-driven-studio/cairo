/**
 * Full Sync System Performance Benchmark
 *
 * Comprehensive performance testing and benchmarking for the sync system.
 * Tests various configurations, data sizes, and scenarios to ensure
 * the system can handle production loads efficiently.
 */

const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../../config/fullSyncConfig");
const { eventKeyGenerator } = require("../../utils/eventKeyGenerator");
const { DatabaseOptimizations } = require("../../utils/dbOptimizations");

console.log("🚀 Full Sync System Performance Benchmark");
console.log("===========================================\n");

class SyncPerformanceBenchmark {
  constructor() {
    this.results = [];
    this.startTime = null;
    this.memoryBaseline = null;
  }

  async runBenchmarkSuite() {
    console.log("📊 Starting Performance Benchmark Suite...\n");

    // Benchmark 1: Event Key Generation Performance
    await this.benchmarkEventKeyGeneration();

    // Benchmark 2: Configuration Validation Performance
    await this.benchmarkConfigurationSystem();

    // Benchmark 3: Database Operations Performance
    await this.benchmarkDatabaseOperations();

    // Benchmark 4: Rate Limiting Performance
    await this.benchmarkRateLimiting();

    // Benchmark 5: Memory Usage Analysis
    await this.benchmarkMemoryUsage();

    // Benchmark 6: Concurrent Operations
    await this.benchmarkConcurrentOperations();

    // Generate comprehensive report
    this.generatePerformanceReport();
  }

  async benchmarkEventKeyGeneration() {
    console.log("🔑 Benchmarking Event Key Generation Performance...");

    const testSizes = [100, 1000, 10000, 50000];
    const eventKeyResults = [];

    for (const size of testSizes) {
      console.log(`   Testing ${size} event key generations...`);

      // Clear cache for clean test
      eventKeyGenerator.clearCache();

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      // Generate event keys
      const keys = [];
      for (let i = 0; i < size; i++) {
        const key = eventKeyGenerator.generateEventKey({
          platform: i % 2 === 0 ? "lemlist" : "smartlead",
          campaignId: `benchmark_camp_${i % 100}`,
          eventType: ["sent", "opened", "clicked", "replied"][i % 4],
          email: `benchmark${i}@example.com`,
          activityId: `act_${i}`,
          timestamp: new Date(Date.now() + i * 1000),
        });
        keys.push(key);
      }

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      const stats = eventKeyGenerator.getStats();

      const result = {
        size,
        duration: endTime - startTime,
        keysPerSecond: size / ((endTime - startTime) / 1000),
        memoryUsed: endMemory - startMemory,
        avgMemoryPerKey: (endMemory - startMemory) / size,
        uniqueKeys: new Set(keys).size,
        uniquenessRate: ((new Set(keys).size / size) * 100).toFixed(2) + "%",
        collisionRate: stats.collision_rate,
        fallbackRate:
          ((stats.fallback_used / stats.total_generated) * 100).toFixed(2) +
          "%",
      };

      eventKeyResults.push(result);

      console.log(`     Duration: ${result.duration}ms`);
      console.log(`     Keys/sec: ${result.keysPerSecond.toFixed(0)}`);
      console.log(
        `     Memory: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`
      );
      console.log(`     Uniqueness: ${result.uniquenessRate}`);
      console.log(`     Collisions: ${result.collisionRate}`);
    }

    this.results.push({
      category: "Event Key Generation",
      results: eventKeyResults,
      summary: this.summarizeResults(eventKeyResults, "keysPerSecond"),
    });

    console.log("   ✅ Event Key Generation benchmarks complete\n");
  }

  async benchmarkConfigurationSystem() {
    console.log("⚙️  Benchmarking Configuration System Performance...");

    const configResults = [];
    const iterations = [1000, 5000, 10000];

    for (const count of iterations) {
      console.log(`   Testing ${count} configuration creations...`);

      const startTime = Date.now();

      // Create many configurations
      for (let i = 0; i < count; i++) {
        try {
          const config = new FullSyncConfig({
            platforms: [PLATFORMS.LEMLIST, PLATFORMS.SMARTLEAD],
            namespaces: [`namespace_${i % 10}`],
            syncMode:
              Object.values(SYNC_MODES)[i % Object.values(SYNC_MODES).length],
            batchSize: 50 + (i % 100),
            startDate: new Date(2024, 0, (i % 31) + 1)
              .toISOString()
              .split("T")[0],
          });
        } catch (error) {
          // Count validation errors
        }
      }

      const endTime = Date.now();

      const result = {
        iterations: count,
        duration: endTime - startTime,
        configsPerSecond: count / ((endTime - startTime) / 1000),
      };

      configResults.push(result);

      console.log(`     Duration: ${result.duration}ms`);
      console.log(`     Configs/sec: ${result.configsPerSecond.toFixed(0)}`);
    }

    this.results.push({
      category: "Configuration System",
      results: configResults,
      summary: this.summarizeResults(configResults, "configsPerSecond"),
    });

    console.log("   ✅ Configuration system benchmarks complete\n");
  }

  async benchmarkDatabaseOperations() {
    console.log("🗄️  Benchmarking Database Operations Performance...");

    // Mock database operations for performance testing
    const mockQuery = (sql, params) => {
      // Simulate database latency
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ rows: [], rowCount: 0 });
        }, Math.random() * 5); // 0-5ms random latency
      });
    };

    const dbOperationResults = [];
    const batchSizes = [10, 50, 100, 500];

    for (const batchSize of batchSizes) {
      console.log(`   Testing batch operations with size ${batchSize}...`);

      const startTime = Date.now();

      // Simulate bulk event insertions
      const events = Array.from({ length: batchSize }, (_, i) => ({
        event_key: `benchmark_key_${i}`,
        user_id: `user${i}@example.com`,
        event_type: "email_sent",
        platform: "lemlist",
        metadata: { benchmark: true },
        created_at: new Date(),
      }));

      // Simulate batch processing
      const batches = [];
      for (let i = 0; i < events.length; i += 10) {
        batches.push(events.slice(i, i + 10));
      }

      const batchPromises = batches.map((batch) =>
        mockQuery("INSERT INTO event_source VALUES ...", batch)
      );

      await Promise.all(batchPromises);

      const endTime = Date.now();

      const result = {
        batchSize,
        totalEvents: events.length,
        batchCount: batches.length,
        duration: endTime - startTime,
        eventsPerSecond: events.length / ((endTime - startTime) / 1000),
        avgBatchTime: (endTime - startTime) / batches.length,
      };

      dbOperationResults.push(result);

      console.log(`     Duration: ${result.duration}ms`);
      console.log(`     Events/sec: ${result.eventsPerSecond.toFixed(0)}`);
      console.log(`     Avg batch time: ${result.avgBatchTime.toFixed(2)}ms`);
    }

    this.results.push({
      category: "Database Operations",
      results: dbOperationResults,
      summary: this.summarizeResults(dbOperationResults, "eventsPerSecond"),
    });

    console.log("   ✅ Database operations benchmarks complete\n");
  }

  async benchmarkRateLimiting() {
    console.log("⏱️  Benchmarking Rate Limiting Performance...");

    const { createRateLimiter } = require("../../utils/bulkSyncRateLimiter");

    const rateLimitResults = [];
    const configurations = [
      { requestsPerSecond: 10, maxConcurrent: 2 },
      { requestsPerSecond: 50, maxConcurrent: 5 },
      { requestsPerSecond: 100, maxConcurrent: 10 },
    ];

    for (const config of configurations) {
      console.log(
        `   Testing rate limiter: ${config.requestsPerSecond} req/s, ${config.maxConcurrent} concurrent...`
      );

      const rateLimiter = createRateLimiter("benchmark", {
        requestsPerSecond: config.requestsPerSecond,
        maxConcurrentRequests: config.maxConcurrent,
      });

      const requests = 100;
      const startTime = Date.now();

      // Simulate rate-limited requests
      const promises = Array.from({ length: requests }, (_, i) =>
        rateLimiter.makeRateLimitedCall(async () => {
          // Simulate work
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 10)
          );
          return `result_${i}`;
        })
      );

      await Promise.all(promises);

      const endTime = Date.now();
      const stats = rateLimiter.getStats();

      const result = {
        config,
        requests,
        duration: endTime - startTime,
        actualRate: requests / ((endTime - startTime) / 1000),
        queueStats: {
          maxQueueSize: stats.queue.maxSize || 0,
          totalQueued: stats.queue.totalQueued || 0,
        },
        rateLimitEfficiency:
          (config.requestsPerSecond /
            (requests / ((endTime - startTime) / 1000))) *
          100,
      };

      rateLimitResults.push(result);

      console.log(`     Duration: ${result.duration}ms`);
      console.log(`     Actual rate: ${result.actualRate.toFixed(2)} req/s`);
      console.log(`     Efficiency: ${result.rateLimitEfficiency.toFixed(1)}%`);
    }

    this.results.push({
      category: "Rate Limiting",
      results: rateLimitResults,
    });

    console.log("   ✅ Rate limiting benchmarks complete\n");
  }

  async benchmarkMemoryUsage() {
    console.log("🧠 Benchmarking Memory Usage Patterns...");

    const memoryResults = [];
    const baseline = process.memoryUsage();

    console.log(
      `   Baseline memory: ${(baseline.heapUsed / 1024 / 1024).toFixed(2)}MB`
    );

    // Test 1: Event key cache growth
    console.log("   Testing event key cache memory usage...");

    const cacheStartMemory = process.memoryUsage().heapUsed;

    // Generate many event keys to fill cache
    for (let i = 0; i < 10000; i++) {
      eventKeyGenerator.generateEventKey({
        platform: "lemlist",
        campaignId: `memory_test_${i}`,
        eventType: "test",
        email: `test${i}@example.com`,
        activityId: `act_${i}`,
      });
    }

    const cacheEndMemory = process.memoryUsage().heapUsed;
    const cacheStats = eventKeyGenerator.getStats();

    memoryResults.push({
      test: "Event Key Cache",
      itemsGenerated: 10000,
      cacheSize: cacheStats.cache_size,
      memoryUsed: cacheEndMemory - cacheStartMemory,
      memoryPerItem: (cacheEndMemory - cacheStartMemory) / 10000,
    });

    console.log(`     Cache size: ${cacheStats.cache_size}`);
    console.log(
      `     Memory used: ${(
        (cacheEndMemory - cacheStartMemory) /
        1024 /
        1024
      ).toFixed(2)}MB`
    );

    // Test 2: Configuration objects memory usage
    console.log("   Testing configuration objects memory usage...");

    const configStartMemory = process.memoryUsage().heapUsed;
    const configs = [];

    for (let i = 0; i < 1000; i++) {
      configs.push(
        new FullSyncConfig({
          platforms: [PLATFORMS.LEMLIST],
          syncMode: SYNC_MODES.FULL_HISTORICAL,
          batchSize: 50,
        })
      );
    }

    const configEndMemory = process.memoryUsage().heapUsed;

    memoryResults.push({
      test: "Configuration Objects",
      itemsCreated: 1000,
      memoryUsed: configEndMemory - configStartMemory,
      memoryPerItem: (configEndMemory - configStartMemory) / 1000,
    });

    console.log(`     Configs created: 1000`);
    console.log(
      `     Memory used: ${(
        (configEndMemory - configStartMemory) /
        1024
      ).toFixed(2)}KB`
    );

    // Cleanup
    eventKeyGenerator.clearCache();
    configs.length = 0; // Clear array reference

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log("   Performed garbage collection");
    }

    const finalMemory = process.memoryUsage();
    console.log(
      `   Final memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`
    );

    this.results.push({
      category: "Memory Usage",
      results: memoryResults,
      baseline: baseline,
      final: finalMemory,
    });

    console.log("   ✅ Memory usage benchmarks complete\n");
  }

  async benchmarkConcurrentOperations() {
    console.log("🔄 Benchmarking Concurrent Operations Performance...");

    const concurrencyResults = [];
    const concurrencyLevels = [1, 5, 10, 20];

    for (const concurrency of concurrencyLevels) {
      console.log(`   Testing ${concurrency} concurrent operations...`);

      const startTime = Date.now();
      const promises = [];

      for (let i = 0; i < concurrency; i++) {
        promises.push(this.simulateAsyncOperation(i, 100)); // 100 operations each
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();

      const totalOperations = results.reduce((sum, r) => sum + r.operations, 0);
      const result = {
        concurrencyLevel: concurrency,
        totalOperations,
        duration: endTime - startTime,
        operationsPerSecond: totalOperations / ((endTime - startTime) / 1000),
        avgOperationTime: (endTime - startTime) / totalOperations,
      };

      concurrencyResults.push(result);

      console.log(`     Duration: ${result.duration}ms`);
      console.log(
        `     Operations/sec: ${result.operationsPerSecond.toFixed(0)}`
      );
      console.log(`     Avg op time: ${result.avgOperationTime.toFixed(2)}ms`);
    }

    this.results.push({
      category: "Concurrent Operations",
      results: concurrencyResults,
      summary: this.summarizeResults(concurrencyResults, "operationsPerSecond"),
    });

    console.log("   ✅ Concurrent operations benchmarks complete\n");
  }

  async simulateAsyncOperation(workerId, operationCount) {
    let completedOperations = 0;

    for (let i = 0; i < operationCount; i++) {
      // Simulate async work (event key generation)
      eventKeyGenerator.generateEventKey({
        platform: "lemlist",
        campaignId: `worker_${workerId}_camp_${i}`,
        eventType: "async_test",
        email: `worker${workerId}.op${i}@example.com`,
        activityId: `act_${workerId}_${i}`,
      });

      // Simulate small delay
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 2));

      completedOperations++;
    }

    return { workerId, operations: completedOperations };
  }

  summarizeResults(results, performanceMetric) {
    const values = results.map((r) => r[performanceMetric]);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
      total: values.reduce((sum, v) => sum + v, 0),
    };
  }

  generatePerformanceReport() {
    console.log("📋 Generating Performance Report...");
    console.log("=====================================\n");

    const report = {
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage(),
        cpus: require("os").cpus().length,
      },
      results: this.results,
    };

    // Console report
    this.results.forEach((category) => {
      console.log(`🎯 ${category.category}:`);

      if (category.summary) {
        console.log(`   Min: ${category.summary.min.toFixed(0)}`);
        console.log(`   Max: ${category.summary.max.toFixed(0)}`);
        console.log(`   Avg: ${category.summary.avg.toFixed(0)}`);
      }

      if (category.category === "Event Key Generation") {
        const bestResult = category.results.reduce((best, current) =>
          current.keysPerSecond > best.keysPerSecond ? current : best
        );
        console.log(
          `   Best Performance: ${bestResult.keysPerSecond.toFixed(
            0
          )} keys/sec (${bestResult.size} keys)`
        );
      }

      if (category.category === "Memory Usage") {
        const totalMemoryUsed = category.results.reduce(
          (sum, r) => sum + r.memoryUsed,
          0
        );
        console.log(
          `   Total Memory Used: ${(totalMemoryUsed / 1024 / 1024).toFixed(
            2
          )}MB`
        );
      }

      console.log("");
    });

    // Performance grade
    const overallGrade = this.calculateOverallGrade();
    console.log(
      `🏆 Overall Performance Grade: ${overallGrade.grade} (${overallGrade.score}/100)`
    );
    console.log(`📝 ${overallGrade.description}\n`);

    // Recommendations
    console.log("💡 Performance Recommendations:");
    overallGrade.recommendations.forEach((rec) => console.log(`   • ${rec}`));

    console.log("\n✨ Performance Benchmark Complete!");

    return report;
  }

  calculateOverallGrade() {
    let score = 100;
    const recommendations = [];

    // Event key generation performance
    const eventKeyResult = this.results.find(
      (r) => r.category === "Event Key Generation"
    );
    if (eventKeyResult && eventKeyResult.summary.avg < 1000) {
      score -= 10;
      recommendations.push(
        "Consider optimizing event key generation for higher throughput"
      );
    }

    // Memory usage efficiency
    const memoryResult = this.results.find(
      (r) => r.category === "Memory Usage"
    );
    if (memoryResult) {
      const totalMemory = memoryResult.results.reduce(
        (sum, r) => sum + r.memoryUsed,
        0
      );
      if (totalMemory > 100 * 1024 * 1024) {
        // 100MB
        score -= 5;
        recommendations.push("Monitor memory usage in production environments");
      }
    }

    // Concurrent operations
    const concurrentResult = this.results.find(
      (r) => r.category === "Concurrent Operations"
    );
    if (concurrentResult && concurrentResult.summary.avg < 500) {
      score -= 5;
      recommendations.push(
        "Optimize for better concurrent operation performance"
      );
    }

    let grade = "F";
    let description = "Needs significant improvement";

    if (score >= 95) {
      grade = "A+";
      description = "Excellent performance across all metrics";
    } else if (score >= 90) {
      grade = "A";
      description = "Very good performance with minor optimizations possible";
    } else if (score >= 85) {
      grade = "B+";
      description = "Good performance with some room for improvement";
    } else if (score >= 80) {
      grade = "B";
      description = "Acceptable performance but optimization recommended";
    } else if (score >= 70) {
      grade = "C";
      description = "Below expectations, optimization needed";
    } else {
      grade = "D";
      description = "Poor performance, significant optimization required";
    }

    if (recommendations.length === 0) {
      recommendations.push("Performance looks good! Monitor in production.");
    }

    return { score, grade, description, recommendations };
  }
}

// Run benchmarks if called directly
if (require.main === module) {
  const benchmark = new SyncPerformanceBenchmark();

  benchmark
    .runBenchmarkSuite()
    .then(() => {
      console.log("🎉 Benchmark suite completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Benchmark suite failed:", error.message);
      process.exit(1);
    });
}

module.exports = SyncPerformanceBenchmark;
