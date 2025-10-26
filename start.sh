#!/bin/sh

echo ""
echo "========================================="
echo "    Cairo CDP - Starting Application"
echo "========================================="
echo ""

# Check if db-check.js exists before running it
if [ -f "db-check.js" ]; then
  echo "--- [STEP 1/3] RUNNING PRE-FLIGHT DATABASE CHECK ---"

  # Run the database connection test script (don't exit on failure)
  node db-check.js

  # Check the exit code of the test script
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "--- ⚠️  WARNING: Database connection test failed ---"
    echo "Starting application anyway - will retry connections..."
    echo "Please check your POSTGRES_URL environment variable."
  else
    echo ""
    echo "--- ✅ PRE-FLIGHT CHECK PASSED ---"
  fi
else
  echo "--- ⚠️  No database check script found, skipping pre-flight check ---"
fi

echo ""
echo "--- [STEP 2/3] RUNNING DATABASE MIGRATIONS ---"
echo ""

# Run database migrations (creates/updates tables in Neon)
node src/migrations/run_migrations.js

# Check if migrations succeeded
MIGRATIONS_EXIT_CODE=$?

if [ $MIGRATIONS_EXIT_CODE -ne 0 ]; then
  echo ""
  echo "--- ❌ CRITICAL: Database migrations failed ---"
  echo "Cannot start application without database schema."
  echo "Please check your database connection and migration scripts."
  exit 1
else
  echo ""
  echo "--- ✅ MIGRATIONS COMPLETED SUCCESSFULLY ---"
fi

echo ""
echo "--- [STEP 3/3] STARTING APPLICATION SERVER ---"
echo ""

# Start the main application
exec node server.js
