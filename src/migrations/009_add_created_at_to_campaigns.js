module.exports = {
  up: async (query) => {
    await query(`
      ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE;
    `);
  },
  down: async (query) => {
    // This will remove the column. Be cautious in production.
    await query(`
      ALTER TABLE campaigns
      DROP COLUMN IF EXISTS created_at;
    `);
  },
}; 