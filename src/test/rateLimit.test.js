const { rateLimit } = require('../middleware/rateLimit');

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(k, v) { headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('rateLimit middleware', () => {
  const prevLimit = process.env.CAIRO_RATE_LIMIT;
  const prevWindow = process.env.CAIRO_RATE_WINDOW_MS;

  beforeAll(() => {
    process.env.CAIRO_RATE_LIMIT = '3';
    process.env.CAIRO_RATE_WINDOW_MS = '60000';
  });

  afterAll(() => {
    if (prevLimit === undefined) delete process.env.CAIRO_RATE_LIMIT;
    else process.env.CAIRO_RATE_LIMIT = prevLimit;
    if (prevWindow === undefined) delete process.env.CAIRO_RATE_WINDOW_MS;
    else process.env.CAIRO_RATE_WINDOW_MS = prevWindow;
  });

  it('allows requests under the limit and 429s after', () => {
    const key = `test-key-${Date.now()}`;
    let allowed = 0;
    let blocked = 0;

    for (let i = 0; i < 5; i++) {
      const req = { path: '/v2/track', writeKey: key, headers: {}, ip: '1.2.3.4' };
      const res = mockRes();
      let nextCalled = false;
      rateLimit(req, res, () => { nextCalled = true; });
      if (nextCalled) allowed += 1;
      else if (res.statusCode === 429) blocked += 1;
    }

    expect(allowed).toBe(3);
    expect(blocked).toBe(2);
  });

  it('skips health endpoints', () => {
    const req = { path: '/health', writeKey: 'x', headers: {}, ip: '9.9.9.9' };
    const res = mockRes();
    let nextCalled = false;
    rateLimit(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});
