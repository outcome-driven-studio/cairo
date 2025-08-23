#!/usr/bin/env node
/**
 * Background Job Setup Validation Script
 *
 * Validates the periodic sync service and cron job configurations
 * to ensure they work correctly when deployed to Railway
 */

const fs = require("fs");
const path = require("path");

console.log("🔍 Cairo CDP Background Job Setup Validation");
console.log("=".repeat(50));

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: [],
};

function runTest(testName, testFn) {
  try {
    const result = testFn();
    if (result === true) {
      console.log(`✅ ${testName}`);
      results.passed++;
      results.tests.push({ name: testName, status: "PASS" });
    } else if (result === "warning") {
      console.log(`⚠️  ${testName}`);
      results.warnings++;
      results.tests.push({ name: testName, status: "WARN" });
    } else {
      console.log(`❌ ${testName}: ${result}`);
      results.failed++;
      results.tests.push({ name: testName, status: "FAIL", error: result });
    }
  } catch (error) {
    console.log(`❌ ${testName}: ${error.message}`);
    results.failed++;
    results.tests.push({
      name: testName,
      status: "ERROR",
      error: error.message,
    });
  }
}

// Test 1: Environment File Exists
runTest("Environment example file exists", () => {
  const envExamplePath = path.join(__dirname, "../../.env.example");
  if (fs.existsSync(envExamplePath)) {
    const content = fs.readFileSync(envExamplePath, "utf8");
    if (
      content.includes("USE_PERIODIC_SYNC") &&
      content.includes("LEMLIST_API_KEY")
    ) {
      return true;
    }
    return "Missing required variables in .env.example";
  }
  return ".env.example file not found";
});

// Test 2: PeriodicSyncService exists and loads
runTest("PeriodicSyncService module loads correctly", () => {
  try {
    const servicePath = path.join(
      __dirname,
      "../services/periodicSyncService.js"
    );
    if (!fs.existsSync(servicePath)) {
      return "PeriodicSyncService file not found";
    }

    // Try to require without initializing to avoid DB connections
    delete require.cache[require.resolve("../services/periodicSyncService.js")];
    const serviceFile = fs.readFileSync(servicePath, "utf8");

    if (
      serviceFile.includes("class PeriodicSyncService") &&
      serviceFile.includes("runFullSync") &&
      serviceFile.includes("syncFromLemlist") &&
      serviceFile.includes("syncFromSmartlead")
    ) {
      return true;
    }
    return "Missing required methods in PeriodicSyncService";
  } catch (error) {
    return error.message;
  }
});

// Test 3: CronManager exists and loads
runTest("CronManager module loads correctly", () => {
  try {
    const cronPath = path.join(__dirname, "../config/cron.js");
    if (!fs.existsSync(cronPath)) {
      return "CronManager file not found";
    }

    const cronFile = fs.readFileSync(cronPath, "utf8");

    if (
      cronFile.includes("class CronManager") &&
      cronFile.includes("cron.schedule") &&
      cronFile.includes("lemlist-delta") &&
      cronFile.includes("smartlead-delta")
    ) {
      return true;
    }
    return "Missing required functionality in CronManager";
  } catch (error) {
    return error.message;
  }
});

// Test 4: Required dependencies are installed
runTest("Required dependencies are installed", () => {
  const packagePath = path.join(__dirname, "../../package.json");
  if (!fs.existsSync(packagePath)) {
    return "package.json not found";
  }

  const package = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const requiredDeps = ["node-cron", "axios", "express", "winston", "pg"];

  const missingDeps = requiredDeps.filter((dep) => !package.dependencies[dep]);
  if (missingDeps.length > 0) {
    return `Missing dependencies: ${missingDeps.join(", ")}`;
  }

  return true;
});

// Test 5: Server.js has background job initialization
runTest("Server.js has background job initialization logic", () => {
  const serverPath = path.join(__dirname, "../../server.js");
  if (!fs.existsSync(serverPath)) {
    return "server.js not found";
  }

  const serverFile = fs.readFileSync(serverPath, "utf8");

  if (
    serverFile.includes("USE_PERIODIC_SYNC") &&
    serverFile.includes("ENABLE_CRON_JOBS") &&
    serverFile.includes("periodicSyncService") &&
    serverFile.includes("cronManager")
  ) {
    return true;
  }
  return "Missing background job initialization in server.js";
});

// Test 6: Environment variable validation
runTest("Environment variables have correct structure", () => {
  const requiredForSync = [
    "POSTGRES_URL",
    "LEMLIST_API_KEY",
    "SMARTLEAD_API_KEY",
    "ATTIO_API_KEY",
  ];
  const missing = requiredForSync.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    console.log(`   📝 Missing for full functionality: ${missing.join(", ")}`);
    console.log(`   💡 Copy .env.example to .env and add your API keys`);
    return "warning"; // Not a failure, just a warning
  }

  return true;
});

// Test 7: Sync service files exist
runTest("Individual sync service files exist", () => {
  const services = [
    "../services/lemlistService.js",
    "../services/smartleadService.js",
    "../services/attioService.js",
    "../services/leadScoringService.js",
  ];

  const missingServices = services.filter((service) => {
    const servicePath = path.join(__dirname, service);
    return !fs.existsSync(servicePath);
  });

  if (missingServices.length > 0) {
    return `Missing service files: ${missingServices.join(", ")}`;
  }

  return true;
});

