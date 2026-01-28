const { query } = require("./db");

/**
 * Check if global notifications are enabled (Slack, Discord, Notion bridge).
 * Stored in app_settings under key 'notifications_enabled'; defaults to true when unset or table missing.
 */
async function getNotificationsEnabled() {
  try {
    const result = await query(
      "SELECT value FROM app_settings WHERE key = $1",
      ["notifications_enabled"]
    );
    const value = result.rows[0]?.value;
    if (value === false || (typeof value === "object" && value?.enabled === false)) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

module.exports = { getNotificationsEnabled };
