#!/usr/bin/env node

const args = process.argv.slice(2);

// Parse flags
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    flags.port = args[++i];
  } else if (args[i] === '--headless') {
    flags.headless = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    flags.help = true;
  } else if (args[i] === '--version' || args[i] === '-v') {
    flags.version = true;
  } else if (args[i] === 'migrate') {
    flags.migrate = true;
  }
}

if (flags.version) {
  const pkg = require('../package.json');
  console.log(pkg.version);
  process.exit(0);
}

if (flags.help) {
  console.log(`
cairo-cdp - Headless customer data platform with MCP, error tracking, and agent observability

Usage:
  cairo-cdp [options]
  cairo-cdp migrate

Options:
  --port, -p <port>   Port to listen on (default: 8080, or PORT env var)
  --headless           Disable UI serving (same as SERVE_UI=false)
  --help, -h           Show this help
  --version, -v        Show version

Commands:
  migrate              Run database migrations

Environment variables:
  PORT                 Server port (default: 8080)
  POSTGRES_URL         PostgreSQL connection string (required)
  SERVE_UI             Set to "false" for headless mode (no UI)
  SENTRY_DSN           Sentry DSN for error monitoring
  DISCORD_WEBHOOK_URL  Discord webhook for notifications
  SLACK_WEBHOOK_URL    Slack webhook for notifications

Examples:
  npx cairo-cdp --headless --port 3000
  npx cairo-cdp migrate
  POSTGRES_URL=postgres://... npx cairo-cdp
`);
  process.exit(0);
}

// Apply flags to env before loading server
if (flags.port) process.env.PORT = flags.port;
if (flags.headless) process.env.SERVE_UI = 'false';

if (flags.migrate) {
  const { runMigrations } = require('../src/migrations/run_migrations');
  runMigrations()
    .then(() => {
      console.log('Migrations completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
} else {
  require('../server');
}
