const { BaseDestination } = require("../services/destinationService");
const axios = require("axios");

/**
 * Slack Destination Plugin
 * Sends events as Slack notifications
 */
class SlackDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.webhookUrl = config.webhookUrl;
    this.channel = config.channel || '#events';
    this.username = config.username || 'Cairo CDP';
    this.iconEmoji = config.iconEmoji || ':rocket:';
    this.alertEvents = config.alertEvents || [];
    this.paymentThreshold = config.paymentThreshold || 100;
  }

  validateConfig() {
    const errors = [];

    if (!this.webhookUrl) {
      errors.push('webhookUrl is required');
    }

    if (this.webhookUrl && !this.webhookUrl.startsWith('https://hooks.slack.com/')) {
      errors.push('Invalid Slack webhook URL');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async track(event) {
    if (!this.shouldSendAlert(event)) {
      return { success: true, message: 'Event filtered' };
    }

    const message = this.formatTrackEvent(event);
    return await this.sendSlackMessage(message);
  }

  async identify(user) {
    if (!this.alertEvents.includes('identify')) {
      return { success: true, message: 'Identify events not configured' };
    }

    const message = this.formatIdentifyEvent(user);
    return await this.sendSlackMessage(message);
  }

  async page(pageView) {
    if (!this.alertEvents.includes('page')) {
      return { success: true, message: 'Page events not configured' };
    }

    const message = this.formatPageEvent(pageView);
    return await this.sendSlackMessage(message);
  }

  async group(group) {
    if (!this.alertEvents.includes('group')) {
      return { success: true, message: 'Group events not configured' };
    }

    const message = this.formatGroupEvent(group);
    return await this.sendSlackMessage(message);
  }

  async alias(alias) {
    // Usually don't send alias events to Slack
    return { success: true, message: 'Alias events not sent to Slack' };
  }

  async test() {
    try {
      const testMessage = {
        text: "🧪 Cairo CDP Test Message",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Cairo CDP Connection Test*\n\nThis is a test message to verify your Slack integration is working correctly."
            }
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Sent at ${new Date().toISOString()}`
              }
            ]
          }
        ]
      };

      await this.sendSlackMessage(testMessage);
      return { success: true, message: 'Test message sent successfully' };
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
    if (event.event.toLowerCase().includes('purchase') || event.event.toLowerCase().includes('payment')) {
      const amount = event.properties?.amount || event.properties?.revenue || event.properties?.price || 0;
      if (amount < this.paymentThreshold) {
        return false;
      }
    }

    return true;
  }

  formatTrackEvent(event) {
    const emoji = this.getEventEmoji(event.event);
    const user = event.userId || event.anonymousId || 'Unknown User';

    let blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${event.event}*\n*User:* ${user}`
        }
      }
    ];

    // Add properties if they exist
    if (event.properties && Object.keys(event.properties).length > 0) {
      const props = Object.entries(event.properties)
        .slice(0, 5) // Limit to 5 properties
        .map(([key, value]) => `*${key}:* ${value}`)
        .join('\n');

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: props
        }
      });
    }

    // Add timestamp
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short} at {time}|${new Date().toISOString()}>`
        }
      ]
    });

    return {
      username: this.username,
      icon_emoji: this.iconEmoji,
      channel: this.channel,
      blocks
    };
  }

  formatIdentifyEvent(user) {
    return {
      username: this.username,
      icon_emoji: ':bust_in_silhouette:',
      channel: this.channel,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `👤 *User Identified*\n*User ID:* ${user.userId}\n*Email:* ${user.traits?.email || 'N/A'}`
          }
        }
      ]
    };
  }

  formatPageEvent(pageView) {
    return {
      username: this.username,
      icon_emoji: ':page_facing_up:',
      channel: this.channel,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📄 *Page View*\n*Page:* ${pageView.name || 'Unnamed'}\n*User:* ${pageView.userId || pageView.anonymousId}`
          }
        }
      ]
    };
  }

  formatGroupEvent(group) {
    return {
      username: this.username,
      icon_emoji: ':busts_in_silhouette:',
      channel: this.channel,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `👥 *Group Association*\n*Group:* ${group.groupId}\n*User:* ${group.userId || group.anonymousId}`
          }
        }
      ]
    };
  }

  getEventEmoji(eventName) {
    const eventLower = eventName.toLowerCase();

    if (eventLower.includes('signup') || eventLower.includes('register')) return '🎉';
    if (eventLower.includes('login') || eventLower.includes('signin')) return '🔓';
    if (eventLower.includes('purchase') || eventLower.includes('order')) return '💰';
    if (eventLower.includes('payment')) return '💳';
    if (eventLower.includes('upgrade')) return '⬆️';
    if (eventLower.includes('download')) return '📥';
    if (eventLower.includes('share')) return '📤';
    if (eventLower.includes('click')) return '👆';
    if (eventLower.includes('view')) return '👀';
    if (eventLower.includes('search')) return '🔍';
    if (eventLower.includes('error') || eventLower.includes('fail')) return '❌';
    if (eventLower.includes('success') || eventLower.includes('complete')) return '✅';

    return '📊'; // Default event emoji
  }

  async sendSlackMessage(message) {
    try {
      const response = await axios.post(this.webhookUrl, message, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return { success: true, message: 'Slack message sent' };
    } catch (error) {
      throw new Error(`Failed to send Slack message: ${error.message}`);
    }
  }
}

module.exports = SlackDestination;