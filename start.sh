#!/bin/sh

echo "\n"
echo "--- [STEP 1/2] RUNNING PRE-FLIGHT DATABASE CONNECTION TEST ---"

# Run the database connection test script (don't exit on failure)
node db-check.js

# Check the exit code of the test script
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "\n"
  echo "--- ⚠️  WARNING: Database connection test failed ---"
  echo "Starting application anyway - will retry connections..."
  echo "Please check your POSTGRES_URL environment variable."
else
  echo "\n"
  echo "--- ✅ PRE-FLIGHT CHECK PASSED ---"
fi

echo "--- [STEP 2/2] STARTING APPLICATION SERVER ---\n"

# Start the main application
exec node server.js
