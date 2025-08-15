const logger = require('./logger');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class LemlistRateLimiter {
  constructor(requestsPerMinute = 60) {
    this.requestsPerMinute = requestsPerMinute;
    this.requestInterval = (60 * 1000) / requestsPerMinute;
    this.requestQueue = [];
    this.isProcessing = false;
  }

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
          const response = await requestFunction();
          resolve(response);
          break; 
        } catch (error) {
          if (error.response && error.response.status === 429) {
            attempts++;
            const retryAfterSeconds = parseInt(error.response.headers['retry-after'], 10) || 2;
            const waitTime = retryAfterSeconds * 1000;
            logger.warn(`Rate limited by Lemlist. Retrying after ${retryAfterSeconds} seconds... (Attempt ${attempts}/${maxAttempts})`);
            await delay(waitTime);
          } else {
            reject(error);
            break; 
          }
        }
      }

      if (attempts >= maxAttempts) {
        const errorMessage = 'Exceeded maximum retry attempts for rate-limited request.';
        logger.error(errorMessage);
        reject(new Error(errorMessage));
      }
      
      await delay(this.requestInterval);
    }
    this.isProcessing = false;
  }
}

module.exports = LemlistRateLimiter; 