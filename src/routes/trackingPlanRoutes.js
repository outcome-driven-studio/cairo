const express = require('express');
const logger = require('../utils/logger');
const TrackingPlanService = require('../services/trackingPlanService');

class TrackingPlanRoutes {
  constructor() {
    this.trackingPlanService = new TrackingPlanService();
  }

  setupRoutes() {
    const router = express.Router();

    router.get('/', async (req, res) => {
      try {
        const { namespace = 'default' } = req.query;
        const plans = await this.trackingPlanService.getPlans(namespace);
        res.json({ success: true, trackingPlans: plans });
      } catch (error) {
        logger.error('Get tracking plans error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/:id', async (req, res) => {
      try {
        const plan = await this.trackingPlanService.getPlan(req.params.id);
        if (!plan) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, trackingPlan: plan });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.post('/', async (req, res) => {
      try {
        const { name, namespace, enforcementMode, schema } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'name required' });
        const plan = await this.trackingPlanService.createPlan({ name, namespace, enforcementMode, schema });
        res.status(201).json({ success: true, trackingPlan: plan });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.put('/:id', async (req, res) => {
      try {
        const plan = await this.trackingPlanService.updatePlan(req.params.id, req.body);
        res.json({ success: true, trackingPlan: plan });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.delete('/:id', async (req, res) => {
      try {
        await this.trackingPlanService.deletePlan(req.params.id);
        res.json({ success: true, message: 'Tracking plan deleted' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/:id/violations', async (req, res) => {
      try {
        const { limit = 50 } = req.query;
        const plan = await this.trackingPlanService.getPlan(req.params.id);
        if (!plan) return res.status(404).json({ success: false, error: 'Not found' });
        const violations = await this.trackingPlanService.getViolations(plan.namespace, parseInt(limit));
        res.json({ success: true, violations });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.post('/generate', async (req, res) => {
      try {
        const { namespace = 'default' } = req.body;
        const schema = await this.trackingPlanService.generateFromEvents(namespace);
        res.json({ success: true, generatedSchema: schema });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    return router;
  }
}

module.exports = TrackingPlanRoutes;
