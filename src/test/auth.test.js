describe('auth enforcement helpers', () => {
  const prevEnv = process.env.NODE_ENV;
  const prevRequire = process.env.CAIRO_REQUIRE_WRITE_KEYS;

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
    if (prevRequire === undefined) delete process.env.CAIRO_REQUIRE_WRITE_KEYS;
    else process.env.CAIRO_REQUIRE_WRITE_KEYS = prevRequire;
  });

  it('requireKeysEnforced is true in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CAIRO_REQUIRE_WRITE_KEYS;
    jest.resetModules();
    const { requireKeysEnforced } = require('../middleware/auth');
    expect(requireKeysEnforced()).toBe(true);
  });

  it('requireKeysEnforced is true when CAIRO_REQUIRE_WRITE_KEYS=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.CAIRO_REQUIRE_WRITE_KEYS = 'true';
    jest.resetModules();
    const { requireKeysEnforced } = require('../middleware/auth');
    expect(requireKeysEnforced()).toBe(true);
  });

  it('generateWriteKey returns ck_ prefix', () => {
    jest.resetModules();
    const { generateWriteKey } = require('../middleware/auth');
    const key = generateWriteKey();
    expect(key.startsWith('ck_')).toBe(true);
    expect(key.length).toBeGreaterThan(20);
  });
});
