/**
 * Test Mixpanel Integration in Sync Pipelines
 *
 * Validates that campaign events are properly tracked to Mixpanel
 * during sync operations.
 */

const SmartleadSync = require("../services/sync/smartleadSync");
const LemlistSync = require("../services/sync/lemlistSync");
const PeriodicSyncService = require("../services/periodicSyncService");
const logger = require("../utils/logger");

// Mock environment variables for testing
process.env.MIXPANEL_PROJECT_TOKEN = "test-token";
process.env.SMARTLEAD_API_KEY = "test-key";
process.env.LEMLIST_API_KEY = "test-key";
process.env.PERIODIC_SYNC_MIXPANEL_ENABLED = "true";

describe("Mixpanel Integration Tests", () => {
  let smartleadSync;
  let lemlistSync;
  let periodicSyncService;

  beforeEach(() => {
    // Initialize services with Mixpanel tracking enabled
    smartleadSync = new SmartleadSync({
      enableMixpanelTracking: true,
      trackCampaignEvents: true,
    });

    lemlistSync = new LemlistSync({
      enableMixpanelTracking: true,
      trackCampaignEvents: true,
    });

    periodicSyncService = new PeriodicSyncService({
      enableMixpanelTracking: true,
    });
  });

  describe("SmartleadSync Mixpanel Integration", () => {
    test("should initialize with Mixpanel tracking enabled", () => {
      expect(smartleadSync.mixpanelService).toBeDefined();
      expect(smartleadSync.trackingConfig.enableMixpanelTracking).toBe(true);
    });

    test("should map Smartlead event types correctly", () => {
      const eventType = "email_sent";
      const mappedEvent = smartleadSync.mapToMixpanelEvent(eventType);
      expect(mappedEvent).toBe("smartlead_email_sent");
    });

    test("should extract relevant metadata for Mixpanel", () => {
      const metadata = {
        lead: {
          company: "Test Corp",
          first_name: "John",
          last_name: "Doe",
          linkedin_url: "https://linkedin.com/in/johndoe",
        },
      };

      const extracted = smartleadSync.extractMixpanelMetadata(metadata);
      expect(extracted.lead_company).toBe("Test Corp");
      expect(extracted.lead_first_name).toBe("John");
      expect(extracted.has_linkedin).toBe(true);
    });
  });

  describe("LemlistSync Mixpanel Integration", () => {
    test("should initialize with Mixpanel tracking enabled", () => {
      expect(lemlistSync.mixpanelService).toBeDefined();
      expect(lemlistSync.trackingConfig.enableMixpanelTracking).toBe(true);
    });

    test("should map Lemlist event types correctly", () => {
      const eventType = "emailsent";
      const mappedEvent = lemlistSync.mapToMixpanelEvent(eventType);
      expect(mappedEvent).toBe("lemlist_email_sent");
    });

    test("should extract relevant metadata for Mixpanel", () => {
      const metadata = {
        activity: {
          lead: {
            company: "Test Corp",
            firstName: "Jane",
            lastName: "Smith",
            linkedinUrl: "https://linkedin.com/in/janesmith",
          },
          stepIndex: 2,
          subject: "Follow-up Email",
        },
      };

      const extracted = lemlistSync.extractMixpanelMetadata(metadata);
      expect(extracted.lead_company).toBe("Test Corp");
      expect(extracted.lead_first_name).toBe("Jane");
      expect(extracted.sequence_step).toBe(2);
      expect(extracted.email_subject).toBe("Follow-up Email");
    });
  });

  describe("PeriodicSyncService Mixpanel Integration", () => {
    test("should initialize with Mixpanel-enabled sync services", () => {
      expect(periodicSyncService.lemlistSyncService).toBeDefined();
      expect(periodicSyncService.smartleadSyncService).toBeDefined();
    });

    test("should use sync services with Mixpanel tracking", () => {
      expect(
        periodicSyncService.lemlistSyncService.trackingConfig
          .enableMixpanelTracking
      ).toBe(true);
      expect(
        periodicSyncService.smartleadSyncService.trackingConfig
          .enableMixpanelTracking
      ).toBe(true);
    });
  });

  describe("Event Type Mappings", () => {
    const testMappings = [
      // Smartlead mappings
      {
        platform: "smartlead",
        input: "email_sent",
        expected: "smartlead_email_sent",
      },
      {
        platform: "smartlead",
        input: "email_opened",
        expected: "smartlead_email_opened",
      },
      {
        platform: "smartlead",
        input: "email_clicked",
        expected: "smartlead_email_clicked",
      },
      {
        platform: "smartlead",
        input: "email_replied",
        expected: "smartlead_email_replied",
      },

      // Lemlist mappings
      {
        platform: "lemlist",
        input: "emailsent",
        expected: "lemlist_email_sent",
      },
      {
        platform: "lemlist",
        input: "emailopened",
        expected: "lemlist_email_opened",
      },
      {
        platform: "lemlist",
        input: "linkedinmessage",
        expected: "lemlist_linkedin_message",
      },
      {
        platform: "lemlist",
        input: "linkedinvisit",
        expected: "lemlist_linkedin_visit",
      },
    ];

    testMappings.forEach(({ platform, input, expected }) => {
      test(`should map ${platform} ${input} to ${expected}`, () => {
        const service = platform === "smartlead" ? smartleadSync : lemlistSync;
        const result = service.mapToMixpanelEvent(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe("Configuration Options", () => {
    test("should respect enableMixpanelTracking=false", () => {
      const disabledSync = new SmartleadSync({
        enableMixpanelTracking: false,
      });

      expect(disabledSync.trackingConfig.enableMixpanelTracking).toBe(false);
    });

    test("should default to enabled when no options provided", () => {
      const defaultSync = new SmartleadSync();
      expect(defaultSync.trackingConfig.enableMixpanelTracking).toBe(true);
    });

    test("should use environment variable for periodic sync", () => {
      process.env.PERIODIC_SYNC_MIXPANEL_ENABLED = "false";
      const disabledPeriodicSync = new PeriodicSyncService();

      // Reset for other tests
      process.env.PERIODIC_SYNC_MIXPANEL_ENABLED = "true";
    });
  });
});

// Integration test helper
async function runMixpanelIntegrationDemo() {
  logger.info("🧪 Starting Mixpanel Integration Demo...");

  try {
    // Test SmartleadSync
    const smartleadSync = new SmartleadSync({
      enableMixpanelTracking: true,
    });

    logger.info("✅ SmartleadSync initialized with Mixpanel tracking");
    logger.info(
      `   - Mixpanel enabled: ${smartleadSync.mixpanelService.enabled}`
    );
    logger.info(
      `   - Tracking config: ${JSON.stringify(smartleadSync.trackingConfig)}`
    );

    // Test LemlistSync
    const lemlistSync = new LemlistSync({
      enableMixpanelTracking: true,
    });

    logger.info("✅ LemlistSync initialized with Mixpanel tracking");
    logger.info(
      `   - Mixpanel enabled: ${lemlistSync.mixpanelService.enabled}`
    );

    // Test PeriodicSyncService
    const periodicSync = new PeriodicSyncService();

    logger.info(
      "✅ PeriodicSyncService initialized with Mixpanel-enabled sync services"
    );
    logger.info(
      `   - Lemlist sync service enabled: ${!!periodicSync.lemlistSyncService}`
    );
    logger.info(
      `   - Smartlead sync service enabled: ${!!periodicSync.smartleadSyncService}`
    );

    logger.info("🎉 Mixpanel Integration Demo completed successfully!");

    return {
      success: true,
      services: {
        smartleadSync: smartleadSync.trackingConfig,
        lemlistSync: lemlistSync.trackingConfig,
        periodicSync: "initialized",
      },
    };
  } catch (error) {
    logger.error("❌ Mixpanel Integration Demo failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Export for use in other tests or demos
module.exports = {
  runMixpanelIntegrationDemo,
};

// Run demo if this file is executed directly
if (require.main === module) {
  runMixpanelIntegrationDemo()
    .then((result) => {
      console.log("Demo Result:", JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Demo Error:", error);
      process.exit(1);
    });
}
