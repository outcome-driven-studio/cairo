'use strict';

/**
 * Pluggable delivery adapters for cairo-relay.
 *
 * Resolve order (first match wins):
 *   1. DESTINATION env (webhook | discord | stdout)
 *   2. FORWARD_URL / WEBHOOK_URL → webhook
 *   3. DISCORD_WEBHOOK_URL or DISCORD_BOT_TOKEN+CHANNEL → discord
 *   4. else → error
 */

async function deliverWebhook(url, content, items, { style } = {}) {
  if (!url) throw new Error('FORWARD_URL (or WEBHOOK_URL) required');
  if (!content) return { skipped: true };

  const payload =
    style === 'slack'
      ? { text: content }
      : {
          text: content,
          content,
          count: items.length,
          notifications: items.map((item) => item.notification || item),
        };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`forward webhook ${res.status}: ${text.slice(0, 200)}`);
  }
  return { ok: true, destination: 'webhook' };
}

async function deliverDiscord(env, content) {
  if (!content) return { skipped: true };

  if (env.DISCORD_WEBHOOK_URL) {
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Discord webhook ${res.status}: ${text.slice(0, 200)}`);
    }
    return { ok: true, destination: 'discord' };
  }

  const token = env.DISCORD_BOT_TOKEN;
  const channelId = env.DISCORD_CHANNEL_ID;
  if (!token || !channelId) {
    throw new Error('DISCORD_WEBHOOK_URL or DISCORD_BOT_TOKEN+DISCORD_CHANNEL_ID required');
  }

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
  return { ok: true, destination: 'discord' };
}

async function deliverStdout(content, items) {
  console.log(
    JSON.stringify({
      type: 'cairo-relay',
      content,
      count: items.length,
      ids: items.map((i) => i.notification?.id || i.id).filter(Boolean),
    })
  );
  return { ok: true, destination: 'stdout' };
}

function resolveDestination(env = process.env) {
  const explicit = (env.DESTINATION || '').toLowerCase().trim();
  if (explicit) return explicit;

  if (env.FORWARD_URL || env.WEBHOOK_URL) return 'webhook';
  if (
    env.DISCORD_WEBHOOK_URL ||
    (env.DISCORD_BOT_TOKEN && env.DISCORD_CHANNEL_ID)
  ) {
    return 'discord';
  }
  return null;
}

function assertDestinationConfigured(env = process.env) {
  const dest = resolveDestination(env);
  if (!dest) {
    throw new Error(
      'cairo-relay needs a destination: set FORWARD_URL, or DISCORD_WEBHOOK_URL, or DESTINATION=stdout'
    );
  }
  return dest;
}

/**
 * Deliver formatted content for a flushed batch.
 */
async function deliver(env, content, items) {
  const dest = assertDestinationConfigured(env);

  if (dest === 'stdout') return deliverStdout(content, items);
  if (dest === 'discord') return deliverDiscord(env, content);
  if (dest === 'webhook') {
    const url = env.FORWARD_URL || env.WEBHOOK_URL;
    const style = (env.WEBHOOK_STYLE || '').toLowerCase() === 'slack' ? 'slack' : 'generic';
    return deliverWebhook(url, content, items, { style });
  }

  throw new Error(`unknown DESTINATION: ${dest} (use webhook | discord | stdout)`);
}

module.exports = {
  resolveDestination,
  assertDestinationConfigured,
  deliver,
  deliverWebhook,
  deliverDiscord,
  deliverStdout,
};
