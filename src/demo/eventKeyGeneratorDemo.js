const {
  EventKeyGenerator,
  eventKeyGenerator,
} = require("../utils/eventKeyGenerator");

console.log("🔑 Event Key Generator Demo");
console.log("==========================\n");

// Test basic generation
console.log("1. Basic Event Key Generation:");
const basicOptions = {
  platform: "lemlist",
  campaignId: "campaign-123",
  eventType: "email_sent",
  email: "test@example.com",
  activityId: "activity-456",
  timestamp: "2024-01-01T10:00:00Z",
};

const key1 = eventKeyGenerator.generateEventKey(basicOptions);
console.log(`   Generated Key: ${key1}`);

// Test consistency
const key2 = eventKeyGenerator.generateEventKey(basicOptions);
console.log(`   Consistent Key: ${key1 === key2 ? "✅ Same" : "❌ Different"}`);

console.log("\n2. Collision Detection:");
const key3 = eventKeyGenerator.generateEventKey(basicOptions);
console.log(`   Collision Key: ${key3}`);
console.log(
  `   Contains 'collision': ${key3.includes("collision") ? "✅ Yes" : "❌ No"}`
);

console.log("\n3. Platform-specific Generation:");

// Test Lemlist
const lemlistActivity = {
  id: "lemlist_act_789",
  type: "emailsOpened",
  campaignId: "camp456",
  date: "2024-01-01T10:00:00Z",
  lead: {
    email: "lead@example.com",
  },
  leadId: "lead123",
  campaignName: "Demo Campaign",
};

const lemlistKey = eventKeyGenerator.generateLemlistKey(
  lemlistActivity,
  "camp456",
  "demo"
);
console.log(`   Lemlist Key: ${lemlistKey}`);

// Test Smartlead
const smartleadEvent = {
  id: "smart_event_123",
  email_campaign_seq_id: "seq_789",
  lead_id: "lead_456",
  sent_time: "2024-01-01T10:00:00Z",
};

const smartleadKey = eventKeyGenerator.generateSmartleadKey(
  smartleadEvent,
  "sent",
  "campaign_789",
  "smartlead@example.com",
  "demo"
);
console.log(`   Smartlead Key: ${smartleadKey}`);

console.log("\n4. Fallback Handling:");

// Test missing required fields
const incompleteOptions = {
  platform: "lemlist",
  // Missing required fields
};

const fallbackKey = eventKeyGenerator.generateEventKey(incompleteOptions);
console.log(`   Fallback Key: ${fallbackKey}`);

// Test missing activity ID
const noIdActivity = {
  type: "emailsClicked",
  campaignId: "camp789",
  date: "2024-01-01T10:00:00Z",
  lead: {
    email: "noid@example.com",
  },
};

const noIdKey = eventKeyGenerator.generateLemlistKey(noIdActivity, "camp789");
console.log(`   No ID Key: ${noIdKey}`);

console.log("\n5. Statistics:");
const stats = eventKeyGenerator.getStats();
console.log(`   Total Generated: ${stats.total_generated}`);
console.log(`   Collisions Detected: ${stats.collisions_detected}`);
console.log(`   Fallbacks Used: ${stats.fallback_used}`);
console.log(`   Invalid Inputs: ${stats.invalid_inputs}`);
console.log(`   Collision Rate: ${stats.collision_rate}`);
console.log(`   Cache Size: ${stats.cache_size}`);

console.log("\n6. Key Format Validation:");
const validationKeys = [
  eventKeyGenerator.generateEventKey({
    platform: "SMARTLEAD",
    campaignId: "Camp-123!@#",
    eventType: "EMAIL_OPENED",
    email: "TEST@EXAMPLE.COM",
    activityId: "Act-456",
  }),
  eventKeyGenerator.generateEventKey({
    platform: "lemlist",
    campaignId: "normal_campaign",
    eventType: "email_clicked",
    email: "user@test.com",
    activityId: "12345",
  }),
];

validationKeys.forEach((key, index) => {
  const parts = key.split("_");
  console.log(`   Key ${index + 1}: ${key}`);
  console.log(
    `   Format Valid: ${parts.length >= 4 ? "✅" : "❌"} (${
      parts.length
    } parts)`
  );
});

console.log("\n7. Special Cases:");

// Test with special characters
const specialKey = eventKeyGenerator.generateEventKey({
  platform: "LeMlIsT",
  campaignId: "Campaign-With-Dashes_And_Underscores!@#$%^&*()",
  eventType: "WEIRD-EVENT_TYPE",
  email: "weird.email+tag@sub.domain.com",
  activityId: "Activity.With.Dots-And-Dashes_123",
});
console.log(`   Special Chars: ${specialKey}`);

// Test with very long strings
const longString = "a".repeat(100);
const longKey = eventKeyGenerator.generateEventKey({
  platform: "lemlist",
  campaignId: longString,
  eventType: longString,
  email: "test@example.com",
  activityId: longString,
});
console.log(`   Long String: ${longKey} (length: ${longKey.length})`);

console.log("\n8. Error Handling:");

// Test null/undefined
const nullKey = eventKeyGenerator.generateEventKey(null);
console.log(`   Null Options: ${nullKey}`);

const undefinedKey = eventKeyGenerator.generateEventKey(undefined);
console.log(`   Undefined Options: ${undefinedKey}`);

// Test invalid platform
const invalidPlatformKey = eventKeyGenerator.generateEventKey({
  platform: "invalid_platform",
  campaignId: "camp123",
  eventType: "test",
  email: "test@example.com",
});
console.log(`   Invalid Platform: ${invalidPlatformKey}`);

console.log("\n✨ Event Key Generator Demo Complete!");
console.log("\nFinal Statistics:");
const finalStats = eventKeyGenerator.getStats();
Object.entries(finalStats).forEach(([key, value]) => {
  console.log(`   ${key}: ${value}`);
});
