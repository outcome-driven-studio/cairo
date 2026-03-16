const express = require("express");
const { query } = require("../utils/db");
const logger = require("../utils/logger");
const { getNotificationsEnabled } = require("../utils/notificationsEnabled");
const MixpanelService = require("../services/mixpanelService");
const AttioService = require("../services/attioService");
const SlackService = require("../services/slackService");
const DiscordService = require("../services/discordService");
const config = require("../config");

// V2 CDP Pipeline Services
const IdentityService = require("../services/identityService");
const TransformationService = require("../services/transformationService");
const TrackingPlanService = require("../services/trackingPlanService");
const GDPRService = require("../services/gdprService");
const EventReplayService = require("../services/eventReplayService");

/**
 * SDK Routes - Handle events from Cairo SDKs
 * Compatible with Segment-like API structure
 */
class SDKRoutes {
  constructor() {
    // Initialize services
    this.mixpanelService = new MixpanelService(
      process.env.MIXPANEL_PROJECT_TOKEN
    );
    this.attioService = config.attioApiKey
      ? new AttioService(config.attioApiKey)
      : null;

    // Initialize Slack service
    const slackConfig = {
      defaultChannel: process.env.SLACK_DEFAULT_CHANNEL,
      alertEvents: process.env.SLACK_ALERT_EVENTS
        ? process.env.SLACK_ALERT_EVENTS.split(",").map((e) => e.trim())
        : undefined,
      paymentThreshold: process.env.SLACK_PAYMENT_THRESHOLD
        ? parseFloat(process.env.SLACK_PAYMENT_THRESHOLD)
        : undefined,
    };
    this.slackService = new SlackService(
      process.env.SLACK_WEBHOOK_URL,
      slackConfig
    );

    // Initialize Discord service
    const discordConfig = {
      defaultChannel: process.env.DISCORD_DEFAULT_CHANNEL,
      alertEvents: process.env.DISCORD_ALERT_EVENTS
        ? process.env.DISCORD_ALERT_EVENTS.split(",").map((e) => e.trim())
        : undefined,
      paymentThreshold: process.env.DISCORD_PAYMENT_THRESHOLD
        ? parseFloat(process.env.DISCORD_PAYMENT_THRESHOLD)
        : undefined,
      username: process.env.DISCORD_USERNAME,
      avatarUrl: process.env.DISCORD_AVATAR_URL,
    };
    this.discordService = new DiscordService(
      process.env.DISCORD_WEBHOOK_URL,
      discordConfig
    );

    // V2 CDP Pipeline Services
    this.identityService = new IdentityService();
    this.transformationService = new TransformationService();
    this.trackingPlanService = new TrackingPlanService();
    this.gdprService = new GDPRService();
    this.eventReplayService = new EventReplayService();

    logger.info("SDK Routes initialized");
  }

  /**
   * Authenticate SDK requests
   */
  authenticate(req, res, next) {
    const writeKey = req.headers["x-write-key"] || req.headers.authorization?.replace("Bearer ", "");

    if (!writeKey) {
      return res.status(401).json({
        success: false,
        error: "Missing write key",
      });
    }

    // TODO: Validate write key against database
    // For now, accept any non-empty key
    req.writeKey = writeKey;
    next();
  }

