const {
  EventKeyGenerator,
  eventKeyGenerator,
} = require("../utils/eventKeyGenerator");

// Mock logger to avoid console output during tests
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe("EventKeyGenerator", () => {
  let generator;

  beforeEach(() => {
    generator = new EventKeyGenerator();
  });

  describe("generateEventKey", () => {
    it("should generate consistent keys for identical inputs", () => {
      const options = {
        platform: "lemlist",
        campaignId: "camp123",
        eventType: "email_sent",
        email: "test@example.com",
        activityId: "act456",
        timestamp: "2024-01-01T10:00:00Z",
      };

      const key1 = generator.generateEventKey(options);
      const key2 = generator.generateEventKey(options);

      // Should be identical for same input
      expect(key1).toBe(key2);
    });

    it("should generate different keys for different inputs", () => {
      const options1 = {
        platform: "lemlist",
        campaignId: "camp123",
        eventType: "email_sent",
        email: "test@example.com",
        activityId: "act456",
      };

      const options2 = {
        ...options1,
        eventType: "email_opened",
      };

      const key1 = generator.generateEventKey(options1);
      const key2 = generator.generateEventKey(options2);

      expect(key1).not.toBe(key2);
    });

    it("should follow the expected format pattern", () => {
      const options = {
        platform: "smartlead",
        campaignId: "campaign-123",
        eventType: "email_clicked",
        email: "user@test.com",
        activityId: "activity-789",
      };

      const key = generator.generateEventKey(options);

      // Should match: platform_campaignid_eventtype_uniqueid_hash
      const parts = key.split("_");
      expect(parts.length).toBe(5);
      expect(parts[0]).toBe("smartlead");
      expect(parts[1]).toBe("campaign123");
      expect(parts[2]).toBe("emailclicked");
      expect(parts[3]).toContain("activity789");
      expect(parts[4]).toMatch(/^[a-f0-9]{8}$/); // 8-char hex hash
    });

    it("should handle missing required fields gracefully", () => {
      const options = {
        platform: "lemlist",
        // Missing required fields
      };

      const key = generator.generateEventKey(options);

      // Should generate fallback key
      expect(key).toContain("lemlist_fallback_");
      expect(generator.getStats().invalid_inputs).toBe(1);
    });

    it("should clean special characters from components", () => {
      const options = {
        platform: "LemList",
        campaignId: "Camp-123!@#",
        eventType: "EMAIL_SENT",
        email: "test@example.com",
        activityId: "act-456",
      };

      const key = generator.generateEventKey(options);

      // Should be cleaned to lowercase alphanumeric
      expect(key).toMatch(/^lemlist_camp123_emailsent_act456_[a-f0-9]{8}$/);
    });

    it("should use fallback identifier when activityId is missing", () => {
      const options = {
        platform: "lemlist",
        campaignId: "camp123",
        eventType: "email_sent",
        email: "test@example.com",
        // No activityId
        timestamp: "2024-01-01T10:00:00Z",
      };

      const key = generator.generateEventKey(options);

      expect(key).toMatch(/^lemlist_camp123_emailsent_/);
      expect(generator.getStats().fallback_used).toBe(1);
    });

    it("should handle invalid email format", () => {
      const options = {
        platform: "lemlist",
        campaignId: "camp123",
        eventType: "email_sent",
        email: "invalid-email",
        activityId: "act456",
      };

      const key = generator.generateEventKey(options);

      // Should still generate key but mark as invalid input
      expect(key).toContain("lemlist_fallback_");
      expect(generator.getStats().invalid_inputs).toBe(1);
    });
  });

  describe("collision detection", () => {
    it("should detect collisions and generate alternative keys", () => {
      const options = {
        platform: "lemlist",
        campaignId: "camp123",
        eventType: "email_sent",
        email: "test@example.com",
        activityId: "act456",
        timestamp: "2024-01-01T10:00:00Z",
      };

      const key1 = generator.generateEventKey(options);
      const key2 = generator.generateEventKey(options);

      // Second generation should detect collision and create alternative
      expect(key2).toContain("_collision_");
      expect(generator.getStats().collisions_detected).toBe(1);
    });

    it("should register keys for collision detection", () => {
      const key = "test_key_123";
      generator.registerEventKey(key, { test: true });

      expect(generator.detectCollision(key)).toBe(true);
      expect(generator.detectCollision("non_existent_key")).toBe(false);
    });

    it("should manage cache size to prevent memory leaks", () => {
      const originalMaxSize = generator.maxCacheSize;
      generator.maxCacheSize = 3; // Set small cache size for testing

      // Generate more keys than cache can hold
      for (let i = 0; i < 5; i++) {
        generator.registerEventKey(`test_key_${i}`);
      }

      expect(generator.getStats().cache_size).toBe(3);

      // Restore original size
      generator.maxCacheSize = originalMaxSize;
    });
  });

  describe("platform-specific generators", () => {
    it("should generate Lemlist keys correctly", () => {
      const activity = {
        id: "lemlist_act_123",
        type: "emailsSent",
        campaignId: "camp456",
        date: "2024-01-01T10:00:00Z",
        lead: {
          email: "lead@example.com",
        },
        leadId: "lead789",
        campaignName: "Test Campaign",
      };

      const key = generator.generateLemlistKey(
        activity,
        "camp456",
        "test_namespace"
      );

      expect(key).toMatch(
        /^lemlist_camp456_emailssent_lemlistact123_[a-f0-9]{8}$/
      );
    });

    it("should generate Smartlead keys correctly", () => {
      const event = {
        id: "smart_123",
        email_campaign_seq_id: "seq_456",
        lead_id: "lead_789",
        sent_time: "2024-01-01T10:00:00Z",
      };

      const key = generator.generateSmartleadKey(
        event,
        "sent",
        "campaign_123",
        "lead@example.com",
        "test_namespace"
      );

      expect(key).toMatch(/^smartlead_campaign123_sent_smart123_[a-f0-9]{8}$/);
    });

    it("should handle missing activity ID in Lemlist", () => {
      const activity = {
        type: "emailsOpened",
        campaignId: "camp456",
        date: "2024-01-01T10:00:00Z",
        lead: {
          email: "lead@example.com",
        },
        // Missing id
      };

      const key = generator.generateLemlistKey(activity, "camp456");

      expect(key).toMatch(/^lemlist_camp456_emailsopened_/);
      expect(generator.getStats().fallback_used).toBeGreaterThan(0);
    });

    it("should handle missing event ID in Smartlead", () => {
      const event = {
        lead_id: "lead_789",
        sent_time: "2024-01-01T10:00:00Z",
        // Missing id and email_campaign_seq_id
      };

      const key = generator.generateSmartleadKey(
        event,
        "sent",
        "campaign_123",
        "lead@example.com"
      );

      expect(key).toMatch(/^smartlead_campaign123_sent_/);
      expect(generator.getStats().fallback_used).toBeGreaterThan(0);
    });
  });

  describe("statistics and monitoring", () => {
    it("should track generation statistics", () => {
      const options = {
        platform: "lemlist",
        campaignId: "camp123",
        eventType: "email_sent",
        email: "test@example.com",
        activityId: "act456",
      };

      // Generate some keys
      generator.generateEventKey(options);
      generator.generateEventKey({ ...options, activityId: "act789" });

      // Generate collision
      generator.generateEventKey(options);

      const stats = generator.getStats();

      expect(stats.total_generated).toBe(3);
      expect(stats.collisions_detected).toBe(1);
      expect(stats.collision_rate).toBe("33.33%");
    });

    it("should clear cache when requested", () => {
      generator.registerEventKey("test_key_1");
      generator.registerEventKey("test_key_2");

      expect(generator.getStats().cache_size).toBe(2);

      generator.clearCache();

      expect(generator.getStats().cache_size).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should handle null/undefined options gracefully", () => {
      expect(() => generator.generateEventKey(null)).not.toThrow();
      expect(() => generator.generateEventKey(undefined)).not.toThrow();

      const key1 = generator.generateEventKey(null);
      const key2 = generator.generateEventKey(undefined);

      expect(key1).toContain("unknown_fallback_");
      expect(key2).toContain("unknown_fallback_");
    });

    it("should handle invalid platform values", () => {
      const options = {
        platform: "invalid_platform",
        campaignId: "camp123",
        eventType: "email_sent",
        email: "test@example.com",
      };

      const key = generator.generateEventKey(options);

      expect(key).toContain("invalidplatform_fallback_");
      expect(generator.getStats().invalid_inputs).toBeGreaterThan(0);
    });

    it("should handle extremely long component values", () => {
      const longString = "a".repeat(200);
      const options = {
        platform: "lemlist",
        campaignId: longString,
        eventType: longString,
        email: "test@example.com",
        activityId: longString,
      };

      const key = generator.generateEventKey(options);

      // Should be truncated but still work
      expect(key.length).toBeLessThan(1000);
      expect(key).toMatch(/^lemlist_/);
    });
  });

  describe("singleton instance", () => {
    it("should provide working singleton instance", () => {
      expect(eventKeyGenerator).toBeInstanceOf(EventKeyGenerator);

      const options = {
        platform: "lemlist",
        campaignId: "camp123",
        eventType: "email_sent",
        email: "test@example.com",
        activityId: "act456",
      };

      const key = eventKeyGenerator.generateEventKey(options);
      expect(key).toMatch(/^lemlist_/);
    });
  });
});
