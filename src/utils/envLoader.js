const fs = require("fs");
const path = require("path");

/**
 * Environment Variable Loader
 * 
 * Loads environment variables with priority:
 * 1. Process environment variables (Railway/GCP/cloud) - highest priority
 * 2. GCP Secret Manager (if running on Cloud Run) - loaded separately via loadGCPSecrets()
 * 3. .env.local (for local development)
 * 4. .env (fallback for local)
 * 
 * In production/cloud (Railway/GCP), environment variables are provided directly,
 * so .env files are not loaded.
 * 
 * Note: GCP secrets are loaded asynchronously via loadGCPSecrets() which should
 * be called before server startup.
 */
function loadEnv() {
  const isProduction = process.env.NODE_ENV === "production";
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;
  const isGCP = !!process.env.K_SERVICE; // Cloud Run sets K_SERVICE
  
  // In production/cloud (Railway/GCP), use environment variables directly
  // Don't load .env files as they may contain outdated values
  // GCP secrets are loaded separately via loadGCPSecrets()
  if (isProduction || isRailway || isGCP) {
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

/**
 * Load GCP secrets from Secret Manager (async)
 * Should be called before server startup when running on Cloud Run
 */
async function loadGCPSecrets() {
  const isGCP = !!process.env.K_SERVICE; // Cloud Run sets K_SERVICE
  
  if (!isGCP) {
    return; // Not running on Cloud Run
  }
  
  try {
    const {loadSecrets} = require('./gcpSecrets');
    await loadSecrets();
  } catch (error) {
    console.warn('Failed to load GCP secrets:', error.message);
    // Continue without secrets - they may be set via environment variables
  }
}

module.exports = {
  loadEnv,
  loadGCPSecrets,
};
