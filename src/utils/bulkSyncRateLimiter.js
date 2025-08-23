/**
 * Bulk Sync Rate Limiter
 *
 * Provides unified rate limiting for bulk synchronization operations
 * with adaptive batching, progress tracking, and API-specific limits.
 */

const logger = require("./logger");

/**
 * API Rate Limit Configuration
 * Based on research from API documentation
 */
const API_LIMITS = {
  smartlead: {
    requestsPerSecond: 10, // Conservative estimate
    requestsPerMinute: 300, // Conservative estimate
    maxBatchSize: 100, // Safe batch size
    burstLimit: 5, // Burst allowance
    backoffMultiplier: 1.5, // Exponential backoff
  },
  lemlist: {
    requestsPerSecond: 10, // 20 calls per 2 seconds = 10/sec
    requestsPerMinute: 300, // Conservative estimate
    maxBatchSize: 50, // Smaller batches for safety
    burstLimit: 3, // Conservative burst
    backoffMultiplier: 2.0, // Aggressive backoff
  },
  attio: {
    requestsPerSecond: 5, // Conservative for bulk operations
    requestsPerMinute: 150, // Conservative estimate
    maxBatchSize: 25, // Small batches for CRM
    burstLimit: 2, // Very conservative
    backoffMultiplier: 2.0, // Aggressive backoff
  },
  mixpanel: {
    requestsPerSecond: 50, // Events API is more generous
    requestsPerMinute: 2000, // Higher limit for analytics
    maxBatchSize: 200, // Batch events efficiently
    burstLimit: 10, // Allow bursts
    backoffMultiplier: 1.2, // Gentle backoff
  },
  database: {
    requestsPerSecond: 100, // High for local database
    requestsPerMinute: 6000, // Very high limit
    maxBatchSize: 500, // Large batches OK
    burstLimit: 20, // High burst allowance
    backoffMultiplier: 1.1, // Minimal backoff
  },
};

/**
 * Progress tracking for bulk operations
 */
class ProgressTracker {
  constructor(totalItems, operationName) {
    this.totalItems = totalItems;
    this.operationName = operationName;
    this.processedItems = 0;
    this.errorCount = 0;
    this.startTime = new Date();
    this.lastLogTime = new Date();
    this.logInterval = 10000; // Log every 10 seconds
  }

  /**
   * Update progress and log if needed
   */
  update(processedCount, errorCount = 0) {
    this.processedItems += processedCount;
    this.errorCount += errorCount;

    const now = new Date();
    const shouldLog = now - this.lastLogTime >= this.logInterval;

    if (shouldLog || this.processedItems >= this.totalItems) {
      this.logProgress();
      this.lastLogTime = now;
    }
  }

  /**
   * Log current progress
   */
  logProgress() {
    const elapsed = (new Date() - this.startTime) / 1000;
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

  /**
   * Get final summary
   */
  getSummary() {
    const elapsed = (new Date() - this.startTime) / 1000;
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
 * Adaptive batch queue manager
 */
class BatchQueue {
  constructor(items, initialBatchSize = 50) {
    this.items = [...items]; // Copy to avoid mutations
    this.currentBatchSize = initialBatchSize;
    this.minBatchSize = 5;
    this.maxBatchSize = 1000;
    this.successfulBatches = 0;
    this.failedBatches = 0;
    this.totalProcessed = 0;
  }

  /**
   * Get next batch of items
   */
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

  /**
   * Report batch success - increase batch size gradually
   */
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

      logger.debug("Increased batch size", {
        newBatchSize: this.currentBatchSize,
        successfulBatches: this.successfulBatches,
      });
    }
  }

  /**
   * Report batch failure - decrease batch size immediately
   */
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

    logger.warn("Decreased batch size due to failure", {
      newBatchSize: this.currentBatchSize,
      failedBatches: this.failedBatches,
      itemsRequeued: failedItems?.length || 0,
    });
  }

  /**
   * Check if there are more items to process
   */
  hasMore() {
    return this.items.length > 0;
  }

  /**
   * Get queue status
   */
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
 * Main Bulk Sync Rate Limiter Class
 */
class BulkSyncRateLimiter {
  constructor(apiType, config = {}) {
    this.apiType = apiType;
    this.limits = API_LIMITS[apiType] || API_LIMITS.database;
    this.config = { ...this.limits, ...config };

    // Rate limiting state
    this.requestCount = 0;
    this.windowStart = new Date();
    this.windowDuration = 1000; // 1 second window
    this.backoffDelay = 0;
    this.consecutiveErrors = 0;

    // Progress tracking
    this.progressTracker = null;
    this.batchQueue = null;

    logger.info("Initialized bulk sync rate limiter", {
      apiType: this.apiType,
      limits: this.config,
    });
  }

