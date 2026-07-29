// Dummy URL so requiring modules that load db.js does not throw in unit tests.
process.env.POSTGRES_URL =
  process.env.POSTGRES_URL ||
  'postgresql://cairo:cairo@127.0.0.1:5432/cairo_test';
