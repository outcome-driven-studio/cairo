const MixpanelService = require("./mixpanelService");
const AttioService = require("./attioService");
const SlackService = require("./slackService");
const DiscordService = require("./discordService");
const config = require("../config");

let instance = null;

/**
 * Shared service factory. Returns singleton instances of Mixpanel, Attio,
 * Slack, and Discord services so route modules don't each create their own.
 */
function getServices() {
  if (instance) return instance;

  const mixpanelService = new MixpanelService(
    process.env.MIXPANEL_PROJECT_TOKEN
  );

  const attioService = config.attioApiKey
    ? new AttioService(config.attioApiKey)
    : null;

  const slackService = new SlackService(process.env.SLACK_WEBHOOK_URL, {
    defaultChannel: process.env.SLACK_DEFAULT_CHANNEL,
    alertEvents: process.env.SLACK_ALERT_EVENTS
      ? process.env.SLACK_ALERT_EVENTS.split(",").map((e) => e.trim())
      : undefined,
    paymentThreshold: process.env.SLACK_PAYMENT_THRESHOLD
      ? parseFloat(process.env.SLACK_PAYMENT_THRESHOLD)
      : undefined,
    maxAlertsPerMinute: process.env.SLACK_MAX_ALERTS_PER_MINUTE
      ? parseInt(process.env.SLACK_MAX_ALERTS_PER_MINUTE)
      : undefined,
  });

  const discordService = new DiscordService(process.env.DISCORD_WEBHOOK_URL, {
    defaultChannel: process.env.DISCORD_DEFAULT_CHANNEL,
    alertEvents: process.env.DISCORD_ALERT_EVENTS
      ? process.env.DISCORD_ALERT_EVENTS.split(",").map((e) => e.trim())
      : undefined,
    paymentThreshold: process.env.DISCORD_PAYMENT_THRESHOLD
      ? parseFloat(process.env.DISCORD_PAYMENT_THRESHOLD)
      : undefined,
    maxAlertsPerMinute: process.env.DISCORD_MAX_ALERTS_PER_MINUTE
      ? parseInt(process.env.DISCORD_MAX_ALERTS_PER_MINUTE)
      : undefined,
    username: process.env.DISCORD_USERNAME,
    avatarUrl: process.env.DISCORD_AVATAR_URL,
  });

  instance = { mixpanelService, attioService, slackService, discordService };
  return instance;
}

module.exports = { getServices };
