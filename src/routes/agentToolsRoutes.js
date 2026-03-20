const express = require('express');
const { query } = require('../utils/db');
const logger = require('../utils/logger');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'enrich_lead',
      description: 'Enrich a lead by email using AI (Gemini) or Apollo/Hunter. Returns company and contact data.',
      parameters: { type: 'object', properties: { email: { type: 'string', description: 'Lead email address' }, namespace: { type: 'string', description: 'Namespace (default: default)' } }, required: ['email'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_lead_summary',
      description: 'Get a one-paragraph summary of a lead (score, company, recent events) for context.',
      parameters: { type: 'object', properties: { email: { type: 'string' }, namespace: { type: 'string' } }, required: ['email'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_top_leads',
      description: 'List top N leads by lead_score for a namespace, with optional grade filter.',
      parameters: { type: 'object', properties: { namespace: { type: 'string' }, limit: { type: 'integer', default: 10 }, min_grade: { type: 'string', enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'] } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_data',
      description: 'Ask a natural language question about leads and events. Returns answer and optional data.',
      parameters: { type: 'object', properties: { question: { type: 'string' }, namespace: { type: 'string' } }, required: ['question'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'track_event',
      description: 'Track a product event for a user.',
      parameters: { type: 'object', properties: { userId: { type: 'string' }, event: { type: 'string' }, properties: { type: 'object' } }, required: ['userId', 'event'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_pipeline_stats',
      description: 'Get pipeline statistics: lead counts by grade, recent events, sync status.',
      parameters: { type: 'object', properties: { namespace: { type: 'string' } } }
    }
  }
];

class AgentToolsRoutes {
  setupRoutes() {
    const router = express.Router();

    router.get('/tools', (req, res) => {
      res.json({ tools: TOOLS });
    });

    router.post('/tools/execute', async (req, res) => {
      try {
        const { tool, arguments: args = {} } = req.body;
        if (!tool) return res.status(400).json({ success: false, error: 'tool name required' });

        const result = await this._executeTool(tool, args);
        res.json({ success: true, tool, result });
      } catch (error) {
        logger.error('Agent tool execute error:', error);
        res.status(500).json({ success: false, tool: req.body.tool, error: error.message });
      }
    });

    router.post('/tools/execute-batch', async (req, res) => {
      try {
        const { calls = [] } = req.body;
        const results = [];
        for (const call of calls) {
          try {
            const result = await this._executeTool(call.tool, call.arguments || {});
            results.push({ tool: call.tool, success: true, result });
          } catch (error) {
            results.push({ tool: call.tool, success: false, error: error.message });
          }
        }
        res.json({ success: true, results });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Context endpoints
    router.get('/context/lead', async (req, res) => {
      try {
        const { email, namespace = 'default', format = 'json' } = req.query;
        if (!email) return res.status(400).json({ success: false, error: 'email required' });

        const user = await query(
          `SELECT email, name, company, title, lead_score, lead_grade, icp_score, behaviour_score, enrichment_profile, updated_at
           FROM playmaker_user_source WHERE email = $1`, [email]
        );
        if (user.rows.length === 0) return res.status(404).json({ success: false, error: 'Lead not found' });

        const lead = user.rows[0];
        const events = await query(
          `SELECT event_type, created_at FROM event_source WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [email]
        );

        if (format === 'text') {
          const text = `Lead: ${lead.name || 'Unknown'} (${lead.email})\nCompany: ${lead.company || 'Unknown'}\nScore: ${lead.lead_score || 0}/100 (Grade: ${lead.lead_grade || 'Unscored'})\nICP: ${lead.icp_score || 0} | Behavior: ${lead.behaviour_score || 0}\nLast Updated: ${lead.updated_at || 'Never'}\nRecent Events: ${events.rows.map(e => e.event_type).join(', ') || 'None'}`;
          return res.type('text').send(text);
        }
        res.json({ success: true, lead, recentEvents: events.rows });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/context/pipeline', async (req, res) => {
      try {
        const { namespace = 'default', limit = 20 } = req.query;
        const leads = await query(
          `SELECT email, name, company, lead_score, lead_grade, updated_at
           FROM playmaker_user_source WHERE lead_score IS NOT NULL ORDER BY lead_score DESC LIMIT $1`, [parseInt(limit)]
        );
        res.json({ success: true, leads: leads.rows, count: leads.rows.length });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/context/stats', async (req, res) => {
      try {
        const stats = await query(`
          SELECT
            COUNT(*) as total_leads,
            COUNT(*) FILTER (WHERE lead_grade IN ('A+', 'A')) as grade_a,
            COUNT(*) FILTER (WHERE lead_grade IN ('B+', 'B')) as grade_b,
            COUNT(*) FILTER (WHERE lead_grade IN ('C+', 'C')) as grade_c,
            AVG(lead_score) as avg_score
          FROM playmaker_user_source WHERE lead_score IS NOT NULL
        `);
        const events = await query(`
          SELECT COUNT(*) as events_7d FROM event_source WHERE created_at > NOW() - INTERVAL '7 days'
        `);
        res.json({ success: true, stats: { ...stats.rows[0], events_last_7_days: events.rows[0].events_7d } });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    return router;
  }

  async _executeTool(toolName, args) {
    switch (toolName) {
      case 'get_lead_summary': {
        const result = await query('SELECT * FROM playmaker_user_source WHERE email = $1', [args.email]);
        if (result.rows.length === 0) throw new Error('Lead not found');
        return result.rows[0];
      }
      case 'list_top_leads': {
        const limit = args.limit || 10;
        let q = 'SELECT email, name, company, lead_score, lead_grade FROM playmaker_user_source WHERE lead_score IS NOT NULL';
        const params = [];
        if (args.min_grade) { q += ' AND lead_grade = $1'; params.push(args.min_grade); }
        q += ' ORDER BY lead_score DESC LIMIT $' + (params.length + 1);
        params.push(limit);
        const result = await query(q, params);
        return result.rows;
      }
      case 'track_event': {
        const eventKey = `agent-${args.event}-${args.userId}-${Date.now()}`;
        await query(
          `INSERT INTO event_source (event_key, user_id, event_type, platform, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (event_key) DO NOTHING`,
          [eventKey, args.userId, args.event, 'agent', JSON.stringify(args.properties || {})]
        );
        return { tracked: true, event: args.event };
      }
      case 'get_pipeline_stats': {
        const stats = await query(`
          SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE lead_grade IN ('A+','A')) as a_leads,
          COUNT(*) FILTER (WHERE lead_grade IN ('B+','B')) as b_leads FROM playmaker_user_source
        `);
        return stats.rows[0];
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}

module.exports = AgentToolsRoutes;
