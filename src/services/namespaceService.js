const { query } = require("../utils/db");
const logger = require("../utils/logger");
const namespaceGenerator = require("../utils/namespaceGenerator");

/**
 * NamespaceService handles namespace detection, management, and routing
 * for multi-tenant data segregation in Cairo CDP
 */
class NamespaceService {
  constructor() {
    this.cache = new Map(); // Cache for active namespaces
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = 0;

    logger.info("NamespaceService initialized");
  }

  /**
   * Get or create default namespace
   * @returns {Promise<string>} - Default namespace name
   */
  async getDefaultNamespace() {
    try {
      // Check if we have any namespace marked as default (has 'default' keyword)
      const result = await query(
        "SELECT name FROM namespaces WHERE keywords @> '\"default\"' AND is_active = true LIMIT 1"
      );

      if (result.rows.length > 0) {
        return result.rows[0].name;
      }

      // No default namespace exists, create one with random name
      logger.warn("[Namespace] No default namespace found, creating new one");
      const newNamespace = await this.createNamespace({
        name: namespaceGenerator.generate(),
        keywords: ['default']
      });
      return newNamespace.name;
    } catch (error) {
      logger.error("[Namespace] Error getting default namespace:", error);
      // Fallback to a generated namespace name
      return namespaceGenerator.generate();
    }
  }

  /**
   * Detect namespace from campaign name using keyword matching
   * @param {string} campaignName - Name of the campaign
   * @returns {Promise<string>} - Namespace name (defaults to system default)
   */
  async detectNamespaceFromCampaign(campaignName) {
    if (!campaignName) {
      logger.debug(
        "[Namespace] No campaign name provided, using default namespace"
      );
      return await this.getDefaultNamespace();
    }

    try {
      const namespaces = await this.getAllActiveNamespaces();
      const campaignNameLower = campaignName.toLowerCase();

      // Check each namespace's keywords for matches
      for (const namespace of namespaces) {
        // Skip default namespace (identified by having 'default' keyword)
        if (namespace.keywords && namespace.keywords.includes('default')) continue;

        const keywords = Array.isArray(namespace.keywords)
          ? namespace.keywords
          : [];

        for (const keyword of keywords) {
          const keywordLower = keyword.toLowerCase();
          if (campaignNameLower.includes(keywordLower)) {
            logger.info(
              `[Namespace] Detected namespace '${namespace.name}' for campaign: ${campaignName} (keyword: ${keyword})`
            );
            return namespace.name;
          }
        }
      }

      logger.debug(
        `[Namespace] No namespace match found for campaign: ${campaignName}, using default`
      );
      return await this.getDefaultNamespace(); // Default namespace
    } catch (error) {
      logger.error("[Namespace] Error detecting namespace:", error);
      return await this.getDefaultNamespace(); // Failsafe to default
    }
  }

  /**
   * Get all active namespaces with caching
   * @returns {Promise<Array>} - Array of namespace objects
   */
  async getAllActiveNamespaces() {
    const now = Date.now();

    // Return cached data if still valid
    if (
      this.cache.has("active_namespaces") &&
      now - this.lastCacheUpdate < this.cacheExpiry
    ) {
      return this.cache.get("active_namespaces");
    }

    try {
      const result = await query(
        "SELECT * FROM namespaces WHERE is_active = true ORDER BY name"
      );

      const namespaces = result.rows;

      // Update cache
      this.cache.set("active_namespaces", namespaces);
      this.lastCacheUpdate = now;

      logger.debug(`[Namespace] Loaded ${namespaces.length} active namespaces`);
      return namespaces;
    } catch (error) {
      logger.error("[Namespace] Error fetching active namespaces:", error);
      return []; // Return empty array on error
    }
  }

