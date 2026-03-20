const express = require('express');
const logger = require('../utils/logger');
const GDPRService = require('../services/gdprService');

class GDPRRoutes {
  constructor() {
    this.gdprService = new GDPRService();
  }

  setupRoutes() {
    const router = express.Router();

    router.delete('/users/:userId', async (req, res) => {
      try {
        const { namespace = 'default' } = req.query;
        const result = await this.gdprService.deleteUser(req.params.userId, namespace, 'api');
        res.json({ success: true, ...result });
      } catch (error) {
        logger.error('GDPR delete error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.post('/users/:userId/suppress', async (req, res) => {
      try {
        const { reason = '', namespace = 'default' } = req.body;
        const result = await this.gdprService.suppressUser(req.params.userId, namespace, reason, 'api');
        res.json({ success: true, ...result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.post('/users/:userId/unsuppress', async (req, res) => {
      try {
        const { namespace = 'default' } = req.body;
        const result = await this.gdprService.unsuppressUser(req.params.userId, namespace, 'api');
        res.json({ success: true, ...result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/users/:userId/suppression-status', async (req, res) => {
      try {
        const { namespace = 'default' } = req.query;
        const suppressed = await this.gdprService.isSuppressed(req.params.userId, namespace);
        res.json({ success: true, userId: req.params.userId, suppressed });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/audit-log', async (req, res) => {
      try {
        const { userId, namespace = 'default' } = req.query;
        if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
        const log = await this.gdprService.getAuditLog(userId, namespace);
        res.json({ success: true, auditLog: log });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/suppressions', async (req, res) => {
      try {
        const { namespace = 'default', limit = 100 } = req.query;
        const suppressions = await this.gdprService.getSuppressions(namespace, parseInt(limit));
        res.json({ success: true, suppressions });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    return router;
  }
}

module.exports = GDPRRoutes;
