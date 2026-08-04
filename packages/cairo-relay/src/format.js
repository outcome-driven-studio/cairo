'use strict';

/**
 * Format one or more Cairo notifications into a plain-text message.
 * Gateway-agnostic — destinations decide how to send the string.
 */
function formatMessage(items) {
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

module.exports = { formatMessage };
