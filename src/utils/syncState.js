const { query } = require("./db");
const logger = require("./logger");

/**
 * Ensure the sync_state table exists
 */
async function init() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sync_state (
        source      TEXT PRIMARY KEY,
        last_checked TIMESTAMPTZ NOT NULL
      );
    `);
    logger.info("sync_state table ready");
  } catch (err) {
    logger.error("Failed to init sync_state table:", err.message);
    throw err; // Re-throw to handle gracefully upstream
  }
}

/**
 * Get last-checked timestamp for a data source.
 * @param {string} source eg. "lemlist" | "smartlead"
 * @returns {Date|null}
 */
async function getLastChecked(source) {
  try {
    const { rows } = await query(
      "SELECT last_checked FROM sync_state WHERE source=$1",
      [source]
    );
    return rows[0] ? new Date(rows[0].last_checked) : null;
  } catch (error) {
    logger.error(`Failed to get last checked for ${source}:`, error.message);
    return null; // Return null instead of crashing
  }
}

/**
 * Update last_checked to now (or supplied date).
 * @param {string} source
 * @param {Date} [ts]
 */
async function setLastChecked(source, ts = new Date()) {
  try {
    await query(
      `INSERT INTO sync_state (source, last_checked)
       VALUES ($1, $2)
       ON CONFLICT (source) DO UPDATE SET last_checked=excluded.last_checked`,
      [source, ts]
    );
    logger.debug(`Updated last checked for ${source} to ${ts.toISOString()}`);
  } catch (error) {
    logger.error(`Failed to set last checked for ${source}:`, error.message);
    throw error; // This is critical enough to re-throw
  }
}

module.exports = { init, getLastChecked, setLastChecked };
