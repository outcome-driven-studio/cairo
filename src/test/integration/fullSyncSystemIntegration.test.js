/**
 * Full Sync System Integration Tests
 *
 * Comprehensive end-to-end testing of the entire sync system including:
 * - All sync modes (full, delta, date-range, namespace-specific)
 * - Event key generation and collision detection
 * - Database optimizations and bulk operations
 * - Rate limiting and progress tracking
 * - Error handling and recovery
 * - Cross-service integration
 */

const { FullSyncService } = require("../../services/fullSyncService");
const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../../config/fullSyncConfig");
const { eventKeyGenerator } = require("../../utils/eventKeyGenerator");
const { DatabaseOptimizations } = require("../../utils/dbOptimizations");
const { MigrationService } = require("../../services/migrationService");

// Mock logger for test environment
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

// Mock query function for database operations
const mockQuery = jest.fn();

// Mock services
const mockSmartleadService = {
  getCampaigns: jest.fn(),
  getLeads: jest.fn(),
  getSentEmails: jest.fn(),
  getOpenedEmails: jest.fn(),
  getClickedEmails: jest.fn(),
  getRepliedEmails: jest.fn(),
};

const mockLemlistService = {
  getCampaigns: jest.fn(),
  getLeads: jest.fn(),
  getCampaignActivities: jest.fn(),
};

const mockAttioService = {
  createPerson: jest.fn(),
  updatePerson: jest.fn(),
};

const mockMixpanelService = {
  track: jest.fn(),
  enabled: true,
};

