const express = require('express');
const { query } = require('../utils/db');
const logger = require('../utils/logger');
const IdentityService = require('../services/identityService');
const GDPRService = require('../services/gdprService');
const NotificationService = require('../notifications');
const { requireWriteKey } = require('../middleware/auth');

/**
 * Segment-compatible event ingestion.
 * Pipeline: suppress → identity → store → notification rules.
 */
class SDKRoutes {
  constructor() {
    this.identityService = new IdentityService();
    this.gdprService = new GDPRService();
    this.notifications = new NotificationService();
    logger.info('SDK Routes initialized (agent-first)');
  }

  setupRoutes() {
    const router = express.Router();
    router.use(requireWriteKey);

    router.post('/batch', this.handleBatch.bind(this));
    router.post('/track', this.handleTrack.bind(this));
    router.post('/identify', this.handleIdentify.bind(this));
    router.post('/page', this.handlePage.bind(this));
    router.post('/screen', this.handleScreen.bind(this));
    router.post('/group', this.handleGroup.bind(this));
    router.post('/alias', this.handleAlias.bind(this));

    return router;
  }

  async handleBatch(req, res) {
    try {
      const { batch } = req.body;
      if (!batch || !Array.isArray(batch)) {
        return res.status(400).json({ success: false, error: 'Batch array is required' });
      }

      const results = { received: batch.length, processed: 0, errors: [] };
      for (const message of batch) {
        try {
          await this.processMessage(message, req.writeKey);
          results.processed++;
        } catch (error) {
          results.errors.push({ messageId: message.messageId, error: error.message });
        }
      }
      res.json({ success: true, ...results });
    } catch (error) {
      logger.error('[SDK] Batch failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleTrack(req, res) {
    try {
      await this.processMessage({ ...req.body, type: 'track' }, req.writeKey);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleIdentify(req, res) {
    try {
      await this.processMessage({ ...req.body, type: 'identify' }, req.writeKey);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handlePage(req, res) {
    try {
      await this.processMessage({ ...req.body, type: 'page' }, req.writeKey);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleScreen(req, res) {
    try {
      await this.processMessage({ ...req.body, type: 'screen' }, req.writeKey);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGroup(req, res) {
    try {
      await this.processMessage({ ...req.body, type: 'group' }, req.writeKey);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleAlias(req, res) {
    try {
      await this.processMessage({ ...req.body, type: 'alias' }, req.writeKey);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async processMessage(message, writeKey) {
    const { type } = message;
    const userId = message.userId || message.anonymousId || 'anonymous';
    const namespace = message.namespace || message.context?.namespace || 'default';

    // 1. Suppression check
    try {
      if (await this.gdprService.isSuppressed(userId, namespace)) {
        logger.debug(`[SDK] Event dropped: user ${userId} suppressed`);
        return;
      }
    } catch (e) {
      logger.warn('[SDK] Suppression check failed:', e.message);
    }

    // 2. Identity resolution
    try {
      const identifiers = {
        userId: message.userId,
        anonymousId: message.anonymousId,
        email: message.traits?.email || message.properties?.email,
        namespace,
      };
      if (identifiers.userId || identifiers.anonymousId || identifiers.email) {
        const resolution = await this.identityService.resolve(identifiers);
        message._canonicalId = resolution.canonicalId;
      }
    } catch (e) {
      logger.warn('[SDK] Identity resolution failed:', e.message);
    }

    // 3. Type-specific handling
    switch (type) {
      case 'track':
        await this.processTrack(message, writeKey, namespace);
        break;
      case 'identify':
        await this.processIdentify(message, writeKey, namespace);
        break;
      case 'page':
      case 'screen':
        await this.processTrack(
          {
            ...message,
            event: type === 'page' ? 'page' : 'screen',
            properties: {
              ...(message.properties || {}),
              name: message.name,
              category: message.category,
            },
          },
          writeKey,
          namespace
        );
        break;
      case 'group':
        await this.processTrack(
          {
            ...message,
            event: 'group',
            properties: { ...(message.traits || {}), groupId: message.groupId },
          },
          writeKey,
          namespace
        );
        break;
      case 'alias':
        await this.identityService.alias({
          previousId: message.previousId,
          userId: message.userId,
          namespace,
        });
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  async processTrack(message, writeKey, namespace) {
    const { userId, anonymousId, event, properties = {}, timestamp, context } = message;
    const userIdentifier = userId || anonymousId || 'anonymous';
    const eventKey = `sdk-${event}-${userIdentifier}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await query(
      `INSERT INTO event_source (event_key, user_id, event_type, platform, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        eventKey,
        userIdentifier,
        event,
        'sdk',
        JSON.stringify({ properties, context, writeKey, namespace }),
        timestamp || new Date().toISOString(),
      ]
    );

    // 4. Notification rules
    try {
      await this.notifications.evaluateEvent({
        event,
        userId,
        anonymousId,
        properties,
        namespace,
      });
    } catch (e) {
      logger.warn('[SDK] Notification evaluation failed:', e.message);
    }
  }

  async processIdentify(message, writeKey, namespace) {
    const { userId, traits = {}, anonymousId } = message;
    if (!userId) throw new Error('userId is required for identify');

    await query(
      `INSERT INTO playmaker_user_source (email, original_user_id, name, first_name, last_name, company, title, meta, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (email) DO UPDATE SET
         original_user_id = COALESCE(EXCLUDED.original_user_id, playmaker_user_source.original_user_id),
         name = COALESCE(EXCLUDED.name, playmaker_user_source.name),
         first_name = COALESCE(EXCLUDED.first_name, playmaker_user_source.first_name),
         last_name = COALESCE(EXCLUDED.last_name, playmaker_user_source.last_name),
         company = COALESCE(EXCLUDED.company, playmaker_user_source.company),
         title = COALESCE(EXCLUDED.title, playmaker_user_source.title),
         meta = EXCLUDED.meta,
         updated_at = NOW()`,
      [
        traits.email || null,
        userId,
        traits.name || null,
        traits.firstName || traits.first_name || null,
        traits.lastName || traits.last_name || null,
        traits.company || null,
        traits.title || null,
        JSON.stringify({ traits, writeKey, anonymousId }),
      ]
    );

    // Upsert channel addresses from traits if present
    const channelMap = {
      telegram_chat_id: 'telegram',
      telegram: 'telegram',
      discord_user_id: 'discord',
      discord_channel_id: 'discord',
      discord: 'discord',
      whatsapp_number: 'whatsapp',
      whatsapp: 'whatsapp',
      phone: 'whatsapp',
      slack_user_id: 'slack',
      slack: 'slack',
    };

    for (const [traitKey, channel] of Object.entries(channelMap)) {
      if (traits[traitKey]) {
        try {
          await this.notifications.upsertUserChannel({
            userId,
            channel,
            address: String(traits[traitKey]),
            namespace,
          });
        } catch (e) {
          logger.warn(`[SDK] Channel upsert failed for ${traitKey}:`, e.message);
        }
      }
    }
  }
}

module.exports = SDKRoutes;
