const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

let client = null;

function getClient() {
  if (!client && process.env.K_SERVICE) {
    try {
      client = new SecretManagerServiceClient();
    } catch (error) {
      console.warn(
        "Failed to initialize Secret Manager client:",
        error.message
      );
      return null;
    }
  }
  return client;
}

async function loadSecret(secretName) {
  const secretClient = getClient();
  if (!secretClient) {
    return process.env[secretName] || "";
  }

  try {
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      console.warn(
        `Cannot load secret ${secretName}: GOOGLE_CLOUD_PROJECT not set`
      );
      return process.env[secretName] || "";
    }

    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    return version.payload.data.toString();
  } catch (error) {
    console.warn(`Error loading secret ${secretName}:`, error.message);
    return process.env[secretName] || "";
  }
}

async function loadSecrets() {
  if (!process.env.K_SERVICE) {
    return;
  }

  console.log("[GCP] Loading secrets from Secret Manager...");

  const secrets = {
    SENTRY_DSN: "sentry-dsn",
    DB_PASSWORD: "db-password",
  };

  const loaded = {};
  const alreadySet = Object.keys(secrets).filter((envVar) => process.env[envVar]);
  if (alreadySet.length > 0) {
    alreadySet.forEach((envVar) => {
      loaded[envVar] = true;
    });
    console.log("[GCP] Using secrets from environment (Cloud Run --set-secrets)");
  }

  const toFetch = Object.entries(secrets).filter(
    ([envVar]) => !process.env[envVar]
  );
  if (toFetch.length === 0) {
    console.log(`[GCP] Loaded ${Object.keys(loaded).length} secrets from environment`);
    return;
  }

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
          setTimeout(() => reject(new Error("timeout")), fetchTimeoutMs)
        ),
      ]).catch((err) => {
        if (err.message !== "timeout") {
          console.warn(`Error loading secret ${secretName}:`, err.message);
        }
      })
    )
  );

  if (loaded.DB_PASSWORD && process.env.INSTANCE_CONNECTION_NAME) {
    const dbPassword = process.env.DB_PASSWORD;
    const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
    const dbName = process.env.DB_NAME || "cairo_db";
    const dbUser = process.env.DB_USER || "cairo_app";

    process.env.POSTGRES_URL = `postgresql://${dbUser}:${dbPassword}@/${dbName}?host=/cloudsql/${instanceConnectionName}`;
    process.env.DATABASE_URL = process.env.POSTGRES_URL;
    console.log("[GCP] Database URL constructed from secrets");
  }

  const loadedCount = Object.values(loaded).filter(Boolean).length;
  console.log(`[GCP] Loaded ${loadedCount} secrets from Secret Manager`);
}

module.exports = {
  loadSecret,
  loadSecrets,
  getClient,
};
