#!/usr/bin/env node

const { loadEnv } = require('../src/utils/envLoader');
loadEnv();

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('-'));
const flags = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') flags.port = args[++i];
  else if (args[i] === '--help' || args[i] === '-h') flags.help = true;
  else if (args[i] === '--version' || args[i] === '-v') flags.version = true;
  else if (args[i] === '--name' || args[i] === '-n') flags.name = args[++i];
  else if (args[i] === '--key') flags.key = args[++i];
  else if (args[i] === '--id') flags.id = args[++i];
  else if (args[i] === '--host') flags.host = args[++i];
  else if (args[i] === '--agent-id') flags.agentId = args[++i];
}

if (flags.version) {
  console.log(require('../package.json').version);
  process.exit(0);
}

if (flags.help) {
  console.log(`
cairo - Agent-first event tracking

Usage:
  cairo [options]
  cairo migrate
  cairo create-write-key [--name <name>] [--key <value>]
  cairo list-write-keys
  cairo revoke-write-key --id <id-or-key>
  cairo agent-config [--host <url>] [--agent-id <id>] [--name <key-name>] [--key <value>]

Options:
  --port, -p <port>   Port to listen on (default: 8080)
  --help, -h
  --version, -v

Environment:
  POSTGRES_URL              PostgreSQL connection string (required)
  NODE_ENV=production       Enforce write keys (no bootstrap)
  CAIRO_REQUIRE_WRITE_KEYS  Force write-key enforcement in any env
  CAIRO_RATE_LIMIT          Requests per window (default 120)
  CAIRO_RATE_WINDOW_MS      Window size ms (default 60000)
  CAIRO_WEBHOOK_RETRIES     Agent webhook push retries (default 3)
  BASE_URL / CAIRO_PUBLIC_URL  Public host used in agent-config output

Examples:
  POSTGRES_URL=postgres://... npx cairo migrate
  POSTGRES_URL=postgres://... npx cairo create-write-key --name prod
  POSTGRES_URL=postgres://... npx cairo agent-config --host https://cairo.example --agent-id my-agent
  POSTGRES_URL=postgres://... npx cairo --port 8080
`);
  process.exit(0);
}

if (flags.port) process.env.PORT = flags.port;

async function withDb(fn) {
  const db = require('../src/utils/db');
  try {
    await fn();
  } finally {
    try { await db.close(); } catch (_) { /* */ }
  }
}

if (command === 'migrate') {
  const { runMigrations } = require('../src/migrations/run_migrations');
  runMigrations()
    .then(() => { console.log('Migrations completed successfully.'); process.exit(0); })
    .catch((err) => { console.error('Migration failed:', err.message); process.exit(1); });
} else if (command === 'create-write-key') {
  withDb(async () => {
    const { createWriteKey } = require('../src/middleware/auth');
    const row = await createWriteKey({ name: flags.name || 'default', key: flags.key });
    console.log('Write key created:');
    console.log(`  id:   ${row.id}`);
    console.log(`  name: ${row.name}`);
    console.log(`  key:  ${row.key}`);
    console.log('\nStore this key securely — it is shown only once in full.');
  }).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
} else if (command === 'list-write-keys') {
  withDb(async () => {
    const { listWriteKeys } = require('../src/middleware/auth');
    const rows = await listWriteKeys();
    if (!rows.length) {
      console.log('No write keys. Create one with: cairo create-write-key --name prod');
      return;
    }
    for (const r of rows) {
      const status = r.revoked_at ? `revoked@${r.revoked_at.toISOString?.() || r.revoked_at}` : 'active';
      console.log(`${r.id}  ${r.key_prefix}  ${r.name || '-'}  ${status}`);
    }
  }).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
} else if (command === 'revoke-write-key') {
  if (!flags.id) {
    console.error('--id <id-or-key> required');
    process.exit(1);
  }
  withDb(async () => {
    const { revokeWriteKey } = require('../src/middleware/auth');
    const row = await revokeWriteKey(flags.id);
    if (!row) {
      console.error('Key not found or already revoked');
      process.exit(1);
    }
    console.log(`Revoked: ${row.id} (${row.name || 'unnamed'})`);
  }).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
} else if (command === 'agent-config') {
  withDb(async () => {
    const { createWriteKey } = require('../src/middleware/auth');
    const host = (flags.host || process.env.BASE_URL || process.env.CAIRO_PUBLIC_URL || 'https://your-cairo-instance.com')
      .replace(/\/$/, '');
    const agentId = flags.agentId || 'my-agent';
    const keyName = flags.name || `agent-${agentId}`;
    const row = await createWriteKey({ name: keyName, key: flags.key });

    const config = {
      mcpServers: {
        cairo: {
          command: 'npx',
          args: ['-y', '@ani-hq/cairo-mcp'],
          env: {
            CAIRO_HOST: host,
            CAIRO_WRITE_KEY: row.key,
            CAIRO_AGENT_ID: agentId,
          },
        },
      },
    };

    console.log('Agent write key created (store securely — shown once):');
    console.log(`  id:   ${row.id}`);
    console.log(`  name: ${row.name}`);
    console.log(`  key:  ${row.key}`);
    console.log('');
    console.log('Paste this into Cursor / Claude Code / OpenClaw MCP settings:');
    console.log('');
    console.log(JSON.stringify(config, null, 2));
    console.log('');
    console.log('Then tell your agent:');
    console.log('  "Set up tracking for <product>; notify me on signup, checkout, and errors."');
    console.log('It will call setup_product, then drain_notifications to relay via its gateway.');
  }).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
} else if (command) {
  console.error(`Unknown command: ${command}. Try --help`);
  process.exit(1);
} else {
  require('../server');
}
