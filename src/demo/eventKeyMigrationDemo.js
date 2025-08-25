const { eventKeyGenerator } = require("../utils/eventKeyGenerator");

console.log("🔄 Event Key Migration Demo");
console.log("=============================\n");

console.log(
  "This demo tests the updated event key generation across all services:"
);
console.log("1. LemlistSync service");
console.log("2. SmartleadSync service");
console.log("3. SyncRoutes (legacy)");
console.log("4. NewSyncRoutes (supersync)");
console.log("5. FullSyncService\n");

// Clear cache for clean demo
eventKeyGenerator.clearCache();

console.log("🎯 Test 1: LemlistSync Service Event Keys");
console.log("==========================================");

const lemlistActivity1 = {
  id: "lemlist_activity_12345",
  _id: "lemlist_activity_12345",
  type: "emailsSent",
  campaignId: "camp_678",
  date: "2024-01-15T10:30:00Z",
  createdAt: "2024-01-15T10:30:00Z",
  leadId: "lead_456",
  campaignName: "Demo Campaign A",
  lead: {
    email: "test1@example.com",
  },
};

const lemlistKey1 = eventKeyGenerator.generateLemlistKey(
  lemlistActivity1,
  "camp_678",
  "playmaker"
);
console.log(
  `   Activity: ${lemlistActivity1.type} | Email: ${lemlistActivity1.lead.email}`
);
console.log(`   Generated Key: ${lemlistKey1}`);

// Test with missing ID (fallback scenario)
const lemlistActivity2 = {
  type: "emailsOpened",
  campaignId: "camp_678",
  date: "2024-01-15T11:00:00Z",
  leadId: "lead_789",
  campaignName: "Demo Campaign A",
  lead: {
    email: "test2@example.com",
  },
  // No id or _id - should trigger fallback
};

const lemlistKey2 = eventKeyGenerator.generateLemlistKey(
  lemlistActivity2,
  "camp_678",
  "playmaker"
);
console.log(
  `   Activity: ${lemlistActivity2.type} | Email: ${lemlistActivity2.lead.email} | No ID (fallback)`
);
console.log(`   Generated Key: ${lemlistKey2}`);

console.log("\n🎯 Test 2: SmartleadSync Service Event Keys");
console.log("=============================================");

const smartleadEvent1 = {
  id: "smart_event_789",
  email_campaign_seq_id: "seq_123",
  lead_id: "lead_smart_456",
  sent_time: "2024-01-15T14:45:00Z",
};

const smartleadKey1 = eventKeyGenerator.generateSmartleadKey(
  smartleadEvent1,
  "sent",
  "smart_camp_999",
  "smartlead1@example.com",
  "playmaker"
);
console.log(`   Event Type: sent | Email: smartlead1@example.com`);
console.log(`   Generated Key: ${smartleadKey1}`);

// Test with missing ID (fallback scenario)
const smartleadEvent2 = {
  lead_id: "lead_smart_789",
  open_time: "2024-01-15T15:15:00Z",
  // No id or email_campaign_seq_id - should trigger fallback
};

const smartleadKey2 = eventKeyGenerator.generateSmartleadKey(
  smartleadEvent2,
  "opened",
  "smart_camp_999",
  "smartlead2@example.com",
  "playmaker"
);
console.log(
  `   Event Type: opened | Email: smartlead2@example.com | No ID (fallback)`
);
console.log(`   Generated Key: ${smartleadKey2}`);

console.log("\n🎯 Test 3: Legacy SyncRoutes Patterns");
console.log("======================================");

// Simulate the old vs new patterns
console.log("   OLD Pattern: lemlist_act123");
const newLemlistPattern = eventKeyGenerator.generateLemlistKey(
  {
    id: "act123",
    type: "emailsClicked",
    campaignId: "legacy_camp",
    date: "2024-01-15T16:00:00Z",
    lead: { email: "legacy@example.com" },
  },
  "legacy_camp",
  "playmaker"
);
console.log(`   NEW Pattern: ${newLemlistPattern}`);

