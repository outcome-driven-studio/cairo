const logger = require('../utils/logger');
const MixpanelService = require('./mixpanelService');
const AttioService = require('./attioService');

/**
 * Comprehensive Event Tracking Service
 * Handles all event types and sends them to appropriate destinations
 */
class EventTrackingService {
  constructor() {
    this.mixpanelService = new MixpanelService(process.env.MIXPANEL_PROJECT_TOKEN);
    this.attioService = process.env.ATTIO_API_KEY ? new AttioService() : null;

    // Event type definitions
    this.eventTypes = {
      // Lead lifecycle events
      LEAD_CREATED: 'Lead Created',
      LEAD_UPDATED: 'Lead Updated',
      LEAD_SCORED: 'Lead Scored',
      LEAD_ENRICHED: 'Lead Enriched',
      LEAD_SEGMENTED: 'Lead Segmented',
      LEAD_QUALIFIED: 'Lead Qualified',
      LEAD_DISQUALIFIED: 'Lead Disqualified',

      // Email campaign events
      EMAIL_SENT: 'Email Sent',
      EMAIL_OPENED: 'Email Opened',
      EMAIL_CLICKED: 'Email Clicked',
      EMAIL_REPLIED: 'Email Replied',
      EMAIL_BOUNCED: 'Email Bounced',
      EMAIL_UNSUBSCRIBED: 'Email Unsubscribed',

      // Campaign events
      CAMPAIGN_STARTED: 'Campaign Started',
      CAMPAIGN_PAUSED: 'Campaign Paused',
      CAMPAIGN_COMPLETED: 'Campaign Completed',
      CAMPAIGN_LEAD_ADDED: 'Campaign Lead Added',
      CAMPAIGN_LEAD_REMOVED: 'Campaign Lead Removed',

      // LinkedIn events
      LINKEDIN_MESSAGE_SENT: 'LinkedIn Message Sent',
      LINKEDIN_CONNECTION_REQUEST: 'LinkedIn Connection Request',
      LINKEDIN_PROFILE_VIEWED: 'LinkedIn Profile Viewed',
      LINKEDIN_MESSAGE_ACCEPTED: 'LinkedIn Message Accepted',

      // Data sync events
      DATA_SYNCED: 'Data Synced',
      APOLLO_DATA_SYNCED: 'Apollo Data Synced',
      ATTIO_DATA_SYNCED: 'Attio Data Synced',
      ENRICHMENT_COMPLETED: 'Enrichment Completed',

      // User activity events
      USER_LOGIN: 'User Login',
      USER_SIGNUP: 'User Signup',
      USER_ACTION: 'User Action',
      PAGE_VIEWED: 'Page Viewed',
      FEATURE_USED: 'Feature Used',

      // System events
      SYNC_STARTED: 'Sync Started',
      SYNC_COMPLETED: 'Sync Completed',
      SYNC_FAILED: 'Sync Failed',
      ERROR_OCCURRED: 'Error Occurred',

      // Business events
      TRIAL_STARTED: 'Trial Started',
      TRIAL_ENDED: 'Trial Ended',
      SUBSCRIPTION_CREATED: 'Subscription Created',
      SUBSCRIPTION_UPGRADED: 'Subscription Upgraded',
      SUBSCRIPTION_DOWNGRADED: 'Subscription Downgraded',
      SUBSCRIPTION_CANCELLED: 'Subscription Cancelled',
      PAYMENT_SUCCEEDED: 'Payment Succeeded',
      PAYMENT_FAILED: 'Payment Failed'
    };

    this.stats = {
      eventsTracked: 0,
      eventsByType: {},
      errors: []
    };
  }

  /**
   * Track a generic event
   */
  async trackEvent(userId, eventName, properties = {}) {
    try {
      const enrichedProperties = {
        ...properties,
        timestamp: new Date().toISOString(),
        source: properties.source || 'event_tracking_service',
        environment: process.env.NODE_ENV || 'development'
      };

      // Send to Mixpanel
      if (this.mixpanelService.enabled) {
        await this.mixpanelService.track(userId, eventName, enrichedProperties);
      }

      // Send to Attio if configured
      if (this.attioService && properties.syncToAttio !== false) {
        await this.trackAttioEvent(userId, eventName, enrichedProperties);
      }

      // Update statistics
      this.stats.eventsTracked++;
      this.stats.eventsByType[eventName] = (this.stats.eventsByType[eventName] || 0) + 1;

      logger.debug(`Event tracked: ${eventName} for user ${userId}`);
      return { success: true, event: eventName, userId };
    } catch (error) {
      logger.error(`Failed to track event ${eventName}:`, error);
      this.stats.errors.push({ event: eventName, error: error.message, timestamp: new Date() });
      throw error;
    }
  }

  /**
   * Track lead lifecycle events
   */
  async trackLeadEvent(email, eventType, leadData = {}) {
    const properties = {
      email,
      lead_score: leadData.lead_score,
      lead_grade: leadData.lead_grade,
      icp_score: leadData.icp_score,
      organization: leadData.organization,
      title: leadData.title,
      industry: leadData.industry,
      location: leadData.location,
      has_enrichment: !!leadData.enrichment_profile,
      has_apollo_data: !!leadData.apollo_data,
      source: 'lead_tracking',
      ...leadData
    };

    return this.trackEvent(email, eventType, properties);
  }

