#!/usr/bin/env node

/**
 * Safe startup script for Cairo CDP
 * Provides better error handling and graceful degradation
 */

const express = require("express");

// Create a minimal express app for health checks
const app = express();
const PORT = process.env.PORT || 8080;

// Immediate health check endpoint (no dependencies)
app.get("/health/simple", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "cairo-cdp",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    startup: "safe-mode"
  });
});

// Basic status endpoint
app.get("/status", (req, res) => {
  res.status(200).json({
    service: "cairo-cdp",
    status: "starting",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "production"
  });
});

// Start minimal server first
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Cairo CDP safe mode server listening on http://0.0.0.0:${PORT}`);
  console.log(`✅ Health check available at http://0.0.0.0:${PORT}/health/simple`);

  // Now try to start the full application
  setTimeout(startFullApplication, 1000);
});

async function startFullApplication() {
  try {
    console.log("🚀 Starting full Cairo CDP application...");

    // Close the minimal server
    server.close(() => {
      console.log("📦 Minimal server closed, starting full application");

      // Load and start the full server
      require('./server.js');
    });

  } catch (error) {
    console.error("❌ Failed to start full application:", error);
    console.log("🔄 Continuing in safe mode...");

    // Add a fallback endpoint to show the error
    app.get("/error", (req, res) => {
      res.status(503).json({
        status: "error",
        service: "cairo-cdp",
        error: error.message,
        timestamp: new Date().toISOString(),
        mode: "safe-fallback"
      });
    });
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});