'use strict';

/**
 * Build Discord webhook content from one or more Cairo notifications.
 */
function formatDiscordContent(items) {
  if (!items || items.length === 0) return '';
  if (items.length === 1) {
    const n = items[0].notification || items[0];
    return String(n.message || n.event || 'notification').slice(0, 1900);
  }

  const event = items[0].notification?.event || items[0].event || 'events';
  const lines = items.slice(0, 5).map((item) => {
    const n = item.notification || item;
    const msg = String(n.message || n.event || '').slice(0, 120);
    return `• ${msg}`;
  });
  const more = items.length > 5 ? `\n…and ${items.length - 5} more` : '';
  const header = `${items.length} new ${event} in this batch`;
  return `${header}\n${lines.join('\n')}${more}`.slice(0, 1900);
}

async function postDiscordWebhook(webhookUrl, content) {
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL required');
  if (!content) return { skipped: true };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord webhook ${res.status}: ${text.slice(0, 200)}`);
  }
  return { ok: true };
}

/**
 * Post via bot token + channel id when no incoming webhook is configured.
 */
async function postDiscordBot({ token, channelId, content }) {
  if (!token || !channelId) throw new Error('DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID required');
  if (!content) return { skipped: true };

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${token}`,
    },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord bot post ${res.status}: ${text.slice(0, 200)}`);
  }
  return { ok: true };
}

async function postDiscord(env, content) {
  if (env.DISCORD_WEBHOOK_URL) {
    return postDiscordWebhook(env.DISCORD_WEBHOOK_URL, content);
  }
  return postDiscordBot({
    token: env.DISCORD_BOT_TOKEN,
    channelId: env.DISCORD_CHANNEL_ID,
    content,
  });
}

module.exports = {
  formatDiscordContent,
  postDiscordWebhook,
  postDiscordBot,
  postDiscord,
};