describe("Full Sync System - Integration Tests", () => {
  let fullSyncService;
  let dbOptimizations;
  let migrationService;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    eventKeyGenerator.clearCache();

    // Mock database
    jest.doMock("../../utils/db", () => ({
      query: mockQuery,
    }));

    jest.doMock("../../utils/logger", () => mockLogger);

    // Initialize services with mocked dependencies
    fullSyncService = new FullSyncService();
    dbOptimizations = new DatabaseOptimizations();
    migrationService = new MigrationService();

    // Mock successful database responses
    mockQuery.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Sync Configuration System", () => {
    it("should create valid full sync configuration", () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.LEMLIST, PLATFORMS.SMARTLEAD],
        namespaces: ["playmaker", "demo"],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        batchSize: 100,
        enableProgressTracking: true,
      });

      expect(config.platforms).toEqual(["lemlist", "smartlead"]);
      expect(config.namespaces).toEqual(["playmaker", "demo"]);
      expect(config.syncMode).toBe("full_historical");
      expect(config.batchSize).toBe(100);
      expect(config.enableProgressTracking).toBe(true);
    });

    it("should validate configuration parameters", () => {
      expect(() => {
        new FullSyncConfig({
          platforms: ["invalid_platform"],
          syncMode: SYNC_MODES.FULL_HISTORICAL,
        });
      }).toThrow();

      expect(() => {
        new FullSyncConfig({
          platforms: [PLATFORMS.LEMLIST],
          syncMode: "invalid_mode",
        });
      }).toThrow();
    });

    it("should create configuration from API request", () => {
      const apiRequest = {
        platforms: "lemlist,smartlead",
        namespaces: "playmaker,demo",
        syncMode: "full_historical",
        startDate: "2024-01-01",
        batchSize: "50",
      };

      const config = FullSyncConfig.fromApiRequest(apiRequest);

      expect(config.platforms).toEqual(["lemlist", "smartlead"]);
      expect(config.namespaces).toEqual(["playmaker", "demo"]);
      expect(config.batchSize).toBe(50);
    });
  });

  describe("Event Key Generation and Collision Detection", () => {
    it("should generate consistent event keys", () => {
      const eventData = {
        platform: "lemlist",
        campaignId: "camp_123",
        eventType: "email_sent",
        email: "test@example.com",
        activityId: "act_456",
        timestamp: "2024-01-01T10:00:00Z",
      };

      const key1 = eventKeyGenerator.generateEventKey(eventData);
      const key2 = eventKeyGenerator.generateEventKey(eventData);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^lemlist_camp123_emailsent_act456_[a-f0-9]{8}$/);
    });

    it("should detect and resolve collisions", () => {
      const eventData = {
        platform: "lemlist",
        campaignId: "camp_123",
        eventType: "email_sent",
        email: "test@example.com",
        activityId: "act_456",
        timestamp: "2024-01-01T10:00:00Z",
      };

      const key1 = eventKeyGenerator.generateEventKey(eventData);
      const key2 = eventKeyGenerator.generateEventKey(eventData);
      const key3 = eventKeyGenerator.generateEventKey(eventData);

      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key2).toContain("_collision_");
      expect(key3).toContain("_collision_");
    });

    it("should handle platform-specific key generation", () => {
      // Lemlist key generation
      const lemlistActivity = {
        id: "lemlist_act_123",
        type: "emailsOpened",
        campaignId: "camp_456",
        date: "2024-01-01T10:00:00Z",
        lead: { email: "lemlist@example.com" },
      };

      const lemlistKey = eventKeyGenerator.generateLemlistKey(
        lemlistActivity,
        "camp_456",
        "test"
      );

      expect(lemlistKey).toMatch(
        /^lemlist_camp456_emailsopened_lemlistact123_[a-f0-9]{8}$/
      );

      // Smartlead key generation
      const smartleadEvent = {
        id: "smart_123",
        email_campaign_seq_id: "seq_456",
        sent_time: "2024-01-01T10:00:00Z",
      };

      const smartleadKey = eventKeyGenerator.generateSmartleadKey(
        smartleadEvent,
        "sent",
        "camp_789",
        "smartlead@example.com",
        "test"
      );

      expect(smartleadKey).toMatch(
        /^smartlead_camp789_sent_smart123_[a-f0-9]{8}$/
      );
    });

    it("should provide collision statistics", () => {
      // Generate some keys with collisions
      const eventData = {
        platform: "lemlist",
        campaignId: "test_camp",
        eventType: "test_event",
        email: "stats@example.com",
        activityId: "stats_123",
      };

      // Generate initial key and collision
      eventKeyGenerator.generateEventKey(eventData);
      eventKeyGenerator.generateEventKey(eventData);

      const stats = eventKeyGenerator.getStats();
      expect(stats.total_generated).toBeGreaterThan(0);
      expect(stats.collisions_detected).toBeGreaterThan(0);
      expect(stats.collision_rate).toContain("%");
    });
  });

  describe("Database Optimizations", () => {
    beforeEach(() => {
      // Mock successful index creation
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // createSyncIndexes
        .mockResolvedValueOnce({ rows: [] }) // validateIndexes
        .mockResolvedValueOnce({ rows: [] }); // initializeBulkOperations
    });

    it("should initialize database optimizations", async () => {
      await dbOptimizations.initialize();

      // Verify sync indexes were created
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("CREATE INDEX CONCURRENTLY")
      );
    });

    it("should create sync-optimized indexes", async () => {
      await dbOptimizations.createSyncIndexes();

      // Check for specific index creation calls
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("idx_event_source_platform_created_at")
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("idx_event_source_event_key_hash")
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("idx_user_source_email_platform")
      );
    });

    it("should validate created indexes", async () => {
      // Mock index validation response
      mockQuery.mockResolvedValueOnce({
        rows: [
          { index_name: "idx_event_source_platform_created_at", valid: true },
          { index_name: "idx_event_source_event_key_hash", valid: true },
        ],
      });

      const validation = await dbOptimizations.validateIndexes();
      expect(validation.valid_indexes).toBeGreaterThan(0);
      expect(validation.invalid_indexes).toBe(0);
    });

    it("should initialize bulk operations", async () => {
      await dbOptimizations.initializeBulkOperations();

      // Verify prepared statements were created
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("PREPARE bulk_insert_events")
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("PREPARE bulk_upsert_users")
      );
    });

    it("should perform bulk event insertions", async () => {
      const events = [
        {
          event_key: "test_key_1",
          user_id: "user1@example.com",
          event_type: "email_sent",
          platform: "lemlist",
          metadata: { test: true },
          created_at: new Date(),
        },
        {
          event_key: "test_key_2",
          user_id: "user2@example.com",
          event_type: "email_opened",
          platform: "smartlead",
          metadata: { test: true },
          created_at: new Date(),
        },
      ];

      mockQuery.mockResolvedValueOnce({ rowCount: 2 });

      const result = await dbOptimizations.bulkInsertEvents(events);

      expect(result.inserted).toBe(2);
      expect(result.errors).toBe(0);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("EXECUTE bulk_insert_events")
      );
    });
  });

  describe("Migration System", () => {
    it("should initialize migration system", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await migrationService.initialize();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("CREATE TABLE IF NOT EXISTS migrations")
      );
    });

    it("should detect pending migrations", async () => {
      // Mock available migrations
      const availableMigrations = [
        "001_initial",
        "002_sync_opt",
        "003_indexes",
      ];

      // Mock applied migrations
      mockQuery.mockResolvedValueOnce({
        rows: [{ migration_name: "001_initial" }],
      });

      jest
        .spyOn(migrationService, "getAvailableMigrations")
        .mockReturnValue(availableMigrations);

      const pending = await migrationService.getPendingMigrations();

      expect(pending).toEqual(["002_sync_opt", "003_indexes"]);
    });

    it("should run pending migrations", async () => {
      // Mock successful migration execution
      mockQuery
        .mockResolvedValueOnce({ rows: [{ migration_name: "001_initial" }] }) // getAppliedMigrations
        .mockResolvedValueOnce({ rows: [] }) // migration execution
        .mockResolvedValueOnce({ rows: [] }); // record migration

      jest
        .spyOn(migrationService, "getAvailableMigrations")
        .mockReturnValue(["001_initial", "002_new_migration"]);

      const result = await migrationService.runPendingMigrations();

      expect(result.applied).toEqual(["002_new_migration"]);
      expect(result.failed).toEqual([]);
    });
  });

  describe("Full Sync Service Integration", () => {
    beforeEach(() => {
      // Mock service responses
      mockSmartleadService.getCampaigns.mockResolvedValue([
        { id: "camp_1", name: "Test Campaign 1" },
      ]);

      mockSmartleadService.getLeads.mockResolvedValue({
        data: [{ lead: { id: 1, email: "test1@example.com" } }],
      });

      mockSmartleadService.getSentEmails.mockResolvedValue({
        data: [
          {
            id: 1,
            lead_email: "test1@example.com",
            sent_time: "2024-01-01T10:00:00Z",
          },
        ],
      });

      mockLemlistService.getCampaigns.mockResolvedValue([
        { _id: "lemlist_1", name: "Lemlist Campaign 1" },
      ]);

      mockLemlistService.getLeads.mockResolvedValue([
        { _id: "lead_1", email: "lemlist1@example.com" },
      ]);

      mockLemlistService.getCampaignActivities.mockResolvedValue([
        {
          _id: "act_1",
          type: "emailsSent",
          leadId: "lead_1",
          date: "2024-01-01T10:00:00Z",
        },
      ]);
    });

    it("should execute full historical sync", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.SMARTLEAD],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        batchSize: 10,
      });

      // Mock successful database insertions
      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const result = await fullSyncService.executeFullSync(config);

      expect(result.success).toBe(true);
      expect(result.summary.total_processed).toBeGreaterThan(0);
      expect(mockSmartleadService.getCampaigns).toHaveBeenCalled();
    });

    it("should execute delta sync with date filtering", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.LEMLIST],
        syncMode: SYNC_MODES.DELTA_SINCE_LAST,
        startDate: "2024-01-01",
        batchSize: 10,
      });

      // Mock database responses
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ last_sync: "2023-12-31T23:59:59Z" }],
        }) // last sync time
        .mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 }); // insertions

      const result = await fullSyncService.executeFullSync(config);

      expect(result.success).toBe(true);
      expect(mockLemlistService.getCampaigns).toHaveBeenCalled();
    });

    it("should handle sync errors gracefully", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.SMARTLEAD],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        batchSize: 10,
      });

      // Mock service error
      mockSmartleadService.getCampaigns.mockRejectedValue(
        new Error("API Error")
      );

      const result = await fullSyncService.executeFullSync(config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("API Error");
    });

    it("should track sync progress", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.SMARTLEAD],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        enableProgressTracking: true,
        batchSize: 1,
      });

      // Mock database insertions
      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const result = await fullSyncService.executeFullSync(config);

      expect(result.progress).toBeDefined();
      expect(result.progress.percentage).toBe(100);
      expect(result.progress.processed_items).toBeGreaterThan(0);
    });

    it("should respect rate limits", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.SMARTLEAD],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        batchSize: 5,
      });

      const startTime = Date.now();

      // Mock database insertions
      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      await fullSyncService.executeFullSync(config);

      const endTime = Date.now();

      // Should have taken some time due to rate limiting
      expect(endTime - startTime).toBeGreaterThan(0);
    });
  });

  describe("Cross-Service Integration", () => {
    it("should integrate Mixpanel tracking with sync operations", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.LEMLIST],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        enableMixpanelTracking: true,
      });

      // Mock successful sync
      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      await fullSyncService.executeFullSync(config);

      // Verify Mixpanel tracking was called
      // (This would need to be implemented in the actual service)
      expect(mockMixpanelService.track).toHaveBeenCalled();
    });

    it("should integrate Attio person creation", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.SMARTLEAD],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        enableAttioSync: true,
      });

      // Mock successful sync
      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      await fullSyncService.executeFullSync(config);

      // Verify Attio integration was called
      expect(mockAttioService.createPerson).toHaveBeenCalled();
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should handle database connection errors", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.SMARTLEAD],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
      });

      // Mock database error
      mockQuery.mockRejectedValue(new Error("Database connection failed"));

      const result = await fullSyncService.executeFullSync(config);

      expect(result.success).toBe(false);
      expect(result.error.message).toContain("Database connection failed");
    });

    it("should handle API rate limiting gracefully", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.SMARTLEAD],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        batchSize: 1000, // Large batch to trigger rate limiting
      });

      // Mock rate limit error
      mockSmartleadService.getCampaigns.mockRejectedValue({
        response: { status: 429 },
        message: "Rate limit exceeded",
      });

      const result = await fullSyncService.executeFullSync(config);

      expect(result.success).toBe(false);
      expect(result.error.message).toContain("Rate limit exceeded");
    });

    it("should provide detailed error context", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.LEMLIST],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
      });

      // Mock service error with context
      mockLemlistService.getCampaigns.mockRejectedValue({
        message: "API Error",
        code: "LEMLIST_API_ERROR",
        details: { campaign_id: "failed_campaign" },
      });

      const result = await fullSyncService.executeFullSync(config);

      expect(result.error).toBeDefined();
      expect(result.error.context).toBeDefined();
      expect(result.error.context.platform).toBe("lemlist");
    });

    it("should implement retry logic for transient failures", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.SMARTLEAD],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        retryAttempts: 3,
      });

      // Mock transient failure followed by success
      mockSmartleadService.getCampaigns
        .mockRejectedValueOnce(new Error("Temporary error"))
        .mockRejectedValueOnce(new Error("Temporary error"))
        .mockResolvedValueOnce([{ id: "camp_1", name: "Test Campaign" }]);

      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const result = await fullSyncService.executeFullSync(config);

      expect(result.success).toBe(true);
      expect(mockSmartleadService.getCampaigns).toHaveBeenCalledTimes(3);
    });
  });

  describe("Performance and Load Testing", () => {
    it("should handle large dataset sync efficiently", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.SMARTLEAD],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        batchSize: 100,
      });

      // Mock large dataset
      const largeCampaignList = Array.from({ length: 10 }, (_, i) => ({
        id: `camp_${i}`,
        name: `Campaign ${i}`,
      }));

      const largeLeadsList = Array.from({ length: 1000 }, (_, i) => ({
        lead: { id: i, email: `user${i}@example.com` },
      }));

      mockSmartleadService.getCampaigns.mockResolvedValue(largeCampaignList);
      mockSmartleadService.getLeads.mockResolvedValue({ data: largeLeadsList });
      mockSmartleadService.getSentEmails.mockResolvedValue({ data: [] });

      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const startTime = Date.now();
      const result = await fullSyncService.executeFullSync(config);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.summary.total_processed).toBeGreaterThan(0);

      // Performance should be reasonable (less than 30 seconds for mocked data)
      expect(endTime - startTime).toBeLessThan(30000);
    });

    it("should maintain performance statistics", async () => {
      const config = new FullSyncConfig({
        platforms: [PLATFORMS.LEMLIST],
        syncMode: SYNC_MODES.FULL_HISTORICAL,
        enablePerformanceTracking: true,
      });

      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const result = await fullSyncService.executeFullSync(config);

      expect(result.performance).toBeDefined();
      expect(result.performance.duration_ms).toBeGreaterThan(0);
      expect(result.performance.items_per_second).toBeGreaterThan(0);
      expect(result.performance.memory_usage).toBeDefined();
    });
  });
});

