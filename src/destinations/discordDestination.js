const { BaseDestination } = require("../services/destinationService");
const axios = require("axios");

/**
 * Discord Destination Plugin
 * Sends events as Discord notifications via webhooks
 */
class DiscordDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.webhookUrl = config.webhookUrl;
    this.username = config.username || "Cairo CDP";
    this.avatarUrl = config.avatarUrl || null;
    this.alertEvents = config.alertEvents || [];
    this.paymentThreshold = config.paymentThreshold || 100;
  }

  validateConfig() {
    const errors = [];

    if (!this.webhookUrl) {
      errors.push("webhookUrl is required");
    }

    if (
      this.webhookUrl &&
      !this.webhookUrl.startsWith("https://discord.com/api/webhooks/") &&
      !this.webhookUrl.startsWith("https://discordapp.com/api/webhooks/")
    ) {
      errors.push("Invalid Discord webhook URL");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async track(event) {
    if (!this.shouldSendAlert(event)) {
      return { success: true, message: "Event filtered" };
    }

    const message = this.formatTrackEvent(event);
    return await this.sendDiscordMessage(message);
  }

  async identify(user) {
    if (!this.alertEvents.includes("identify")) {
      return { success: true, message: "Identify events not configured" };
    }

    const message = this.formatIdentifyEvent(user);
    return await this.sendDiscordMessage(message);
  }

  async page(pageView) {
    if (!this.alertEvents.includes("page")) {
      return { success: true, message: "Page events not configured" };
    }

    const message = this.formatPageEvent(pageView);
    return await this.sendDiscordMessage(message);
  }

  async group(group) {
    if (!this.alertEvents.includes("group")) {
      return { success: true, message: "Group events not configured" };
    }

    const message = this.formatGroupEvent(group);
    return await this.sendDiscordMessage(message);
  }

  async alias(alias) {
    // Usually don't send alias events to Discord
    return { success: true, message: "Alias events not sent to Discord" };
  }

  async test() {
    try {
      const testMessage = {
        username: this.username,
        embeds: [
          {
            title: "🧪 Cairo CDP Connection Test",
            description:
              "This is a test message to verify your Discord integration is working correctly.",
            color: 0x3498db, // Blue
            timestamp: new Date().toISOString(),
            footer: {
              text: "Cairo CDP",
            },
          },
        ],
      };

      if (this.avatarUrl) {
        testMessage.avatar_url = this.avatarUrl;
      }

      await this.sendDiscordMessage(testMessage);
      return { success: true, message: "Test message sent successfully" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Private methods

  shouldSendAlert(event) {
    // Check if event type is in alert list
    if (this.alertEvents.length > 0 && !this.alertEvents.includes(event.event)) {
      return false;
    }

    // Check payment threshold
    if (
      event.event.toLowerCase().includes("purchase") ||
      event.event.toLowerCase().includes("payment")
    ) {
      const amount =
        event.properties?.amount ||
        event.properties?.revenue ||
        event.properties?.price ||
        0;
      if (amount < this.paymentThreshold) {
        return false;
      }
    }

    return true;
  }

  formatTrackEvent(event) {
    const emoji = this.getEventEmoji(event.event);
    const user = event.userId || event.anonymousId || "Unknown User";

    const embed = {
      title: `${emoji} ${event.event}`,
      description: `**User:** ${user}`,
      color: this.getEventColor(event.event),
      timestamp: new Date().toISOString(),
      fields: [],
      footer: {
        text: "Cairo CDP",
      },
    };

    // Add properties if they exist
    if (event.properties && Object.keys(event.properties).length > 0) {
      Object.entries(event.properties)
        .slice(0, 5) // Limit to 5 properties
        .forEach(([key, value]) => {
          embed.fields.push({
            name: this.formatFieldName(key),
            value: String(value),
            inline: true,
          });
        });
    }

    return {
      username: this.username,
      embeds: [embed],
      ...(this.avatarUrl && { avatar_url: this.avatarUrl }),
    };
  }

  formatIdentifyEvent(user) {
    return {
      username: this.username,
      embeds: [
        {
          title: "👤 User Identified",
          description: `**User ID:** ${user.userId}\n**Email:** ${
            user.traits?.email || "N/A"
          }`,
          color: 0x3498db,
          timestamp: new Date().toISOString(),
          footer: {
            text: "Cairo CDP",
          },
        },
      ],
      ...(this.avatarUrl && { avatar_url: this.avatarUrl }),
    };
  }

  formatPageEvent(pageView) {
    return {
      username: this.username,
      embeds: [
        {
          title: "📄 Page View",
          description: `**Page:** ${pageView.name || "Unnamed"}\n**User:** ${
            pageView.userId || pageView.anonymousId
          }`,
          color: 0x3498db,
          timestamp: new Date().toISOString(),
          footer: {
            text: "Cairo CDP",
          },
        },
      ],
      ...(this.avatarUrl && { avatar_url: this.avatarUrl }),
    };
  }

  formatGroupEvent(group) {
    return {
      username: this.username,
      embeds: [
        {
          title: "👥 Group Association",
          description: `**Group:** ${group.groupId}\n**User:** ${
            group.userId || group.anonymousId
          }`,
          color: 0x3498db,
          timestamp: new Date().toISOString(),
          footer: {
            text: "Cairo CDP",
          },
        },
      ],
      ...(this.avatarUrl && { avatar_url: this.avatarUrl }),
    };
  }

  getEventEmoji(eventName) {
    const eventLower = eventName.toLowerCase();

    if (eventLower.includes("signup") || eventLower.includes("register"))
      return "🎉";
    if (eventLower.includes("login") || eventLower.includes("signin"))
      return "🔓";
    if (eventLower.includes("purchase") || eventLower.includes("order"))
      return "💰";
    if (eventLower.includes("payment")) return "💳";
    if (eventLower.includes("upgrade")) return "⬆️";
    if (eventLower.includes("download")) return "📥";
    if (eventLower.includes("share")) return "📤";
    if (eventLower.includes("click")) return "👆";
    if (eventLower.includes("view")) return "👀";
    if (eventLower.includes("search")) return "🔍";
    if (eventLower.includes("error") || eventLower.includes("fail"))
      return "❌";
    if (eventLower.includes("success") || eventLower.includes("complete"))
      return "✅";

    return "📊"; // Default event emoji
  }

  getEventColor(eventName) {
    const eventLower = eventName.toLowerCase();

    if (eventLower.includes("signup") || eventLower.includes("register"))
      return 0x36a64f; // Green
    if (eventLower.includes("payment") || eventLower.includes("purchase"))
      return 0x2eb886; // Teal
    if (eventLower.includes("error") || eventLower.includes("fail"))
      return 0xdc3545; // Red
    if (eventLower.includes("warning") || eventLower.includes("alert"))
      return 0xff9900; // Orange
    if (eventLower.includes("success") || eventLower.includes("complete"))
      return 0x36a64f; // Green

    return 0x3498db; // Blue (default)
  }

  formatFieldName(key) {
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  async sendDiscordMessage(message) {
    try {
      const response = await axios.post(this.webhookUrl, message, {
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return { success: true, message: "Discord message sent" };
    } catch (error) {
      throw new Error(`Failed to send Discord message: ${error.message}`);
    }
  }
}

module.exports = DiscordDestination;