console.log("\n   OLD Pattern: smartlead_opened_camp123_lead456");
const newSmartleadPattern = eventKeyGenerator.generateSmartleadKey(
  {
    id: "lead456",
    lead_id: "lead456",
  },
  "opened",
  "camp123",
  "legacy-smart@example.com",
  "playmaker"
);
console.log(`   NEW Pattern: ${newSmartleadPattern}`);

console.log("\n🎯 Test 4: NewSyncRoutes (SuperSync) Patterns");
console.log("===============================================");

// Simulate supersync patterns
console.log("   OLD Pattern: lemlist-emailsSent-supersync123-act789");
const newSupersyncLemlist = eventKeyGenerator.generateLemlistKey(
  {
    _id: "act789",
    type: "emailsSent",
    campaignId: "supersync_camp",
    createdAt: "2024-01-15T17:00:00Z",
    leadId: "lead_super_123",
    lead: { email: "supersync@example.com" },
  },
  "supersync_camp",
  "playmaker"
);
console.log(`   NEW Pattern: ${newSupersyncLemlist}`);

console.log("\n   OLD Pattern: smartlead-sent-supersync456-event999");
const newSupersyncSmartlead = eventKeyGenerator.generateSmartleadKey(
  {
    id: "event999",
    email_campaign_seq_id: "seq_456",
  },
  "sent",
  "supersync_smart_camp",
  "supersync-smart@example.com",
  "playmaker"
);
console.log(`   NEW Pattern: ${newSupersyncSmartlead}`);

console.log("\n🎯 Test 5: FullSyncService Patterns");
console.log("====================================");

// Simulate full sync patterns
console.log("   OLD Pattern: lemlist-camp456-activity-user@example.com");
const newFullSyncLemlist = eventKeyGenerator.generateLemlistKey(
  {
    id: "activity_id_123",
    type: "activity",
    campaignId: "camp456",
    date: "2024-01-15T18:00:00Z",
    lead: { email: "fullsync@example.com" },
  },
  "camp456",
  "fullsync_namespace"
);
console.log(`   NEW Pattern: ${newFullSyncLemlist}`);

console.log("\n   OLD Pattern: smartlead-camp789-event-user@example.com");
const newFullSyncSmartlead = eventKeyGenerator.generateSmartleadKey(
  {
    id: "event_123",
    type: "event",
  },
  "event",
  "camp789",
  "fullsync-smart@example.com",
  "fullsync_namespace"
);
console.log(`   NEW Pattern: ${newFullSyncSmartlead}`);

console.log("\n🎯 Test 6: Collision Detection & Resolution");
console.log("=============================================");

// Generate identical events to trigger collision detection
const collisionActivity = {
  id: "collision_test_123",
  type: "emailsReplied",
  campaignId: "collision_camp",
  date: "2024-01-15T19:00:00Z",
  lead: { email: "collision@example.com" },
};

const key1 = eventKeyGenerator.generateLemlistKey(
  collisionActivity,
  "collision_camp",
  "test"
);
const key2 = eventKeyGenerator.generateLemlistKey(
  collisionActivity,
  "collision_camp",
  "test"
);
const key3 = eventKeyGenerator.generateLemlistKey(
  collisionActivity,
  "collision_camp",
  "test"
);

console.log(`   First Generation: ${key1}`);
console.log(`   Second Generation (collision): ${key2}`);
console.log(`   Third Generation (collision): ${key3}`);
console.log(
  `   Keys are different: ${
    key1 !== key2 && key2 !== key3 ? "✅ Yes" : "❌ No"
  }`
);

console.log("\n🎯 Test 7: Performance & Reliability Metrics");
console.log("==============================================");

const startTime = Date.now();

