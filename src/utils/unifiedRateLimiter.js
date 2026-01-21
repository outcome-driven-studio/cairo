/**
 * Unified Rate Limiter
 * 
 * Consolidates all rate limiting implementations into a single, comprehensive solution.
 * Supports:
 * - Token bucket algorithm
 * - Header-aware rate limiting (from API responses)
 * - Bulk operations with progress tracking
 * - Adaptive batching
 * - Queue-based processing
 * - Per-service configuration
 */

const logger = require("./logger");

/**
 * Pre-configured API limits for common services
 */
const API_LIMITS = {
  smartlead: {
    requestsPerSecond: 10,
    requestsPerMinute: 300,
    maxBatchSize: 100,
    burstLimit: 5,
    backoffMultiplier: 1.5,
  },
  lemlist: {
    requestsPerSecond: 10, // 20 calls per 2 seconds = 10/sec
    requestsPerMinute: 300,
    maxBatchSize: 50,
    burstLimit: 3,
    backoffMultiplier: 2.0,
  },
  attio: {
    requestsPerSecond: 5,
    requestsPerMinute: 150,
    maxBatchSize: 25,
    burstLimit: 2,
    backoffMultiplier: 2.0,
  },
  mixpanel: {
    requestsPerSecond: 50,
    requestsPerMinute: 2000,
    maxBatchSize: 200,
    burstLimit: 10,
    backoffMultiplier: 1.2,
  },
  database: {
    requestsPerSecond: 100,
    requestsPerMinute: 6000,
    maxBatchSize: 500,
    burstLimit: 20,
    backoffMultiplier: 1.1,
  },
  apollo: {
    requestsPerSecond: 1.67, // 100 per minute
    requestsPerMinute: 100,
    maxBatchSize: 10,
    burstLimit: 2,
    backoffMultiplier: 1.5,
  },
  slack: {
    requestsPerSecond: 1, // 1 per second
    requestsPerMinute: 60,
    maxBatchSize: 5,
    burstLimit: 1,
    backoffMultiplier: 2.0,
  },
  gemini: {
    requestsPerSecond: 15, // Gemini API limits
    requestsPerMinute: 900,
    maxBatchSize: 50,
    burstLimit: 5,
    backoffMultiplier: 1.5,
  },
  discord: {
    requestsPerSecond: 5, // Discord webhook rate limit (conservative)
    requestsPerMinute: 30, // Discord allows ~30 requests per minute per webhook
    maxBatchSize: 5,
    burstLimit: 2,
    backoffMultiplier: 2.0,
  },
};

/**
 * Progress Tracker for bulk operations
 */
class ProgressTracker {
  constructor(totalItems, operationName) {
    this.totalItems = totalItems;
    this.operationName = operationName;
    this.processedItems = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
    this.lastLogTime = Date.now();
    this.logInterval = 10000; // Log every 10 seconds
  }

  update(processedCount, errorCount = 0) {
    this.processedItems += processedCount;
    this.errorCount += errorCount;

    const now = Date.now();
    const shouldLog = now - this.lastLogTime >= this.logInterval;

    if (shouldLog || this.processedItems >= this.totalItems) {
      this.logProgress();
      this.lastLogTime = now;
    }
  }

  logProgress() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.processedItems / elapsed;
    const remaining = this.totalItems - this.processedItems;
    const eta = remaining > 0 ? remaining / rate : 0;
    const percentage = Math.min(
      100,
      (this.processedItems / this.totalItems) * 100
    );

    logger.info(`${this.operationName} Progress`, {
      processed: this.processedItems,
      total: this.totalItems,
      percentage: percentage.toFixed(1) + "%",
      errors: this.errorCount,
      rate: rate.toFixed(2) + "/sec",
      elapsed: elapsed.toFixed(0) + "s",
      eta: eta > 0 ? eta.toFixed(0) + "s" : "complete",
    });
  }

  getSummary() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.processedItems / elapsed;

    return {
      operationName: this.operationName,
      totalItems: this.totalItems,
      processedItems: this.processedItems,
      errorCount: this.errorCount,
      successRate: (
        ((this.processedItems - this.errorCount) / this.totalItems) *
        100
      ).toFixed(1),
      elapsed: elapsed.toFixed(2),
      averageRate: rate.toFixed(2),
      completed: this.processedItems >= this.totalItems,
    };
  }
}

