#!/bin/sh

echo ""
echo "========================================="
echo "    Cairo CDP - Starting Application"
echo "========================================="
echo ""

# Check if db-check.js exists before running it
if [ -f "db-check.js" ]; then
  echo "--- [STEP 1/2] RUNNING PRE-FLIGHT DATABASE CHECK ---"

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
echo "--- [STEP 2/2] STARTING APPLICATION SERVER ---"
echo ""

# Start the main application
exec node server.js
