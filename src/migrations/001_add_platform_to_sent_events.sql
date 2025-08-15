-- Add platform column to sent_events table
ALTER TABLE sent_events ADD COLUMN IF NOT EXISTS platform TEXT;

-- Set default platform for existing records
UPDATE sent_events SET platform = 'unknown' WHERE platform IS NULL;

-- Make platform column NOT NULL
ALTER TABLE sent_events ALTER COLUMN platform SET NOT NULL; 