const { loadEnv } = require('./src/utils/envLoader');
loadEnv();

const sentry = require('./src/utils/sentry');
const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('./src/utils/logger');
const monitoring = require('./src/utils/monitoring');
const db = require('./src/utils/db');

const app = express();
sentry.initSentry(app);

const PORT = process.env.PORT || 8080;

// ── Health (unauthenticated) ───────────────────────────────────────────
app.get('/health/simple', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'cairo',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
  });
});

app.get('/health', async (req, res) => {
  try {
    const healthStatus = monitoring.getHealthStatus();
    const dbHealth = await db.healthCheck();
    const combined = {
      ...healthStatus,
      database: dbHealth,
      status: dbHealth.healthy ? healthStatus.status : 'unhealthy',
    };
    res.status(combined.status === 'healthy' ? 200 : 503).json(combined);
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

app.get('/health/detailed', async (req, res) => {
  try {
    const healthStatus = monitoring.getHealthStatus();
    const dbHealth = await db.healthCheck();
    res.json({
      ...healthStatus,
      database: dbHealth,
      status: dbHealth.healthy ? healthStatus.status : 'unhealthy',
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// ── Body + CORS + logging ──────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const { rateLimit } = require('./src/middleware/rateLimit');
app.use(rateLimit);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Write-Key'
  );
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    logger[level](`[RESPONSE] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ── Discovery / docs (public) ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Cairo</title>
<style>body{font-family:ui-monospace,Menlo,monospace;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5}
a{color:#2563eb}code{background:#f4f4f5;padding:2px 6px;border-radius:4px}</style>
</head><body>
<h1>Cairo</h1>
<p>Agent-first event tracking. Notifications hand off to agents; agents relay via their own Telegram/Discord/Slack gateways.</p>
<ul>
  <li><a href="/mcp">GET /mcp</a> — MCP discovery</li>
  <li><code>POST /mcp</code> — MCP JSON-RPC</li>
  <li><a href="/llms.txt">GET /llms.txt</a> — agent docs</li>
  <li><a href="/docs">GET /docs</a> — deep dive</li>
  <li><code>POST /v2/track</code> / <code>/api/v2/track</code> — event ingestion</li>
  <li><a href="/health">GET /health</a></li>
</ul>
</body></html>`);
});

app.get('/llms.txt', (req, res) => {
  const file = path.join(__dirname, 'llms.txt');
  if (fs.existsSync(file)) {
    res.type('text/plain').send(fs.readFileSync(file, 'utf8'));
  } else {
    res.status(404).type('text/plain').send('llms.txt not found');
  }
});

app.get('/.well-known/mcp.json', (req, res) => {
  res.json({
    name: 'cairo',
    version: '3.0.0',
    description: 'Agent-first event tracking with notification delivery',
    endpoint: '/mcp',
    transport: 'streamable-http',
  });
});

try {
  const { setup: setupDocs } = require('./src/routes/docsRoutes');
  setupDocs(app);
} catch (e) {
  logger.warn('Docs routes unavailable:', e.message);
}

// ── MCP (primary) ──────────────────────────────────────────────────────
const McpRoutes = require('./src/routes/mcpRoutes');
const mcpRoutes = new McpRoutes();
app.use('/mcp', mcpRoutes.setupRoutes());

// ── REST: /api/v2 and /v2 alias (SDK compatibility) ────────────────────
const SDKRoutes = require('./src/routes/sdkRoutes');
const IdentityRoutes = require('./src/routes/identityRoutes');
const GDPRRoutes = require('./src/routes/gdprRoutes');
const ErrorRoutes = require('./src/routes/errorRoutes');
const AgentTrackingRoutes = require('./src/routes/agentTrackingRoutes');

const sdkRoutes = new SDKRoutes().setupRoutes();
const identityRoutes = new IdentityRoutes().setupRoutes();
const gdprRoutes = new GDPRRoutes().setupRoutes();
const errorRoutes = new ErrorRoutes().setupRoutes();
const agentTrackingRoutes = new AgentTrackingRoutes().setupRoutes();

function mountV2(base) {
  app.use(`${base}`, sdkRoutes);
  app.use(`${base}/identities`, identityRoutes);
  app.use(`${base}`, gdprRoutes);
  app.use(`${base}/errors`, errorRoutes);
  app.use(`${base}/agent`, agentTrackingRoutes);
}

mountV2('/api/v2');
mountV2('/v2'); // SDK packages post to /v2/batch

// ── 404 + errors ───────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    message: 'Cairo is agent-first. Use POST /mcp or /v2/* for events.',
    docs: { landing: 'GET /', docs: 'GET /docs', mcp: 'GET /mcp', llms: 'GET /llms.txt' },
  });
});

app.use(sentry.getErrorHandler());
app.use((err, req, res, next) => {
  logger.error(`Express error: ${err.message}`, { path: req.path });
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    path: req.path,
  });
});

// ── Start ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Cairo listening on http://0.0.0.0:${PORT}`);
  logger.info(`Cairo listening on http://0.0.0.0:${PORT}`);

  try {
    if (process.env.K_SERVICE) {
      const { loadGCPSecrets } = require('./src/utils/envLoader');
      await loadGCPSecrets();
    }

    const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (databaseUrl) {
      const dbHealth = await db.healthCheck();
      if (!dbHealth.healthy) {
        throw new Error(`Database connection failed: ${dbHealth.error}`);
      }
      logger.info('Database connection healthy');
    } else {
      logger.warn('No POSTGRES_URL/DATABASE_URL — running without DB');
    }

    monitoring.startHealthChecks();

    console.log(`
Cairo ready (agent-first)
  POST /mcp              MCP JSON-RPC
  GET  /mcp              Discovery
  GET  /llms.txt         Agent docs
  POST /v2/track         Track event (also /api/v2/track)
  POST /v2/batch         Batch ingest
  GET  /health
`);
  } catch (error) {
    logger.error('FATAL: Failed to initialize:', error);
    console.error(`Startup failed: ${error.message}`);
    process.exit(1);
  }
});

async function gracefulShutdown() {
  try {
    server.close(() => logger.info('HTTP server closed'));
    await db.close();
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown error:', error);
    process.exit(1);
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = app;
