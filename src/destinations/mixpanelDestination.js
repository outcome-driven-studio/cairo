const { BaseDestination } = require("../services/destinationService");
const axios = require("axios");

/**
 * Mixpanel Destination Plugin
 * Sends events to Mixpanel analytics
 */
class MixpanelDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.projectToken = config.projectToken;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl || 'https://api.mixpanel.com';
  }

  validateConfig() {
    const errors = [];

    if (!this.projectToken) {
      errors.push('projectToken is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async track(event) {
    const mixpanelEvent = {
      event: event.event,
      properties: {
        distinct_id: event.userId || event.anonymousId,
        time: Math.floor(new Date(event.timestamp || Date.now()).getTime() / 1000),
        $insert_id: event.messageId,
        ...event.properties,
        // Add context data
        $current_url: event.context?.page?.url,
        $referrer: event.context?.page?.referrer,
        $browser: event.context?.userAgent,
        $os: event.context?.os?.name,
        mp_lib: 'cairo-cdp',
      }
    };

    return await this.sendToMixpanel('/track', [mixpanelEvent]);
  }

  async identify(user) {
    // Set user properties
    const profileUpdate = {
      $distinct_id: user.userId,
      $set: {
        ...user.traits,
        $created: user.traits?.createdAt || new Date().toISOString(),
        $email: user.traits?.email,
        $name: user.traits?.name || user.traits?.firstName + ' ' + user.traits?.lastName,
        $phone: user.traits?.phone,
      }
    };

    // Remove undefined values
    Object.keys(profileUpdate.$set).forEach(key => {
      if (profileUpdate.$set[key] === undefined) {
        delete profileUpdate.$set[key];
      }
    });

    const result = await this.sendToMixpanel('/engage', [profileUpdate]);

    // Also create an alias if we have anonymousId
    if (user.anonymousId && user.anonymousId !== user.userId) {
      await this.alias({
        userId: user.userId,
        previousId: user.anonymousId
      });
    }

    return result;
  }

  async page(pageView) {
    // Convert page view to track event
    const event = {
      event: 'Page Viewed',
      userId: pageView.userId,
      anonymousId: pageView.anonymousId,
      messageId: pageView.messageId,
      timestamp: pageView.timestamp,
      properties: {
        page_name: pageView.name,
        page_category: pageView.category,
        ...pageView.properties
      },
      context: pageView.context
    };

    return await this.track(event);
  }

  async group(group) {
    // Set group properties on the user profile
    const profileUpdate = {
      $distinct_id: group.userId,
      $set: {
        company_id: group.groupId,
        ...Object.keys(group.traits || {}).reduce((acc, key) => {
          acc[`company_${key}`] = group.traits[key];
          return acc;
        }, {})
      }
    };

    return await this.sendToMixpanel('/engage', [profileUpdate]);
  }

  async alias(alias) {
    const aliasEvent = {
      event: '$create_alias',
      properties: {
        distinct_id: alias.previousId,
        alias: alias.userId,
        token: this.projectToken
      }
    };

    return await this.sendToMixpanel('/track', [aliasEvent]);
  }

  async test() {
    try {
      const testEvent = {
        event: 'Cairo CDP Test Event',
        properties: {
          distinct_id: 'test-user-' + Date.now(),
          time: Math.floor(Date.now() / 1000),
          test: true,
          source: 'cairo-cdp-test'
        }
      };

      const result = await this.sendToMixpanel('/track', [testEvent]);
      return { success: true, message: 'Test event sent successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Private methods

  async sendToMixpanel(endpoint, data) {
    try {
      const payload = {
        data: Buffer.from(JSON.stringify(data)).toString('base64'),
      };

      if (endpoint === '/track') {
        payload.token = this.projectToken;
      }

      if (endpoint === '/engage' && this.apiSecret) {
        payload.api_key = this.apiSecret;
      }

      const response = await axios.post(`${this.baseUrl}${endpoint}`, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        transformRequest: [(data) => {
          return Object.keys(data)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
            .join('&');
        }]
      });

      if (response.data.error) {
        throw new Error(`Mixpanel API error: ${response.data.error}`);
      }

      return { success: true, message: 'Event sent to Mixpanel' };
    } catch (error) {
      if (error.response) {
        throw new Error(`Mixpanel API error (${error.response.status}): ${error.response.data?.error || error.message}`);
      }
      throw new Error(`Failed to send to Mixpanel: ${error.message}`);
    }
  }

  // Utility method to track multiple events in batch
  async trackBatch(events) {
    const mixpanelEvents = events.map(event => ({
      event: event.event,
      properties: {
        distinct_id: event.userId || event.anonymousId,
        time: Math.floor(new Date(event.timestamp || Date.now()).getTime() / 1000),
        $insert_id: event.messageId,
        ...event.properties,
        mp_lib: 'cairo-cdp',
      }
    }));

    return await this.sendToMixpanel('/track', mixpanelEvents);
  }

  // Get Mixpanel project info
  async getProjectInfo() {
    if (!this.apiSecret) {
      throw new Error('API secret required for project info');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/engage`, {
        params: {
          where: '',
          session_id: '',
          token: this.projectToken,
          api_key: this.apiSecret
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get project info: ${error.message}`);
    }
  }
}

module.exports = MixpanelDestination;