-- Drop existing table
DROP TABLE IF EXISTS sent_events;

-- Recreate with updated schema
CREATE TABLE sent_events (
    id SERIAL PRIMARY KEY,
    event_key VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    linkedin_profile TEXT,
    event_type VARCHAR(100) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX idx_sent_events_email ON sent_events(email);
CREATE INDEX idx_sent_events_event_type ON sent_events(event_type);
CREATE INDEX idx_sent_events_platform ON sent_events(platform); 