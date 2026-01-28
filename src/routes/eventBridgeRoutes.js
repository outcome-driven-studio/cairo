const express = require("express");
const logger = require("../utils/logger");
const DiscordService = require("../services/discordService");

/**
 * Event bridge routes
 * Receives events and forwards to destinations (e.g. Discord) only.
 * No persistence: no database, no Mixpanel. Use for Notion, webhooks, etc.
 */
class EventBridgeRoutes {
  constructor() {
    const discordConfig = {
      defaultChannel: process.env.DISCORD_DEFAULT_CHANNEL,
      alertEvents: process.env.DISCORD_ALERT_EVENTS
        ? process.env.DISCORD_ALERT_EVENTS.split(",").map((e) => e.trim())
        : undefined,
      maxAlertsPerMinute: process.env.DISCORD_MAX_ALERTS_PER_MINUTE
        ? parseInt(process.env.DISCORD_MAX_ALERTS_PER_MINUTE, 10)
        : undefined,
      username: process.env.DISCORD_USERNAME || "Event Bridge",
      avatarUrl: process.env.DISCORD_AVATAR_URL,
    };
    this.discordService = new DiscordService(
      process.env.DISCORD_WEBHOOK_URL,
      discordConfig
    );
  }

  /**
   * Build Discord embed description from event payload
   */
  formatEventDescription(body) {
    const lines = [];
    if (body.message) {
      lines.push(body.message);
    }
    const skip = new Set(["message", "title", "eventType", "color"]);
    for (const [key, value] of Object.entries(body)) {
      if (skip.has(key) || value === undefined || value === null) continue;
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
      lines.push(`**${label}:** ${value}`);
    }
    return lines.length ? lines.join("\n") : "No details";
  }

  /**
   * POST /api/bridge — send event through bridge (Discord only, not persisted)
   */
  async send(req, res) {
    try {
      if (!this.discordService.enabled) {
        return res.status(503).json({
          success: false,
          error: "Discord is not configured. Set DISCORD_WEBHOOK_URL.",
        });
      }

      const body = req.body || {};
      const title =
        body.title ||
        body.name ||
        body.eventType ||
        "Event";
      const description = this.formatEventDescription(body);
      const color = body.color || "3498db"; // default blue

      const result = await this.discordService.sendCustomAlert({
        title: String(title).slice(0, 256),
        message: description.slice(0, 4096),
        color: color.startsWith("#") ? color : `#${color}`,
      });

      if (!result.success) {
        if (result.reason === "rate_limited") {
          return res.status(429).json({
            success: false,
            error: "Rate limited. Try again shortly.",
          });
        }
        return res.status(500).json({
          success: false,
          error: result.error || "Failed to send to Discord",
        });
      }

      res.status(200).json({
        success: true,
        message: "Event sent to bridge (Discord)",
      });
    } catch (error) {
      logger.error("[EventBridge] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  setupRoutes() {
    const router = express.Router();
    router.post("/", this.send.bind(this));
    return router;
  }
}

module.exports = EventBridgeRoutes;
