import { TrackMessage } from './types';

export interface ClientConfig {
  host: string;
  writeKey: string;
  maxRetries: number;
  timeout: number;
  debug: boolean;
}

export class HttpClient {
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  async sendBatch(messages: TrackMessage[]): Promise<void> {
    const url = `${this.config.host}/v2/batch`;
    const body = JSON.stringify({
      batch: messages,
      sentAt: new Date().toISOString(),
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Write-Key': this.config.writeKey,
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          if (this.config.debug) {
            console.log(`[AgentTracker] Batch of ${messages.length} events sent`);
          }
          return;
        }

        // Don't retry 4xx errors (except 429)
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.name === 'AbortError') {
          lastError = new Error('Request timeout');
        }
      }

      // Exponential backoff before retry
      if (attempt < this.config.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (this.config.debug && lastError) {
      console.error(`[AgentTracker] Failed to send batch after ${this.config.maxRetries + 1} attempts:`, lastError.message);
    }

    throw lastError || new Error('Failed to send batch');
  }
}
