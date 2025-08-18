// Core tables migration for Cairo CDP
// This migration creates all essential tables required for Cairo to function

const logger = require('../utils/logger');

async function up(query) {
    logger.info('Creating core tables for Cairo CDP...');

    try {
        // Enable required extensions
        await query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

        // Create the main user table (playmaker_user_source)
        // This is the primary table referenced throughout the codebase
        await query(`
      CREATE TABLE IF NOT EXISTS playmaker_user_source (
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
        
        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
        logger.info('✅ playmaker_user_source table created');

        // Create event_source table for tracking all events
        await query(`
      CREATE TABLE IF NOT EXISTS event_source (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_key VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        user_id TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
        logger.info('✅ event_source table created');

        // Create campaigns table
        await query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        external_id VARCHAR(255) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB,
        UNIQUE(external_id, platform)
      )
    `);
        logger.info('✅ campaigns table created');

        // Create sent_events table for deduplication
        await query(`
      CREATE TABLE IF NOT EXISTS sent_events (
        id SERIAL PRIMARY KEY,
        event_key VARCHAR(255) UNIQUE NOT NULL,
        platform VARCHAR(50) NOT NULL,
        event_type VARCHAR(100),
        user_id VARCHAR(255),
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      )
    `);
        logger.info('✅ sent_events table created');

        // Create lead scoring configuration table
        await query(`
      CREATE TABLE IF NOT EXISTS playmaker_lead_scoring (
        id SERIAL PRIMARY KEY,
        scoring_type VARCHAR(20) NOT NULL, -- 'icp' or 'behavior'
        criteria VARCHAR(100) NOT NULL,
        value VARCHAR(100),
        points INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scoring_type, criteria, value)
      )
    `);
        logger.info('✅ playmaker_lead_scoring table created');

        // Create source_users table (legacy compatibility)
        await query(`
      CREATE TABLE IF NOT EXISTS source_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        linkedin_profile TEXT,
        enrichment_profile JSONB,
        enrichment_status VARCHAR(50) DEFAULT 'pending',
        last_enrichment_attempt TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
        logger.info('✅ source_users table created');

        // Create user_source table (for server compatibility)
        await query(`
      CREATE TABLE IF NOT EXISTS user_source (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE,
        linkedin_profile TEXT,
        enrichment_profile JSONB,
        meta JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
        logger.info('✅ user_source table created');

        // Create sync_state table for tracking sync status
        // Note: Check if sync_state already exists with different schema
        const syncStateExists = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'app' AND table_name = 'sync_state'
      )
    `);

        if (!syncStateExists.rows[0].exists) {
            await query(`
        CREATE TABLE sync_state (
          id SERIAL PRIMARY KEY,
          platform VARCHAR(50) NOT NULL,
          last_sync_time TIMESTAMP WITH TIME ZONE,
          sync_type VARCHAR(50) NOT NULL DEFAULT 'full',
          status VARCHAR(20) DEFAULT 'pending',
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(platform, sync_type)
        )
      `);
            logger.info('✅ sync_state table created');
        } else {
            logger.info('✅ sync_state table already exists (keeping existing schema)');
        }

        // Create all indexes
        logger.info('Creating indexes...');

        // playmaker_user_source indexes
        await query('CREATE INDEX IF NOT EXISTS idx_playmaker_user_source_email ON playmaker_user_source(email)');
        await query('CREATE INDEX IF NOT EXISTS idx_playmaker_user_source_lead_score ON playmaker_user_source(lead_score DESC)');
        await query('CREATE INDEX IF NOT EXISTS idx_playmaker_user_source_lead_grade ON playmaker_user_source(lead_grade)');
        await query('CREATE INDEX IF NOT EXISTS idx_playmaker_user_source_enrichment_status ON playmaker_user_source(enrichment_status)');
        await query('CREATE INDEX IF NOT EXISTS idx_hunter_enriched_at ON playmaker_user_source(hunter_enriched_at)');
        await query('CREATE INDEX IF NOT EXISTS idx_enrichment_source ON playmaker_user_source(enrichment_source)');

        // event_source indexes
        await query('CREATE INDEX IF NOT EXISTS idx_event_source_user_id ON event_source(user_id)');
        await query('CREATE INDEX IF NOT EXISTS idx_event_source_event_type ON event_source(event_type)');
        await query('CREATE INDEX IF NOT EXISTS idx_event_source_platform ON event_source(platform)');
        await query('CREATE INDEX IF NOT EXISTS idx_event_source_created_at ON event_source(created_at)');

        // sent_events indexes
        await query('CREATE INDEX IF NOT EXISTS idx_sent_events_event_key ON sent_events(event_key)');
        await query('CREATE INDEX IF NOT EXISTS idx_sent_events_platform ON sent_events(platform)');
        await query('CREATE INDEX IF NOT EXISTS idx_sent_events_user_id ON sent_events(user_id)');

        // sync_state indexes (check if columns exist first)
        const syncStateColumns = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'app' AND table_name = 'sync_state'
    `);
        const syncStateColumnNames = syncStateColumns.rows.map(row => row.column_name);

        if (syncStateColumnNames.includes('platform')) {
            await query('CREATE INDEX IF NOT EXISTS idx_sync_state_platform ON sync_state(platform)');
            logger.info('✅ sync_state platform index created');
        } else {
            logger.info('sync_state.platform column does not exist, skipping index');
        }

        if (syncStateColumnNames.includes('status')) {
            await query('CREATE INDEX IF NOT EXISTS idx_sync_state_status ON sync_state(status)');
            logger.info('✅ sync_state status index created');
        } else {
            logger.info('sync_state.status column does not exist, skipping index');
        }

        // source_users indexes (check if columns exist first)
        const sourceUsersColumns = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'app' AND table_name = 'source_users'
    `);
        const sourceUsersColumnNames = sourceUsersColumns.rows.map(row => row.column_name);

        if (sourceUsersColumnNames.includes('email')) {
            await query('CREATE INDEX IF NOT EXISTS idx_source_users_email ON source_users(email)');
            logger.info('✅ source_users email index created');
        }

        if (sourceUsersColumnNames.includes('enrichment_status')) {
            await query('CREATE INDEX IF NOT EXISTS idx_source_users_enrichment_status ON source_users(enrichment_status)');
            logger.info('✅ source_users enrichment_status index created');
        } else {
            logger.info('source_users.enrichment_status column does not exist, skipping index');
        }

        logger.info('✅ All indexes created');

        // Insert default scoring configurations
        logger.info('Inserting default scoring configurations...');

        // Insert ICP scoring configuration
        await query(`
      INSERT INTO playmaker_lead_scoring (scoring_type, criteria, value, points) VALUES
      -- Funding Stage
      ('icp', 'funding_stage', 'Seed', 10),
      ('icp', 'funding_stage', 'Series A', 15),
      ('icp', 'funding_stage', 'Series B', 20),
      -- ARR Range
      ('icp', 'arr_range', '1M-10M', 20),
      ('icp', 'arr_range', '10M-50M', 40),
      -- Headcount
      ('icp', 'headcount', '1-10', 10),
      ('icp', 'headcount', '11-50', 30),
      ('icp', 'headcount', '51-250', 40)
      ON CONFLICT (scoring_type, criteria, value) DO UPDATE 
      SET points = EXCLUDED.points,
          updated_at = CURRENT_TIMESTAMP
    `);

        // Insert Behavior scoring configuration
        await query(`
      INSERT INTO playmaker_lead_scoring (scoring_type, criteria, value, points) VALUES
      ('behavior', 'event_type', 'Email Sent', 0),
      ('behavior', 'event_type', 'Email Opened', 5),
      ('behavior', 'event_type', 'Email Clicked', 5),
      ('behavior', 'event_type', 'Email Replied', 10),
      ('behavior', 'event_type', 'LinkedIn Message', 10),
      ('behavior', 'event_type', 'Website Visit', 5)
      ON CONFLICT (scoring_type, criteria, value) DO UPDATE 
      SET points = EXCLUDED.points,
          updated_at = CURRENT_TIMESTAMP
    `);

        logger.info('✅ Default scoring configurations inserted');
        logger.info('🎉 Core tables migration completed successfully!');

    } catch (error) {
        logger.error('❌ Failed to create core tables:', error);
        throw error;
    }
}

module.exports = { up };