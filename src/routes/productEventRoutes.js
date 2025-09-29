const express = require("express");
const { query } = require("../utils/db");
const logger = require("../utils/logger");
const MixpanelService = require("../services/mixpanelService");
const AttioService = require("../services/attioService");
const SlackService = require("../services/slackService");
const config = require("../config");
const EventTrackingService = require("../services/eventTrackingService");

/**
 * Product Event Routes
 * Receives events from your product and sends to DB, Mixpanel, Attio, and Slack
 */
class ProductEventRoutes {
  constructor(webSocketService = null) {
    this.webSocketService = webSocketService;
    // Initialize services
    this.mixpanelService = new MixpanelService(
      process.env.MIXPANEL_PROJECT_TOKEN
    );
    this.attioService = config.attioApiKey
      ? new AttioService(config.attioApiKey)
      : null;

    // Initialize Slack service with configuration
    const slackConfig = {
      defaultChannel: process.env.SLACK_DEFAULT_CHANNEL,
      alertEvents: process.env.SLACK_ALERT_EVENTS
        ? process.env.SLACK_ALERT_EVENTS.split(",").map((e) => e.trim())
        : undefined,
      paymentThreshold: process.env.SLACK_PAYMENT_THRESHOLD
        ? parseFloat(process.env.SLACK_PAYMENT_THRESHOLD)
        : undefined,
      maxAlertsPerMinute: process.env.SLACK_MAX_ALERTS_PER_MINUTE
        ? parseInt(process.env.SLACK_MAX_ALERTS_PER_MINUTE)
        : undefined,
    };
    this.slackService = new SlackService(
      process.env.SLACK_WEBHOOK_URL,
      slackConfig
    );
    this.eventTracking = new EventTrackingService();

    // Track statistics
    this.stats = {
      eventsReceived: 0,
      eventsStored: 0,
      mixpanelSent: 0,
      attioSent: 0,
      slackAlertsSent: 0,
      errors: [],
    };

    logger.info("ProductEventRoutes initialized");
  }

