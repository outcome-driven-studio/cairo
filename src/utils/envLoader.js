const fs = require("fs");
const path = require("path");

/**
 * Environment Variable Loader
 * 
 * Loads environment variables with priority:
 * 1. Process environment variables (Railway/cloud) - highest priority
 * 2. .env.local (for local development)
 * 3. .env (fallback for local)
 * 
 * In production/cloud (Railway), environment variables are provided directly,
 * so .env files are not loaded.
 */
function loadEnv() {
  const isProduction = process.env.NODE_ENV === "production";
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;
  
  // In production/cloud (Railway), use environment variables directly
  // Don't load .env files as they may contain outdated values
  if (isProduction || isRailway) {
    return;
  }

  // Local development: load .env files
  const rootDir = path.resolve(__dirname, "../..");
  const envLocalPath = path.join(rootDir, ".env.local");
  const envPath = path.join(rootDir, ".env");

  // Load .env first (base configuration)
  // Use override: false so we don't override any existing process.env values
  if (fs.existsSync(envPath)) {
    const envConfig = require("dotenv").config({ path: envPath, override: false });
    if (envConfig.error && envConfig.error.code !== "ENOENT") {
      console.warn("Warning: Error loading .env file:", envConfig.error.message);
    }
  }

  // Load .env.local (overrides .env values, but won't override existing process.env)
  // Use override: true so .env.local values override .env values
  // But since we check for Railway first, process.env from Railway won't be overridden
  if (fs.existsSync(envLocalPath)) {
    const envLocalConfig = require("dotenv").config({ path: envLocalPath, override: true });
    if (envLocalConfig.error && envLocalConfig.error.code !== "ENOENT") {
      console.warn("Warning: Error loading .env.local file:", envLocalConfig.error.message);
    }
  }

  // If neither exists, try default .env (backward compatibility)
  if (!fs.existsSync(envLocalPath) && !fs.existsSync(envPath)) {
    require("dotenv").config();
  }
}

module.exports = {
  loadEnv,
};
