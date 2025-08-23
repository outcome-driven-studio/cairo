const { query } = require("../utils/db");
const logger = require("../utils/logger");

/**
 * TableManagerService handles dynamic creation and management of namespace-specific tables
 * Each namespace gets its own user_source table with identical schema to playmaker_user_source
 */
class TableManagerService {
  constructor() {
    logger.info("TableManagerService initialized");
  }

  /**
   * Create a namespace-specific user_source table
   * @param {string} namespaceName - Name of the namespace
   * @returns {Promise<string>} - Name of the created table
   */
  async createNamespaceTable(namespaceName) {
    const tableName = this.getTableNameForNamespace(namespaceName);

    try {
      logger.info(`[TableManager] Creating table: ${tableName}`);

      // Create the table with same schema as playmaker_user_source
      await query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE,
          original_user_id VARCHAR(255),
          name VARCHAR(255),
          first_name VARCHAR(255),
          last_name VARCHAR(255),
          company VARCHAR(255),
          title VARCHAR(255),
          linkedin_profile TEXT,
          enrichment_profile JSONB,
          meta JSONB NOT NULL DEFAULT '[]'::jsonb,
          
          -- Lead scoring columns
          icp_score INTEGER DEFAULT 0,
          behaviour_score INTEGER DEFAULT 0,
          lead_score INTEGER DEFAULT 0,
          lead_grade VARCHAR(5),
          last_scored_at TIMESTAMP WITH TIME ZONE,
          
          -- Enrichment tracking
          apollo_enriched_at TIMESTAMP WITH TIME ZONE,
          apollo_data JSONB,
          hunter_data JSONB DEFAULT NULL,
          hunter_enriched_at TIMESTAMP DEFAULT NULL,
          enrichment_source VARCHAR(50) DEFAULT 'apollo',
          enrichment_status VARCHAR(50) DEFAULT 'pending',
          last_enrichment_attempt TIMESTAMP WITH TIME ZONE,
          
          -- Platform tracking
          platform VARCHAR(50),
          
          -- Timestamps
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for performance (same as playmaker_user_source)
      await this.createTableIndexes(tableName);

      // Create update trigger for updated_at timestamp
      await this.createUpdateTrigger(tableName);

      logger.info(`✅ Successfully created namespace table: ${tableName}`);
      return tableName;
    } catch (error) {
      logger.error(`❌ Failed to create namespace table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Create necessary indexes for a namespace table
   * @param {string} tableName - Name of the table
   */
  async createTableIndexes(tableName) {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_email ON ${tableName}(email)`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_linkedin_profile ON ${tableName}(linkedin_profile)`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_created_at ON ${tableName}(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_updated_at ON ${tableName}(updated_at)`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_lead_score ON ${tableName}(lead_score)`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_behaviour_score ON ${tableName}(behaviour_score)`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_icp_score ON ${tableName}(icp_score)`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_enrichment_status ON ${tableName}(enrichment_status)`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_platform ON ${tableName}(platform)`,
    ];

    for (const indexQuery of indexes) {
      try {
        await query(indexQuery);
      } catch (error) {
        logger.warn(
          `[TableManager] Failed to create index: ${indexQuery}`,
          error.message
        );
      }
    }

    logger.debug(`[TableManager] Created indexes for table: ${tableName}`);
  }

  /**
   * Create update trigger for updated_at column
   * @param {string} tableName - Name of the table
   */
  async createUpdateTrigger(tableName) {
    const functionName = `update_${tableName}_updated_at`;
    const triggerName = `update_${tableName}_updated_at_trigger`;

    try {
      // Create or replace the trigger function
      await query(`
        CREATE OR REPLACE FUNCTION ${functionName}()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ language 'plpgsql'
      `);

      // Drop existing trigger if it exists, then create new one
      await query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`);

      await query(`
        CREATE TRIGGER ${triggerName}
          BEFORE UPDATE ON ${tableName}
          FOR EACH ROW
          EXECUTE FUNCTION ${functionName}()
      `);

      logger.debug(
        `[TableManager] Created update trigger for table: ${tableName}`
      );
    } catch (error) {
      logger.warn(
        `[TableManager] Failed to create update trigger for ${tableName}:`,
        error.message
      );
    }
  }

  /**
   * Ensure a namespace table exists, creating it if necessary
   * @param {string} namespaceName - Name of the namespace
   * @returns {Promise<string>} - Name of the table
   */
  async ensureNamespaceTableExists(namespaceName) {
    const tableName = this.getTableNameForNamespace(namespaceName);

    // Check if table already exists
    const exists = await this.tableExists(tableName);

    if (exists) {
      logger.debug(`[TableManager] Table ${tableName} already exists`);
      return tableName;
    }

    // Create the table
    return await this.createNamespaceTable(namespaceName);
  }

