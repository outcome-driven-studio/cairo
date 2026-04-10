const express = require('express');
const logger = require('../utils/logger');
const ErrorTrackingService = require('../services/errorTrackingService');
const { getServices } = require('../services/serviceFactory');

class ErrorRoutes {
  constructor() {
    this.errorService = new ErrorTrackingService();
    this.services = getServices();
    logger.info('Error Routes initialized');
  }

  authenticate(req, res, next) {
    const writeKey = req.headers['x-write-key'] || req.headers.authorization?.replace('Bearer ', '');
    if (!writeKey) {
      return res.status(401).json({ success: false, error: 'Missing write key' });
    }
    req.writeKey = writeKey;
    next();
  }

  /**
   * POST /api/v2/errors/capture
   * Ingest an error event (SDK / agent / manual)
   */
  async handleCapture(req, res) {
    try {
      const result = await this.errorService.capture(req.body);

      // Forward to Discord/Slack for fatal/error level
      const level = req.body.level || 'error';
      if (level === 'fatal' || level === 'error') {
        this._notifyChannels(req.body, result);
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

  /**
   * POST /api/v2/errors/batch
   * Ingest multiple errors at once.
   */
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
          const result = await this.errorService.capture(errorData);
          results.push(result);
        } catch (err) {
          failures.push({ message: errorData.message, error: err.message });
        }
      }

      res.status(201).json({ success: true, captured: results.length, failed: failures.length, failures });
    } catch (error) {
      logger.error('[ErrorRoutes] Batch capture failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/v2/errors
   * Query error events.
   */
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
      logger.error('[ErrorRoutes] Query failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/v2/errors/groups
   */
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
      logger.error('[ErrorRoutes] List groups failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/v2/errors/groups/:fingerprint
   */
  async handleGetGroup(req, res) {
    try {
      const group = await this.errorService.getErrorGroup(req.params.fingerprint);
      if (!group) {
        return res.status(404).json({ success: false, error: 'Error group not found' });
      }
      res.json({ success: true, group });
    } catch (error) {
      logger.error('[ErrorRoutes] Get group failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * PATCH /api/v2/errors/groups/:fingerprint
   * Update status (open, resolved, ignored).
   */
  async handleUpdateGroup(req, res) {
    try {
      const { status, assigned_to } = req.body;
      if (!status || !['open', 'resolved', 'ignored', 'regressed'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Valid status required: open, resolved, ignored' });
      }

      const group = await this.errorService.updateStatus(req.params.fingerprint, status, assigned_to);
      if (!group) {
        return res.status(404).json({ success: false, error: 'Error group not found' });
      }
      res.json({ success: true, group });
    } catch (error) {
      logger.error('[ErrorRoutes] Update group failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/v2/errors/trends
   */
  async handleTrends(req, res) {
    try {
      const { namespace = 'default', timeRange = '24h', groupBy = 'hour' } = req.query;
      const trends = await this.errorService.getTrends({ namespace, timeRange, groupBy });
      res.json({ success: true, trends });
    } catch (error) {
      logger.error('[ErrorRoutes] Trends failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Fire-and-forget notifications to Discord/Slack for critical errors.
   */
  _notifyChannels(errorData, result) {
    try {
      const msg = `[${(errorData.level || 'error').toUpperCase()}] ${errorData.message}`;
      const details = errorData.source_file
        ? `${errorData.source_file}:${errorData.source_line || '?'}`
        : errorData.url || 'unknown source';

      if (this.services.discordService?.enabled) {
        this.services.discordService.sendCustomAlert({
          title: `Error: ${errorData.type || 'error'}`,
          message: `${msg}\n**Source:** ${details}\n**Fingerprint:** \`${result.fingerprint}\``,
          color: errorData.level === 'fatal' ? '#dc3545' : '#ff9900',
        }).catch(() => {});
      }

      if (this.services.slackService?.enabled) {
        this.services.slackService.sendCustomAlert({
          title: `Error: ${errorData.type || 'error'}`,
          message: msg,
          color: errorData.level === 'fatal' ? '#dc3545' : '#ff9900',
        }).catch(() => {});
      }
    } catch {
      // Notification failures are non-blocking
    }
  }

  setupRoutes() {
    const router = express.Router();
    router.use(this.authenticate.bind(this));

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