  /**
   * Track email campaign events
   */
  async trackEmailEvent(email, eventType, emailData = {}) {
    const properties = {
      campaign_id: emailData.campaign_id,
      campaign_name: emailData.campaign_name,
      campaign_platform: emailData.platform,
      subject: emailData.subject,
      sequence_step: emailData.sequence_step,
      template_id: emailData.template_id,
      send_time: emailData.send_time,
      open_time: emailData.open_time,
      click_time: emailData.click_time,
      reply_time: emailData.reply_time,
      source: 'email_tracking',
      ...emailData
    };

    return this.trackEvent(email, eventType, properties);
  }

  /**
   * Track campaign events
   */
  async trackCampaignEvent(campaignId, eventType, campaignData = {}) {
    const properties = {
      campaign_id: campaignId,
      campaign_name: campaignData.name,
      campaign_platform: campaignData.platform,
      total_leads: campaignData.total_leads,
      sent_count: campaignData.sent_count,
      open_count: campaignData.open_count,
      click_count: campaignData.click_count,
      reply_count: campaignData.reply_count,
      status: campaignData.status,
      source: 'campaign_tracking',
      ...campaignData
    };

    // Use campaign ID as user ID for campaign-level events
    return this.trackEvent(`campaign_${campaignId}`, eventType, properties);
  }

  /**
   * Track LinkedIn events
   */
  async trackLinkedInEvent(email, eventType, linkedinData = {}) {
    const properties = {
      profile_url: linkedinData.profile_url,
      connection_degree: linkedinData.connection_degree,
      message_content: linkedinData.message_content,
      campaign_id: linkedinData.campaign_id,
      campaign_platform: 'linkedin',
      source: 'linkedin_tracking',
      ...linkedinData
    };

    return this.trackEvent(email, eventType, properties);
  }

  /**
   * Track data sync events
   */
  async trackSyncEvent(syncType, syncData = {}) {
    const properties = {
      sync_type: syncType,
      records_processed: syncData.records_processed,
      records_succeeded: syncData.records_succeeded,
      records_failed: syncData.records_failed,
      duration_seconds: syncData.duration,
      platform: syncData.platform,
      destination: syncData.destination,
      source: 'sync_tracking',
      ...syncData
    };

    // Use sync type as identifier
    return this.trackEvent(`sync_${syncType}`, this.eventTypes.DATA_SYNCED, properties);
  }

  /**
   * Track user activity events
   */
  async trackUserActivity(userId, activityType, activityData = {}) {
    const properties = {
      activity_type: activityType,
      page: activityData.page,
      feature: activityData.feature,
      action: activityData.action,
      duration: activityData.duration,
      source: 'user_activity',
      ...activityData
    };

    return this.trackEvent(userId, activityType, properties);
  }

  /**
   * Track business/subscription events
   */
  async trackBusinessEvent(userId, eventType, businessData = {}) {
    const properties = {
      plan: businessData.plan,
      amount: businessData.amount,
      currency: businessData.currency,
      billing_period: businessData.billing_period,
      mrr: businessData.mrr,
      seats: businessData.seats,
      source: 'business_tracking',
      ...businessData
    };

    return this.trackEvent(userId, eventType, properties);
  }

  /**
   * Batch track multiple events
   */
  async trackBatch(events) {
    const results = [];
    const errors = [];

    for (const event of events) {
      try {
        const result = await this.trackEvent(
          event.userId || event.email,
          event.event,
          event.properties || {}
        );
        results.push(result);
      } catch (error) {
        errors.push({ event, error: error.message });
      }
    }

    return {
      success: errors.length === 0,
      tracked: results.length,
      failed: errors.length,
      errors: errors.slice(0, 10) // Return first 10 errors
    };
  }

  /**
   * Track event to Attio
   */
  async trackAttioEvent(userId, eventName, properties) {
    try {
      if (!this.attioService) return;

      const attioEventData = {
        event_key: `${eventName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
        event_type: eventName,
        user_id: userId,
        metadata: properties,
        created_at: new Date().toISOString()
      };

      await this.attioService.createEvent(attioEventData, userId);
      logger.debug(`Event tracked to Attio: ${eventName} for ${userId}`);
    } catch (error) {
      logger.error(`Failed to track event to Attio:`, error);
      // Don't throw - Attio tracking is optional
    }
  }

  /**
   * Track enrichment completion
   */
  async trackEnrichmentCompleted(email, enrichmentData) {
    return this.trackEvent(email, this.eventTypes.ENRICHMENT_COMPLETED, {
      fields_enriched: Object.keys(enrichmentData).length,
      has_name: !!enrichmentData.name,
      has_company: !!enrichmentData.company,
      has_title: !!enrichmentData.title,
      has_linkedin: !!enrichmentData.linkedin_url,
      has_phone: !!enrichmentData.phone,
      enrichment_source: enrichmentData.source || 'apollo',
      source: 'enrichment_tracking'
    });
  }

  /**
   * Track lead scoring
   */
  async trackLeadScoring(email, scoreData) {
    return this.trackEvent(email, this.eventTypes.LEAD_SCORED, {
      lead_score: scoreData.lead_score,
      previous_score: scoreData.previous_score,
      score_change: scoreData.lead_score - (scoreData.previous_score || 0),
      lead_grade: scoreData.lead_grade,
      icp_score: scoreData.icp_score,
      behavior_score: scoreData.behavior_score,
      engagement_score: scoreData.engagement_score,
      score_factors: scoreData.factors,
      source: 'scoring_tracking'
    });
  }

  /**
   * Get tracking statistics
   */
  getStats() {
    return {
      ...this.stats,
      mixpanel: this.mixpanelService.getStats(),
      attio: this.attioService ? 'enabled' : 'disabled'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      eventsTracked: 0,
      eventsByType: {},
      errors: []
    };
  }
}

module.exports = EventTrackingService;