  /**
   * Check if a table exists in the database
   * @param {string} tableName - Name of the table
   * @returns {Promise<boolean>} - True if table exists
   */
  async tableExists(tableName) {
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
      logger.error(
        `[TableManager] Error checking if table ${tableName} exists:`,
        error
      );
      return false;
    }
  }

  /**
   * Get the table name for a namespace
   * @param {string} namespaceName - Name of the namespace
   * @returns {string} - Table name
   */
  getTableNameForNamespace(namespaceName) {
    if (namespaceName === "playmaker") {
      return "playmaker_user_source"; // Use existing table for default namespace
    }

    // Generate table name from namespace name
    const sanitizedName = namespaceName
      .replace(/[^a-z0-9_]/g, "_")
      .toLowerCase();
    return `${sanitizedName}_user_source`;
  }

  /**
   * Drop a namespace table (use with caution!)
   * @param {string} namespaceName - Name of the namespace
   * @returns {Promise<boolean>} - True if successfully dropped
   */
  async dropNamespaceTable(namespaceName) {
    // Safety check: never drop the default playmaker table
    if (namespaceName === "playmaker") {
      throw new Error("Cannot drop the default playmaker_user_source table");
    }

    const tableName = this.getTableNameForNamespace(namespaceName);

    try {
      // Drop the trigger function first
      const functionName = `update_${tableName}_updated_at`;
      await query(`DROP FUNCTION IF EXISTS ${functionName}() CASCADE`);

      // Drop the table
      await query(`DROP TABLE IF EXISTS ${tableName}`);

      logger.info(`[TableManager] Dropped namespace table: ${tableName}`);
      return true;
    } catch (error) {
      logger.error(`[TableManager] Error dropping table ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Get table statistics for a namespace
   * @param {string} namespaceName - Name of the namespace
   * @returns {Promise<Object>} - Statistics about the table
   */
  async getTableStats(namespaceName) {
    const tableName = this.getTableNameForNamespace(namespaceName);

    if (!(await this.tableExists(tableName))) {
      return {
        exists: false,
        total_users: 0,
        users_with_scores: 0,
        enriched_users: 0,
      };
    }

    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN lead_score > 0 THEN 1 END) as users_with_scores,
          COUNT(CASE WHEN enrichment_status = 'completed' THEN 1 END) as enriched_users
        FROM ${tableName}
      `);

      return {
        exists: true,
        table_name: tableName,
        ...result.rows[0],
      };
    } catch (error) {
      logger.error(
        `[TableManager] Error getting stats for table ${tableName}:`,
        error
      );
      return {
        exists: true,
        table_name: tableName,
        total_users: 0,
        users_with_scores: 0,
        enriched_users: 0,
        error: error.message,
      };
    }
  }

  /**
   * Copy data from one namespace table to another (for migration purposes)
   * @param {string} sourceNamespace - Source namespace
   * @param {string} targetNamespace - Target namespace
   * @returns {Promise<number>} - Number of records copied
   */
  async copyNamespaceData(sourceNamespace, targetNamespace) {
    const sourceTable = this.getTableNameForNamespace(sourceNamespace);
    const targetTable = this.getTableNameForNamespace(targetNamespace);

    // Ensure target table exists
    await this.ensureNamespaceTableExists(targetNamespace);

    try {
      const result = await query(`
        INSERT INTO ${targetTable} (
          email, original_user_id, name, first_name, last_name, company, title,
          linkedin_profile, enrichment_profile, meta, icp_score, behaviour_score,
          lead_score, lead_grade, last_scored_at, apollo_enriched_at, apollo_data,
          hunter_data, hunter_enriched_at, enrichment_source, enrichment_status,
          last_enrichment_attempt, platform, created_at
        )
        SELECT 
          email, original_user_id, name, first_name, last_name, company, title,
          linkedin_profile, enrichment_profile, meta, icp_score, behaviour_score,
          lead_score, lead_grade, last_scored_at, apollo_enriched_at, apollo_data,
          hunter_data, hunter_enriched_at, enrichment_source, enrichment_status,
          last_enrichment_attempt, platform, created_at
        FROM ${sourceTable}
        ON CONFLICT (email) DO NOTHING
      `);

      const copiedCount = result.rowCount;
      logger.info(
        `[TableManager] Copied ${copiedCount} records from ${sourceTable} to ${targetTable}`
      );
      return copiedCount;
    } catch (error) {
      logger.error(
        `[TableManager] Error copying data from ${sourceTable} to ${targetTable}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all namespace tables in the database
   * @returns {Promise<Array>} - Array of table names that match namespace pattern
   */
  async getAllNamespaceTables() {
    try {
      const result = await query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name ~ '_user_source$'
        AND table_schema = 'public'
        ORDER BY table_name
      `);

      return result.rows.map((row) => row.table_name);
    } catch (error) {
      logger.error("[TableManager] Error fetching namespace tables:", error);
      return [];
    }
  }
}

module.exports = TableManagerService;