  /**
   * Get namespace by name
   * @param {string} namespaceName - Name of the namespace
   * @returns {Promise<Object|null>} - Namespace object or null if not found
   */
  async getNamespaceByName(namespaceName) {
    try {
      const result = await query(
        "SELECT * FROM namespaces WHERE name = $1 AND is_active = true",
        [namespaceName]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error(
        `[Namespace] Error fetching namespace ${namespaceName}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get table name for a namespace
   * @param {string} namespaceName - Name of the namespace
   * @returns {Promise<string>} - Table name for the namespace
   */
  async getTableNameForNamespace(namespaceName) {
    const namespace = await this.getNamespaceByName(namespaceName);

    if (namespace && namespace.table_name) {
      return namespace.table_name;
    }

    // Default fallback - no hardcoded namespace
    // Generate table name from namespace name

    // Generate table name from namespace name
    const sanitizedName = namespaceName
      .replace(/[^a-z0-9_]/g, "_")
      .toLowerCase();
    return `${sanitizedName}_user_source`;
  }

  /**
   * Create a new namespace
   * @param {Object} namespaceData - Namespace configuration
   * @param {string} namespaceData.name - Namespace name
   * @param {Array} namespaceData.keywords - Keywords to match in campaign names
   * @param {Object} namespaceData.attio_config - Optional Attio configuration
   * @returns {Promise<Object>} - Created namespace object
   */
  async createNamespace(namespaceData) {
    const { name, keywords, attio_config = null } = namespaceData;

    // Validate namespace name
    if (!name || !/^[a-z][a-z0-9_-]*$/.test(name)) {
      throw new Error(
        "Invalid namespace name. Must start with lowercase letter and contain only lowercase letters, numbers, underscores, and hyphens."
      );
    }

    // Validate keywords
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error("Keywords must be a non-empty array");
    }

    const tableName = await this.getTableNameForNamespace(name);

    try {
      const result = await query(
        `INSERT INTO namespaces (name, keywords, table_name, attio_config)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          name,
          JSON.stringify(keywords),
          tableName,
          attio_config ? JSON.stringify(attio_config) : null,
        ]
      );

      // Clear cache to force refresh
      this.clearCache();

      logger.info(
        `[Namespace] Created new namespace: ${name} with table: ${tableName}`
      );
      return result.rows[0];
    } catch (error) {
      if (error.code === "23505") {
        // Unique violation
        throw new Error(`Namespace '${name}' already exists`);
      }
      logger.error(`[Namespace] Error creating namespace ${name}:`, error);
      throw error;
    }
  }

  /**
   * Update namespace keywords or configuration
   * @param {string} namespaceName - Name of the namespace to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} - Updated namespace object
   */
  async updateNamespace(namespaceName, updateData) {
    const { keywords, attio_config, is_active } = updateData;

    try {
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (keywords !== undefined) {
        if (!Array.isArray(keywords)) {
          throw new Error("Keywords must be an array");
        }
        updates.push(`keywords = $${paramCount++}`);
        values.push(JSON.stringify(keywords));
      }

      if (attio_config !== undefined) {
        updates.push(`attio_config = $${paramCount++}`);
        values.push(attio_config ? JSON.stringify(attio_config) : null);
      }

      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCount++}`);
        values.push(is_active);
      }

      if (updates.length === 0) {
        throw new Error("No updates provided");
      }

      values.push(namespaceName); // WHERE condition

      const result = await query(
        `UPDATE namespaces 
         SET ${updates.join(", ")}
         WHERE name = $${paramCount}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error(`Namespace '${namespaceName}' not found`);
      }

      // Clear cache to force refresh
      this.clearCache();

      logger.info(`[Namespace] Updated namespace: ${namespaceName}`);
      return result.rows[0];
    } catch (error) {
      logger.error(
        `[Namespace] Error updating namespace ${namespaceName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get Attio configuration for a namespace
   * @param {string} namespaceName - Name of the namespace
   * @returns {Promise<Object|null>} - Attio configuration or null
   */
  async getAttioConfigForNamespace(namespaceName) {
    const namespace = await this.getNamespaceByName(namespaceName);
    return namespace && namespace.attio_config ? namespace.attio_config : null;
  }

  /**
   * Clear the namespace cache
   */
  clearCache() {
    this.cache.clear();
    this.lastCacheUpdate = 0;
    logger.debug("[Namespace] Cache cleared");
  }

  /**
   * Get namespace statistics
   * @returns {Promise<Object>} - Statistics about namespaces
   */
  async getNamespaceStats() {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_namespaces,
          COUNT(CASE WHEN is_active THEN 1 END) as active_namespaces,
          COUNT(CASE WHEN attio_config IS NOT NULL THEN 1 END) as namespaces_with_attio
        FROM namespaces
      `);

      return result.rows[0];
    } catch (error) {
      logger.error("[Namespace] Error fetching namespace stats:", error);
      return {
        total_namespaces: 0,
        active_namespaces: 0,
        namespaces_with_attio: 0,
      };
    }
  }

  /**
   * Validate that a namespace table exists
   * @param {string} namespaceName - Name of the namespace
   * @returns {Promise<boolean>} - True if table exists
   */
  async validateNamespaceTable(namespaceName) {
    const tableName = await this.getTableNameForNamespace(namespaceName);

    try {
      const result = await query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )`,
        [tableName]
      );

      return result.rows[0].exists;
    } catch (error) {
      logger.error(`[Namespace] Error validating table ${tableName}:`, error);
      return false;
    }
  }
}

module.exports = NamespaceService;
