-- Add Hunter.io data columns to user tables
-- Note: This migration adds Hunter.io support to whichever user table exists

DO $$ 
BEGIN
    -- Check if playmaker_user_source exists and add columns
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'playmaker_user_source') THEN
        ALTER TABLE playmaker_user_source
        ADD COLUMN IF NOT EXISTS hunter_data JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS hunter_enriched_at TIMESTAMP DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS enrichment_source VARCHAR(50) DEFAULT 'apollo';
        
        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_hunter_enriched_at ON playmaker_user_source(hunter_enriched_at);
        CREATE INDEX IF NOT EXISTS idx_enrichment_source ON playmaker_user_source(enrichment_source);
        
        RAISE NOTICE 'Hunter columns added to playmaker_user_source table';
    END IF;
    
    -- Also check for user_source table (legacy name)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_source') THEN
        ALTER TABLE user_source
        ADD COLUMN IF NOT EXISTS hunter_data JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS hunter_enriched_at TIMESTAMP DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS enrichment_source VARCHAR(50) DEFAULT 'apollo';
        
        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_hunter_enriched_at_user ON user_source(hunter_enriched_at);
        CREATE INDEX IF NOT EXISTS idx_enrichment_source_user ON user_source(enrichment_source);
        
        RAISE NOTICE 'Hunter columns added to user_source table';
    END IF;
END $$;
