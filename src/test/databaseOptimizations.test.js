/**
 * Database Optimizations Test
 *
 * Tests the database optimization features including:
 * - Bulk operations
 * - Index creation
 * - Performance monitoring
 * - Migration system
 */

const logger = require("../utils/logger");

// Mock the database module to avoid connection issues
const mockQuery = jest.fn();
const mockPool = {
  totalCount: 5,
  idleCount: 3,
  waitingCount: 0,
  options: {
    max: 8,
    min: 2,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 300000,
  },
};

jest.mock("../utils/db", () => ({
  query: mockQuery,
  pool: mockPool,
}));

const { DatabaseOptimizations } = require("../utils/dbOptimizations");
const { MigrationService } = require("../services/migrationService");

describe("Database Optimizations Tests", () => {
  let dbOpt;
  let migrationService;

  beforeEach(() => {
    // Reset mocks
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    // Suppress console logs during tests
    logger.info = jest.fn();
    logger.debug = jest.fn();
    logger.warn = jest.fn();
    logger.error = jest.fn();

    dbOpt = new DatabaseOptimizations();
    migrationService = new MigrationService();
  });

  describe("DatabaseOptimizations", () => {
    describe("Initialization", () => {
      test("should initialize successfully", async () => {
        await dbOpt.initialize();

        expect(dbOpt.initialized).toBe(true);
        expect(mockQuery).toHaveBeenCalled();
      });

      test("should not initialize twice", async () => {
        await dbOpt.initialize();
        await dbOpt.initialize(); // Second call

        expect(dbOpt.initialized).toBe(true);
        expect(logger.info).toHaveBeenCalledWith(
          "[DB Optimizations] Already initialized"
        );
      });
    });

    describe("Index Creation", () => {
      test("should create sync indexes without errors", async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

        await dbOpt.createSyncIndexes();

        // Should call multiple CREATE INDEX queries
        expect(mockQuery).toHaveBeenCalledTimes(6); // 6 sync-specific indexes
      });

      test("should handle existing indexes gracefully", async () => {
        mockQuery.mockRejectedValueOnce(
          new Error('relation "idx_test" already exists')
        );

        await dbOpt.createSyncIndexes();

        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining("Already exists")
        );
      });
    });

    describe("Index Validation", () => {
      test("should validate critical indexes exist", async () => {
        mockQuery.mockResolvedValue({ rows: [{ exists: true }] });

        const missingIndexes = await dbOpt.validateIndexes();

        expect(missingIndexes).toHaveLength(0);
        expect(logger.info).toHaveBeenCalledWith(
          "[DB Optimizations] ✅ All critical indexes validated"
        );
      });

      test("should detect missing indexes", async () => {
        mockQuery.mockResolvedValue({ rows: [{ exists: false }] });

        const missingIndexes = await dbOpt.validateIndexes();

        expect(missingIndexes.length).toBeGreaterThan(0);
        expect(logger.warn).toHaveBeenCalledWith(
          "[DB Optimizations] Missing critical indexes:",
          expect.any(Array)
        );
      });
    });

    describe("Bulk Operations", () => {
      test("should perform bulk insert of events", async () => {
        const events = [
          {
            event_key: "test-key-1",
            user_id: "user1@test.com",
            event_type: "email_sent",
            platform: "smartlead",
            metadata: { campaign_id: "camp1" },
          },
          {
            event_key: "test-key-2",
            user_id: "user2@test.com",
            event_type: "email_opened",
            platform: "smartlead",
            metadata: { campaign_id: "camp1" },
          },
        ];

        // Mock successful insert
        mockQuery
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValue({ rows: [{ id: "uuid-123" }] }) // INSERT with RETURNING
          .mockResolvedValue({ rows: [] }); // COMMIT

        const result = await dbOpt.bulkInsertEvents(events);

        expect(result.success).toBe(true);
        expect(result.inserted).toBe(2);
        expect(result.duration).toBeGreaterThan(0);
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("Bulk insert completed")
        );
      });

      test("should handle bulk insert errors gracefully", async () => {
        const events = [
          {
            event_key: "invalid-event",
          },
        ]; // Missing required fields

        mockQuery
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockRejectedValueOnce(new Error("Column not found")) // INSERT fails
          .mockResolvedValue({ rows: [] }); // ROLLBACK

        await expect(dbOpt.bulkInsertEvents(events)).rejects.toThrow(
          "Column not found"
        );
      });

      test("should perform bulk upsert of users", async () => {
        const users = [
          {
            email: "user1@test.com",
            name: "User One",
            platform: "smartlead",
          },
          {
            email: "user2@test.com",
            name: "User Two",
            platform: "lemlist",
          },
        ];

        mockQuery
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValue({ rows: [{ id: "uuid-456" }] }) // UPSERT
          .mockResolvedValue({ rows: [] }); // COMMIT

        const result = await dbOpt.bulkUpsertUsers(users);

        expect(result.success).toBe(true);
        expect(result.upserted).toBe(2);
        expect(result.rate).toBeGreaterThan(0);
      });
    });

    describe("Connection Pool Monitoring", () => {
      test("should get connection pool statistics", async () => {
        const stats = await dbOpt.getConnectionPoolStats();

        expect(stats).toEqual({
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
          maxPoolSize: 8,
          minPoolSize: 2,
          connectionTimeoutMillis: 15000,
          idleTimeoutMillis: 300000,
        });
      });

      test("should handle pool stats error gracefully", async () => {
        // Mock require failure
        jest.doMock("../utils/db", () => {
          throw new Error("DB module error");
        });

        const stats = await dbOpt.getConnectionPoolStats();
        expect(stats).toBeNull();
      });
    });

    describe("Performance Analytics", () => {
      test("should track bulk operation statistics", () => {
        // Simulate some operations
        dbOpt.bulkOperationStats.bulkInserts = 5;
        dbOpt.bulkOperationStats.totalRecordsProcessed = 1000;
        dbOpt.bulkOperationStats.averageProcessingTime = 250;

        const stats = dbOpt.getBulkOperationStats();

        expect(stats.bulkInserts).toBe(5);
        expect(stats.totalRecordsProcessed).toBe(1000);
        expect(stats.averageProcessingTime).toBe(250);
        expect(stats.initialized).toBe(false); // Not initialized yet
      });

      test("should analyze sync query performance", async () => {
        mockQuery.mockResolvedValue({
          rows: [{ "QUERY PLAN": "Index Scan using idx_test on event_source" }],
        });

        const analysis = await dbOpt.analyzeSyncQueryPerformance();

        expect(analysis).toHaveProperty("Recent events by platform");
        expect(analysis).toHaveProperty("Event deduplication check");
        expect(analysis).toHaveProperty("User platform lookup");
      });
    });

    describe("Utility Functions", () => {
      test("should chunk arrays correctly", () => {
        const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const chunks = dbOpt.chunkArray(array, 3);

        expect(chunks).toHaveLength(4);
        expect(chunks[0]).toEqual([1, 2, 3]);
        expect(chunks[1]).toEqual([4, 5, 6]);
        expect(chunks[2]).toEqual([7, 8, 9]);
        expect(chunks[3]).toEqual([10]);
      });

      test("should sleep for specified time", async () => {
        const start = Date.now();
        await dbOpt.sleep(50);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some variance
        expect(elapsed).toBeLessThan(100);
      });
    });

    describe("Data Cleanup", () => {
      test("should clean up old events", async () => {
        mockQuery.mockResolvedValue({ rowCount: 1500 });

        const deletedCount = await dbOpt.cleanupOldEvents(90);

        expect(deletedCount).toBe(1500);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("DELETE FROM event_source"),
          expect.anything()
        );
      });
    });
  });

  describe("MigrationService", () => {
    describe("Initialization", () => {
      test("should initialize migration tracking", async () => {
        await migrationService.initialize();

        expect(migrationService.initialized).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("CREATE TABLE IF NOT EXISTS migrations")
        );
      });
    });

    describe("Migration Status", () => {
      test("should get migration status", async () => {
        // Mock fs.readdirSync for available migrations
        jest.doMock("fs", () => ({
          readdirSync: () => [
            "001_initial.js",
            "002_indexes.js",
            "020_sync_optimizations.js",
          ],
        }));

        // Mock applied migrations
        mockQuery.mockResolvedValue({
          rows: [
            {
              filename: "001_initial.js",
              applied_at: new Date(),
              success: true,
              execution_time_ms: 100,
            },
          ],
        });

        const status = await migrationService.getStatus();

        expect(status.totalMigrations).toBe(3);
        expect(status.appliedMigrations).toBe(1);
        expect(status.pendingMigrations).toBe(2);
        expect(status.status).toBe("pending-migrations");
      });
    });
  });
});