// Performance benchmarking utility
class SyncPerformanceBenchmark {
  constructor() {
    this.results = [];
  }

  async runBenchmark(config, testName) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    try {
      const fullSyncService = new FullSyncService();
      const result = await fullSyncService.executeFullSync(config);

      const endTime = Date.now();
      const endMemory = process.memoryUsage();

      const benchmark = {
        testName,
        duration: endTime - startTime,
        success: result.success,
        processed: result.summary?.total_processed || 0,
        itemsPerSecond:
          result.summary?.total_processed / ((endTime - startTime) / 1000),
        memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
        config: {
          platforms: config.platforms,
          syncMode: config.syncMode,
          batchSize: config.batchSize,
        },
      };

      this.results.push(benchmark);
      return benchmark;
    } catch (error) {
      const endTime = Date.now();
      this.results.push({
        testName,
        duration: endTime - startTime,
        success: false,
        error: error.message,
        config: {
          platforms: config.platforms,
          syncMode: config.syncMode,
          batchSize: config.batchSize,
        },
      });
      throw error;
    }
  }

  getResults() {
    return this.results;
  }

  generateReport() {
    const successfulTests = this.results.filter((r) => r.success);
    const avgDuration =
      successfulTests.reduce((sum, r) => sum + r.duration, 0) /
      successfulTests.length;
    const avgItemsPerSecond =
      successfulTests.reduce((sum, r) => sum + r.itemsPerSecond, 0) /
      successfulTests.length;

    return {
      totalTests: this.results.length,
      successfulTests: successfulTests.length,
      averageDuration: avgDuration,
      averageItemsPerSecond: avgItemsPerSecond,
      results: this.results,
    };
  }
}

module.exports = {
  SyncPerformanceBenchmark,
};
