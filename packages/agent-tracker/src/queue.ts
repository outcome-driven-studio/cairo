import { QueueItem, TrackMessage } from './types';

export class EventQueue {
  private items: QueueItem[] = [];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  add(message: TrackMessage): void {
    this.items.push({
      message,
      attempts: 0,
      timestamp: Date.now(),
    });

    // Drop oldest if queue gets too large
    while (this.items.length > this.maxSize * 2) {
      this.items.shift();
    }
  }

  size(): number {
    return this.items.length;
  }

  flush(limit?: number): TrackMessage[] {
    const count = limit || this.items.length;
    const flushed = this.items.splice(0, count);
    return flushed.map(item => item.message);
  }

  clear(): void {
    this.items = [];
  }

  peek(): TrackMessage[] {
    return this.items.map(item => item.message);
  }
}
