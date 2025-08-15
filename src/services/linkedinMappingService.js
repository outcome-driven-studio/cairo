const { query } = require("../utils/db");
const logger = require("../utils/logger");

class LinkedInMappingService {
  constructor() {
    // Use shared database pool instead of creating a new one
    // Initialize table on construction
    this.init().catch((err) => {
      logger.error(
        `Failed to initialize LinkedIn mapping table: ${err.message}`
      );
    });
  }

  /**
   * Initialize the LinkedIn email mapping table
   */
  async init() {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS linkedin_email_mapping (
          linkedin_url TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          lead_name TEXT,
          source TEXT DEFAULT 'lemlist',
          first_seen_at TIMESTAMPTZ DEFAULT NOW(),
          last_updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Create indexes for better query performance
        CREATE INDEX IF NOT EXISTS idx_linkedin_email_mapping_email 
        ON linkedin_email_mapping(email);
        
        CREATE INDEX IF NOT EXISTS idx_linkedin_email_mapping_source 
        ON linkedin_email_mapping(source);
        
        CREATE INDEX IF NOT EXISTS idx_linkedin_email_mapping_updated 
        ON linkedin_email_mapping(last_updated_at);
      `);
      logger.info("LinkedIn email mapping table initialized successfully");
    } catch (err) {
      logger.error(
        "Failed to initialize LinkedIn email mapping table:",
        err.message
      );
      throw err;
    }
  }

  /**
   * Store or update a LinkedIn URL to email mapping
   */
  async storeMapping(linkedinUrl, email, leadName = null, source = "lemlist") {
    if (!linkedinUrl || !email) return;

    const queryText = `
      INSERT INTO linkedin_email_mapping (linkedin_url, email, lead_name, source)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (linkedin_url) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        lead_name = COALESCE(EXCLUDED.lead_name, linkedin_email_mapping.lead_name),
        last_updated_at = NOW()
      RETURNING *;
    `;

    try {
      const result = await query(queryText, [
        linkedinUrl,
        email.toLowerCase(),
        leadName,
        source,
      ]);
      logger.debug(`Stored LinkedIn mapping: ${linkedinUrl} -> ${email}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error storing LinkedIn mapping: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get email for a LinkedIn URL
   */
  async getEmailForLinkedIn(linkedinUrl) {
    if (!linkedinUrl) return null;

    const queryText = `
      SELECT email, lead_name 
      FROM linkedin_email_mapping 
      WHERE linkedin_url = $1;
    `;

    try {
      const result = await query(queryText, [linkedinUrl]);
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      logger.error(`Error fetching LinkedIn mapping: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all LinkedIn URLs for an email
   */
  async getLinkedInUrlsForEmail(email) {
    if (!email) return [];

    const queryText = `
      SELECT linkedin_url, lead_name 
      FROM linkedin_email_mapping 
      WHERE email = $1;
    `;

    try {
      const result = await query(queryText, [email.toLowerCase()]);
      return result.rows;
    } catch (error) {
      logger.error(`Error fetching LinkedIn URLs for email: ${error.message}`);
      return [];
    }
  }

  /**
   * Bulk store mappings (more efficient for large syncs)
   */
  async bulkStoreMappings(mappings) {
    console.log("🟡 Storing LinkedIn mappings:", mappings);
    if (!mappings || mappings.length === 0) return;

    // Deduplicate mappings by LinkedIn URL (keep the last occurrence)
    const uniqueMappings = new Map();
    mappings
      .filter((m) => (m.linkedin_url || m.linkedinUrl) && m.email)
      .forEach((m) => {
        const linkedinUrl = m.linkedin_url || m.linkedinUrl;
        uniqueMappings.set(linkedinUrl, {
          linkedinUrl: linkedinUrl,
          email: m.email.toLowerCase(),
          leadName: m.lead_name || m.leadName || null,
          source: m.source || "lemlist",
        });
      });

    // Convert back to array
    const dedupedMappings = Array.from(uniqueMappings.values());

    if (dedupedMappings.length === 0) return;

    const values = dedupedMappings
      .map((m, index) => {
        const offset = index * 4;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${
          offset + 4
        })`;
      })
      .join(", ");

    const flatParams = dedupedMappings.flatMap((m) => [
      m.linkedinUrl,
      m.email,
      m.leadName,
      m.source,
    ]);

    const queryText = `
      INSERT INTO linkedin_email_mapping (linkedin_url, email, lead_name, source)
      VALUES ${values}
      ON CONFLICT (linkedin_url) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        lead_name = COALESCE(EXCLUDED.lead_name, linkedin_email_mapping.lead_name),
        last_updated_at = NOW();
    `;

    try {
      await query(queryText, flatParams);
      logger.info(
        `Bulk stored ${dedupedMappings.length} LinkedIn mappings (${
          mappings.length
        } provided, ${
          mappings.length - dedupedMappings.length
        } duplicates removed)`
      );
    } catch (error) {
      logger.error(`Error bulk storing LinkedIn mappings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get mapping statistics
   */
  async getStats() {
    const queryText = `
      SELECT 
        COUNT(*) as total_mappings,
        COUNT(DISTINCT email) as unique_emails,
        COUNT(DISTINCT linkedin_url) as unique_linkedin_urls,
        MIN(first_seen_at) as oldest_mapping,
        MAX(last_updated_at) as newest_mapping
      FROM linkedin_email_mapping;
    `;

    try {
      const result = await query(queryText);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error fetching mapping stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Clean up old or invalid mappings
   */
  async cleanup() {
    // Remove mappings older than 6 months that haven't been updated
    const queryText = `
      DELETE FROM linkedin_email_mapping 
      WHERE last_updated_at < NOW() - INTERVAL '6 months'
      RETURNING *;
    `;

    try {
      const result = await query(queryText);
      logger.info(`Cleaned up ${result.rowCount} old LinkedIn mappings`);
      return result.rowCount;
    } catch (error) {
      logger.error(`Error cleaning up LinkedIn mappings: ${error.message}`);
      return 0;
    }
  }

  /**
   * Close database connection - No longer needed since we use shared pool
   */
  async close() {
    // No-op since we're using the shared pool
    logger.debug("LinkedInMappingService close() called - using shared pool");
  }
}

module.exports = LinkedInMappingService;
