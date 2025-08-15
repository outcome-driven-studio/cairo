-- Drop existing constraints if any
ALTER TABLE source_users DROP CONSTRAINT IF EXISTS source_users_email_key;

-- Add enrichment_profile column and make linkedin_profile nullable
ALTER TABLE source_users 
  ADD COLUMN IF NOT EXISTS enrichment_profile JSONB,
  ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_enrichment_attempt TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN linkedin_profile DROP NOT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_source_users_email ON source_users(email);
CREATE INDEX IF NOT EXISTS idx_source_users_enrichment_status ON source_users(enrichment_status);

-- Add unique constraint on email
ALTER TABLE source_users ADD CONSTRAINT source_users_email_key UNIQUE (email); 