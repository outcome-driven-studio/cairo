'use strict';

/**
 * Discord adapter — thin re-export for backwards compatibility.
 * Prefer `destinations.js` + `format.js` for new code.
 */

const { formatMessage } = require('./format');
const { deliverDiscord } = require('./destinations');

function formatDiscordContent(items) {
  return formatMessage(items);
}

async function postDiscord(env, content) {
  return deliverDiscord(env, content);
}

module.exports = {
  formatDiscordContent,
  postDiscord,
};
