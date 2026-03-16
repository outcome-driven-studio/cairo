const express = require('express');
const { query } = require('../utils/db');
const logger = require('../utils/logger');
const registry = require('../destinations/registry');

class DestinationConfigRoutes {
  setupRoutes() {
    const router = express.Router();

    router.get('/types', (req, res) => {
      const types = Object.keys(registry).map(key => ({ type: key, name: key.charAt(0).toUpperCase() + key.slice(1) }));
      res.json({ success: true, types });
    });

    router.get('/', async (req, res) => {
      try {
        const { namespace = 'default' } = req.query;
        const result = await query('SELECT * FROM destination_configs_v2 WHERE namespace = $1 ORDER BY created_at DESC', [namespace]);
        res.json({ success: true, destinations: result.rows });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    router.get('/:id', async (req, res) => {
      try {
        const result = await query('SELECT * FROM destination_configs_v2 WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, destination: result.rows[0] });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    router.post('/', async (req, res) => {
      try {
        const { name, type, namespace = 'default', config = {}, eventTypes } = req.body;
        if (!name || !type) return res.status(400).json({ success: false, error: 'name and type required' });
        if (!registry[type]) return res.status(400).json({ success: false, error: `Unknown destination type: ${type}` });

        const result = await query(
          `INSERT INTO destination_configs_v2 (name, type, namespace, config, event_types) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [name, type, namespace, JSON.stringify(config), eventTypes || ['track','identify','page','screen','group','alias']]
        );
        res.status(201).json({ success: true, destination: result.rows[0] });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    router.put('/:id', async (req, res) => {
      try {
        const { name, config, enabled, eventTypes } = req.body;
        const sets = ['updated_at = NOW()'];
        const params = [req.params.id];
        let idx = 2;
        if (name !== undefined) { sets.push(`name = $${idx}`); params.push(name); idx++; }
        if (config !== undefined) { sets.push(`config = $${idx}`); params.push(JSON.stringify(config)); idx++; }
        if (enabled !== undefined) { sets.push(`enabled = $${idx}`); params.push(enabled); idx++; }
        if (eventTypes !== undefined) { sets.push(`event_types = $${idx}`); params.push(eventTypes); idx++; }

        const result = await query(`UPDATE destination_configs_v2 SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
        res.json({ success: true, destination: result.rows[0] });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    router.delete('/:id', async (req, res) => {
      try {
        await query('DELETE FROM destination_configs_v2 WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Destination deleted' });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    router.post('/:id/test', async (req, res) => {
      try {
        const result = await query('SELECT * FROM destination_configs_v2 WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        const dest = result.rows[0];
        const DestClass = registry[dest.type];
        if (!DestClass) return res.status(400).json({ success: false, error: `Unknown type: ${dest.type}` });
        const instance = new DestClass(typeof dest.config === 'string' ? JSON.parse(dest.config) : dest.config);
        const testResult = await instance.test();
        res.json({ success: true, test: testResult });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    router.post('/:id/toggle', async (req, res) => {
      try {
        const { enabled } = req.body;
        const result = await query('UPDATE destination_configs_v2 SET enabled = $2, updated_at = NOW() WHERE id = $1 RETURNING *', [req.params.id, enabled]);
        res.json({ success: true, destination: result.rows[0] });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    // Dead letter
    router.get('/dead-letter', async (req, res) => {
      try {
        const { namespace = 'default', limit = 50 } = req.query;
        const result = await query('SELECT * FROM dead_letter_events WHERE namespace = $1 ORDER BY created_at DESC LIMIT $2', [namespace, parseInt(limit)]);
        res.json({ success: true, deadLetterEvents: result.rows });
      } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });

    return router;
  }
}

module.exports = DestinationConfigRoutes;
