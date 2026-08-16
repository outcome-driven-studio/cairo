const logger = require("./logger");

class MonitoringService {
  constructor() {
    this.startedAt = new Date();
  }

  getHealthStatus() {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "production",
      version: require("../../package.json").version,
    };
  }

  startHealthChecks() {
    logger.info("[MONITORING] Health checks started");
  }
}

module.exports = new MonitoringService();