/**
 * Adaptive Batch Queue
 */
class BatchQueue {
  constructor(items, initialBatchSize = 50) {
    this.items = [...items];
    this.currentBatchSize = initialBatchSize;
    this.minBatchSize = 5;
    this.maxBatchSize = 1000;
    this.successfulBatches = 0;
    this.failedBatches = 0;
    this.totalProcessed = 0;
  }

  getNextBatch() {
    if (this.items.length === 0) {
      return null;
    }

    const batchSize = Math.min(this.currentBatchSize, this.items.length);
    const batch = this.items.splice(0, batchSize);

    return {
      items: batch,
      batchNumber: this.successfulBatches + this.failedBatches + 1,
      remainingItems: this.items.length,
    };
  }

  reportSuccess(processedCount) {
    this.successfulBatches++;
    this.totalProcessed += processedCount;

    // Increase batch size on consecutive successes
    if (
      this.successfulBatches % 3 === 0 &&
      this.currentBatchSize < this.maxBatchSize
    ) {
      this.currentBatchSize = Math.min(
        this.maxBatchSize,
        Math.ceil(this.currentBatchSize * 1.2)
      );
    }
  }

  reportFailure(failedItems = []) {
    this.failedBatches++;

    // Add failed items back to front of queue for retry
    if (failedItems && failedItems.length > 0) {
      this.items.unshift(...failedItems);
    }

    // Decrease batch size on failure
    this.currentBatchSize = Math.max(
      this.minBatchSize,
      Math.floor(this.currentBatchSize * 0.7)
    );
  }

  hasMore() {
    return this.items.length > 0;
  }

  getStatus() {
    return {
      remainingItems: this.items.length,
      currentBatchSize: this.currentBatchSize,
      successfulBatches: this.successfulBatches,
      failedBatches: this.failedBatches,
      totalProcessed: this.totalProcessed,
    };
  }
}

/**
 * Unified Rate Limiter Class
 */
class UnifiedRateLimiter {
  /**
   * @param {string|object} config - Service name (uses API_LIMITS) or custom config object
   * @param {object} customConfig - Optional custom configuration to override defaults
   */
  constructor(config, customConfig = {}) {
    // If config is a string, use pre-configured limits
    if (typeof config === "string") {
      this.serviceName = config;
      this.limits = API_LIMITS[config] || API_LIMITS.database;
    } else {
      // Custom configuration
      this.serviceName = config.serviceName || "custom";
      this.limits = config;
    }

    // Merge with custom config
    this.config = {
      ...this.limits,
      ...customConfig,
    };

    // Token bucket state
    this.maxRequests = this.config.requestsPerSecond || 10;
    this.timeWindowMs = 1000; // 1 second window
    this.tokens = this.maxRequests;
    this.lastRefill = Date.now();

    // Header-aware rate limiting
    this.retryAfter = null;
    this.rateLimitReset = null;
    this.headerMaxRequests = null;
    this.headerRemaining = null;

    // Exponential backoff
    this.backoffDelay = 0;
    this.consecutiveErrors = 0;
    this.backoffMultiplier = this.config.backoffMultiplier || 1.5;

    // Bulk operation support
    this.progressTracker = null;
    this.batchQueue = null;

    // Queue-based processing
    this.requestQueue = [];
    this.isProcessing = false;

    logger.info("UnifiedRateLimiter initialized", {
      serviceName: this.serviceName,
      maxRequests: this.maxRequests,
      requestsPerMinute: this.config.requestsPerMinute,
    });
  }

