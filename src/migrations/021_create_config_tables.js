// Configuration tables migration for Cairo CDP UI
// Creates tables for managing sources and destinations

const logger = require('../utils/logger');

async function up(query) {
    logger.info('Creating configuration tables...');

    try {
        // Create sources table
        await query(`
            CREATE TABLE IF NOT EXISTS sources (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL,
                write_key VARCHAR(255) UNIQUE NOT NULL,
                enabled BOOLEAN DEFAULT true,
                settings JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        logger.info('✅ sources table created');

        // Create destinations table
        await query(`
            CREATE TABLE IF NOT EXISTS destinations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL,
                enabled BOOLEAN DEFAULT true,
                settings JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        logger.info('✅ destinations table created');

        // Create transformations table
        await query(`
            CREATE TABLE IF NOT EXISTS transformations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
                destination_id UUID REFERENCES destinations(id) ON DELETE CASCADE,
                enabled BOOLEAN DEFAULT true,
                conditions JSONB DEFAULT '[]',
                mappings JSONB DEFAULT '{}',
                code TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        logger.info('✅ transformations table created');

        // Create event_logs table for debugging
        await query(`
            CREATE TABLE IF NOT EXISTS event_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
                event_type VARCHAR(100) NOT NULL,
                user_id VARCHAR(255),
                event_data JSONB,
                processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                destinations_sent JSONB DEFAULT '[]',
                errors JSONB DEFAULT '[]'
            )
        `);
        logger.info('✅ event_logs table created');

        // Create indexes for performance
        await query(`
            CREATE INDEX IF NOT EXISTS idx_sources_write_key ON sources(write_key);
            CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
            CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);

            CREATE INDEX IF NOT EXISTS idx_destinations_type ON destinations(type);
            CREATE INDEX IF NOT EXISTS idx_destinations_enabled ON destinations(enabled);

            CREATE INDEX IF NOT EXISTS idx_transformations_source ON transformations(source_id);
            CREATE INDEX IF NOT EXISTS idx_transformations_destination ON transformations(destination_id);
            CREATE INDEX IF NOT EXISTS idx_transformations_enabled ON transformations(enabled);

            CREATE INDEX IF NOT EXISTS idx_event_logs_source ON event_logs(source_id);
            CREATE INDEX IF NOT EXISTS idx_event_logs_processed_at ON event_logs(processed_at);
            CREATE INDEX IF NOT EXISTS idx_event_logs_event_type ON event_logs(event_type);
        `);
        logger.info('✅ Configuration table indexes created');

        // Insert default sources if they don't exist
        const existingSources = await query('SELECT COUNT(*) FROM sources');
        if (existingSources.rows[0].count === '0') {
            await query(`
                INSERT INTO sources (name, type, write_key, enabled, settings) VALUES
                ('JavaScript SDK', 'javascript', 'wk_javascript_default_key_123456789', true, '{"domains": ["localhost"], "autoTrack": {"pageViews": true}}'),
                ('Node.js SDK', 'nodejs', 'wk_nodejs_default_key_987654321', true, '{"serverSide": true}'),
                ('React SDK', 'react', 'wk_react_default_key_456789123', true, '{"framework": "react", "autoTrack": {"pageViews": true, "clicks": true}}')
            `);
            logger.info('✅ Default sources inserted');
        }

        // Insert default destinations based on environment variables
        const existingDestinations = await query('SELECT COUNT(*) FROM destinations');
        if (existingDestinations.rows[0].count === '0') {
            if (process.env.SLACK_WEBHOOK_URL) {
                await query(`
                    INSERT INTO destinations (name, type, enabled, settings) VALUES
                    ('Slack Notifications', 'slack', true, $1)
                `, [JSON.stringify({
                    webhookUrl: process.env.SLACK_WEBHOOK_URL,
                    channel: process.env.SLACK_DEFAULT_CHANNEL || '#events',
                    alertEvents: process.env.SLACK_ALERT_EVENTS?.split(',') || ['signup', 'purchase']
                })]);
                logger.info('✅ Default Slack destination inserted');
            }

            if (process.env.MIXPANEL_PROJECT_TOKEN) {
                await query(`
                    INSERT INTO destinations (name, type, enabled, settings) VALUES
                    ('Mixpanel Analytics', 'mixpanel', true, $1)
                `, [JSON.stringify({
                    projectToken: process.env.MIXPANEL_PROJECT_TOKEN,
                    apiSecret: process.env.MIXPANEL_API_SECRET
                })]);
                logger.info('✅ Default Mixpanel destination inserted');
            }

            // Always insert database destination
            await query(`
                INSERT INTO destinations (name, type, enabled, settings) VALUES
                ('PostgreSQL Database', 'database', true, '{"table": "event_source", "namespace": "default"}')
            `);
            logger.info('✅ Default Database destination inserted');
        }

        logger.info('✅ Configuration tables migration completed successfully');

    } catch (error) {
        logger.error('❌ Configuration tables migration failed:', error);
        throw error;
    }
}

async function down(query) {
    logger.info('Rolling back configuration tables...');

    try {
        // Drop tables in reverse order due to foreign key constraints
        await query('DROP TABLE IF EXISTS event_logs CASCADE');
        await query('DROP TABLE IF EXISTS transformations CASCADE');
        await query('DROP TABLE IF EXISTS destinations CASCADE');
        await query('DROP TABLE IF EXISTS sources CASCADE');

        logger.info('✅ Configuration tables rolled back successfully');
    } catch (error) {
        logger.error('❌ Configuration tables rollback failed:', error);
        throw error;
    }
}

module.exports = { up, down };