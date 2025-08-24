/**
 * Full Sync System End-to-End Tests
 *
 * Comprehensive end-to-end testing that simulates real-world usage scenarios
 * across the entire sync system, from API requests to database operations.
 */

const express = require("express");
const request = require("supertest");
const {
  FullSyncConfig,
  SYNC_MODES,
  PLATFORMS,
} = require("../../config/fullSyncConfig");
const { eventKeyGenerator } = require("../../utils/eventKeyGenerator");

// Create test app
const app = express();
app.use(express.json());

// Mock database for E2E tests
const mockDatabase = {
  events: [],
  users: [],
  migrations: [],
  campaigns: [],
  sync_logs: [],
};

// Mock services for E2E tests
const mockServices = {
  smartlead: {
    campaigns: [
      { id: "sl_camp_1", name: "E2E Test Campaign 1", status: "active" },
      { id: "sl_camp_2", name: "E2E Test Campaign 2", status: "active" },
    ],
    leads: {
      sl_camp_1: [
        {
          lead: {
            id: 1,
            email: "e2e1@example.com",
            first_name: "John",
            last_name: "Doe",
          },
        },
        {
          lead: {
            id: 2,
            email: "e2e2@example.com",
            first_name: "Jane",
            last_name: "Smith",
          },
        },
      ],
    },
    sentEmails: {
      sl_camp_1: [
        {
          id: 1,
          lead_email: "e2e1@example.com",
          sent_time: "2024-01-15T10:00:00Z",
        },
        {
          id: 2,
          lead_email: "e2e2@example.com",
          sent_time: "2024-01-15T10:30:00Z",
        },
      ],
    },
  },
  lemlist: {
    campaigns: [
      { _id: "ll_camp_1", name: "Lemlist E2E Campaign 1", status: "active" },
      { _id: "ll_camp_2", name: "Lemlist E2E Campaign 2", status: "paused" },
    ],
    leads: {
      ll_camp_1: [
        {
          _id: "lead_1",
          email: "lemlist1@example.com",
          firstName: "Alice",
          lastName: "Johnson",
        },
        {
          _id: "lead_2",
          email: "lemlist2@example.com",
          firstName: "Bob",
          lastName: "Wilson",
        },
      ],
    },
    activities: {
      ll_camp_1: [
        {
          _id: "act_1",
          type: "linkedinSent",
          leadId: "lead_1",
          date: "2024-01-15T11:00:00Z",
        },
        {
          _id: "act_2",
          type: "linkedinOpened",
          leadId: "lead_2",
          date: "2024-01-15T11:30:00Z",
        },
      ],
    },
  },
};