  /**
   * Update rate limit info from API response headers
   */
  updateFromHeaders(headers) {
    if (!headers) return;

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
      this.retryAfter = Date.now() + parseInt(retryAfter) * 1000;
      logger.warn(
        `Rate limited! Must wait ${retryAfter} seconds until ${new Date(
          this.retryAfter
        ).toISOString()}`
      );
    }

    if (rateLimitLimit) {
      this.headerMaxRequests = parseInt(rateLimitLimit);
      this.maxRequests = Math.min(this.maxRequests, this.headerMaxRequests);
    }

    if (rateLimitRemaining !== null) {
      this.headerRemaining = parseInt(rateLimitRemaining);
      this.tokens = Math.min(this.tokens, this.headerRemaining);
    }

    if (rateLimitReset) {
      this.rateLimitReset = isNaN(rateLimitReset)
        ? new Date(rateLimitReset).getTime()
        : parseInt(rateLimitReset) * 1000;
    }
  }

  /**
   * Check if currently rate limited
   */
  isRateLimited() {
    return this.retryAfter && Date.now() < this.retryAfter;
  }

  /**
   * Refill tokens based on elapsed time
   */
  refillTokens() {
    const now = Date.now();

    // If we have a reset time and it's passed, refill all tokens
    if (this.rateLimitReset && now >= this.rateLimitReset) {
      this.tokens = this.maxRequests;
      this.rateLimitReset = null;
      this.lastRefill = now;
      return;
    }

    // Standard token bucket refill
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(
      (timePassed / this.timeWindowMs) * this.maxRequests
    );

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxRequests, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Wait for a token to become available
   */
  async waitForToken() {
    // Check if we're rate limited by retry-after header
    if (this.isRateLimited()) {
      const waitTime = this.retryAfter - Date.now();
      logger.warn(
        `Rate limited, waiting ${waitTime}ms until ${new Date(
          this.retryAfter
        ).toISOString()}`
      );
      await this.sleep(waitTime);
      this.retryAfter = null;
    }

    // Handle exponential backoff
    if (this.backoffDelay > 0) {
      logger.debug("Applying backoff delay", {
        delay: this.backoffDelay + "ms",
        consecutiveErrors: this.consecutiveErrors,
      });
      await this.sleep(this.backoffDelay);
    }

    this.refillTokens();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Calculate wait time until next token
    let waitTime;
    if (this.rateLimitReset) {
      waitTime = this.rateLimitReset - Date.now();
    } else {
      waitTime = this.timeWindowMs - (Date.now() - this.lastRefill);
    }

    if (waitTime > 0) {
      await this.sleep(waitTime);
      return this.waitForToken();
    }
  }

  /**
   * Make a rate-limited API call
   */
  async makeRateLimitedCall(apiCall) {
    await this.waitForToken();

    try {
      const result = await apiCall();
      this.consecutiveErrors = 0;
      this.backoffDelay = 0;
      return result;
    } catch (error) {
      this.consecutiveErrors++;
      this.backoffDelay = Math.min(
        30000, // Max 30 seconds
        1000 * Math.pow(this.backoffMultiplier, this.consecutiveErrors - 1)
      );

      // Check for rate limit headers in error response
      if (error.response?.headers) {
        this.updateFromHeaders(error.response.headers);
      }

      throw error;
    }
  }

  /**
   * Wrap axios instance to automatically handle rate limiting
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
        if (error.response?.headers) {
          rateLimiter.updateFromHeaders(error.response.headers);
        }
        throw error;
      }
    };
  }

  /**
   * Queue-based request processing (like LemlistRateLimiter)
   */
  async makeRequest(requestFunction) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFunction, resolve, reject });
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    this.isProcessing = true;
    while (this.requestQueue.length > 0) {
      const { requestFunction, resolve, reject } = this.requestQueue.shift();
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        try {
          await this.waitForToken();
          const response = await requestFunction();
          resolve(response);
          break;
        } catch (error) {
          if (error.response && error.response.status === 429) {
            attempts++;
            const retryAfterSeconds =
              parseInt(error.response.headers["retry-after"], 10) || 2;
            logger.warn(
              `Rate limited. Retrying after ${retryAfterSeconds} seconds... (Attempt ${attempts}/${maxAttempts})`
            );
            await this.sleep(retryAfterSeconds * 1000);
          } else {
            reject(error);
            break;
          }
        }
      }

      if (attempts >= maxAttempts) {
        reject(
          new Error("Exceeded maximum retry attempts for rate-limited request.")
        );
      }

      // Delay between requests
      const delay = 1000 / this.maxRequests;
      await this.sleep(delay);
    }
    this.isProcessing = false;
  }

  /**
   * Initialize bulk operation
   */
  initializeBulkOperation(items, operationName) {
    const totalItems = Array.isArray(items) ? items.length : items;

    this.progressTracker = new ProgressTracker(totalItems, operationName);

    if (Array.isArray(items)) {
      this.batchQueue = new BatchQueue(
        items,
        this.config.maxBatchSize || 50
      );
    }

    logger.info("Initialized bulk operation", {
      operationName,
      totalItems: typeof totalItems === "number" ? totalItems : "unknown",
      estimatedBatches: Math.ceil(
        totalItems / (this.config.maxBatchSize || 50)
      ),
    });
  }

  /**
   * Process a single batch with rate limiting
   */
  async processBatch(batchProcessor) {
    if (!this.batchQueue || !this.batchQueue.hasMore()) {
      return null;
    }

    const batch = this.batchQueue.getNextBatch();
    if (!batch) {
      return null;
    }

    try {
      await this.waitForToken();

      const startTime = Date.now();
      const result = await batchProcessor(batch.items);
      const duration = Date.now() - startTime;

      this.batchQueue.reportSuccess(batch.items.length);
      this.progressTracker.update(batch.items.length);
      this.consecutiveErrors = 0;
      this.backoffDelay = 0;

      return {
        success: true,
        processed: batch.items.length,
        remaining: batch.remainingItems,
        result,
        duration,
      };
    } catch (error) {
      this.batchQueue.reportFailure(batch.items);
      this.progressTracker.update(0, batch.items.length);
      this.consecutiveErrors++;

      this.backoffDelay = Math.min(
        30000,
        1000 * Math.pow(this.backoffMultiplier, this.consecutiveErrors - 1)
      );

      throw error;
    }
  }

  /**
   * Process all batches
   */
  async processAllBatches(batchProcessor, options = {}) {
    const { maxRetries = 3, stopOnError = false } = options;
    const results = [];
    let retryCount = 0;

    while (this.batchQueue && this.batchQueue.hasMore()) {
      try {
        const result = await this.processBatch(batchProcessor);
        if (result) {
          results.push(result);
          retryCount = 0;
        }
      } catch (error) {
        retryCount++;

        if (retryCount >= maxRetries) {
          if (stopOnError) {
            throw error;
          } else {
            break;
          }
        }
      }
    }

    const summary = this.progressTracker?.getSummary();
    if (summary) {
      logger.info("Bulk operation completed", summary);
    }

    return {
      results,
      summary,
      queueStatus: this.batchQueue?.getStatus(),
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      serviceName: this.serviceName,
      config: this.config,
      tokens: this.tokens,
      maxRequests: this.maxRequests,
      backoffDelay: this.backoffDelay,
      consecutiveErrors: this.consecutiveErrors,
      progress: this.progressTracker?.getSummary(),
      queue: this.batchQueue?.getStatus(),
      requestQueueLength: this.requestQueue.length,
    };
  }
}

/**
 * Factory function to create rate limiters
 */
function createRateLimiter(serviceName, customConfig = {}) {
  return new UnifiedRateLimiter(serviceName, customConfig);
}

module.exports = {
  UnifiedRateLimiter,
  ProgressTracker,
  BatchQueue,
  createRateLimiter,
  API_LIMITS,
};
