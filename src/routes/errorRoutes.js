const express = require('express');
const logger = require('../utils/logger');
const ErrorTrackingService = require('../services/errorTrackingService');
const NotificationService = require('../notifications');
const { requireWriteKey } = require('../middleware/auth');

class ErrorRoutes {
  constructor() {
    this.errorService = new ErrorTrackingService();
    this.notifications = new NotificationService();
    logger.info('Error Routes initialized');
  }

  async handleCapture(req, res) {
    try {
      const result = await this.errorService.capture(req.body);
      const level = req.body.level || 'error';
      // Hand off critical errors to a configured agent (CAIRO_ERROR_AGENT_ID)
      if ((level === 'fatal' || level === 'error') && process.env.CAIRO_ERROR_AGENT_ID) {
        this._handoffToAgent(req.body, result).catch(() => {});
      }
      res.status(201).json({ success: true, error_event: result });
    } catch (error) {
      logger.error('[ErrorRoutes] Capture failed:', error);
      res.status(error.message === 'message is required' ? 400 : 500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async handleBatch(req, res) {
    try {
      const { errors } = req.body;
      if (!Array.isArray(errors)) {
        return res.status(400).json({ success: false, error: 'errors array is required' });
      }
      const results = [];
      const failures = [];
      for (const errorData of errors) {
        try {
          results.push(await this.errorService.capture(errorData));
        } catch (err) {
          failures.push({ message: errorData.message, error: err.message });
        }
      }
      res.status(201).json({ success: true, captured: results.length, failed: failures.length, failures });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleQuery(req, res) {
    try {
      const { namespace = 'default', fingerprint, level, user_email, limit = 50, offset = 0 } = req.query;
      const events = await this.errorService.queryErrors({
        namespace, fingerprint, level, user_email,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });
      res.json({ success: true, events });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleListGroups(req, res) {
    try {
      const { namespace = 'default', status, limit = 50, offset = 0 } = req.query;
      const groups = await this.errorService.getErrorGroups({
        namespace, status,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });
      res.json({ success: true, groups });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetGroup(req, res) {
    try {
      const group = await this.errorService.getErrorGroup(req.params.fingerprint);
      if (!group) return res.status(404).json({ success: false, error: 'Error group not found' });
      res.json({ success: true, group });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleUpdateGroup(req, res) {
    try {
      const { status, assigned_to } = req.body;
      if (!status || !['open', 'resolved', 'ignored', 'regressed'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Valid status required' });
      }
      const group = await this.errorService.updateStatus(req.params.fingerprint, status, assigned_to);
      if (!group) return res.status(404).json({ success: false, error: 'Error group not found' });
      res.json({ success: true, group });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleTrends(req, res) {
    try {
      const { namespace = 'default', timeRange = '24h', groupBy = 'hour' } = req.query;
      const trends = await this.errorService.getTrends({ namespace, timeRange, groupBy });
      res.json({ success: true, trends });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async _handoffToAgent(errorData, result) {
    const text = `[${(errorData.level || 'error').toUpperCase()}] ${errorData.message}\nFingerprint: ${result.fingerprint}`;
    await this.notifications.enqueueForAgent({
      agentId: process.env.CAIRO_ERROR_AGENT_ID,
      userId: errorData.user_id || errorData.user_email,
      text,
      eventName: 'error.captured',
      properties: { fingerprint: result.fingerprint, level: errorData.level },
      namespace: errorData.namespace || 'default',
    });
  }

  setupRoutes() {
    const router = express.Router();
    router.use(requireWriteKey);
    router.post('/capture', this.handleCapture.bind(this));
    router.post('/batch', this.handleBatch.bind(this));
    router.get('/', this.handleQuery.bind(this));
    router.get('/groups', this.handleListGroups.bind(this));
    router.get('/groups/:fingerprint', this.handleGetGroup.bind(this));
    router.patch('/groups/:fingerprint', this.handleUpdateGroup.bind(this));
    router.get('/trends', this.handleTrends.bind(this));
    return router;
  }
}

module.exports = ErrorRoutes;
