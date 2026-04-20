#!/bin/sh
set -e

# Run database migrations if a database URL is configured.
# Cloud Run's default TCP startup probe gives us ~240s to open port 8080;
# migrations + server boot fit well within that.
if [ -n "$POSTGRES_URL" ] || [ -n "$DATABASE_URL" ]; then
  echo "--- Running database migrations ---"
  node src/migrations/run_migrations.js
fi

echo "--- Starting application server ---"
exec node server.js