  /**
   * Track a single event from the product
   * POST /api/events/track
   */
  async trackEvent(req, res) {
    try {
      const {
        user_email,
        event,
        properties = {},
        timestamp = new Date().toISOString(),
      } = req.body;

      // Validate required fields
      if (!user_email || !event) {
        return res.status(400).json({
          success: false,
          error: "user_email and event are required",
        });
      }

      this.stats.eventsReceived++;
      logger.info(`[Product Event] Received: ${event} for ${user_email}`);

      // Results tracking
      const results = {
        db: false,
        mixpanel: false,
        attio: false,
      };

      // 1. Find or create user in database
      let user = null;
      try {
        const userResult = await query(
          `SELECT id, email, original_user_id FROM playmaker_user_source WHERE email = $1`,
          [user_email]
        );

        if (userResult.rows.length > 0) {
          user = userResult.rows[0];
        } else {
          // Create new user if doesn't exist
          const createResult = await query(
            `INSERT INTO playmaker_user_source (
              email, 
              original_user_id,
              created_at,
              updated_at
            ) VALUES ($1, gen_random_uuid(), NOW(), NOW())
            RETURNING id, email, original_user_id`,
            [user_email]
          );
          user = createResult.rows[0];
          logger.info(`[Product Event] Created new user: ${user_email}`);
        }
      } catch (error) {
        logger.error(`[Product Event] Error finding/creating user:`, error);
      }

      // 2. Store event in database
      try {
        const eventKey = `product-${event}-${user_email}-${Date.now()}`;
        const eventData = {
          event_key: eventKey,
          user_id: user?.original_user_id || user_email,
          event_type: event,
          platform: "product",
          metadata: properties,
          created_at: timestamp,
        };

        const eventResult = await query(
          `INSERT INTO event_source (
            event_key, 
            user_id, 
            event_type, 
            platform, 
            metadata, 
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (event_key) DO NOTHING
          RETURNING id`,
          [
            eventData.event_key,
            eventData.user_id,
            eventData.event_type,
            eventData.platform,
            JSON.stringify(eventData.metadata),
            eventData.created_at,
          ]
        );

        if (eventResult.rows.length > 0) {
          results.db = true;
          this.stats.eventsStored++;
          logger.debug(
            `[Product Event] Stored in DB: ${event} for ${user_email}`
          );

          // Broadcast event to WebSocket clients
          if (this.webSocketService) {
            this.webSocketService.broadcastEvent({
              event,
              userId: user?.original_user_id || user_email,
              properties,
              platform: 'product',
              timestamp,
              messageId: eventKey
            });
          }
        }
      } catch (error) {
        logger.error(`[Product Event] Error storing in DB:`, error);
        this.stats.errors.push({ type: "db", error: error.message });
      }

      // 3. Send to all tracking destinations via EventTrackingService
      this.eventTracking
        .trackUserActivity(user_email, event, properties)
        .then((result) => {
          if (result.success) {
            this.stats.mixpanelSent++;
            logger.debug(`[Product Event] Tracked via EventTrackingService: ${event}`);
          }
        })
        .catch((error) => {
          logger.error(`[Product Event] EventTracking error:`, error);
        });
      results.tracking = "queued";

      // Also track with legacy service for compatibility
      if (this.mixpanelService.enabled) {
        this.mixpanelService
          .trackProductEvent(user_email, event, properties)
          .then((result) => {
            if (result.success) {
              logger.debug(`[Product Event] Also sent to Mixpanel directly: ${event}`);
            }
          })
          .catch((error) => {
            logger.error(`[Product Event] Direct Mixpanel error:`, error);
          });
        results.mixpanel = "queued";
      }

      // 4. Send to Attio (async, don't wait)
      if (this.attioService) {
        const attioEventData = {
          event_key: `product-${event}-${Date.now()}`,
          event_type: event,
          platform: "product",
          metadata: properties,
          created_at: timestamp,
          user_id: user_email,
        };

        this.attioService
          .createEvent(attioEventData, user_email)
          .then((result) => {
            if (result) {
              this.stats.attioSent++;
              logger.debug(`[Product Event] Sent to Attio: ${event}`);
            }
          })
          .catch((error) => {
            logger.error(`[Product Event] Attio error:`, error);
          });
        results.attio = "queued";
      }

      // 5. Send Slack alert if configured (async, don't wait)
      if (this.slackService.enabled) {
        const slackEventData = {
          user_email,
          event,
          properties,
          timestamp,
        };

        this.slackService
          .sendAlert(slackEventData)
          .then((result) => {
            if (result.success) {
              this.stats.slackAlertsSent++;
              logger.debug(`[Product Event] Slack alert sent: ${event}`);
            } else if (result.reason === "filtered") {
              logger.debug(`[Product Event] Slack alert filtered: ${event}`);
            }
          })
          .catch((error) => {
            logger.error(`[Product Event] Slack error:`, error);
          });
        results.slack = "queued";
      }

      // Return immediate response
      res.json({
        success: true,
        message: `Event tracked: ${event}`,
        user: user_email,
        results,
      });
    } catch (error) {
      logger.error(`[Product Event] Failed to track event:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Track multiple events in batch
   * POST /api/events/batch
   */
  async trackBatch(req, res) {
    try {
      const { events } = req.body;

      if (!events || !Array.isArray(events)) {
        return res.status(400).json({
          success: false,
          error: "events array is required",
        });
      }

      logger.info(`[Product Event] Batch received: ${events.length} events`);

      const results = {
        received: events.length,
        processed: 0,
        errors: [],
      };

      // Process each event
      for (const event of events) {
        try {
          // Validate event
          if (!event.user_email || !event.event) {
            results.errors.push({
              event,
              error: "Missing user_email or event",
            });
            continue;
          }

          // Store in DB
          const eventKey = `product-${event.event}-${
            event.user_email
          }-${Date.now()}`;
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
              event.user_email,
              event.event,
              "product",
              JSON.stringify(event.properties || {}),
              event.timestamp || new Date().toISOString(),
            ]
          );

          results.processed++;
        } catch (error) {
          results.errors.push({
            event: event.event,
            user: event.user_email,
            error: error.message,
          });
        }
      }

      // Send batch to Mixpanel
      if (this.mixpanelService.enabled && results.processed > 0) {
        this.mixpanelService
          .trackBatch(events)
          .then((result) => {
            logger.info(
              `[Product Event] Mixpanel batch sent: ${result.count || 0} events`
            );
          })
          .catch((error) => {
            logger.error(`[Product Event] Mixpanel batch error:`, error);
          });
      }

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      logger.error(`[Product Event] Batch processing failed:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Identify/update user properties
   * POST /api/events/identify
   */
  async identifyUser(req, res) {
    try {
      const { user_email, properties = {} } = req.body;

      if (!user_email) {
        return res.status(400).json({
          success: false,
          error: "user_email is required",
        });
      }

      logger.info(`[Product Event] Identify user: ${user_email}`);

      // Update user in database
      const updates = [];
      const params = [user_email];
      let paramIndex = 2;

      if (properties.name) {
        updates.push(
          `enrichment_profile = jsonb_set(COALESCE(enrichment_profile, '{}'), '{name}', $${paramIndex}::jsonb)`
        );
        params.push(JSON.stringify(properties.name));
        paramIndex++;
      }

      if (properties.company) {
        updates.push(
          `enrichment_profile = jsonb_set(COALESCE(enrichment_profile, '{}'), '{company}', $${paramIndex}::jsonb)`
        );
        params.push(JSON.stringify(properties.company));
        paramIndex++;
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        await query(
          `UPDATE playmaker_user_source SET ${updates.join(
            ", "
          )} WHERE email = $1`,
          params
        );
      }

      // Send to Mixpanel
      if (this.mixpanelService.enabled) {
        await this.mixpanelService.identify(user_email, properties);
      }

      // Update in Attio
      if (this.attioService) {
        await this.attioService.upsertPerson({
          email: user_email,
          enrichment_profile: properties,
        });
      }

      res.json({
        success: true,
        message: `User identified: ${user_email}`,
      });
    } catch (error) {
      logger.error(`[Product Event] Failed to identify user:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get tracking statistics
   * GET /api/events/stats
   */
  async getStats(req, res) {
    try {
      // Get counts from database
      const dbStats = await query(`
        SELECT 
          COUNT(*) FILTER (WHERE platform = 'product') as product_events,
          COUNT(*) FILTER (WHERE platform = 'lemlist') as lemlist_events,
          COUNT(*) FILTER (WHERE platform = 'smartlead') as smartlead_events,
          COUNT(DISTINCT user_id) as unique_users,
          MAX(created_at) as last_event
        FROM event_source
        WHERE created_at > NOW() - INTERVAL '7 days'
      `);

      res.json({
        success: true,
        stats: {
          ...this.stats,
          db: dbStats.rows[0],
          mixpanel: this.mixpanelService.getStats(),
          slack: this.slackService.getStats(),
        },
      });
    } catch (error) {
      logger.error(`[Product Event] Failed to get stats:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    const router = express.Router();

    // Single event tracking
    router.post("/track", this.trackEvent.bind(this));

    // Batch event tracking
    router.post("/batch", this.trackBatch.bind(this));

    // User identification
    router.post("/identify", this.identifyUser.bind(this));

    // Statistics
    router.get("/stats", this.getStats.bind(this));

    // Health check
    router.get("/health", (req, res) => {
      res.json({
        success: true,
        services: {
          mixpanel: this.mixpanelService?.enabled || false,
          attio: !!this.attioService,
          slack: this.slackService?.enabled || false,
          database: true,
        },
      });
    });

    return router;
  }
}

module.exports = ProductEventRoutes;