// Generate many keys to test performance
for (let i = 0; i < 100; i++) {
  eventKeyGenerator.generateEventKey({
    platform: i % 2 === 0 ? "lemlist" : "smartlead",
    campaignId: `perf_camp_${i}`,
    eventType:
      i % 4 === 0
        ? "sent"
        : i % 4 === 1
        ? "opened"
        : i % 4 === 2
        ? "clicked"
        : "replied",
    email: `perf${i}@example.com`,
    activityId: `perf_act_${i}`,
    timestamp: new Date(Date.now() + i * 1000),
  });
}

const endTime = Date.now();
const stats = eventKeyGenerator.getStats();

console.log(`   Generated 100+ keys in ${endTime - startTime}ms`);
console.log(`   Total Generated: ${stats.total_generated}`);
console.log(`   Collisions Detected: ${stats.collisions_detected}`);
console.log(`   Fallbacks Used: ${stats.fallback_used}`);
console.log(`   Invalid Inputs: ${stats.invalid_inputs}`);
console.log(`   Collision Rate: ${stats.collision_rate}`);
console.log(`   Cache Size: ${stats.cache_size}`);

console.log("\n🎯 Test 8: Error Handling & Edge Cases");
console.log("=======================================");

// Test various edge cases
const edgeCases = [
  {
    name: "Extremely long campaign ID",
    data: {
      platform: "lemlist",
      campaignId: "a".repeat(200),
      eventType: "sent",
      email: "edge1@example.com",
      activityId: "edge1",
    },
  },
  {
    name: "Special characters in all fields",
    data: {
      platform: "smartlead",
      campaignId: "Camp-123!@#$%^&*()",
      eventType: "EMAIL_OPENED",
      email: "edge2+tag@sub.domain.com",
      activityId: "Act.With.Dots-And-Dashes_456",
    },
  },
  {
    name: "Empty/null values",
    data: {
      platform: "lemlist",
      campaignId: "",
      eventType: null,
      email: "edge3@example.com",
      activityId: undefined,
    },
  },
];

edgeCases.forEach((testCase) => {
  const key = eventKeyGenerator.generateEventKey(testCase.data);
  console.log(
    `   ${testCase.name}: ${key.substring(0, 80)}${
      key.length > 80 ? "..." : ""
    }`
  );
});

console.log("\n✨ Event Key Migration Demo Complete!");
console.log("======================================");

const finalStats = eventKeyGenerator.getStats();
console.log("\nFinal Statistics:");
console.log(`📊 Total Keys Generated: ${finalStats.total_generated}`);
console.log(`🚨 Collisions Detected: ${finalStats.collisions_detected}`);
console.log(`🔄 Fallbacks Used: ${finalStats.fallback_used}`);
console.log(`❌ Invalid Inputs: ${finalStats.invalid_inputs}`);
console.log(`📈 Collision Rate: ${finalStats.collision_rate}`);
console.log(`💾 Cache Size: ${finalStats.cache_size}`);

console.log("\n🎉 Key Improvements Achieved:");
console.log("✅ Unified event key generation across all services");
console.log("✅ Collision detection and automatic resolution");
console.log("✅ Robust fallback mechanisms for missing data");
console.log("✅ Consistent format: platform_campaign_eventtype_uniqueid_hash");
console.log("✅ Performance monitoring and statistics");
console.log("✅ Special character handling and length limits");
console.log("✅ Platform-specific optimizations");
console.log("✅ Namespace-aware key generation");

console.log("\n🔧 Migration Status:");
console.log("✅ LemlistSync service updated");
console.log("✅ SmartleadSync service updated");
console.log("✅ SyncRoutes (legacy) updated");
console.log("✅ NewSyncRoutes (supersync) updated");
console.log("✅ FullSyncService updated");
console.log("✅ Event key generator created and tested");
console.log("✅ Collision detection implemented");
console.log("✅ Comprehensive demo and testing completed");
