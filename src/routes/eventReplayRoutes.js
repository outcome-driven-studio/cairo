const express = require('express');
const logger = require('../utils/logger');
const EventReplayService = require('../services/eventReplayService');

class EventReplayRoutes {
  constructor() {
    this.replayService = new EventReplayService();
  }

  setupRoutes() {
    const router = express.Router();

    router.post('/', async (req, res) => {
      try {
        const { namespace = 'default', startTime, endTime, destinationTypes, limit } = req.body;
        if (!startTime || !endTime) return res.status(400).json({ success: false, error: 'startTime and endTime required' });
        const result = await this.replayService.replayEvents({ namespace, startTime, endTime, destinationTypes, limit });
        res.json({ success: true, ...result });
      } catch (error) {
        logger.error('Replay error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/count', async (req, res) => {
      try {
        const { namespace = 'default', startTime, endTime } = req.query;
        if (!startTime || !endTime) return res.status(400).json({ success: false, error: 'startTime and endTime required' });
        const count = await this.replayService.countReplayableEvents(namespace, startTime, endTime);
        res.json({ success: true, count });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    router.get('/history', async (req, res) => {
      try {
        const { namespace = 'default' } = req.query;
        const history = await this.replayService.getReplayHistory(namespace);
        res.json({ success: true, history });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    return router;
  }
}

module.exports = EventReplayRoutes;
