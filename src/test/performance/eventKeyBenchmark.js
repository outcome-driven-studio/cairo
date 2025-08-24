/**
 * Event Key Generator Performance Benchmark
 *
 * Focused performance testing for the event key generation system.
 * This test runs independently without database dependencies.
 */

const { eventKeyGenerator } = require("../../utils/eventKeyGenerator");

console.log("🔑 Event Key Generator Performance Benchmark");
console.log("=============================================\n");

class EventKeyBenchmark {
  constructor() {
    this.results = [];
  }

  async runBenchmarks() {
    console.log("🚀 Starting Event Key Benchmarks...\n");

    // Benchmark 1: Basic Generation Performance
    await this.benchmarkBasicGeneration();

    // Benchmark 2: Collision Handling Performance
    await this.benchmarkCollisionHandling();

    // Benchmark 3: Memory Usage Analysis
    await this.benchmarkMemoryUsage();

    // Benchmark 4: Concurrent Generation
    await this.benchmarkConcurrentGeneration();

    // Generate report
    this.generateReport();
  }

  async benchmarkBasicGeneration() {
    console.log("⚡ Benchmark 1: Basic Generation Performance");
    console.log("============================================");

    const testSizes = [1000, 5000, 10000, 25000];

    for (const size of testSizes) {
      console.log(`   Testing ${size.toLocaleString()} key generations...`);

      eventKeyGenerator.clearCache();

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < size; i++) {
        eventKeyGenerator.generateEventKey({
          platform: i % 2 === 0 ? "lemlist" : "smartlead",
          campaignId: `perf_camp_${i % 100}`,
          eventType: ["sent", "opened", "clicked", "replied"][i % 4],
          email: `perf${i}@example.com`,
          activityId: `perf_act_${i}`,
          timestamp: new Date(Date.now() + i * 1000),
        });
      }

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      const stats = eventKeyGenerator.getStats();

      const result = {
        test: "Basic Generation",
        size,
        duration: endTime - startTime,
        keysPerSecond: size / ((endTime - startTime) / 1000),
        memoryUsed: endMemory - startMemory,
        avgMemoryPerKey: (endMemory - startMemory) / size,
        collisionRate: stats.collision_rate,
        cacheSize: stats.cache_size,
      };

      this.results.push(result);

      console.log(`     Duration: ${result.duration}ms`);
      console.log(`     Keys/sec: ${result.keysPerSecond.toLocaleString()}`);
      console.log(
        `     Memory: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`
      );
      console.log(`     Collision Rate: ${result.collisionRate}`);
      console.log("");
    }

