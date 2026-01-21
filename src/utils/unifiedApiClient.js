const axios = require("axios");
const { createRateLimiter } = require("./unifiedRateLimiter");
const logger = require("./logger");

/**
 * Unified API Client
 * 
 * Consolidates common API patterns across services:
 * - Rate limiting integration
 * - Error handling
 * - Retry logic
 * - Logging
 * - Header management
 */
class UnifiedApiClient {
  /**
   * @param {string|object} rateLimiterConfig - Service name or rate limiter config
   * @param {object} options - Client options
   */
  constructor(rateLimiterConfig, options = {}) {
    this.rateLimiter = createRateLimiter(rateLimiterConfig);
    
    this.options = {
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      retryDelay: options.retryDelay || 1000,
      baseURL: options.baseURL || null,
      defaultHeaders: options.defaultHeaders || {},
      ...options,
    };

    // Create axios instance
    this.axios = axios.create({
      baseURL: this.options.baseURL,
      timeout: this.options.timeout,
      headers: this.options.defaultHeaders,
    });

    // Wrap axios with rate limiter
    this.axios = this.rateLimiter.wrapAxios(this.axios);

    logger.info("UnifiedApiClient initialized", {
      service: typeof rateLimiterConfig === "string" ? rateLimiterConfig : "custom",
      baseURL: this.options.baseURL,
    });
  }

  /**
   * Make a GET request
   */
  async get(url, config = {}) {
    return this.request("GET", url, null, config);
  }

  /**
   * Make a POST request
   */
  async post(url, data = null, config = {}) {
    return this.request("POST", url, data, config);
  }

  /**
   * Make a PUT request
   */
  async put(url, data = null, config = {}) {
    return this.request("PUT", url, data, config);
  }

  /**
   * Make a PATCH request
   */
  async patch(url, data = null, config = {}) {
    return this.request("PATCH", url, data, config);
  }

  /**
   * Make a DELETE request
   */
  async delete(url, config = {}) {
    return this.request("DELETE", url, null, config);
  }

  /**
   * Make a request with retry logic
   */
  async request(method, url, data = null, config = {}) {
    const maxRetries = config.retries || this.options.retries;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const requestConfig = {
          method,
          url,
          ...config,
        };

        if (data && (method === "POST" || method === "PUT" || method === "PATCH")) {
          requestConfig.data = data;
        }

        const response = await this.rateLimiter.makeRateLimitedCall(() =>
          this.axios.request(requestConfig)
        );

        // Update rate limiter from response headers
        if (response.headers) {
          this.rateLimiter.updateFromHeaders(response.headers);
        }

        return response;
      } catch (error) {
        lastError = error;

        // Don't retry on 4xx errors (except 429)
        if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
          throw error;
        }

        // Retry on 429, 5xx, or network errors
        if (attempt < maxRetries) {
          const delay = this.calculateRetryDelay(attempt, error);
          logger.warn(
            `[UnifiedApiClient] Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
            error.message
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attempt, error) {
    // If rate limited, use retry-after header
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers["retry-after"];
      if (retryAfter) {
        return parseInt(retryAfter) * 1000;
      }
    }

    // Exponential backoff
    const baseDelay = this.options.retryDelay;
    return baseDelay * Math.pow(2, attempt);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Set default headers
   */
  setDefaultHeaders(headers) {
    this.options.defaultHeaders = {
      ...this.options.defaultHeaders,
      ...headers,
    };
    this.axios.defaults.headers.common = {
      ...this.axios.defaults.headers.common,
      ...this.options.defaultHeaders,
    };
  }

  /**
   * Set authorization header
   */
  setAuth(token, type = "Bearer") {
    this.setDefaultHeaders({
      Authorization: `${type} ${token}`,
    });
  }

  /**
   * Get rate limiter status
   */
  getRateLimiterStatus() {
    return this.rateLimiter.getStatus();
  }
}

/**
 * Factory function to create API clients for different services
 */
function createApiClient(serviceName, options = {}) {
  // Pre-configure common services
  const serviceConfigs = {
    apollo: {
      baseURL: "https://api.apollo.io/api/v1",
      timeout: 30000,
    },
    hunter: {
      baseURL: "https://api.hunter.io/v2",
      timeout: 30000,
    },
    smartlead: {
      baseURL: "https://server.smartlead.ai/api",
      timeout: 30000,
    },
    lemlist: {
      baseURL: "https://api.lemlist.com",
      timeout: 30000,
    },
    attio: {
      baseURL: "https://api.attio.com/v2",
      timeout: 30000,
    },
  };

  const serviceConfig = serviceConfigs[serviceName] || {};
  const mergedOptions = {
    ...serviceConfig,
    ...options,
  };

  return new UnifiedApiClient(serviceName, mergedOptions);
}

module.exports = {
  UnifiedApiClient,
  createApiClient,
};
