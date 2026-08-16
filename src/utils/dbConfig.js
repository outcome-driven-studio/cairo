/**
 * Vendor-agnostic PostgreSQL pool config.
 * Works with Cloud SQL, RDS, self-hosted, or any other Postgres.
 * Override via PGSSLMODE / PG_POOL_MAX / PG_POOL_MIN (or DB_POOL_* aliases).
 */

function sanitizeConnectionString(raw) {
  if (!raw) return raw;
  let s = String(raw);
  // node-postgres does not accept channel_binding (some hosts append it)
  s = s.replace(/([?&])channel_binding=[^&]*/gi, "$1");
  s = s.replace(/\?&/, "?");
  s = s.replace(/[?&]+$/, "");
  s = s.replace(/&&+/g, "&");
  return s;
}

function isLocalOrSocket(connectionString) {
  const s = connectionString || "";
  if (s.includes("/cloudsql/")) return true;
  if (/[?&]host=\//.test(s)) return true;
  try {
    const u = new URL(s.replace(/^postgresql:/i, "http:"));
    const host = (u.hostname || "").toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true;
    }
  } catch (_) {
    if (
      s.includes("localhost") ||
      s.includes("127.0.0.1") ||
      s.includes("::1")
    ) {
      return true;
    }
  }
  return false;
}

function resolveSsl(connectionString, env = process.env) {
  const mode = String(env.PGSSLMODE || env.DB_SSLMODE || "").toLowerCase();
  if (mode === "disable") return false;
  if (mode === "require" || mode === "verify-ca" || mode === "verify-full") {
    return { rejectUnauthorized: true };
  }
  if (mode === "no-verify" || mode === "allow" || mode === "prefer") {
    return { rejectUnauthorized: false };
  }
  if (isLocalOrSocket(connectionString)) return false;
  // Remote TCP: SSL on, don't require a vendor CA bundle
  return { rejectUnauthorized: false };
}

function intEnv(env, keys, fallback) {
  for (const key of keys) {
    if (env[key] !== undefined && env[key] !== "") {
      const n = parseInt(env[key], 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return fallback;
}

function buildPoolConfig(connectionString, env = process.env) {
  const sanitized = sanitizeConnectionString(connectionString);
  const ssl = resolveSsl(sanitized, env);

  return {
    connectionString: sanitized,
    ssl,
    max: intEnv(env, ["PG_POOL_MAX", "DB_POOL_MAX"], 10),
    min: intEnv(env, ["PG_POOL_MIN", "DB_POOL_MIN"], 0),
    idleTimeoutMillis: intEnv(env, ["DB_POOL_IDLE_TIMEOUT"], 30000),
    connectionTimeoutMillis: intEnv(env, ["DB_POOL_CONNECTION_TIMEOUT"], 15000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    application_name: env.PGAPPNAME || "cairo",
  };
}

function isRetryableDbError(error) {
  if (!error) return false;
  const codes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EPIPE",
    "53300", // too_many_connections
    "57P01", // admin_shutdown
    "08000",
    "08001",
    "08006",
  ]);
  if (error.code && codes.has(String(error.code))) return true;

  const message = String(error.message || "").toLowerCase();
  return [
    "connection terminated",
    "connection ended unexpectedly",
    "client has encountered a connection error",
    "connection is closed",
    "server closed the connection unexpectedly",
    "connection pool exhausted",
    "too many clients already",
    "server is not ready",
    "connection limit exceeded",
  ].some((msg) => message.includes(msg));
}

module.exports = {
  sanitizeConnectionString,
  isLocalOrSocket,
  resolveSsl,
  buildPoolConfig,
  isRetryableDbError,
};
