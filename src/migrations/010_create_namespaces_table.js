// Namespace system migration for Cairo CDP
// This migration creates the namespaces table for multi-tenant data segregation

const logger = require("../utils/logger");

async function up(query) {
  logger.info("Creating namespaces table for multi-tenant support...");

  try {
    // Create the namespaces table
    await query(`
            CREATE TABLE IF NOT EXISTS namespaces (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
                table_name VARCHAR(100) NOT NULL,
                attio_config JSONB DEFAULT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- Constraints
                CONSTRAINT namespaces_name_valid CHECK (name ~ '^[a-z][a-z0-9_-]*$'),
                CONSTRAINT namespaces_table_name_valid CHECK (table_name ~ '^[a-z][a-z0-9_]*_user_source$')
            )
        `);

    // Create indexes for performance
    await query(`
            CREATE INDEX IF NOT EXISTS idx_namespaces_name ON namespaces(name);
        `);

    await query(`
            CREATE INDEX IF NOT EXISTS idx_namespaces_active ON namespaces(is_active);
        `);

    // Create function to update updated_at timestamp
    await query(`
            CREATE OR REPLACE FUNCTION update_namespaces_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

    // Create trigger for auto-updating updated_at
    await query(`
            DROP TRIGGER IF EXISTS update_namespaces_updated_at ON namespaces;
            CREATE TRIGGER update_namespaces_updated_at
                BEFORE UPDATE ON namespaces
                FOR EACH ROW
                EXECUTE FUNCTION update_namespaces_updated_at();
        `);

    // Insert default namespace that maps to existing playmaker_user_source table
    await query(`
            INSERT INTO namespaces (name, keywords, table_name, is_active)
            VALUES ('playmaker', '["default"]'::jsonb, 'playmaker_user_source', true)
            ON CONFLICT (name) DO NOTHING
        `);

    logger.info("✅ namespaces table created successfully");
    logger.info('✅ Default "playmaker" namespace created');
  } catch (error) {
    logger.error("❌ Failed to create namespaces table:", error);
    throw error;
  }
}

async function down(query) {
  logger.info("Rolling back namespaces table creation...");

  try {
    // Drop trigger and function
    await query(
      "DROP TRIGGER IF EXISTS update_namespaces_updated_at ON namespaces"
    );
    await query("DROP FUNCTION IF EXISTS update_namespaces_updated_at()");

    // Drop table
    await query("DROP TABLE IF EXISTS namespaces");

    logger.info("✅ namespaces table rollback completed");
  } catch (error) {
    logger.error("❌ Failed to rollback namespaces table:", error);
    throw error;
  }
}

module.exports = { up, down };
