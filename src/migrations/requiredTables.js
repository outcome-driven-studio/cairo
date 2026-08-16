/**
 * Tables the current agent-first app requires.
 * Used by the healing migration, migrate runner, and diagnostics.
 */
const REQUIRED_TABLES = [
  "event_source",
  "playmaker_user_source",
  "write_keys",
  "user_channels",
  "notification_rules",
  "notifications",
  "agent_endpoints",
  "identity_graph",
  "raw_events",
  "user_suppressions",
  "deletion_audit_log",
  "error_groups",
  "error_events",
  "agent_sessions",
];

async function ensurePgcrypto(query) {
  try {
    await query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  } catch (_) {
    // PG 13+ has gen_random_uuid() in core. Managed hosts (Cloud SQL, RDS)
    // often deny CREATE EXTENSION to the app role.
  }
}

async function verifyRequiredTables(query) {
  const result = await query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [REQUIRED_TABLES]
  );
  const existing = new Set(result.rows.map((r) => r.table_name));
  return REQUIRED_TABLES.filter((name) => !existing.has(name));
}

module.exports = {
  REQUIRED_TABLES,
  ensurePgcrypto,
  verifyRequiredTables,
};