  /**
   * Initialize bulk operation
   */
  initializeBulkOperation(items, operationName) {
    const totalItems = Array.isArray(items) ? items.length : items;

    this.progressTracker = new ProgressTracker(totalItems, operationName);

    if (Array.isArray(items)) {
      this.batchQueue = new BatchQueue(items, this.config.maxBatchSize);
    }

    logger.info("Initialized bulk operation", {
      operationName,
      totalItems: typeof totalItems === "number" ? totalItems : "unknown",
      estimatedBatches: Math.ceil(totalItems / this.config.maxBatchSize),
    });
  }

  /**
   * Wait for rate limit if needed
   */
  async waitForRateLimit() {
    const now = new Date();
    const windowElapsed = now - this.windowStart;

    // Reset window if needed
    if (windowElapsed >= this.windowDuration) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // Check if we need to wait
    if (this.requestCount >= this.config.requestsPerSecond) {
      const waitTime = this.windowDuration - windowElapsed + 50; // Add small buffer
      logger.debug("Rate limit reached, waiting", {
        apiType: this.apiType,
        waitTime: waitTime + "ms",
        requests: this.requestCount,
      });

      await this.sleep(waitTime);

      // Reset after waiting
      this.requestCount = 0;
      this.windowStart = new Date();
    }

    // Handle exponential backoff
    if (this.backoffDelay > 0) {
      logger.debug("Applying backoff delay", {
        delay: this.backoffDelay + "ms",
        consecutiveErrors: this.consecutiveErrors,
      });

      await this.sleep(this.backoffDelay);
    }

    this.requestCount++;
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
      // Wait for rate limit
      await this.waitForRateLimit();

      // Process the batch
      const startTime = new Date();
      const result = await batchProcessor(batch.items);
      const duration = new Date() - startTime;

      // Report success
      this.batchQueue.reportSuccess(batch.items.length);
      this.progressTracker.update(batch.items.length);
      this.consecutiveErrors = 0;
      this.backoffDelay = 0;

      logger.debug("Batch processed successfully", {
        batchNumber: batch.batchNumber,
        itemCount: batch.items.length,
        duration: duration + "ms",
        remaining: batch.remainingItems,
      });

      return {
        success: true,
        processed: batch.items.length,
        remaining: batch.remainingItems,
        result,
      };
    } catch (error) {
      // Report failure
      this.batchQueue.reportFailure(batch.items);
      this.progressTracker.update(0, batch.items.length);
      this.consecutiveErrors++;

      // Apply exponential backoff
      this.backoffDelay = Math.min(
        30000, // Max 30 seconds
        1000 *
          Math.pow(this.config.backoffMultiplier, this.consecutiveErrors - 1)
      );

      logger.error("Batch processing failed", {
        batchNumber: batch.batchNumber,
        itemCount: batch.items.length,
        error: error.message,
        consecutiveErrors: this.consecutiveErrors,
        nextBackoffDelay: this.backoffDelay,
      });

      // Re-throw after a brief delay to allow calling code to handle
      await this.sleep(1000);
      throw error;
    }
  }

  /**
   * Process all batches in queue
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
          retryCount = 0; // Reset retry count on success
        }
      } catch (error) {
        retryCount++;

        if (retryCount >= maxRetries) {
          logger.error("Max retries exceeded, stopping batch processing", {
            maxRetries,
            error: error.message,
          });

          if (stopOnError) {
            throw error;
          } else {
            break; // Stop processing but don't throw
          }
        }

        logger.warn(`Retrying batch processing (${retryCount}/${maxRetries})`);
      }
    }

    // Log final summary
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
   * Simple rate-limited API call
   */
  async makeRateLimitedCall(apiCall) {
    await this.waitForRateLimit();

    try {
      const result = await apiCall();
      this.consecutiveErrors = 0;
      this.backoffDelay = 0;
      return result;
    } catch (error) {
      this.consecutiveErrors++;
      this.backoffDelay = Math.min(
        30000,
        1000 *
          Math.pow(this.config.backoffMultiplier, this.consecutiveErrors - 1)
      );
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limiter status
   */
  getStatus() {
    return {
      apiType: this.apiType,
      config: this.config,
      requestCount: this.requestCount,
      backoffDelay: this.backoffDelay,
      consecutiveErrors: this.consecutiveErrors,
      progress: this.progressTracker?.getSummary(),
      queue: this.batchQueue?.getStatus(),
    };
  }
}

/**
 * Factory function to create rate limiters for different APIs
 */
function createRateLimiter(apiType, customConfig = {}) {
  return new BulkSyncRateLimiter(apiType, customConfig);
}

module.exports = {
  BulkSyncRateLimiter,
  ProgressTracker,
  BatchQueue,
  createRateLimiter,
  API_LIMITS,
};
