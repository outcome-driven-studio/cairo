/**
 * Simple in-memory per-write-key rate limiter.
 * Env: CAIRO_RATE_LIMIT (requests per window, default 120)
 *      CAIRO_RATE_WINDOW_MS (default 60000)
 */
const buckets = new Map();

function getLimit() {
  return Math.max(1, parseInt(process.env.CAIRO_RATE_LIMIT || '120', 10));
}

function getWindowMs() {
  return Math.max(1000, parseInt(process.env.CAIRO_RATE_WINDOW_MS || '60000', 10));
}

function rateLimit(req, res, next) {
  // Skip health / docs / discovery
  const path = req.path || '';
  if (
    path === '/health' ||
    path === '/health/simple' ||
    path === '/health/detailed' ||
    path === '/' ||
    path === '/llms.txt' ||
    path === '/docs' ||
    path.startsWith('/docs/') ||
    path === '/.well-known/mcp.json'
  ) {
    return next();
  }

  const key =
    req.writeKey ||
    req.headers['x-write-key'] ||
    req.headers.authorization ||
    req.ip ||
    'anonymous';

  const now = Date.now();
  const windowMs = getWindowMs();
  const limit = getLimit();

  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil((bucket.start + windowMs) / 1000)));

  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.start + windowMs - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      retryAfter,
    });
  }

  next();
}

/** Periodic cleanup to avoid unbounded Map growth */
setInterval(() => {
  const now = Date.now();
  const windowMs = getWindowMs();
  for (const [k, bucket] of buckets.entries()) {
    if (now - bucket.start >= windowMs * 2) buckets.delete(k);
  }
}, 60_000).unref?.();

module.exports = { rateLimit };
