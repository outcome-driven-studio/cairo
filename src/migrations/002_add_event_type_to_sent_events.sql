-- Add event_type column to sent_events table
ALTER TABLE sent_events ADD COLUMN IF NOT EXISTS event_type TEXT;

-- Extract event_type from event_key for existing records
UPDATE sent_events 
SET event_type = split_part(event_key, ':', 2)
WHERE event_type IS NULL;

-- Make event_type column NOT NULL
ALTER TABLE sent_events ALTER COLUMN event_type SET NOT NULL; 