const { query } = require('../utils/db');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class IdentityService {
  /**
   * Resolve identities: given userId, anonymousId, email → return canonical_id
   */
  async resolve({ userId, anonymousId, email, namespace = 'default' }) {
    const identifiers = [];
    if (userId) identifiers.push({ type: 'userId', value: userId });
    if (anonymousId) identifiers.push({ type: 'anonymousId', value: anonymousId });
    if (email) identifiers.push({ type: 'email', value: email });

    if (identifiers.length === 0) {
      throw new Error('At least one identifier is required');
    }

    // Look up existing identities
    const existingCanonicals = new Set();
    const found = [];

    for (const { type, value } of identifiers) {
      const result = await query(
        'SELECT canonical_id, identity_type, identity_value FROM identity_graph WHERE identity_type = $1 AND identity_value = $2 AND namespace = $3',
        [type, value, namespace]
      );
      if (result.rows.length > 0) {
        existingCanonicals.add(result.rows[0].canonical_id);
        found.push(result.rows[0]);
      }
    }

    let canonicalId;
    let merged = false;

    if (existingCanonicals.size === 0) {
      // No existing identities - create new canonical
      canonicalId = uuidv4();
      for (const { type, value } of identifiers) {
        await this._linkIdentity(canonicalId, type, value, namespace);
      }
    } else if (existingCanonicals.size === 1) {
      // All found identities belong to same canonical
      canonicalId = [...existingCanonicals][0];
      // Add any missing identifiers
      for (const { type, value } of identifiers) {
        const exists = found.some(f => f.identity_type === type && f.identity_value === value);
        if (!exists) {
          await this._linkIdentity(canonicalId, type, value, namespace);
        }
      }
    } else {
      // Multiple canonical IDs found - merge them
      const canonicals = [...existingCanonicals];
      canonicalId = canonicals[0];
      for (let i = 1; i < canonicals.length; i++) {
        await this._mergeCanonicals(canonicalId, canonicals[i], namespace);
      }
      // Add any missing identifiers
      for (const { type, value } of identifiers) {
        const exists = found.some(f => f.identity_type === type && f.identity_value === value);
        if (!exists) {
          await this._linkIdentity(canonicalId, type, value, namespace);
        }
      }
      merged = true;
    }

    const identities = await this.getIdentities(canonicalId, namespace);
    return { canonicalId, identities, merged };
  }

  /**
   * Alias: merge previousId into userId
   */
  async alias({ previousId, userId, namespace = 'default' }) {
    if (!previousId || !userId) {
      throw new Error('Both previousId and userId are required');
    }

    const prevResult = await this.lookup('userId', previousId, namespace);
    const userResult = await this.lookup('userId', userId, namespace);

    if (prevResult && userResult) {
      if (prevResult.canonical_id !== userResult.canonical_id) {
        await this._mergeCanonicals(userResult.canonical_id, prevResult.canonical_id, namespace);
      }
      return { canonicalId: userResult.canonical_id, merged: true };
    } else if (prevResult && !userResult) {
      await this._linkIdentity(prevResult.canonical_id, 'userId', userId, namespace);
      return { canonicalId: prevResult.canonical_id, merged: false };
    } else if (!prevResult && userResult) {
      await this._linkIdentity(userResult.canonical_id, 'userId', previousId, namespace);
      return { canonicalId: userResult.canonical_id, merged: false };
    } else {
      const canonicalId = uuidv4();
      await this._linkIdentity(canonicalId, 'userId', userId, namespace);
      await this._linkIdentity(canonicalId, 'userId', previousId, namespace);
      return { canonicalId, merged: false };
    }
  }

  async getIdentities(canonicalId, namespace = 'default') {
    const result = await query(
      'SELECT identity_type, identity_value, created_at FROM identity_graph WHERE canonical_id = $1 AND namespace = $2 ORDER BY created_at',
      [canonicalId, namespace]
    );
    return result.rows;
  }

  async lookup(identityType, identityValue, namespace = 'default') {
    const result = await query(
      'SELECT canonical_id, identity_type, identity_value FROM identity_graph WHERE identity_type = $1 AND identity_value = $2 AND namespace = $3',
      [identityType, identityValue, namespace]
    );
    return result.rows[0] || null;
  }

  async _linkIdentity(canonicalId, identityType, identityValue, namespace) {
    try {
      await query(
        'INSERT INTO identity_graph (canonical_id, identity_type, identity_value, namespace) VALUES ($1, $2, $3, $4) ON CONFLICT (identity_type, identity_value, namespace) DO NOTHING',
        [canonicalId, identityType, identityValue, namespace]
      );
    } catch (error) {
      logger.error(`Failed to link identity ${identityType}:${identityValue}:`, error.message);
    }
  }

  async _mergeCanonicals(keepCanonicalId, mergeCanonicalId, namespace) {
    try {
      await query(
        'UPDATE identity_graph SET canonical_id = $1 WHERE canonical_id = $2 AND namespace = $3',
        [keepCanonicalId, mergeCanonicalId, namespace]
      );
      logger.info(`Merged canonical ${mergeCanonicalId} into ${keepCanonicalId}`);
    } catch (error) {
      logger.error('Failed to merge canonicals:', error.message);
      throw error;
    }
  }
}

module.exports = IdentityService;