    console.log("   ✅ Basic generation benchmark complete\n");
  }

  async benchmarkCollisionHandling() {
    console.log("💥 Benchmark 2: Collision Handling Performance");
    console.log("===============================================");

    const collisionTests = [
      { name: "Low Collision Rate", duplicates: 0.1 },
      { name: "Medium Collision Rate", duplicates: 0.3 },
      { name: "High Collision Rate", duplicates: 0.5 },
    ];

    for (const test of collisionTests) {
      console.log(
        `   Testing ${test.name} (${test.duplicates * 100}% duplicates)...`
      );

      eventKeyGenerator.clearCache();

      const totalKeys = 5000;
      const uniqueKeys = Math.floor(totalKeys * (1 - test.duplicates));

      const startTime = Date.now();
      let collisionsDetected = 0;

      for (let i = 0; i < totalKeys; i++) {
        const keyIndex = i < uniqueKeys ? i : i % uniqueKeys;

        const key = eventKeyGenerator.generateEventKey({
          platform: "lemlist",
          campaignId: `collision_test_${keyIndex}`,
          eventType: "test",
          email: `collision${keyIndex}@example.com`,
          activityId: `coll_${keyIndex}`,
          timestamp: new Date(2024, 0, 1),
        });

        if (key.includes("collision")) {
          collisionsDetected++;
        }
      }

      const endTime = Date.now();
      const stats = eventKeyGenerator.getStats();

      const result = {
        test: "Collision Handling",
        scenario: test.name,
        totalKeys,
        uniqueKeys,
        expectedCollisions: totalKeys - uniqueKeys,
        detectedCollisions: collisionsDetected,
        duration: endTime - startTime,
        keysPerSecond: totalKeys / ((endTime - startTime) / 1000),
        collisionRate: stats.collision_rate,
      };

      this.results.push(result);

      console.log(`     Duration: ${result.duration}ms`);
      console.log(`     Keys/sec: ${result.keysPerSecond.toFixed(0)}`);
      console.log(`     Expected Collisions: ${result.expectedCollisions}`);
      console.log(`     Detected Collisions: ${result.detectedCollisions}`);
      console.log("");
    }

    console.log("   ✅ Collision handling benchmark complete\n");
  }

  async benchmarkMemoryUsage() {
    console.log("🧠 Benchmark 3: Memory Usage Analysis");
    console.log("======================================");

    const phases = [
      { name: "Small Cache", keys: 1000 },
      { name: "Medium Cache", keys: 5000 },
      { name: "Large Cache", keys: 10000 },
      { name: "Extra Large Cache", keys: 20000 },
    ];

    for (const phase of phases) {
      console.log(
        `   Testing ${phase.name} (${phase.keys.toLocaleString()} keys)...`
      );

      eventKeyGenerator.clearCache();
      const baselineMemory = process.memoryUsage().heapUsed;

      // Generate keys to fill cache
      for (let i = 0; i < phase.keys; i++) {
        eventKeyGenerator.generateEventKey({
          platform: "lemlist",
          campaignId: `memory_${i}`,
          eventType: "memory_test",
          email: `memory${i}@example.com`,
          activityId: `mem_${i}`,
        });
      }

      const afterMemory = process.memoryUsage().heapUsed;
      const stats = eventKeyGenerator.getStats();

      const result = {
        test: "Memory Usage",
        phase: phase.name,
        keys: phase.keys,
        cacheSize: stats.cache_size,
        memoryUsed: afterMemory - baselineMemory,
        memoryPerKey: (afterMemory - baselineMemory) / phase.keys,
        memoryEfficiency: (phase.keys / (afterMemory - baselineMemory)) * 1024, // keys per KB
      };

      this.results.push(result);

      console.log(`     Cache Size: ${result.cacheSize.toLocaleString()}`);
      console.log(
        `     Memory Used: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`
      );
      console.log(`     Memory/Key: ${result.memoryPerKey.toFixed(0)} bytes`);
      console.log(
        `     Efficiency: ${result.memoryEfficiency.toFixed(2)} keys/KB`
      );
      console.log("");
    }

    console.log("   ✅ Memory usage benchmark complete\n");
  }

  async benchmarkConcurrentGeneration() {
    console.log("🔄 Benchmark 4: Concurrent Generation Performance");
    console.log("==================================================");

    const concurrencyLevels = [1, 5, 10, 20];

    for (const concurrency of concurrencyLevels) {
      console.log(`   Testing ${concurrency} concurrent workers...`);

      eventKeyGenerator.clearCache();

      const keysPerWorker = 1000;
      const startTime = Date.now();

      const workers = Array.from({ length: concurrency }, (_, workerId) =>
        this.generateKeysWorker(workerId, keysPerWorker)
      );

      const results = await Promise.all(workers);
      const endTime = Date.now();

      const totalKeys = results.reduce((sum, r) => sum + r.generated, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
      const stats = eventKeyGenerator.getStats();

      const result = {
        test: "Concurrent Generation",
        concurrency,
        keysPerWorker,
        totalKeys,
        totalErrors,
        duration: endTime - startTime,
        keysPerSecond: totalKeys / ((endTime - startTime) / 1000),
        errorRate: ((totalErrors / totalKeys) * 100).toFixed(2) + "%",
        collisionRate: stats.collision_rate,
      };

      this.results.push(result);

      console.log(`     Duration: ${result.duration}ms`);
      console.log(`     Total Keys: ${result.totalKeys.toLocaleString()}`);
      console.log(`     Keys/sec: ${result.keysPerSecond.toFixed(0)}`);
      console.log(`     Error Rate: ${result.errorRate}`);
      console.log(`     Collision Rate: ${result.collisionRate}`);
      console.log("");
    }

    console.log("   ✅ Concurrent generation benchmark complete\n");
  }

  async generateKeysWorker(workerId, keyCount) {
    let generated = 0;
    let errors = 0;

    for (let i = 0; i < keyCount; i++) {
      try {
        const key = eventKeyGenerator.generateEventKey({
          platform: "smartlead",
          campaignId: `worker_${workerId}_campaign`,
          eventType: "concurrent_test",
          email: `worker${workerId}.key${i}@example.com`,
          activityId: `w${workerId}_k${i}`,
        });

        if (key) generated++;
        else errors++;
      } catch (error) {
        errors++;
      }

      // Small random delay to simulate real-world conditions
      if (i % 100 === 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.random()));
      }
    }

    return { workerId, generated, errors };
  }

  generateReport() {
    console.log("📊 Performance Benchmark Report");
    console.log("=================================\n");

    // Overall statistics
    const basicResults = this.results.filter(
      (r) => r.test === "Basic Generation"
    );
    const maxKeysPerSecond = Math.max(
      ...basicResults.map((r) => r.keysPerSecond)
    );
    const totalKeysGenerated = basicResults.reduce((sum, r) => sum + r.size, 0);

    console.log("🎯 Key Performance Metrics:");
    console.log(
      `   Peak Performance: ${maxKeysPerSecond.toLocaleString()} keys/sec`
    );
    console.log(
      `   Total Keys Generated: ${totalKeysGenerated.toLocaleString()}`
    );

    // Memory efficiency
    const memoryResults = this.results.filter((r) => r.test === "Memory Usage");
    if (memoryResults.length > 0) {
      const avgMemoryPerKey =
        memoryResults.reduce((sum, r) => sum + r.memoryPerKey, 0) /
        memoryResults.length;
      const maxEfficiency = Math.max(
        ...memoryResults.map((r) => r.memoryEfficiency)
      );

      console.log(`   Avg Memory per Key: ${avgMemoryPerKey.toFixed(0)} bytes`);
      console.log(`   Max Efficiency: ${maxEfficiency.toFixed(2)} keys/KB`);
    }

    // Collision handling
    const collisionResults = this.results.filter(
      (r) => r.test === "Collision Handling"
    );
    if (collisionResults.length > 0) {
      const avgCollisionAccuracy =
        collisionResults.reduce((sum, r) => {
          const accuracy = r.detectedCollisions / r.expectedCollisions;
          return sum + (isNaN(accuracy) ? 1 : accuracy);
        }, 0) / collisionResults.length;

      console.log(
        `   Collision Detection Accuracy: ${(
          avgCollisionAccuracy * 100
        ).toFixed(1)}%`
      );
    }

    // Concurrent performance
    const concurrentResults = this.results.filter(
      (r) => r.test === "Concurrent Generation"
    );
    if (concurrentResults.length > 0) {
      const bestConcurrentPerformance = Math.max(
        ...concurrentResults.map((r) => r.keysPerSecond)
      );
      const avgErrorRate =
        concurrentResults.reduce((sum, r) => sum + parseFloat(r.errorRate), 0) /
        concurrentResults.length;

      console.log(
        `   Best Concurrent Performance: ${bestConcurrentPerformance.toFixed(
          0
        )} keys/sec`
      );
      console.log(`   Avg Concurrent Error Rate: ${avgErrorRate.toFixed(2)}%`);
    }

    // Performance grade
    const grade = this.calculatePerformanceGrade();
    console.log(`\n🏆 Performance Grade: ${grade.grade} (${grade.score}/100)`);
    console.log(`📝 ${grade.description}`);

    if (grade.recommendations.length > 0) {
      console.log("\n💡 Recommendations:");
      grade.recommendations.forEach((rec) => console.log(`   • ${rec}`));
    }

    console.log("\n✨ Event Key Performance Benchmark Complete!");

    return {
      summary: {
        peakPerformance: maxKeysPerSecond,
        totalKeysGenerated,
        performanceGrade: grade,
      },
      results: this.results,
    };
  }

  calculatePerformanceGrade() {
    let score = 100;
    const recommendations = [];

    // Check basic generation performance
    const basicResults = this.results.filter(
      (r) => r.test === "Basic Generation"
    );
    const avgKeysPerSecond =
      basicResults.reduce((sum, r) => sum + r.keysPerSecond, 0) /
      basicResults.length;

    if (avgKeysPerSecond < 5000) {
      score -= 15;
      recommendations.push(
        "Optimize basic key generation for higher throughput"
      );
    } else if (avgKeysPerSecond < 10000) {
      score -= 5;
    }

    // Check memory efficiency
    const memoryResults = this.results.filter((r) => r.test === "Memory Usage");
    if (memoryResults.length > 0) {
      const avgMemoryPerKey =
        memoryResults.reduce((sum, r) => sum + r.memoryPerKey, 0) /
        memoryResults.length;

      if (avgMemoryPerKey > 1000) {
        // More than 1KB per key
        score -= 10;
        recommendations.push("Improve memory efficiency");
      } else if (avgMemoryPerKey > 500) {
        score -= 5;
      }
    }

    // Check collision handling
    const collisionResults = this.results.filter(
      (r) => r.test === "Collision Handling"
    );
    if (collisionResults.length > 0) {
      const avgAccuracy =
        collisionResults.reduce((sum, r) => {
          const accuracy = r.detectedCollisions / r.expectedCollisions;
          return sum + (isNaN(accuracy) ? 1 : accuracy);
        }, 0) / collisionResults.length;

      if (avgAccuracy < 0.9) {
        score -= 10;
        recommendations.push("Improve collision detection accuracy");
      }
    }

    // Check concurrent performance
    const concurrentResults = this.results.filter(
      (r) => r.test === "Concurrent Generation"
    );
    if (concurrentResults.length > 0) {
      const maxConcurrentPerf = Math.max(
        ...concurrentResults.map((r) => r.keysPerSecond)
      );

      if (maxConcurrentPerf < avgKeysPerSecond * 0.8) {
        score -= 5;
        recommendations.push("Optimize for better concurrent performance");
      }
    }

    let grade, description;

    if (score >= 95) {
      grade = "A+";
      description = "Exceptional performance across all metrics";
    } else if (score >= 90) {
      grade = "A";
      description =
        "Excellent performance with minor optimization opportunities";
    } else if (score >= 85) {
      grade = "B+";
      description = "Very good performance with some room for improvement";
    } else if (score >= 80) {
      grade = "B";
      description = "Good performance but optimization recommended";
    } else if (score >= 70) {
      grade = "C";
      description =
        "Acceptable performance but significant optimization needed";
    } else {
      grade = "D";
      description = "Poor performance, major optimization required";
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "Performance looks excellent! Monitor in production."
      );
    }

    return { score, grade, description, recommendations };
  }
}

// Run benchmark if called directly
if (require.main === module) {
  const benchmark = new EventKeyBenchmark();

  benchmark
    .runBenchmarks()
    .then(() => {
      console.log("🎉 Benchmark completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Benchmark failed:", error.message);
      process.exit(1);
    });
}

module.exports = EventKeyBenchmark;
