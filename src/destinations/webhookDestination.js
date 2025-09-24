const { BaseDestination } = require("../services/destinationService");
const axios = require("axios");

/**
 * Webhook Destination Plugin
 * Sends events to custom webhook endpoints
 */
class WebhookDestination extends BaseDestination {
  constructor(config = {}) {
    super(config);
    this.url = config.url;
    this.method = config.method || 'POST';
    this.headers = config.headers || {};
    this.timeout = config.timeout || 10000;
    this.retries = config.retries || 2;
    this.includeContext = config.includeContext !== false;
    this.signatureSecret = config.signatureSecret;
  }

  validateConfig() {
    const errors = [];

    if (!this.url) {
      errors.push('url is required');
    }

    if (this.url && !this.url.startsWith('http')) {
      errors.push('url must be a valid HTTP/HTTPS URL');
    }

    if (this.method && !['GET', 'POST', 'PUT', 'PATCH'].includes(this.method.toUpperCase())) {
      errors.push('method must be one of: GET, POST, PUT, PATCH');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async track(event) {
    const payload = this.buildPayload('track', event);
    return await this.sendWebhook(payload);
  }

  async identify(user) {
    const payload = this.buildPayload('identify', user);
    return await this.sendWebhook(payload);
  }

  async page(pageView) {
    const payload = this.buildPayload('page', pageView);
    return await this.sendWebhook(payload);
  }

  async group(group) {
    const payload = this.buildPayload('group', group);
    return await this.sendWebhook(payload);
  }

  async alias(alias) {
    const payload = this.buildPayload('alias', alias);
    return await this.sendWebhook(payload);
  }

  async test() {
    try {
      const testPayload = {
        type: 'test',
        messageId: 'test-' + Date.now(),
        timestamp: new Date().toISOString(),
        source: 'cairo-cdp',
        test: true,
        message: 'This is a test webhook from Cairo CDP'
      };

      const result = await this.sendWebhook(testPayload);
      return { success: true, message: 'Test webhook sent successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Private methods

  buildPayload(type, eventData) {
    let payload = {
      type,
      messageId: eventData.messageId || this.generateMessageId(),
      timestamp: eventData.timestamp || new Date().toISOString(),
      source: 'cairo-cdp',
      ...eventData
    };

    if (!this.includeContext) {
      delete payload.context;
    }

    return payload;
  }

  async sendWebhook(payload, attempt = 1) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Cairo-CDP-Webhook/1.0',
        ...this.headers
      };

      // Add signature if secret is provided
      if (this.signatureSecret) {
        const signature = this.generateSignature(payload);
        headers['X-Cairo-Signature'] = signature;
      }

      const config = {
        method: this.method,
        url: this.url,
        headers,
        timeout: this.timeout,
        validateStatus: (status) => status >= 200 && status < 300,
      };

      if (['POST', 'PUT', 'PATCH'].includes(this.method.toUpperCase())) {
        config.data = payload;
      } else {
        config.params = payload;
      }

      const response = await axios(config);

      return {
        success: true,
        message: 'Webhook sent successfully',
        statusCode: response.status,
        response: response.data
      };

    } catch (error) {
      // Retry logic
      if (attempt <= this.retries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await this.sleep(delay);
        return this.sendWebhook(payload, attempt + 1);
      }

      // Final failure
      const errorMessage = error.response
        ? `Webhook failed (${error.response.status}): ${error.response.data || error.message}`
        : `Webhook failed: ${error.message}`;

      throw new Error(errorMessage);
    }
  }

  generateSignature(payload) {
    const crypto = require('crypto');
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.signatureSecret)
      .update(payloadString, 'utf8')
      .digest('hex');
  }

  generateMessageId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods for webhook management

  async verifyWebhook() {
    try {
      const testPayload = {
        type: 'verify',
        timestamp: new Date().toISOString(),
        source: 'cairo-cdp'
      };

      await this.sendWebhook(testPayload);
      return true;
    } catch (error) {
      return false;
    }
  }

  getWebhookInfo() {
    return {
      url: this.url,
      method: this.method,
      hasSignature: !!this.signatureSecret,
      timeout: this.timeout,
      retries: this.retries,
      includeContext: this.includeContext,
      customHeaders: Object.keys(this.headers).length > 0
    };
  }
}

module.exports = WebhookDestination;