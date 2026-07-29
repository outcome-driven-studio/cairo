const crypto = require('crypto');
const { query } = require('../utils/db');
const logger = require('../utils/logger');

/**
 * Validate write key against the write_keys table.
 * Accepts X-Write-Key header or Authorization: Bearer <key>.
 *
 * Bootstrap (dev only): if write_keys is empty, any non-empty key is accepted
 * unless NODE_ENV=production or CAIRO_REQUIRE_WRITE_KEYS=true.
 */
let _cache = { keys: new Set(), loadedAt: 0, empty: true };
const CACHE_TTL_MS = 30_000;

function requireKeysEnforced() {
  return (
    process.env.CAIRO_REQUIRE_WRITE_KEYS === 'true' ||
    process.env.NODE_ENV === 'production'
  );
}

async function loadWriteKeys() {
  const now = Date.now();
  if (now - _cache.loadedAt < CACHE_TTL_MS) {
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

function generateWriteKey() {
  return `ck_${crypto.randomBytes(24).toString('hex')}`;
}

async function createWriteKey({ name = 'default', key } = {}) {
  const value = key || generateWriteKey();
  const result = await query(
    `INSERT INTO write_keys (key, name) VALUES ($1, $2) RETURNING id, key, name, created_at`,
    [value, name]
  );
  invalidateWriteKeyCache();
  return result.rows[0];
}

async function listWriteKeys() {
  const result = await query(
    `SELECT id, name, created_at, revoked_at,
            LEFT(key, 8) || '…' AS key_prefix
     FROM write_keys
     ORDER BY created_at DESC`
  );
  return result.rows;
}

async function revokeWriteKey(idOrKey) {
  const result = await query(
    `UPDATE write_keys SET revoked_at = NOW()
     WHERE (id::text = $1 OR key = $1) AND revoked_at IS NULL
     RETURNING id, name, revoked_at`,
    [idOrKey]
  );
  invalidateWriteKeyCache();
  return result.rows[0] || null;
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
  const enforced = requireKeysEnforced();

  if (cache.empty) {
    if (enforced) {
      return res.status(401).json({
        success: false,
        error:
          'No write keys configured. Run: npx cairo create-write-key --name production',
      });
    }
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
  const enforced = requireKeysEnforced();

  if (cache.empty) {
    if (enforced) {
      return res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32000,
          message: 'No write keys configured. Run: npx cairo create-write-key',
        },
      });
    }
    req.writeKey = writeKey;
    return next();
  }

  if (!cache.keys.has(writeKey)) {
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
  _cache = { keys: new Set(), loadedAt: 0, empty: true };
}

module.exports = {
  requireWriteKey,
  requireWriteKeyMcp,
  extractWriteKey,
  invalidateWriteKeyCache,
  loadWriteKeys,
  createWriteKey,
  listWriteKeys,
  revokeWriteKey,
  generateWriteKey,
  requireKeysEnforced,
};
