const express = require('express');
const logger = require('../utils/logger');
const IdentityService = require('../services/identityService');

class IdentityRoutes {
  constructor() {
    this.identityService = new IdentityService();
  }

  setupRoutes() {
    const router = express.Router();

    router.get('/resolve', async (req, res) => {
      try {
        const { userId, anonymousId, email, namespace = 'default' } = req.query;
        if (!userId && !anonymousId && !email) {
          return res.status(400).json({ success: false, error: 'At least one identifier required' });
        }
        const result = await this.identityService.resolve({ userId, anonymousId, email, namespace });
        res.json({ success: true, ...result });
      } catch (error) {
        logger.error('Identity resolve error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/:canonicalId', async (req, res) => {
      try {
        const { namespace = 'default' } = req.query;
        const identities = await this.identityService.getIdentities(req.params.canonicalId, namespace);
        res.json({ success: true, canonicalId: req.params.canonicalId, identities });
      } catch (error) {
        logger.error('Identity get error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.post('/alias', async (req, res) => {
      try {
        const { previousId, userId, namespace = 'default' } = req.body;
        if (!previousId || !userId) {
          return res.status(400).json({ success: false, error: 'previousId and userId required' });
        }
        const result = await this.identityService.alias({ previousId, userId, namespace });
        res.json({ success: true, ...result });
      } catch (error) {
        logger.error('Identity alias error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/lookup', async (req, res) => {
      try {
        const { type, value, namespace = 'default' } = req.query;
        if (!type || !value) {
          return res.status(400).json({ success: false, error: 'type and value required' });
        }
        const result = await this.identityService.lookup(type, value, namespace);
        res.json({ success: true, identity: result });
      } catch (error) {
        logger.error('Identity lookup error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    return router;
  }
}

module.exports = IdentityRoutes;
