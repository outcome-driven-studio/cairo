#!/usr/bin/env node

const logger = require("../utils/logger");

async function diagnosePeriodicSync() {
  console.log("\n🔍 Periodic Sync Diagnostic Tool\n");
  console.log("=" * 50);

  // Check environment variables
  console.log("\n📋 Environment Variables:");
  console.log(
    `  USE_PERIODIC_SYNC: ${process.env.USE_PERIODIC_SYNC || "not set"}`
  );
  console.log(
    `  ENABLE_CRON_JOBS: ${process.env.ENABLE_CRON_JOBS || "not set"}`
  );
  console.log(
    `  SYNC_INTERVAL_HOURS: ${
      process.env.SYNC_INTERVAL_HOURS || "not set (default: 4)"
    }`
  );
  console.log(
    `  RUN_SYNC_ON_START: ${process.env.RUN_SYNC_ON_START || "not set"}`
  );
  console.log(
    `  DISABLE_CRON_JOBS: ${process.env.DISABLE_CRON_JOBS || "not set"}`
  );

  // Check sync-related env vars
  console.log("\n📊 Sync Configuration:");
  console.log(
    `  SYNC_FROM_ATTIO: ${
      process.env.SYNC_FROM_ATTIO || "not set (default: true)"
    }`
  );
  console.log(
    `  SYNC_FROM_LEMLIST: ${
      process.env.SYNC_FROM_LEMLIST || "not set (default: true)"
    }`
  );
  console.log(
    `  SYNC_FROM_SMARTLEAD: ${
      process.env.SYNC_FROM_SMARTLEAD || "not set (default: true)"
    }`
  );
  console.log(
    `  CALCULATE_SCORES: ${
      process.env.CALCULATE_SCORES || "not set (default: true)"
    }`
  );
  console.log(
    `  SYNC_SCORES_TO_ATTIO: ${
      process.env.SYNC_SCORES_TO_ATTIO || "not set (default: true)"
    }`
  );

  // Check API keys
  console.log("\n🔑 API Keys:");
  console.log(
    `  LEMLIST_API_KEY: ${process.env.LEMLIST_API_KEY ? "✓ Set" : "✗ Not set"}`
  );
  console.log(
    `  SMARTLEAD_API_KEY: ${
      process.env.SMARTLEAD_API_KEY ? "✓ Set" : "✗ Not set"
    }`
  );
  console.log(
    `  ATTIO_API_KEY: ${process.env.ATTIO_API_KEY ? "✓ Set" : "✗ Not set"}`
  );

  // Check which mode should be active
  console.log("\n🎯 Expected Behavior:");
  if (process.env.USE_PERIODIC_SYNC === "true") {
    console.log(
      "  ✓ Periodic Sync Service should be active (4-hour intervals)"
    );
    console.log("  ✗ Legacy cron jobs should be disabled");
  } else if (process.env.ENABLE_CRON_JOBS === "true") {
    console.log("  ✗ Periodic Sync Service should be inactive");
    console.log("  ✓ Legacy cron jobs should be active (10-15 min intervals)");
  } else {
    console.log("  ✗ No automatic sync should be running");
    console.log("  ℹ️  Manual sync only mode");
  }

  // Try to check periodic sync status
  console.log("\n🔄 Checking Periodic Sync Service Status...");
  try {
    const { getInstance } = require("../services/periodicSyncService");
    const periodicSync = getInstance();

    const stats = periodicSync.getStats();
    console.log(`  Running: ${stats.isRunning ? "✓ Yes" : "✗ No"}`);
    console.log(`  Sync Interval: ${stats.syncInterval} hours`);
    console.log(`  Total Syncs: ${stats.totalSyncs}`);
    console.log(`  Last Sync: ${stats.lastSyncTime || "Never"}`);
    console.log(
      `  Next Sync: ${
        stats.nextSyncTime ? stats.nextSyncTime.toISOString() : "Not scheduled"
      }`
    );

    if (stats.errors.length > 0) {
      console.log(`  Recent Errors: ${stats.errors.length}`);
      console.log(
        `  Last Error: ${stats.errors[stats.errors.length - 1].error}`
      );
    }
  } catch (error) {
    console.log(`  ❌ Error checking service: ${error.message}`);
  }

  // Provide recommendations
  console.log("\n💡 Recommendations:");
  if (
    process.env.USE_PERIODIC_SYNC !== "true" &&
    process.env.ENABLE_CRON_JOBS !== "true"
  ) {
    console.log("  ⚠️  No automatic sync is configured!");
    console.log(
      "  → Set either USE_PERIODIC_SYNC=true or ENABLE_CRON_JOBS=true"
    );
  }

  if (
    process.env.USE_PERIODIC_SYNC === "true" &&
    process.env.ENABLE_CRON_JOBS === "true"
  ) {
    console.log("  ⚠️  Both sync modes are enabled! This may cause conflicts.");
    console.log(
      "  → Choose one: set either USE_PERIODIC_SYNC or ENABLE_CRON_JOBS, not both"
    );
  }

  if (
    process.env.USE_PERIODIC_SYNC === "true" &&
    !process.env.LEMLIST_API_KEY &&
    !process.env.SMARTLEAD_API_KEY
  ) {
    console.log("  ⚠️  Periodic sync is enabled but no API keys are set!");
    console.log("  → Set LEMLIST_API_KEY and/or SMARTLEAD_API_KEY");
  }

  if (process.env.RUN_SYNC_ON_START !== "true") {
    console.log("  ℹ️  Initial sync on startup is disabled");
    console.log(
      "  → Set RUN_SYNC_ON_START=true to sync immediately on server start"
    );
  }

  console.log("\n" + "=" * 50);
  console.log("Diagnostic complete!\n");
}

// Run diagnostic
diagnosePeriodicSync().catch(console.error);
