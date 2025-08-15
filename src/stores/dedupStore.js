const { Pool } = require('pg');
const logger = require('../utils/logger');

class DedupStore {
  constructor(pool) {
    this.pool = pool;
  }

  async findOrCreateSourceUser({ email, linkedin_profile }) {
    try {
      // First try to find the user
      const findResult = await this.pool.query(
        'SELECT * FROM source_users WHERE email = $1',
        [email]
      );

      if (findResult.rows.length > 0) {
        logger.info(`Found existing user: ${email}`);
        return findResult.rows[0];
      }

      // If not found, create new user
      const createResult = await this.pool.query(
        'INSERT INTO source_users (email, linkedin_profile) VALUES ($1, $2) RETURNING *',
        [email, linkedin_profile]
      );

      logger.info(`Created new user: ${email}`);
      return createResult.rows[0];
    } catch (error) {
      logger.error(`Error in findOrCreateSourceUser: ${error.message}`);
      throw error;
    }
  }

  async updateSourceUserTimestamp(userId) {
    try {
      await this.pool.query(
        'UPDATE source_users SET updated_at = NOW() WHERE id = $1',
        [userId]
      );
    } catch (error) {
      logger.error(`Error updating user timestamp: ${error.message}`);
      throw error;
    }
  }

  async getSourceUserCount() {
    try {
      const result = await this.pool.query('SELECT COUNT(*) FROM source_users');
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error('Error getting source user count:', error);
      throw error;
    }
  }

  async checkTableStatus() {
    try {
      const result = await this.pool.query(`
        SELECT COUNT(*) as total,
               COUNT(CASE WHEN updated_at > NOW() - INTERVAL '15 minutes' THEN 1 END) as recent
        FROM source_users
      `);
      logger.info(`Table status: ${JSON.stringify(result.rows[0])}`);
    } catch (error) {
      logger.error(`Error checking table status: ${error.message}`);
      throw error;
    }
  }
}

module.exports = DedupStore; 