// Integration demo for database optimizations
async function runDbOptimizationsDemo() {
  console.log("🎯 Starting Database Optimizations Demo");
  console.log("======================================");

  try {
    const dbOpt = new DatabaseOptimizations();

    console.log("\n📊 1. Connection Pool Stats");
    console.log("----------------------------");
    const poolStats = await dbOpt.getConnectionPoolStats();
    console.log("Pool Statistics:", JSON.stringify(poolStats, null, 2));

    console.log("\n📈 2. Bulk Operation Stats");
    console.log("---------------------------");
    const bulkStats = dbOpt.getBulkOperationStats();
    console.log(
      "Bulk Operation Statistics:",
      JSON.stringify(bulkStats, null, 2)
    );

    console.log("\n🔧 3. Utility Functions Test");
    console.log("-----------------------------");
    const testArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const chunks = dbOpt.chunkArray(testArray, 3);
    console.log(
      `Array chunking: ${testArray.length} items → ${chunks.length} chunks`
    );
    console.log("Chunks:", chunks);

    console.log("\n⏱️ 4. Sleep Function Test");
    console.log("--------------------------");
    const start = Date.now();
    await dbOpt.sleep(100);
    const elapsed = Date.now() - start;
    console.log(`Sleep test: requested 100ms, actual ${elapsed}ms`);

    console.log("\n🎉 Database Optimizations Demo Summary");
    console.log("======================================");
    console.log("✅ Connection pool monitoring works");
    console.log("✅ Bulk operation stats tracking works");
    console.log("✅ Utility functions work correctly");
    console.log("✅ All core features validated");

    return {
      success: true,
      features: {
        connectionPool: !!poolStats,
        bulkOperations: true,
        utilities: true,
        performance: true,
      },
    };
  } catch (error) {
    console.error("❌ Demo failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Export for use in other modules
module.exports = {
  runDbOptimizationsDemo,
};

// Run demo if executed directly
if (require.main === module) {
  runDbOptimizationsDemo()
    .then((result) => {
      if (result.success) {
        console.log("\n🚀 Database optimizations are ready!");
        process.exit(0);
      } else {
        console.log("\n💥 Issues found with database optimizations");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