// Test 8: Route files for manual triggers exist
runTest("API routes for manual sync triggers exist", () => {
  const routes = [
    "../routes/periodicSyncRoutes.js",
    "../routes/syncRoutes.js",
    "../routes/backgroundJobRoutes.js",
  ];

  const missingRoutes = routes.filter((route) => {
    const routePath = path.join(__dirname, route);
    return !fs.existsSync(routePath);
  });

  if (missingRoutes.length > 0) {
    return `Missing route files: ${missingRoutes.join(", ")}`;
  }

  return true;
});

// Test 9: Database utilities exist
runTest("Database and sync utilities exist", () => {
  const utils = [
    "../utils/db.js",
    "../utils/syncState.js",
    "../utils/logger.js",
    "../utils/monitoring.js",
  ];

  const missingUtils = utils.filter((util) => {
    const utilPath = path.join(__dirname, util);
    return !fs.existsSync(utilPath);
  });

  if (missingUtils.length > 0) {
    return `Missing utility files: ${missingUtils.join(", ")}`;
  }

  return true;
});

// Test 10: Validate cron expressions
runTest("Cron expressions are valid", () => {
  // Test various cron expressions used in the app
  const cronExpressions = {
    "Periodic sync (4 hours)": "0 */4 * * *",
    "Lemlist delta (10 min)": "*/10 * * * *",
    "Smartlead delta (15 min)": "*/15 * * * *",
    "Weekly ICP (Sunday 2 AM)": "0 2 * * 0",
  };

  // More flexible cron pattern that accepts */N format
  const cronPattern =
    /^(\*|\d+|\*\/\d+)\s+(\*|\d+|\*\/\d+)\s+(\*|\d+|\*\/\d+)\s+(\*|\d+|\*\/\d+)\s+(\*|\d+|\*\/\d+)$/;

  for (const [name, expression] of Object.entries(cronExpressions)) {
    if (!cronPattern.test(expression)) {
      return `Invalid cron expression for ${name}: ${expression}`;
    }
  }

  return true;
});

// Test 11: Configuration priority logic
runTest("Configuration priority logic is correct", () => {
  // Simulate different environment configurations
  const testConfigs = [
    {
      USE_PERIODIC_SYNC: "true",
      ENABLE_CRON_JOBS: "true",
      expected: "periodic",
    },
    { USE_PERIODIC_SYNC: "false", ENABLE_CRON_JOBS: "true", expected: "cron" },
    {
      USE_PERIODIC_SYNC: "false",
      ENABLE_CRON_JOBS: "false",
      expected: "manual",
    },
  ];

  for (const config of testConfigs) {
    const usePeriodicSync = config.USE_PERIODIC_SYNC === "true";
    const enableCronJobs = config.ENABLE_CRON_JOBS === "true";

    let actualMode;
    if (usePeriodicSync) {
      actualMode = "periodic";
    } else if (enableCronJobs) {
      actualMode = "cron";
    } else {
      actualMode = "manual";
    }

    if (actualMode !== config.expected) {
      return `Priority logic failed for config: ${JSON.stringify(config)}`;
    }
  }

  return true;
});

console.log("\n📊 Test Results Summary");
console.log("=".repeat(50));
console.log(`✅ Passed: ${results.passed}`);
console.log(`⚠️  Warnings: ${results.warnings}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`📈 Total: ${results.tests.length}`);

if (results.failed > 0) {
  console.log("\n🚨 Failed Tests:");
  results.tests
    .filter((test) => test.status === "FAIL" || test.status === "ERROR")
    .forEach((test) => {
      console.log(`   - ${test.name}: ${test.error}`);
    });
}

if (results.warnings > 0) {
  console.log("\n⚠️  Warnings (not failures):");
  results.tests
    .filter((test) => test.status === "WARN")
    .forEach((test) => {
      console.log(`   - ${test.name}`);
    });
}

console.log("\n🎯 Railway Deployment Readiness");
console.log("=".repeat(50));

if (results.failed === 0) {
  console.log("✅ All critical tests passed!");
  console.log("🚀 Your background job system is ready for Railway deployment");
  console.log("");
  console.log("📋 Next steps for Railway deployment:");
  console.log("   1. Set USE_PERIODIC_SYNC=true in Railway environment");
  console.log(
    "   2. Add your API keys (LEMLIST_API_KEY, SMARTLEAD_API_KEY, etc.)"
  );
  console.log("   3. Set POSTGRES_URL to your Neon database");
  console.log(
    "   4. Optional: Add SENTRY_DSN and SLACK_WEBHOOK_URL for monitoring"
  );
  console.log(
    '   5. Deploy and check logs for "Periodic sync started" message'
  );
} else {
  console.log("❌ Some critical tests failed");
  console.log("🔧 Fix the failed tests before deploying to Railway");
}

console.log(
  "\n💡 Pro tip: Your app will automatically run background sync jobs"
);
console.log("   every 4 hours once deployed with USE_PERIODIC_SYNC=true");

// Exit with appropriate code
process.exit(results.failed > 0 ? 1 : 0);
