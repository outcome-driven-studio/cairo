const express = require('express');
const logger = require('../utils/logger');
const TransformationService = require('../services/transformationService');

class TransformationRoutes {
  constructor() {
    this.transformService = new TransformationService();
  }

  setupRoutes() {
    const router = express.Router();

    router.get('/', async (req, res) => {
      try {
        const { namespace = 'default' } = req.query;
        const transforms = await this.transformService.getTransforms(namespace);
        res.json({ success: true, transformations: transforms });
      } catch (error) {
        logger.error('Get transforms error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.post('/', async (req, res) => {
      try {
        const { name, code, namespace, destinationId, executionOrder } = req.body;
        if (!name || !code) {
          return res.status(400).json({ success: false, error: 'name and code required' });
        }
        const transform = await this.transformService.createTransform({ name, code, namespace, destinationId, executionOrder });
        res.status(201).json({ success: true, transformation: transform });
      } catch (error) {
        logger.error('Create transform error:', error);
        res.status(400).json({ success: false, error: error.message });
      }
    });

    router.put('/:id', async (req, res) => {
      try {
        const transform = await this.transformService.updateTransform(req.params.id, req.body);
        res.json({ success: true, transformation: transform });
      } catch (error) {
        logger.error('Update transform error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.delete('/:id', async (req, res) => {
      try {
        await this.transformService.deleteTransform(req.params.id);
        res.json({ success: true, message: 'Transformation deleted' });
      } catch (error) {
        logger.error('Delete transform error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.post('/test', async (req, res) => {
      try {
        const { code, sampleEvent } = req.body;
        if (!code || !sampleEvent) {
          return res.status(400).json({ success: false, error: 'code and sampleEvent required' });
        }
        const result = await this.transformService.testTransform(code, sampleEvent);
        res.json({ success: true, ...result });
      } catch (error) {
        logger.error('Test transform error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    return router;
  }
}

module.exports = TransformationRoutes;
