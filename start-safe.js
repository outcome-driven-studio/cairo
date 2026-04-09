#!/usr/bin/env node

const express = require("express");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 8080;

let startupState = "starting";
let startupError = null;

app.get("/health/simple", (req, res) => {
  const statusCode = startupState === "failed" ? 503 : 200;

  res.status(statusCode).json({
    status: startupState === "failed" ? "unhealthy" : "healthy",
    service: "cairo-cdp",
    startup: startupState,
    error: startupError,
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

app.get("/status", (req, res) => {
  const statusCode = startupState === "failed" ? 503 : 200;

  res.status(statusCode).json({
    service: "cairo-cdp",
    status: startupState,
    error: startupError,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "production"
  });
});

function runNodeScript(scriptPath, stepName, allowFailure = false) {
  return new Promise((resolve, reject) => {
    console.log(`--- ${stepName} ---`);

    const child = spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
      env: process.env
    });

    child.on("error", (error) => {
      if (allowFailure) {
        console.warn(`${stepName} failed to start: ${error.message}`);
        resolve();
        return;
      }

      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal
        ? `${stepName} exited from signal ${signal}`
        : `${stepName} exited with code ${code}`;

      if (allowFailure) {
        console.warn(reason);
        resolve();
        return;
      }

      reject(new Error(reason));
    });
  });
}

async function bootstrap() {
  try {
    console.log("=========================================");
    console.log("    Cairo CDP - Bootstrap Starting");
    console.log("=========================================");

    const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

    if (databaseUrl) {
      await runNodeScript("db-check.js", "[STEP 1/3] RUNNING PRE-FLIGHT DATABASE CHECK", true);
      await runNodeScript("src/migrations/run_migrations.js", "[STEP 2/3] RUNNING DATABASE MIGRATIONS");
    } else {
      console.log("--- [STEP 1/3] SKIPPING DATABASE CHECK ---");
      console.log("No POSTGRES_URL or DATABASE_URL configured; starting without database features");
      console.log("--- [STEP 2/3] SKIPPING DATABASE MIGRATIONS ---");
      console.log("Database migrations require POSTGRES_URL or DATABASE_URL");
    }

    console.log("--- [STEP 3/3] STARTING APPLICATION SERVER ---");
    startupState = "handoff";

    server.close((closeError) => {
      if (closeError) {
        console.error("Failed to close bootstrap server:", closeError);
        startupState = "failed";
        startupError = closeError.message;
        process.exit(1);
        return;
      }

      startupState = "starting-app";
      require("./server.js");
    });
  } catch (error) {
    startupState = "failed";
    startupError = error.message;
    console.error("Bootstrap failed:", error);
    process.exit(1);
  }
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Bootstrap server listening on http://0.0.0.0:${PORT}`);
  console.log(`Health check available at http://0.0.0.0:${PORT}/health/simple`);
  bootstrap();
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  server.close(() => {
    process.exit(0);
  });
});
