const { query, db } = require("./db");
const logger = require("./logger");

async function init() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS source_users (
        id SERIAL PRIMARY KEY,
        email TEXT,
        linkedin_profile TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT unique_email_linkedin UNIQUE (email, linkedin_profile)
      );
    `);
    logger.info("✅ source_users table ready");
  } catch (err) {
    logger.error("Error initializing source_users table:", err);
    throw err;
  }
}

async function findOrCreateSourceUser({ email, linkedin_profile }) {
  if (!email || !linkedin_profile) {
    console.log(`[DB] ❌ Skipping invalid user data: email=${email}, linkedin=${linkedin_profile}`);
    return null;
  }

  try {
    console.log(`[DB] 🔍 Checking for user: email=${email}, linkedin=${linkedin_profile}`);

    // 1. Check if user exists
    const existingUser = await query(
      `SELECT * FROM source_users WHERE email = $1 AND linkedin_profile = $2`,
      [email, linkedin_profile]
    );

    if (existingUser.rows.length > 0) {
      console.log(`[DB] ✅ Found existing user: ${email} (ID: ${existingUser.rows[0].id})`);
      return existingUser.rows[0];
    }

    // 2. Insert if not found
    console.log(`[DB] ➕ Inserting new user: ${email}`);
    const result = await query(
      `INSERT INTO source_users (email, linkedin_profile, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (email, linkedin_profile) DO NOTHING
       RETURNING *`,
      [email, linkedin_profile]
    );

    if (result.rows.length > 0) {
      console.log(`[DB] ✅ Inserted new user: ${email} (ID: ${result.rows[0].id})`);
      return result.rows[0];
    }

    // 3. Fallback: conflict happened but user exists
    const fallback = await query(
      `SELECT * FROM source_users WHERE email = $1 AND linkedin_profile = $2`,
      [email, linkedin_profile]
    );
    if (fallback.rows.length > 0) {
      console.log(`[DB] ♻️ Fallback retrieved user after conflict: ${fallback.rows[0].email} (ID: ${fallback.rows[0].id})`);
      return fallback.rows[0];
    }

    console.log(`[DB] ⚠️ WARNING: Could not insert or find user`);
    return null;
  } catch (err) {
    logger.error("findOrCreateSourceUser error:", err);
    console.error(`[DB] ❌ Error processing user ${email}:`, err.message);
    return null;
  }
}

async function updateSourceUserTimestamp(id) {
  try {
    const result = await query(
      "UPDATE source_users SET updated_at = now() WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length > 0) {
      console.log(`[DB] 🔄 Updated timestamp for user ID: ${id}`);
    } else {
      console.log(`[DB] ⚠️ No user found to update for ID: ${id}`);
    }
  } catch (err) {
    logger.error("Error updating source user timestamp:", err);
  }
}

async function checkTableStatus() {
  try {
    const result = await query(`SELECT COUNT(*) as count FROM source_users;`);
    console.log(`[DB] 📊 Total rows in source_users: ${result.rows[0].count}`);
    return result.rows[0].count;
  } catch (err) {
    logger.error("Error checking table status:", err);
    return -1;
  }
}

/**
 * Add a user to the user_source table if they don't already exist
 * @param {Object} userData User data to insert
 * @param {string} userData.email User's email (required)
 * @param {string} [userData.linkedin_url] User's LinkedIn URL (optional)
 * @param {string} [userData.lead_name] User's name (optional)
 * @param {string} [userData.source] Source platform (e.g. 'smartlead', 'lemlist')
 * @returns {Promise<Object>} Created or existing user
 */
async function addUserIfNotExists(userData) {
  if (!userData.email) {
    logger.warn('[DB] ❌ Skipping invalid user data: missing email');
    return null;
  }

  const email = userData.email.trim().toLowerCase();
  
  try {
    // First try to find existing user
    const existingUser = await query(
      'SELECT * FROM user_source WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      
      // Update enrichment data if we have new information
      if (userData.linkedin_url && !user.linkedin_profile) {
        await query(
          `UPDATE user_source 
           SET linkedin_profile = $1,
               enrichment_status = CASE 
                 WHEN enrichment_status = 'pending' THEN 'partial'
                 ELSE enrichment_status
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE email = $2`,
          [userData.linkedin_url, email]
        );
        user.linkedin_profile = userData.linkedin_url;
      }

      // Store additional metadata in enrichment_profile
      if (userData.lead_name || userData.source) {
        const enrichmentProfile = {
          ...(user.enrichment_profile || {}),
          ...(userData.lead_name ? { name: userData.lead_name } : {}),
          sources: {
            ...(user.enrichment_profile?.sources || {}),
            [userData.source]: true
          }
        };

        await query(
          `UPDATE user_source 
           SET enrichment_profile = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE email = $2`,
          [enrichmentProfile, email]
        );
        user.enrichment_profile = enrichmentProfile;
      }

      return user;
    }

    // Create new user if doesn't exist
    const result = await query(
      `INSERT INTO user_source 
       (email, linkedin_profile, enrichment_profile, enrichment_status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        email,
        userData.linkedin_url || null,
        {
          name: userData.lead_name || null,
          sources: { [userData.source]: true }
        },
        userData.linkedin_url ? 'partial' : 'pending'
      ]
    );

    logger.info(`Created new user: ${email}`);
    return result.rows[0];

  } catch (error) {
    logger.error(`Failed to create/find source user for: ${email}`, error);
    return null;
  }
}

/**
 * Get the count of source users
 * @returns {Promise<number>} Count of users
 */
async function getSourceUserCount() {
  const result = await query('SELECT COUNT(*) FROM user_source');
  return parseInt(result.rows[0].count);
}

/**
 * Get users pending enrichment
 * @param {number} limit Maximum number of users to return
 * @returns {Promise<Array>} Array of users pending enrichment
 */
async function getPendingEnrichmentUsers(limit = 100) {
  const result = await query(
    `SELECT * FROM user_source 
     WHERE enrichment_status = 'pending'
     OR (enrichment_status = 'partial' AND last_enrichment_attempt < NOW() - INTERVAL '24 hours')
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Update user enrichment status
 * @param {string} email User's email
 * @param {Object} enrichmentData Enrichment data
 * @param {string} status New enrichment status
 */
async function updateEnrichment(email, enrichmentData, status) {
  await query(
    `UPDATE user_source 
     SET enrichment_profile = $1,
         enrichment_status = $2,
         last_enrichment_attempt = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE email = $3`,
    [enrichmentData, status, email]
  );
}

module.exports = {
  init,
  findOrCreateSourceUser,
  updateSourceUserTimestamp,
  checkTableStatus,
  addUserIfNotExists,
  getSourceUserCount,
  getPendingEnrichmentUsers,
  updateEnrichment
};
