DROP TABLE IF EXISTS campaigns;

CREATE TABLE campaigns (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    UNIQUE(external_id, platform)
); 