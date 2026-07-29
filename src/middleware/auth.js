const { query } = require('../utils/db');
const logger = require('../utils/logger');

/**
 * Validate write key against the write_keys table.
 * Accepts X-Write-Key header or Authorization: Bearer <key>.
 *
 * Bootstrap: if write_keys table is empty (or missing), any non-empty key
 * is accepted so first-run setup is not locked out. Once at least one key
 * exists, validation is enforced.
 */
let _cache = { keys: new Set(), loadedAt: 0 };
const CACHE_TTL_MS = 60_000;

async function loadWriteKeys() {
  const now = Date.now();
  if (now - _cache.loadedAt < CACHE_TTL_MS && _cache.keys.size >= 0) {
    return _cache;
  }
  try {
    const result = await query(
      `SELECT key FROM write_keys WHERE revoked_at IS NULL`
    );
    _cache = {
      keys: new Set(result.rows.map((r) => r.key)),
      loadedAt: now,
      empty: result.rows.length === 0,
    };
  } catch (err) {
    // Table may not exist yet during first boot
    logger.warn('[auth] write_keys lookup failed:', err.message);
    _cache = { keys: new Set(), loadedAt: now, empty: true, error: true };
  }
  return _cache;
}

function extractWriteKey(req) {
  return (
    req.headers['x-write-key'] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
    null
  );
}

async function requireWriteKey(req, res, next) {
  const writeKey = extractWriteKey(req);

  if (!writeKey) {
    return res.status(401).json({
      success: false,
      error: 'Missing write key. Pass X-Write-Key header or Bearer token.',
    });
  }

  const cache = await loadWriteKeys();

  // Bootstrap / fail-open when no keys configured yet
  if (cache.empty) {
    req.writeKey = writeKey;
    return next();
  }

  if (!cache.keys.has(writeKey)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid write key',
    });
  }

  req.writeKey = writeKey;
  next();
}

/** MCP variant — JSON-RPC error shape */
async function requireWriteKeyMcp(req, res, next) {
  const writeKey = extractWriteKey(req);

  if (!writeKey) {
    return res.status(401).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32000,
        message: 'Missing write key. Pass X-Write-Key header or Bearer token.',
      },
    });
  }

  const cache = await loadWriteKeys();
  if (!cache.empty && !cache.keys.has(writeKey)) {
    return res.status(401).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Invalid write key' },
    });
  }

  req.writeKey = writeKey;
  next();
}

function invalidateWriteKeyCache() {
  _cache = { keys: new Set(), loadedAt: 0 };
}

module.exports = {
  requireWriteKey,
  requireWriteKeyMcp,
  extractWriteKey,
  invalidateWriteKeyCache,
  loadWriteKeys,
};
