import { Message } from './types';

export class EventQueue {
  private items: Message[] = [];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  add(message: Message): void {
    this.items.push(message);

    while (this.items.length > this.maxSize * 2) {
      this.items.shift();
    }
  }

  size(): number {
    return this.items.length;
  }

  flush(limit?: number): Message[] {
    const count = limit || this.items.length;
    return this.items.splice(0, count);
  }

  clear(): void {
    this.items = [];
  }
}
