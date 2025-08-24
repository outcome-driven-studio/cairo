/**
 * Core Mixpanel Integration Test (No Database Dependencies)
 *
 * Tests the core Mixpanel integration logic without requiring database connections.
 */

const logger = require("../utils/logger");

// Mock the database module to avoid connection requirements
jest.mock("../utils/db", () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

// Mock environment variables
process.env.MIXPANEL_PROJECT_TOKEN = "test-token-12345";
process.env.SMARTLEAD_API_KEY = "test-smartlead-key";
process.env.LEMLIST_API_KEY = "test-lemlist-key";
process.env.PERIODIC_SYNC_MIXPANEL_ENABLED = "true";

const SmartleadSync = require("../services/sync/smartleadSync");
const LemlistSync = require("../services/sync/lemlistSync");

describe("Mixpanel Integration Core Tests", () => {
  beforeAll(() => {
    // Suppress console logs during tests
    logger.info = jest.fn();
    logger.debug = jest.fn();
    logger.warn = jest.fn();
    logger.error = jest.fn();
  });

  describe("SmartleadSync Mixpanel Integration", () => {
    let smartleadSync;

    beforeEach(() => {
      smartleadSync = new SmartleadSync({
        enableMixpanelTracking: true,
        trackCampaignEvents: true,
      });
    });

    test("should initialize with Mixpanel service", () => {
      expect(smartleadSync.mixpanelService).toBeDefined();
      expect(smartleadSync.trackingConfig.enableMixpanelTracking).toBe(true);
    });

    test("should map event types correctly", () => {
      expect(smartleadSync.mapToMixpanelEvent("email_sent")).toBe(
        "smartlead_email_sent"
      );
      expect(smartleadSync.mapToMixpanelEvent("email_opened")).toBe(
        "smartlead_email_opened"
      );
      expect(smartleadSync.mapToMixpanelEvent("email_clicked")).toBe(
        "smartlead_email_clicked"
      );
      expect(smartleadSync.mapToMixpanelEvent("email_replied")).toBe(
        "smartlead_email_replied"
      );
      expect(smartleadSync.mapToMixpanelEvent("unknown_type")).toBeNull();
    });

    test("should extract metadata correctly", () => {
      const metadata = {
        lead: {
          company: "Test Corp",
          first_name: "John",
          last_name: "Doe",
          linkedin_url: "https://linkedin.com/johndoe",
        },
        sequence_step: 3,
        email_subject: "Test Subject",
      };

      const extracted = smartleadSync.extractMixpanelMetadata(metadata);
      expect(extracted.lead_company).toBe("Test Corp");
      expect(extracted.lead_first_name).toBe("John");
      expect(extracted.lead_last_name).toBe("Doe");
      expect(extracted.has_linkedin).toBe(true);
      expect(extracted.sequence_step).toBe(3);
      expect(extracted.email_subject).toBe("Test Subject");
    });
  });

  describe("LemlistSync Mixpanel Integration", () => {
    let lemlistSync;

    beforeEach(() => {
      lemlistSync = new LemlistSync({
        enableMixpanelTracking: true,
        trackCampaignEvents: true,
      });
    });

    test("should initialize with Mixpanel service", () => {
      expect(lemlistSync.mixpanelService).toBeDefined();
      expect(lemlistSync.trackingConfig.enableMixpanelTracking).toBe(true);
    });

    test("should map event types correctly", () => {
      expect(lemlistSync.mapToMixpanelEvent("emailsent")).toBe(
        "lemlist_email_sent"
      );
      expect(lemlistSync.mapToMixpanelEvent("emailopened")).toBe(
        "lemlist_email_opened"
      );
      expect(lemlistSync.mapToMixpanelEvent("emailclicked")).toBe(
        "lemlist_email_clicked"
      );
      expect(lemlistSync.mapToMixpanelEvent("linkedinmessage")).toBe(
        "lemlist_linkedin_message"
      );
      expect(lemlistSync.mapToMixpanelEvent("unknown_type")).toBeNull();
    });

    test("should extract metadata correctly", () => {
      const metadata = {
        activity: {
          lead: {
            company: "Tech Startup",
            firstName: "Jane",
            lastName: "Smith",
            linkedinUrl: "https://linkedin.com/janesmith",
          },
          stepIndex: 2,
          subject: "Follow-up Email",
          type: "emailsent",
        },
      };

      const extracted = lemlistSync.extractMixpanelMetadata(metadata);
      expect(extracted.lead_company).toBe("Tech Startup");
      expect(extracted.lead_first_name).toBe("Jane");
      expect(extracted.lead_last_name).toBe("Smith");
      expect(extracted.has_linkedin).toBe(true);
      expect(extracted.sequence_step).toBe(2);
      expect(extracted.email_subject).toBe("Follow-up Email");
      expect(extracted.activity_type).toBe("emailsent");
    });
  });

  describe("Configuration Management", () => {
    test("should respect disabled Mixpanel tracking", () => {
      const disabledSync = new SmartleadSync({
        enableMixpanelTracking: false,
      });
      expect(disabledSync.trackingConfig.enableMixpanelTracking).toBe(false);
    });

    test("should default to enabled tracking", () => {
      const defaultSync = new SmartleadSync();
      expect(defaultSync.trackingConfig.enableMixpanelTracking).toBe(true);
    });

    test("should handle custom tracking options", () => {
      const customSync = new LemlistSync({
        enableMixpanelTracking: true,
        trackCampaignEvents: false,
        trackUserEvents: true,
      });

      expect(customSync.trackingConfig.enableMixpanelTracking).toBe(true);
      expect(customSync.trackingConfig.trackCampaignEvents).toBe(false);
      expect(customSync.trackingConfig.trackUserEvents).toBe(true);
    });
  });

  describe("Event Processing Logic", () => {
    test("should handle trackEventInMixpanel with disabled tracking", async () => {
      const disabledSync = new SmartleadSync({
        enableMixpanelTracking: false,
      });

      const eventData = {
        email: "test@example.com",
        event_key: "test-key",
        event_type: "email_sent",
        metadata: { campaign_id: "camp123" },
      };

      // Should return early without error when tracking is disabled
      await expect(
        disabledSync.trackEventInMixpanel(eventData, "test-namespace")
      ).resolves.toBeUndefined();
    });

    test("should handle trackEventInMixpanel with unknown event type", async () => {
      const sync = new SmartleadSync({
        enableMixpanelTracking: true,
      });

      const eventData = {
        email: "test@example.com",
        event_key: "test-key",
        event_type: "unknown_type",
        metadata: { campaign_id: "camp123" },
      };

      // Should return early when event type cannot be mapped
      await expect(
        sync.trackEventInMixpanel(eventData, "test-namespace")
      ).resolves.toBeUndefined();
    });
  });
});

// Integration demo that works without database
async function runCoreIntegrationDemo() {
  console.log("🧪 Starting Core Mixpanel Integration Demo...");

  try {
    const smartleadSync = new SmartleadSync({
      enableMixpanelTracking: true,
    });

    console.log("✅ SmartleadSync initialized:");
    console.log(
      `   - Mixpanel enabled: ${smartleadSync.mixpanelService.enabled}`
    );
    console.log(
      `   - Project token present: ${!!process.env.MIXPANEL_PROJECT_TOKEN}`
    );

    const lemlistSync = new LemlistSync({
      enableMixpanelTracking: true,
    });

    console.log("✅ LemlistSync initialized:");
    console.log(
      `   - Mixpanel enabled: ${lemlistSync.mixpanelService.enabled}`
    );

    // Test event mapping
    console.log("🔄 Testing event type mappings:");
    console.log(
      `   - Smartlead email_sent → ${smartleadSync.mapToMixpanelEvent(
        "email_sent"
      )}`
    );
    console.log(
      `   - Lemlist emailsent → ${lemlistSync.mapToMixpanelEvent("emailsent")}`
    );

    console.log("🎉 Core Mixpanel Integration Demo completed successfully!");

    return {
      success: true,
      mixpanelEnabled: smartleadSync.mixpanelService.enabled,
      eventMappings: {
        smartlead_email_sent: smartleadSync.mapToMixpanelEvent("email_sent"),
        lemlist_email_sent: lemlistSync.mapToMixpanelEvent("emailsent"),
      },
    };
  } catch (error) {
    console.error("❌ Core Integration Demo failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Export for use elsewhere
module.exports = {
  runCoreIntegrationDemo,
};

// Run demo if executed directly
if (require.main === module) {
  runCoreIntegrationDemo()
    .then((result) => {
      console.log("Demo Result:", JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Demo failed:", error);
      process.exit(1);
    });
}
