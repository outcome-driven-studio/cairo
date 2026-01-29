const express = require("express");
const logger = require("../utils/logger");
const { query } = require("../utils/db");
const { getNotificationsEnabled } = require("../utils/notificationsEnabled");
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

    // Notion bridge: optional dedicated webhook and display options
    const notionWebhook =
      process.env.NOTION_BRIDGE_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    this.notionDiscordService =
      notionWebhook && notionWebhook !== "placeholder"
        ? new DiscordService(notionWebhook, {
            username: process.env.NOTION_BRIDGE_USERNAME || process.env.DISCORD_USERNAME || "Notion",
            avatarUrl: process.env.NOTION_BRIDGE_AVATAR_URL || process.env.DISCORD_AVATAR_URL,
          })
        : this.discordService;

    this.notionBridgeConfig = {
      titleKeys: process.env.NOTION_BRIDGE_TITLE_KEYS
        ? process.env.NOTION_BRIDGE_TITLE_KEYS.split(",").map((s) => s.trim()).filter(Boolean)
        : ["Task name", "Name", "Title", "title", "name"],
      defaultColor: (process.env.NOTION_BRIDGE_DEFAULT_COLOR || "5B4FFF").replace(/^#/, ""),
      includePageLink: process.env.NOTION_BRIDGE_INCLUDE_LINK !== "false",
    };
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
   * Convert a single Notion property value to a display string.
   * Handles Notion API / automation payload shapes: title, rich_text, people, date, select, status, etc.
   */
  parseNotionPropertyValue(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (!Array.isArray(value) && typeof value === "object") {
      // title / rich_text: array of { plain_text } or { text: { content } }
      if (value.title && Array.isArray(value.title)) {
        return value.title.map((t) => t.plain_text ?? t.text?.content ?? "").join("").trim() || "";
      }
      if (value.rich_text && Array.isArray(value.rich_text)) {
        return value.rich_text.map((t) => t.plain_text ?? t.text?.content ?? "").join("").trim() || "";
      }
      // Some webhook payloads send a single content string or content array
      if (value.content !== undefined) {
        if (typeof value.content === "string") return value.content.trim() || "";
        if (Array.isArray(value.content)) {
          return value.content
            .map((c) => (typeof c === "string" ? c : c?.plain_text ?? c?.text?.content ?? ""))
            .filter(Boolean)
            .join(" ")
            .trim() || "";
        }
      }
      // people
      if (value.people && Array.isArray(value.people)) {
        return value.people.map((p) => p.name ?? p.id ?? "").filter(Boolean).join(", ") || "";
      }
      // date
      if (value.date) {
        const d = value.date;
        const start = d.start ?? "";
        const end = d.end ? ` — ${d.end}` : "";
        return start ? `${start}${end}` : "";
      }
      if (value.start != null && !value.people) return value.end ? `${value.start} — ${value.end}` : String(value.start);
      // select / status
      if (value.select && typeof value.select === "object") return value.select.name ?? "";
      if (value.status && typeof value.status === "object") return value.status.name ?? "";
      // multi_select
      if (value.multi_select && Array.isArray(value.multi_select)) {
        return value.multi_select.map((s) => s.name ?? "").filter(Boolean).join(", ") || "";
      }
      // created_by / last_edited_by (user object)
      if (value.name && (value.object === "user" || value.type === "person" || value.type === "bot")) return value.name;
      if (value.created_by && typeof value.created_by === "object") return this.parseNotionPropertyValue(value.created_by);
      if (value.last_edited_by && typeof value.last_edited_by === "object") return this.parseNotionPropertyValue(value.last_edited_by);
      // formula
      if (value.formula && typeof value.formula === "object") {
        const f = value.formula;
        return String(f.string ?? f.number ?? f.boolean ?? f.date ?? "");
      }
      // checkbox, number, email, url, phone_number
      if (typeof value.checkbox === "boolean") return value.checkbox ? "Yes" : "No";
      if (typeof value.number === "number") return String(value.number);
      if (value.email) return value.email;
      if (value.url) return value.url;
      if (value.phone_number) return value.phone_number;
      // created_time / last_edited_time
      if (value.created_time) return value.created_time;
      if (value.last_edited_time) return value.last_edited_time;
      // type wrapper (e.g. { type: "title", title: [...] })
      if (value.type && value[value.type] !== undefined) return this.parseNotionPropertyValue(value[value.type]);
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.parseNotionPropertyValue(v)).filter(Boolean).join(", ") || "";
    }
    return "";
  }

  /**
   * Resolve the object that holds "properties" from various Notion payload shapes.
   * Automation "Send webhook" and integration webhooks use different structures.
   */
  resolveNotionProps(raw) {
    if (!raw || typeof raw !== "object") return {};
    const findProps = (obj) => {
      if (!obj || typeof obj !== "object") return null;
      if (obj.properties && typeof obj.properties === "object") return obj.properties;
      return null;
    };
    // Wrapper: body / event (e.g. some clients send { body: { ... } })
    const body = raw.body && typeof raw.body === "object" ? raw.body : raw;
    // Direct properties (API-style or flat)
    if (body.properties && typeof body.properties === "object") return body.properties;
    // Nested under entry (e.g. automation payload); entry can be array or single object
    const entry = body.entry;
    if (entry !== undefined && entry !== null) {
      const single = Array.isArray(entry) ? entry[0] : entry;
      if (single && typeof single === "object") {
        if (single.properties && typeof single.properties === "object") return single.properties;
        return single;
      }
    }
    // content / payload wrapper
    if (body.content && typeof body.content === "object") return body.content.properties || body.content;
    if (body.payload && typeof body.payload === "object") return body.payload.properties || body.payload;
    // data may hold event payload or selected properties
    if (body.data && typeof body.data === "object") {
      const fromData = findProps(body.data) || body.data;
      if (typeof fromData === "object" && Object.keys(fromData).length > 0) return fromData;
    }
    // event (integration webhook style)
    if (body.event && typeof body.event === "object") {
      const fromEvent = findProps(body.event) || body.event;
      if (typeof fromEvent === "object" && Object.keys(fromEvent).length > 0) return fromEvent;
    }
    // Top-level flat (selected properties at root when Send webhook sends property keys at top level)
    const meta = new Set([
      "type", "entity", "timestamp", "workspace_id", "workspace_name", "subscription_id",
      "integration_id", "authors", "accessible_by", "attempt_number", "url", "message",
      "eventType", "color", "automation_id", "action_id", "event_id", "created_time",
      "last_edited_time", "created_by", "last_edited_by", "parent", "icon", "cover",
      "body", "entry", "content", "payload", "data", "event",
    ]);
    const fromRaw = {};
    for (const [k, v] of Object.entries(body)) {
      if (meta.has(k) || v === undefined || v === null) continue;
      fromRaw[k] = v;
    }
    if (Object.keys(fromRaw).length > 0) return fromRaw;
    return body;
  }

  /**
   * Normalize Notion webhook payload (flat or nested under properties) into title + description for Discord.
   * Supports automation "Send webhook" and integration-style payloads; uses fallback when no properties.
   */
  normalizeNotionPayload(body, overrideConfig = null) {
    const raw = body || {};
    const props = this.resolveNotionProps(raw);
    const skip = new Set(["properties", "message", "eventType", "color", "id", "url"]);
    const config = overrideConfig || this.notionBridgeConfig;
    const titleKeys = config.titleKeys || this.notionBridgeConfig.titleKeys;
    const defaultColor = config.defaultColor ?? this.notionBridgeConfig.defaultColor;
    const includePageLink = config.includePageLink !== false;
    let title = "Notion update";
    const lines = [];

    for (const key of titleKeys) {
      if (props[key] !== undefined) {
        const t = this.parseNotionPropertyValue(props[key]);
        if (t) {
          title = t.slice(0, 256);
          break;
        }
      }
    }

    for (const [key, value] of Object.entries(props)) {
      if (skip.has(key) || value === undefined || value === null) continue;
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
      const text = this.parseNotionPropertyValue(value);
      if (text) lines.push(`**${label}:** ${text}`);
    }

    // Resolve metadata from multiple possible payload locations (Notion sends different shapes)
    const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
    const body = raw.body && typeof raw.body === "object" ? raw.body : raw;
    const entry = body.entry;
    const entryOne = Array.isArray(entry) ? entry?.[0] : entry;
    const entityId =
      raw.entity?.id ?? data.entity?.id ?? body.entity?.id ?? entryOne?.id ?? raw.id ?? data.id ?? body.id;
    const eventType = raw.type ?? data.type ?? body.type ?? entryOne?.type;
    const timestamp = raw.timestamp ?? data.timestamp ?? body.timestamp ?? entryOne?.timestamp;
    const workspaceName = raw.workspace_name ?? data.workspace_name ?? body.workspace_name;
    const url = raw.url ?? data.url ?? body.url ?? entryOne?.url;

    if (includePageLink && url) lines.push(`**Link:** ${url}`);
    if (entityId) lines.push(`**Entry ID:** \`${entityId}\``);
    if (eventType) lines.push(`**Event:** ${eventType}`);
    if (timestamp) lines.push(`**Time:** ${timestamp}`);
    if (workspaceName) lines.push(`**Workspace:** ${workspaceName}`);

    // Never show "No details" when we have any metadata; fallback to generic message with payload hint
    let description;
    if (lines.length > 0) {
      description = lines.join("\n");
    } else {
      const fallbackParts = [];
      if (eventType) fallbackParts.push(`Event: ${eventType}`);
      if (timestamp) fallbackParts.push(`Time: ${timestamp}`);
      if (workspaceName) fallbackParts.push(`Workspace: ${workspaceName}`);
      if (entityId) fallbackParts.push(`ID: ${entityId}`);
      description =
        fallbackParts.length > 0
          ? fallbackParts.join(" · ")
          : "Notion event received. (No properties or metadata could be extracted. Check webhook payload or use ?debug=1 to inspect.)";
    }
    const color = (typeof raw.color === "string" ? raw.color : defaultColor).replace(/^#/, "");
    return { title, description, color };
  }

  /**
   * POST /api/bridge/notion — Notion automation webhook: normalizes Notion payload and sends to Discord only.
   * Use this URL in Notion’s “Send webhook” action; you can’t customize the payload there, so this endpoint
   * understands Notion property shapes (title, rich_text, people, date, select, status, etc.).
   */
  async notion(req, res) {
    try {
      const isDebug =
        req.query.debug === "1" || req.get("X-Notion-Debug") === "1";
      if (process.env.LOG_LEVEL === "debug" && req.body) {
        logger.debug("[EventBridge] Notion raw body:", JSON.stringify(req.body, null, 2));
      }

      if (!(await getNotificationsEnabled())) {
        return res.status(200).json({
          success: true,
          message: "Notion event accepted; notifications are currently disabled.",
        });
      }
      let config = null;
      try {
        const result = await query("SELECT value FROM app_settings WHERE key = $1", ["notion_bridge"]);
        const stored = result.rows[0]?.value;
        if (stored && typeof stored === "object" && stored.webhookUrl) {
          config = stored;
          if (!Array.isArray(config.titleKeys) && typeof config.titleKeys === "string") {
            config.titleKeys = config.titleKeys.split(",").map((s) => s.trim()).filter(Boolean);
          }
          if (config.defaultColor && config.defaultColor.startsWith("#")) {
            config.defaultColor = config.defaultColor.slice(1);
          }
        }
      } catch (e) {
        // Table may not exist; use env
      }

      const discordService =
        config?.webhookUrl
          ? new DiscordService(config.webhookUrl, {
              username: config.username || "Notion",
              avatarUrl: config.avatarUrl || null,
            })
          : this.notionDiscordService;

      if (!discordService.enabled) {
        return res.status(503).json({
          success: false,
          error: "Discord is not configured. Set webhook in Event Notifications → Notion bridge, or NOTION_BRIDGE_WEBHOOK_URL / DISCORD_WEBHOOK_URL.",
        });
      }

      const bridgeConfig = config || this.notionBridgeConfig;
      const { title, description, color } = this.normalizeNotionPayload(req.body, bridgeConfig);

      if (isDebug) {
        return res.status(200).json({
          success: true,
          debug: true,
          message: "Debug mode: no message sent to Discord.",
          rawBody: req.body,
          normalized: { title, description, color },
        });
      }

      const alertPayload = {
        title: String(title).slice(0, 256),
        message: description.slice(0, 4096),
        color: color.startsWith("#") ? color : `#${color}`,
      };
      if (config?.username) alertPayload.username = config.username;
      if (config?.avatarUrl) alertPayload.avatar_url = config.avatarUrl;
      if (config?.footer) alertPayload.footer = config.footer;
      if (!config) {
        if (process.env.NOTION_BRIDGE_USERNAME) alertPayload.username = process.env.NOTION_BRIDGE_USERNAME;
        if (process.env.NOTION_BRIDGE_AVATAR_URL) alertPayload.avatar_url = process.env.NOTION_BRIDGE_AVATAR_URL;
        if (process.env.NOTION_BRIDGE_FOOTER) alertPayload.footer = process.env.NOTION_BRIDGE_FOOTER;
      }

      const result = await discordService.sendCustomAlert(alertPayload);

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
        message: "Notion event sent to Discord",
      });
    } catch (error) {
      logger.error("[EventBridge] Notion handler error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/bridge — send event through bridge (Discord only, not persisted)
   */
  async send(req, res) {
    try {
      if (!(await getNotificationsEnabled())) {
        return res.status(200).json({
          success: true,
          message: "Event accepted; notifications are currently disabled.",
        });
      }
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
    router.post("/notion", this.notion.bind(this));
    return router;
  }
}

module.exports = EventBridgeRoutes;