  /**
   * Handle batch events from SDKs
   * POST /v2/batch
   */
  async handleBatch(req, res) {
    try {
      const { batch, sentAt } = req.body;

      if (!batch || !Array.isArray(batch)) {
        return res.status(400).json({
          success: false,
          error: "Batch array is required",
        });
      }

      logger.info(`[SDK] Batch received: ${batch.length} events`);

      const results = {
        received: batch.length,
        processed: 0,
        errors: [],
      };

      // Process each message in the batch
      for (const message of batch) {
        try {
          await this.processMessage(message, req.writeKey);
          results.processed++;
        } catch (error) {
          logger.error(`[SDK] Error processing message:`, error);
          results.errors.push({
            messageId: message.messageId,
            error: error.message,
          });
        }
      }

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      logger.error(`[SDK] Batch processing failed:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle single track event
   * POST /v2/track
   */
  async handleTrack(req, res) {
    try {
      const message = {
        ...req.body,
        type: "track",
      };

      await this.processMessage(message, req.writeKey);

      res.json({
        success: true,
        messageId: message.messageId,
      });
    } catch (error) {
      logger.error(`[SDK] Track failed:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle identify event
   * POST /v2/identify
   */
  async handleIdentify(req, res) {
    try {
      const message = {
        ...req.body,
        type: "identify",
      };

      await this.processMessage(message, req.writeKey);

      res.json({
        success: true,
        messageId: message.messageId,
      });
    } catch (error) {
      logger.error(`[SDK] Identify failed:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle page event
   * POST /v2/page
   */
  async handlePage(req, res) {
    try {
      const message = {
        ...req.body,
        type: "page",
      };

      await this.processMessage(message, req.writeKey);

      res.json({
        success: true,
        messageId: message.messageId,
      });
    } catch (error) {
      logger.error(`[SDK] Page failed:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle screen event
   * POST /v2/screen
   */
  async handleScreen(req, res) {
    try {
      const message = {
        ...req.body,
        type: "screen",
      };

      await this.processMessage(message, req.writeKey);

      res.json({
        success: true,
        messageId: message.messageId,
      });
    } catch (error) {
      logger.error(`[SDK] Screen failed:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle group event
   * POST /v2/group
   */
  async handleGroup(req, res) {
    try {
      const message = {
        ...req.body,
        type: "group",
      };

      await this.processMessage(message, req.writeKey);

      res.json({
        success: true,
        messageId: message.messageId,
      });
    } catch (error) {
      logger.error(`[SDK] Group failed:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle alias event
   * POST /v2/alias
   */
  async handleAlias(req, res) {
    try {
      const message = {
        ...req.body,
        type: "alias",
      };

      await this.processMessage(message, req.writeKey);

      res.json({
        success: true,
        messageId: message.messageId,
      });
    } catch (error) {
      logger.error(`[SDK] Alias failed:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Process a single message through the full CDP pipeline:
   * 1. Suppression check
   * 2. Store raw event (for replay)
   * 3. Identity resolution
   * 4. Tracking plan validation
   * 5. Transformations
   * 6. Route to type-specific handler
   */
  async processMessage(message, writeKey) {
    const { type, messageId, timestamp, context } = message;
    const userId = message.userId || message.anonymousId || "anonymous";
    const namespace = message.namespace || context?.namespace || "default";

    logger.debug(`[SDK] Processing ${type} message: ${messageId}`);

    // 1. Suppression check - silently drop events for suppressed users
    try {
      const suppressed = await this.gdprService.isSuppressed(userId, namespace);
      if (suppressed) {
        logger.debug(`[SDK] Event dropped: user ${userId} is suppressed`);
        return;
      }
    } catch (e) {
      // Fail-open: if suppression check fails, process the event
      logger.warn(`[SDK] Suppression check failed, proceeding:`, e.message);
    }

    // 2. Store raw event for replay capability
    try {
      this.eventReplayService.storeRawEvent(message, namespace, writeKey);
    } catch (e) {
      logger.warn(`[SDK] Raw event storage failed:`, e.message);
    }

    // 3. Identity resolution - link userId, anonymousId, email
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
        if (resolution.merged) {
          logger.info(`[SDK] Identity merged for ${userId}, canonical: ${resolution.canonicalId}`);
        }
      }
    } catch (e) {
      // Fail-open: identity resolution failure shouldn't block events
      logger.warn(`[SDK] Identity resolution failed, proceeding:`, e.message);
    }

    // 4. Tracking plan validation (for track events)
    if (type === "track" && message.event) {
      try {
        const validation = await this.trackingPlanService.validate(message, namespace);
        if (!validation.valid) {
          if (validation.action === "drop") {
            logger.info(`[SDK] Event dropped by tracking plan: ${message.event} - ${validation.violations.map(v => v.message).join(", ")}`);
            return;
          }
          if (validation.action === "warn") {
            logger.warn(`[SDK] Tracking plan violation (warn): ${message.event} - ${validation.violations.map(v => v.message).join(", ")}`);
          }
          // 'allow' mode: log violation but continue
        }
      } catch (e) {
        logger.warn(`[SDK] Tracking plan validation failed, proceeding:`, e.message);
      }
    }

    // 5. Transformations - run user-defined transforms
    try {
      const transformed = await this.transformationService.transform(message, namespace);
      if (transformed === null) {
        logger.debug(`[SDK] Event dropped by transformation`);
        return;
      }
      // Replace message properties with transformed values (keep type/identity fields)
      if (transformed.properties) message.properties = transformed.properties;
      if (transformed.traits) message.traits = transformed.traits;
    } catch (e) {
      // Fail-open: transformation failure uses original event
      logger.warn(`[SDK] Transformation failed, using original:`, e.message);
    }

    // 6. Route to type-specific handler
    switch (type) {
      case "track":
        await this.processTrack(message, writeKey);
        break;
      case "identify":
        await this.processIdentify(message, writeKey);
        break;
      case "page":
        await this.processPage(message, writeKey);
        break;
      case "screen":
        await this.processScreen(message, writeKey);
        break;
      case "group":
        await this.processGroup(message, writeKey);
        break;
      case "alias":
        await this.processAlias(message, writeKey);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  /**
   * Process track event
   */
  async processTrack(message, writeKey) {
    const { userId, anonymousId, event, properties = {}, timestamp, context } = message;

    // Get user identifier
    const userIdentifier = userId || anonymousId || "anonymous";

    // Store in database
    const eventKey = `sdk-${event}-${userIdentifier}-${Date.now()}`;
    await query(
      `INSERT INTO event_source (
        event_key,
        user_id,
        event_type,
        platform,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (event_key) DO NOTHING`,
      [
        eventKey,
        userIdentifier,
        event,
        "sdk",
        JSON.stringify({
          properties,
          context,
          writeKey,
        }),
        timestamp || new Date().toISOString(),
      ]
    );

    // Send to Mixpanel
    if (this.mixpanelService.enabled) {
      await this.mixpanelService.trackProductEvent(userIdentifier, event, properties);
    }

    // Send to Attio if user exists
    if (this.attioService && userId) {
      const attioEventData = {
        event_key: eventKey,
        event_type: event,
        platform: "sdk",
        metadata: properties,
        created_at: timestamp,
        user_id: userId,
      };
      await this.attioService.createEvent(attioEventData, userId);
    }

    const notificationsOn = await getNotificationsEnabled();

    // Send Slack alert if configured
    if (notificationsOn && this.slackService.enabled) {
      await this.slackService.sendAlert({
        user_email: userId || anonymousId,
        event,
        properties,
        timestamp,
      });
    }

    // Send Discord alert if configured
    if (notificationsOn && this.discordService.enabled) {
      await this.discordService.sendAlert({
        user_email: userId || anonymousId,
        event,
        properties,
        timestamp,
      });
    }
  }

  /**
   * Process identify event
   */
  async processIdentify(message, writeKey) {
    const { userId, traits = {}, timestamp, context } = message;

    if (!userId) {
      throw new Error("userId is required for identify");
    }

    // Find or create user
    const userResult = await query(
      `SELECT id FROM playmaker_user_source WHERE email = $1 OR original_user_id = $2`,
      [traits.email || userId, userId]
    );

    if (userResult.rows.length === 0) {
      // Create new user
      await query(
        `INSERT INTO playmaker_user_source (
          email,
          original_user_id,
          name,
          first_name,
          last_name,
          company,
          title,
          enrichment_profile,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE SET
          enrichment_profile = COALESCE(playmaker_user_source.enrichment_profile, '{}')::jsonb || $8::jsonb,
          updated_at = NOW()`,
        [
          traits.email || `${userId}@unknown.com`,
          userId,
          traits.name,
          traits.firstName || traits.first_name,
          traits.lastName || traits.last_name,
          traits.company?.name || traits.company,
          traits.title,
          JSON.stringify(traits),
        ]
      );
    } else {
      // Update existing user
      await query(
        `UPDATE playmaker_user_source SET
          enrichment_profile = COALESCE(enrichment_profile, '{}')::jsonb || $2::jsonb,
          updated_at = NOW()
        WHERE email = $1 OR original_user_id = $1`,
        [traits.email || userId, JSON.stringify(traits)]
      );
    }

    // Send to Mixpanel
    if (this.mixpanelService.enabled) {
      await this.mixpanelService.identify(traits.email || userId, traits);
    }

    // Update in Attio
    if (this.attioService) {
      await this.attioService.upsertPerson({
        email: traits.email || `${userId}@unknown.com`,
        enrichment_profile: traits,
      });
    }
  }

  /**
   * Process page event
   */
  async processPage(message, writeKey) {
    const { userId, anonymousId, category, name, properties = {}, timestamp, context } = message;

    // Convert to track event
    const trackMessage = {
      ...message,
      event: "Page Viewed",
      properties: {
        category,
        name,
        ...properties,
      },
    };

    await this.processTrack(trackMessage, writeKey);
  }

  /**
   * Process screen event
   */
  async processScreen(message, writeKey) {
    const { userId, anonymousId, category, name, properties = {}, timestamp, context } = message;

    // Convert to track event
    const trackMessage = {
      ...message,
      event: "Screen Viewed",
      properties: {
        category,
        name,
        ...properties,
      },
    };

    await this.processTrack(trackMessage, writeKey);
  }

  /**
   * Process group event
   */
  async processGroup(message, writeKey) {
    const { userId, groupId, traits = {}, timestamp, context } = message;

    // Store group association
    await query(
      `INSERT INTO event_source (
        event_key,
        user_id,
        event_type,
        platform,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (event_key) DO NOTHING`,
      [
        `sdk-group-${userId}-${groupId}-${Date.now()}`,
        userId,
        "Group Joined",
        "sdk",
        JSON.stringify({
          groupId,
          traits,
          context,
        }),
        timestamp || new Date().toISOString(),
      ]
    );

    // Update user with group info if they exist
    if (userId) {
      await query(
        `UPDATE playmaker_user_source SET
          enrichment_profile = jsonb_set(
            COALESCE(enrichment_profile, '{}'),
            '{group}',
            $2::jsonb
          ),
          updated_at = NOW()
        WHERE original_user_id = $1 OR email = $1`,
        [userId, JSON.stringify({ id: groupId, ...traits })]
      );
    }
  }

  /**
   * Process alias event
   */
  async processAlias(message, writeKey) {
    const { userId, previousId, timestamp, context } = message;

    // Store alias mapping
    await query(
      `INSERT INTO event_source (
        event_key,
        user_id,
        event_type,
        platform,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (event_key) DO NOTHING`,
      [
        `sdk-alias-${userId}-${previousId}-${Date.now()}`,
        userId,
        "Alias Created",
        "sdk",
        JSON.stringify({
          previousId,
          context,
        }),
        timestamp || new Date().toISOString(),
      ]
    );

    // Merge identities via identity resolution
    try {
      await this.identityService.alias({ previousId, userId, namespace: "default" });
      logger.info(`[SDK] Alias created: ${previousId} -> ${userId}`);
    } catch (e) {
      logger.error(`[SDK] Alias identity merge failed:`, e.message);
    }
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    const router = express.Router();

    // Apply authentication middleware to all routes
    router.use(this.authenticate.bind(this));

    // Batch endpoint (primary)
    router.post("/batch", this.handleBatch.bind(this));

    // Individual event endpoints
    router.post("/track", this.handleTrack.bind(this));
    router.post("/identify", this.handleIdentify.bind(this));
    router.post("/page", this.handlePage.bind(this));
    router.post("/screen", this.handleScreen.bind(this));
    router.post("/group", this.handleGroup.bind(this));
    router.post("/alias", this.handleAlias.bind(this));

    // Health check
    router.get("/health", (req, res) => {
      res.json({
        success: true,
        version: "2.0.0",
        services: {
          mixpanel: this.mixpanelService?.enabled || false,
          attio: !!this.attioService,
          slack: this.slackService?.enabled || false,
          database: true,
          identityResolution: true,
          transformations: true,
          trackingPlans: true,
          gdprCompliance: true,
          eventReplay: true,
        },
      });
    });

    return router;
  }
}

module.exports = SDKRoutes;