#!/usr/bin/env node
'use strict';

const { createApp } = require('./server');

async function main() {
  const required = ['CAIRO_HOST', 'CAIRO_WRITE_KEY'];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`cairo-relay requires ${key}`);
      process.exit(1);
    }
  }
  const hasDiscord =
    process.env.DISCORD_WEBHOOK_URL ||
    (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID);
  if (!hasDiscord) {
    console.error(
      'cairo-relay requires DISCORD_WEBHOOK_URL or DISCORD_BOT_TOKEN+DISCORD_CHANNEL_ID'
    );
    process.exit(1);
  }

  const app = createApp(process.env);
  await app.start();

  const shutdown = async (signal) => {
    console.log(`[cairo-relay] ${signal}, flushing…`);
    try {
      await app.stop();
    } catch (err) {
      console.error(err.message);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createApp };
