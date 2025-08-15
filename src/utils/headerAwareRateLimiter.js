const logger = require("./logger");

class HeaderAwareRateLimiter {
  /**
   * Create a new rate limiter that respects API response headers
   * @param {number} defaultMaxRequests - Default maximum requests (used if no header info)
   * @param {number} defaultTimeWindowMs - Default time window in milliseconds
   */
  constructor(defaultMaxRequests = 20, defaultTimeWindowMs = 2000) {
    this.defaultMaxRequests = defaultMaxRequests;
    this.defaultTimeWindowMs = defaultTimeWindowMs;
    this.maxRequests = defaultMaxRequests;
    this.timeWindowMs = defaultTimeWindowMs;
    this.tokens = defaultMaxRequests;
    this.lastRefill = Date.now();
    this.retryAfter = null;
    this.rateLimitReset = null;

    logger.info(
      `HeaderAwareRateLimiter initialized: ${defaultMaxRequests} requests per ${defaultTimeWindowMs}ms`
    );
  }

  /**
   * Update rate limit info from response headers
   * @param {Object} headers - Response headers from API
   */
  updateFromHeaders(headers) {
    if (!headers) return;

    // Check for rate limit headers (case-insensitive)
    const getHeader = (name) => {
      const key = Object.keys(headers).find(
        (k) => k.toLowerCase() === name.toLowerCase()
      );
      return key ? headers[key] : null;
    };

    const retryAfter = getHeader("retry-after");
    const rateLimitLimit = getHeader("x-ratelimit-limit");
    const rateLimitRemaining = getHeader("x-ratelimit-remaining");
    const rateLimitReset = getHeader("x-ratelimit-reset");

    if (retryAfter) {
      // We've been rate limited, need to wait
      this.retryAfter = Date.now() + parseInt(retryAfter) * 1000;
      logger.warn(
        `Rate limited! Must wait ${retryAfter} seconds until ${new Date(
          this.retryAfter
        ).toISOString()}`
      );
    }

    if (rateLimitLimit) {
      this.maxRequests = parseInt(rateLimitLimit);
    }

    if (rateLimitRemaining !== null) {
      this.tokens = parseInt(rateLimitRemaining);
      logger.debug(`Rate limit remaining: ${this.tokens}/${this.maxRequests}`);
    }

    if (rateLimitReset) {
      // Could be a timestamp or a date string
      this.rateLimitReset = isNaN(rateLimitReset)
        ? new Date(rateLimitReset).getTime()
        : parseInt(rateLimitReset) * 1000;
    }
  }

  /**
   * Check if we're currently rate limited
   * @returns {boolean}
   */
  isRateLimited() {
    return this.retryAfter && Date.now() < this.retryAfter;
  }

  /**
   * Refill tokens based on elapsed time or reset time
   * @private
   */
  refillTokens() {
    const now = Date.now();

    // If we have a reset time and it's passed, refill all tokens
    if (this.rateLimitReset && now >= this.rateLimitReset) {
      this.tokens = this.maxRequests;
      this.rateLimitReset = null;
      this.lastRefill = now;
      logger.debug(`Rate limit reset, tokens refilled to ${this.tokens}`);
      return;
    }

    // Otherwise use standard refill logic
    const timePassed = now - this.lastRefill;
    const tokensToAdd =
      Math.floor(timePassed / this.timeWindowMs) * this.maxRequests;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxRequests, this.tokens + tokensToAdd);
      this.lastRefill = now;
      logger.debug(
        `Refilled ${tokensToAdd} tokens, current tokens: ${this.tokens}`
      );
    }
  }

  /**
   * Wait for a token to become available
   * @returns {Promise<void>}
   */
  async waitForToken() {
    // First check if we're rate limited
    if (this.isRateLimited()) {
      const waitTime = this.retryAfter - Date.now();
      logger.warn(
        `Rate limited, waiting ${waitTime}ms until ${new Date(
          this.retryAfter
        ).toISOString()}`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.retryAfter = null; // Clear the retry after we've waited
    }

    this.refillTokens();

    if (this.tokens > 0) {
      this.tokens--;
      logger.debug(`Token consumed, ${this.tokens} tokens remaining`);
      return;
    }

    // Calculate wait time until next token
    let waitTime;
    if (this.rateLimitReset) {
      waitTime = this.rateLimitReset - Date.now();
    } else {
      waitTime = this.timeWindowMs - (Date.now() - this.lastRefill);
    }

    logger.debug(`No tokens available, waiting ${waitTime}ms`);

    // Wait for the calculated time
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitTime)));

    // Try again after waiting
    return this.waitForToken();
  }

  /**
   * Create a wrapper for axios that automatically handles rate limit headers
   * @param {Function} axiosInstance - Axios instance or function
   * @returns {Function} Wrapped axios function
   */
  wrapAxios(axiosInstance) {
    const rateLimiter = this;

    return async function (...args) {
      await rateLimiter.waitForToken();

      try {
        const response = await axiosInstance(...args);
        rateLimiter.updateFromHeaders(response.headers);
        return response;
      } catch (error) {
        // Even on error, check for rate limit headers
        if (error.response?.headers) {
          rateLimiter.updateFromHeaders(error.response.headers);
        }
        throw error;
      }
    };
  }
}

module.exports = HeaderAwareRateLimiter;
