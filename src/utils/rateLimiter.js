const logger = require('./logger');

class RateLimiter {
  /**
   * Create a new rate limiter
   * @param {number} maxRequests - Maximum number of requests allowed in the time window
   * @param {number} timeWindowMs - Time window in milliseconds
   */
  constructor(maxRequests, timeWindowMs) {
    this.maxRequests = maxRequests;
    this.timeWindowMs = timeWindowMs;
    this.tokens = maxRequests;
    this.lastRefill = Date.now();
    
    logger.info(`RateLimiter initialized: ${maxRequests} requests per ${timeWindowMs}ms`);
  }

  /**
   * Refill tokens based on elapsed time
   * @private
   */
  refillTokens() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed / this.timeWindowMs) * this.maxRequests;
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxRequests, this.tokens + tokensToAdd);
      this.lastRefill = now;
      logger.debug(`Refilled ${tokensToAdd} tokens, current tokens: ${this.tokens}`);
    }
  }

  /**
   * Wait for a token to become available
   * @returns {Promise<void>}
   */
  async waitForToken() {
    this.refillTokens();
    
    if (this.tokens > 0) {
      this.tokens--;
      logger.debug(`Token consumed, ${this.tokens} tokens remaining`);
      return;
    }
    
    // Calculate wait time until next token
    const waitTime = this.timeWindowMs - (Date.now() - this.lastRefill);
    logger.debug(`Rate limit reached, waiting ${waitTime}ms for next token`);
    
    // Wait for the calculated time
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Try again after waiting
    return this.waitForToken();
  }
}

module.exports = RateLimiter;
