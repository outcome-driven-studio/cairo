const {
  sanitizeConnectionString,
  isLocalOrSocket,
  resolveSsl,
  buildPoolConfig,
  isRetryableDbError,
} = require("../utils/dbConfig");

describe("dbConfig", () => {
  it("strips channel_binding from any connection string", () => {
    const raw =
      "postgresql://u:p@db.example.com/cairo?sslmode=require&channel_binding=require";
    const out = sanitizeConnectionString(raw);
    expect(out).not.toMatch(/channel_binding/);
    expect(out).toContain("sslmode=require");
  });

  it("treats localhost, loopback, and Cloud SQL sockets as local", () => {
    expect(isLocalOrSocket("postgresql://u:p@localhost:5432/cairo")).toBe(true);
    expect(isLocalOrSocket("postgresql://u:p@127.0.0.1:5432/cairo")).toBe(true);
    expect(
      isLocalOrSocket(
        "postgresql://u:p@/cairo?host=/cloudsql/proj:region:instance"
      )
    ).toBe(true);
    expect(isLocalOrSocket("postgresql://u:p@10.0.0.8:5432/cairo")).toBe(false);
  });

  it("disables SSL for local/socket and honors PGSSLMODE", () => {
    expect(
      resolveSsl("postgresql://u:p@localhost:5432/cairo", {})
    ).toBe(false);
    expect(
      resolveSsl("postgresql://u:p@db.example.com/cairo", {
        PGSSLMODE: "disable",
      })
    ).toBe(false);
    expect(
      resolveSsl("postgresql://u:p@db.example.com/cairo", {})
    ).toEqual({ rejectUnauthorized: false });
  });

  it("builds a vendor-agnostic pool (no host-specific branches)", () => {
    const cfg = buildPoolConfig("postgresql://u:p@10.1.2.3:5432/cairo", {
      PG_POOL_MAX: "6",
      PG_POOL_MIN: "1",
    });
    expect(cfg.max).toBe(6);
    expect(cfg.min).toBe(1);
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
    expect(cfg.connectionString).not.toMatch(/neon/i);
  });

  it("retries generic connection errors, not a vendor list", () => {
    expect(isRetryableDbError({ code: "ECONNRESET", message: "reset" })).toBe(
      true
    );
    expect(isRetryableDbError({ code: "53300", message: "too many" })).toBe(
      true
    );
    expect(isRetryableDbError({ code: "23505", message: "unique" })).toBe(
      false
    );
  });
});
