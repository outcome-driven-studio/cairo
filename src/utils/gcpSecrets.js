const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');

let client = null;

/**
 * Initialize Secret Manager client (only if running on GCP)
 */
function getClient() {
  if (!client && process.env.K_SERVICE) {
    // Running on Cloud Run
    try {
      client = new SecretManagerServiceClient();
    } catch (error) {
      console.warn('Failed to initialize Secret Manager client:', error.message);
      return null;
    }
  }
  return client;
}

/**
 * Load a secret from Google Secret Manager
 * @param {string} secretName - Name of the secret
 * @returns {Promise<string>} Secret value
 */
async function loadSecret(secretName) {
  const secretClient = getClient();
  if (!secretClient) {
    // Not on GCP or client failed to initialize
    return process.env[secretName] || '';
  }

  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      console.warn(`Cannot load secret ${secretName}: GOOGLE_CLOUD_PROJECT not set`);
      return process.env[secretName] || '';
    }

    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({name});
    return version.payload.data.toString();
  } catch (error) {
    console.warn(`Error loading secret ${secretName}:`, error.message);
    // Fallback to environment variable
    return process.env[secretName] || '';
  }
}

/**
 * Load all secrets from Secret Manager and set them as environment variables
 * This should be called early in the application startup
 */
async function loadSecrets() {
  // Only load secrets if running on Cloud Run
  if (!process.env.K_SERVICE) {
    return; // Not running on Cloud Run, skip
  }

  console.log('[GCP] Loading secrets from Secret Manager...');

  const secrets = {
    GEMINI_API_KEY: 'gemini-api-key',
    APOLLO_API_KEY: 'apollo-api-key',
    HUNTER_API_KEY: 'hunter-api-key',
    LEMLIST_API_KEY: 'lemlist-api-key',
    SMARTLEAD_API_KEY: 'smartlead-api-key',
    ATTIO_API_KEY: 'attio-api-key',
    MIXPANEL_PROJECT_TOKEN: 'mixpanel-token',
    MIXPANEL_API_SECRET: 'mixpanel-api-secret',
    SENTRY_DSN: 'sentry-dsn',
    SLACK_WEBHOOK_URL: 'slack-webhook-url',
    DISCORD_WEBHOOK_URL: 'discord-webhook-url',
    DB_PASSWORD: 'db-password',
  };

  const loaded = {};

  // Cloud Run injects secrets via --set-secrets; skip API calls when already set to avoid timeouts
  const alreadySet = Object.keys(secrets).filter((envVar) => process.env[envVar]);
  if (alreadySet.length > 0) {
    alreadySet.forEach((envVar) => { loaded[envVar] = true; });
    console.log('[GCP] Using secrets from environment (Cloud Run --set-secrets)');
  }

  const toFetch = Object.entries(secrets).filter(([envVar]) => !process.env[envVar]);
  if (toFetch.length === 0) {
    const loadedCount = Object.keys(loaded).length;
    console.log(`[GCP] Loaded ${loadedCount} secrets from environment`);
    return;
  }

  // Load missing secrets from Secret Manager (with timeout to avoid DEADLINE_EXCEEDED on cold start)
  const fetchTimeoutMs = 15000;
  await Promise.all(
    toFetch.map(([envVar, secretName]) =>
      Promise.race([
        loadSecret(secretName).then((value) => {
          if (value) {
            process.env[envVar] = value;
            loaded[envVar] = true;
          }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), fetchTimeoutMs)
        ),
      ]).catch((err) => {
        if (err.message !== 'timeout') console.warn(`Error loading secret ${secretName}:`, err.message);
      })
    )
  );

  // Construct database URL if we have the password
  if (loaded.DB_PASSWORD && process.env.INSTANCE_CONNECTION_NAME) {
    const dbPassword = process.env.DB_PASSWORD;
    const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
    const dbName = process.env.DB_NAME || 'cairo_db';
    const dbUser = process.env.DB_USER || 'cairo_app';

    // Cloud SQL Unix socket connection
    process.env.POSTGRES_URL = 
      `postgresql://${dbUser}:${dbPassword}@/${dbName}?host=/cloudsql/${instanceConnectionName}`;
    
    // Also set DATABASE_URL for compatibility
    process.env.DATABASE_URL = process.env.POSTGRES_URL;

    console.log('[GCP] Database URL constructed from secrets');
  }

  const loadedCount = Object.values(loaded).filter(Boolean).length;
  console.log(`[GCP] Loaded ${loadedCount} secrets from Secret Manager`);
}

module.exports = {
  loadSecret,
  loadSecrets,
  getClient,
};