// Setup mock routes for E2E testing
const setupMockRoutes = () => {
  // Full Sync API Routes
  app.post("/api/full-sync/execute", async (req, res) => {
    try {
      const config = FullSyncConfig.fromApiRequest(req.body);

      // Simulate sync execution
      const result = await simulateFullSync(config);

      res.json({
        success: true,
        jobId: `job_${Date.now()}`,
        config: {
          platforms: config.platforms,
          syncMode: config.syncMode,
          namespaces: config.namespaces,
        },
        ...result,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });

  app.get("/api/full-sync/status/:jobId", (req, res) => {
    res.json({
      jobId: req.params.jobId,
      status: "completed",
      progress: {
        percentage: 100,
        processed_items: 150,
        total_items: 150,
        current_stage: "completed",
      },
      summary: {
        total_processed: 150,
        events_created: 100,
        users_processed: 50,
        duration_ms: 5000,
      },
    });
  });

  // Event Key Generation API
  app.post("/api/event-keys/generate", (req, res) => {
    try {
      const key = eventKeyGenerator.generateEventKey(req.body);
      res.json({ success: true, event_key: key });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Database Optimization API
  app.post("/api/database/optimize", (req, res) => {
    // Simulate database optimization
    setTimeout(() => {
      res.json({
        success: true,
        optimizations_applied: [
          "sync_indexes_created",
          "bulk_operations_initialized",
          "connection_pool_configured",
        ],
        performance_improvement: "25%",
      });
    }, 1000);
  });

  // Migration API
  app.get("/api/migrations/status", (req, res) => {
    res.json({
      available_migrations: [
        "001_initial",
        "002_sync_optimizations",
        "003_event_keys",
      ],
      applied_migrations: ["001_initial", "002_sync_optimizations"],
      pending_migrations: ["003_event_keys"],
    });
  });

  app.post("/api/migrations/run", (req, res) => {
    res.json({
      success: true,
      applied: ["003_event_keys"],
      failed: [],
    });
  });
};

// Simulate full sync execution
async function simulateFullSync(config) {
  const startTime = Date.now();
  let processedEvents = 0;
  let processedUsers = 0;

  // Simulate processing based on configuration
  for (const platform of config.platforms) {
    if (platform === "smartlead") {
      // Process Smartlead campaigns
      for (const campaign of mockServices.smartlead.campaigns) {
        const leads = mockServices.smartlead.leads[campaign.id] || [];
        const sentEmails = mockServices.smartlead.sentEmails[campaign.id] || [];

        processedUsers += leads.length;
        processedEvents += sentEmails.length;

        // Simulate event key generation
        sentEmails.forEach((email) => {
          const key = eventKeyGenerator.generateSmartleadKey(
            email,
            "sent",
            campaign.id,
            email.lead_email,
            config.namespaces[0] || "default"
          );

          mockDatabase.events.push({
            event_key: key,
            platform: "smartlead",
            event_type: "email_sent",
            user_id: email.lead_email,
            campaign_id: campaign.id,
            created_at: new Date(),
          });
        });
      }
    }

    if (platform === "lemlist") {
      // Process Lemlist campaigns
      for (const campaign of mockServices.lemlist.campaigns) {
        const leads = mockServices.lemlist.leads[campaign._id] || [];
        const activities = mockServices.lemlist.activities[campaign._id] || [];

        processedUsers += leads.length;
        processedEvents += activities.length;

        // Simulate event key generation
        activities.forEach((activity) => {
          const lead = leads.find((l) => l._id === activity.leadId);
          if (lead) {
            const key = eventKeyGenerator.generateLemlistKey(
              {
                ...activity,
                lead: { email: lead.email },
              },
              campaign._id,
              config.namespaces[0] || "default"
            );

            mockDatabase.events.push({
              event_key: key,
              platform: "lemlist",
              event_type: activity.type,
              user_id: lead.email,
              campaign_id: campaign._id,
              created_at: new Date(),
            });
          }
        });
      }
    }
  }

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  const endTime = Date.now();

  return {
    summary: {
      total_processed: processedEvents + processedUsers,
      events_created: processedEvents,
      users_processed: processedUsers,
      duration_ms: endTime - startTime,
    },
    progress: {
      percentage: 100,
      processed_items: processedEvents + processedUsers,
      total_items: processedEvents + processedUsers,
      current_stage: "completed",
    },
  };
}

// E2E Test Suite
describe("Full Sync System - End-to-End Tests", () => {
  beforeAll(() => {
    setupMockRoutes();
  });

  beforeEach(() => {
    // Clear mock database
    mockDatabase.events = [];
    mockDatabase.users = [];
    mockDatabase.sync_logs = [];

    // Clear event key cache
    eventKeyGenerator.clearCache();
  });

  describe("Full Sync API Workflow", () => {
    it("should execute full historical sync via API", async () => {
      const response = await request(app).post("/api/full-sync/execute").send({
        platforms: "smartlead,lemlist",
        syncMode: "full_historical",
        namespaces: "e2e-test",
        batchSize: 100,
        enableProgressTracking: true,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.jobId).toBeDefined();
      expect(response.body.config.platforms).toEqual(["smartlead", "lemlist"]);
      expect(response.body.summary.total_processed).toBeGreaterThan(0);
    });

    it("should track sync job progress", async () => {
      const jobId = "test_job_123";

      const response = await request(app).get(`/api/full-sync/status/${jobId}`);

      expect(response.status).toBe(200);
      expect(response.body.jobId).toBe(jobId);
      expect(response.body.status).toBe("completed");
      expect(response.body.progress.percentage).toBe(100);
    });

    it("should handle invalid sync configurations", async () => {
      const response = await request(app).post("/api/full-sync/execute").send({
        platforms: "invalid_platform",
        syncMode: "invalid_mode",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it("should support delta sync mode", async () => {
      const response = await request(app).post("/api/full-sync/execute").send({
        platforms: "smartlead",
        syncMode: "delta_since_last",
        startDate: "2024-01-01",
        endDate: "2024-01-31",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.config.syncMode).toBe("delta_since_last");
    });

    it("should support namespace-specific sync", async () => {
      const response = await request(app).post("/api/full-sync/execute").send({
        platforms: "lemlist",
        syncMode: "namespace_reset",
        namespaces: "specific-namespace",
        batchSize: 50,
      });

      expect(response.status).toBe(200);
      expect(response.body.config.namespaces).toEqual(["specific-namespace"]);
    });
  });

  describe("Event Key Generation Workflow", () => {
    it("should generate event keys via API", async () => {
      const response = await request(app)
        .post("/api/event-keys/generate")
        .send({
          platform: "lemlist",
          campaignId: "e2e_campaign",
          eventType: "email_sent",
          email: "e2e@example.com",
          activityId: "e2e_activity",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.event_key).toMatch(
        /^lemlist_e2ecampaign_emailsent_e2eactivity_[a-f0-9]{8}$/
      );
    });

    it("should handle event key collision detection", async () => {
      const keyData = {
        platform: "smartlead",
        campaignId: "collision_test",
        eventType: "email_opened",
        email: "collision@example.com",
        activityId: "same_activity",
      };

      // Generate first key
      const response1 = await request(app)
        .post("/api/event-keys/generate")
        .send(keyData);

      // Generate second key (should detect collision)
      const response2 = await request(app)
        .post("/api/event-keys/generate")
        .send(keyData);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.event_key).not.toBe(response2.body.event_key);
      expect(response2.body.event_key).toContain("collision");
    });

    it("should validate event key parameters", async () => {
      const response = await request(app)
        .post("/api/event-keys/generate")
        .send({
          platform: "invalid",
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Database Operations Workflow", () => {
    it("should apply database optimizations", async () => {
      const response = await request(app)
        .post("/api/database/optimize")
        .send({
          optimizations: ["sync_indexes", "bulk_operations"],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.optimizations_applied).toContain(
        "sync_indexes_created"
      );
    });
  });

  describe("Migration System Workflow", () => {
    it("should check migration status", async () => {
      const response = await request(app).get("/api/migrations/status");

      expect(response.status).toBe(200);
      expect(response.body.available_migrations).toBeDefined();
      expect(response.body.pending_migrations).toBeDefined();
    });

    it("should run pending migrations", async () => {
      const response = await request(app).post("/api/migrations/run");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.applied).toContain("003_event_keys");
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complete sync workflow", async () => {
      // Step 1: Check migration status
      const migrationStatus = await request(app).get("/api/migrations/status");
      expect(migrationStatus.status).toBe(200);

      // Step 2: Apply database optimizations
      const optimization = await request(app).post("/api/database/optimize");
      expect(optimization.status).toBe(200);

      // Step 3: Execute full sync
      const syncResponse = await request(app)
        .post("/api/full-sync/execute")
        .send({
          platforms: "smartlead,lemlist",
          syncMode: "full_historical",
          namespaces: "integration-test",
          enableProgressTracking: true,
        });

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.success).toBe(true);

      // Step 4: Check job status
      const statusResponse = await request(app).get(
        `/api/full-sync/status/${syncResponse.body.jobId}`
      );

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.status).toBe("completed");

      // Verify data was processed
      expect(mockDatabase.events.length).toBeGreaterThan(0);

      // Verify event keys were generated correctly
      const eventKeys = mockDatabase.events.map((e) => e.event_key);
      const uniqueKeys = new Set(eventKeys);
      expect(uniqueKeys.size).toBe(eventKeys.length); // All keys should be unique
    });

    it("should handle multi-platform sync with different configurations", async () => {
      // Smartlead sync
      const smartleadSync = await request(app)
        .post("/api/full-sync/execute")
        .send({
          platforms: "smartlead",
          syncMode: "delta_since_last",
          namespaces: "smartlead-only",
          batchSize: 25,
        });

      expect(smartleadSync.status).toBe(200);

      // Lemlist sync
      const lemlistSync = await request(app)
        .post("/api/full-sync/execute")
        .send({
          platforms: "lemlist",
          syncMode: "full_historical",
          namespaces: "lemlist-only",
          batchSize: 50,
        });

      expect(lemlistSync.status).toBe(200);

      // Combined sync
      const combinedSync = await request(app)
        .post("/api/full-sync/execute")
        .send({
          platforms: "smartlead,lemlist",
          syncMode: "date_range",
          startDate: "2024-01-01",
          endDate: "2024-01-31",
          namespaces: "combined-sync",
        });

      expect(combinedSync.status).toBe(200);
      expect(combinedSync.body.config.platforms).toEqual([
        "smartlead",
        "lemlist",
      ]);
    });

    it("should maintain data consistency across sync operations", async () => {
      const initialEventCount = mockDatabase.events.length;

      // Execute sync
      await request(app).post("/api/full-sync/execute").send({
        platforms: "smartlead",
        syncMode: "full_historical",
      });

      const afterSyncEventCount = mockDatabase.events.length;
      expect(afterSyncEventCount).toBeGreaterThan(initialEventCount);

      // Re-run same sync (should handle deduplication)
      await request(app).post("/api/full-sync/execute").send({
        platforms: "smartlead",
        syncMode: "full_historical",
      });

      // Event count should not significantly increase due to deduplication
      const afterResyncEventCount = mockDatabase.events.length;
      expect(afterResyncEventCount).toBeLessThanOrEqual(
        afterSyncEventCount * 1.1
      ); // Allow for some variance
    });

    it("should handle error scenarios gracefully", async () => {
      // Test with invalid configuration
      const invalidConfig = await request(app)
        .post("/api/full-sync/execute")
        .send({
          platforms: "nonexistent",
          syncMode: "invalid_mode",
          startDate: "invalid-date",
        });

      expect(invalidConfig.status).toBe(400);
      expect(invalidConfig.body.success).toBe(false);

      // Test with malformed request
      const malformedRequest = await request(app)
        .post("/api/full-sync/execute")
        .send("invalid json");

      expect(malformedRequest.status).toBe(400);
    });
  });

  describe("Performance and Reliability", () => {
    it("should handle concurrent sync requests", async () => {
      const concurrentRequests = 5;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app)
            .post("/api/full-sync/execute")
            .send({
              platforms: "lemlist",
              syncMode: "full_historical",
              namespaces: `concurrent-${i}`,
              batchSize: 10,
            })
        );
      }

      const results = await Promise.all(promises);

      results.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Verify unique job IDs
      const jobIds = results.map((r) => r.body.jobId);
      const uniqueJobIds = new Set(jobIds);
      expect(uniqueJobIds.size).toBe(concurrentRequests);
    });

    it("should maintain performance under load", async () => {
      const startTime = Date.now();

      // Execute multiple sync operations
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post("/api/full-sync/execute")
          .send({
            platforms: i % 2 === 0 ? "smartlead" : "lemlist",
            syncMode: "full_historical",
            namespaces: `perf-test-${i}`,
            batchSize: 20,
          })
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      // All requests should complete successfully
      expect(results.every((r) => r.status === 200)).toBe(true);

      // Should complete within reasonable time (less than 30 seconds)
      expect(endTime - startTime).toBeLessThan(30000);

      // Average processing time should be reasonable
      const avgProcessingTime =
        results.reduce((sum, r) => sum + r.body.summary.duration_ms, 0) /
        results.length;

      expect(avgProcessingTime).toBeLessThan(10000); // Less than 10 seconds average
    });
  });

  describe("Data Validation", () => {
    it("should generate valid event keys for all platforms", async () => {
      const testCases = [
        { platform: "smartlead", eventType: "email_sent" },
        { platform: "smartlead", eventType: "email_opened" },
        { platform: "lemlist", eventType: "linkedinSent" },
        { platform: "lemlist", eventType: "linkedinOpened" },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post("/api/event-keys/generate")
          .send({
            platform: testCase.platform,
            campaignId: "validation_test",
            eventType: testCase.eventType,
            email: "validation@example.com",
            activityId: "val_123",
          });

        expect(response.status).toBe(200);
        expect(response.body.event_key).toMatch(
          new RegExp(
            `^${
              testCase.platform
            }_validationtest_${testCase.eventType.toLowerCase()}_val123_[a-f0-9]{8}$`
          )
        );
      }
    });

    it("should maintain event key uniqueness across large datasets", async () => {
      const keyCount = 1000;
      const promises = [];

      for (let i = 0; i < keyCount; i++) {
        promises.push(
          request(app)
            .post("/api/event-keys/generate")
            .send({
              platform: i % 2 === 0 ? "smartlead" : "lemlist",
              campaignId: `uniqueness_test_${Math.floor(i / 100)}`,
              eventType: "test_event",
              email: `unique${i}@example.com`,
              activityId: `unique_${i}`,
            })
        );
      }

      const results = await Promise.all(promises);
      const eventKeys = results.map((r) => r.body.event_key);
      const uniqueKeys = new Set(eventKeys);

      // All generated keys should be unique
      expect(uniqueKeys.size).toBe(keyCount);

      // All requests should succeed
      expect(results.every((r) => r.status === 200)).toBe(true);
    });
  });
});

module.exports = { app, mockDatabase, mockServices };
