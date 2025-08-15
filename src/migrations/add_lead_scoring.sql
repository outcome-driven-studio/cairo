-- Add lead scoring columns to playmaker_user_source table
ALTER TABLE playmaker_user_source
ADD COLUMN IF NOT EXISTS icp_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS behaviour_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lead_grade VARCHAR(5),
ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS apollo_enriched_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS apollo_data JSONB;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_playmaker_user_source_lead_score ON playmaker_user_source(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_playmaker_user_source_lead_grade ON playmaker_user_source(lead_grade);

-- Create playmaker_lead_scoring reference table
CREATE TABLE IF NOT EXISTS playmaker_lead_scoring (
  id SERIAL PRIMARY KEY,
  scoring_type VARCHAR(20) NOT NULL, -- 'icp' or 'behavior'
  criteria VARCHAR(100) NOT NULL,
  value VARCHAR(100),
  points INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scoring_type, criteria, value)
);

-- Insert ICP scoring configuration
INSERT INTO playmaker_lead_scoring (scoring_type, criteria, value, points) VALUES
-- Funding Stage
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
    updated_at = CURRENT_TIMESTAMP;

-- Insert Behavior scoring configuration
INSERT INTO playmaker_lead_scoring (scoring_type, criteria, value, points) VALUES
('behavior', 'event_type', 'Email Sent', 0),
('behavior', 'event_type', 'Email Opened', 5),
('behavior', 'event_type', 'Email Clicked', 5),
('behavior', 'event_type', 'Email Replied', 10),
('behavior', 'event_type', 'LinkedIn Message Sent', 0),
('behavior', 'event_type', 'LinkedIn Message Opened', 5),
('behavior', 'event_type', 'LinkedIn Message Replied', 10),
('behavior', 'event_type', 'LinkedIn Opened', 5),
('behavior', 'event_type', 'LinkedIn Replied', 10),
('behavior', 'event_type', 'Website Visit', 20),
('behavior', 'event_type', 'Signed Up', 50),
-- Additional common event types
('behavior', 'event_type', 'emailSent', 0),
('behavior', 'event_type', 'emailOpened', 5),
('behavior', 'event_type', 'emailClicked', 5),
('behavior', 'event_type', 'emailReplied', 10),
('behavior', 'event_type', 'linkedinMessageSent', 0),
('behavior', 'event_type', 'linkedinMessageOpened', 5),
('behavior', 'event_type', 'linkedinMessageReplied', 10)
ON CONFLICT (scoring_type, criteria, value) DO UPDATE 
SET points = EXCLUDED.points,
    updated_at = CURRENT_TIMESTAMP;