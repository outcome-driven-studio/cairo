import { v4 as uuidv4 } from 'uuid';
import { SessionEndOptions } from './types';

export interface SessionAccumulator {
  totalTokens: number;
  totalCostUsd: number;
  generationCount: number;
  toolCallCount: number;
  errorCount: number;
  startTime: number;
}

export class Session {
  readonly sessionId: string;
  readonly task?: string;
  readonly agentType?: string;
  readonly model?: string;
  readonly config?: Record<string, unknown>;
  readonly accumulator: SessionAccumulator;
  private ended: boolean = false;
  private onEnd: (session: Session, options: SessionEndOptions) => void;

  constructor(
    options: {
      task?: string;
      agentType?: string;
      model?: string;
      config?: Record<string, unknown>;
    },
    onEnd: (session: Session, options: SessionEndOptions) => void,
  ) {
    this.sessionId = uuidv4();
    this.task = options.task;
    this.agentType = options.agentType;
    this.model = options.model;
    this.config = options.config;
    this.onEnd = onEnd;
    this.accumulator = {
      totalTokens: 0,
      totalCostUsd: 0,
      generationCount: 0,
      toolCallCount: 0,
      errorCount: 0,
      startTime: Date.now(),
    };
  }

  addGeneration(promptTokens: number = 0, completionTokens: number = 0, costUsd: number = 0): void {
    this.accumulator.totalTokens += promptTokens + completionTokens;
    this.accumulator.totalCostUsd += costUsd;
    this.accumulator.generationCount++;
  }

  addToolCall(): void {
    this.accumulator.toolCallCount++;
  }

  addError(): void {
    this.accumulator.errorCount++;
  }

  get durationMs(): number {
    return Date.now() - this.accumulator.startTime;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  end(options: SessionEndOptions = {}): void {
    if (this.ended) return;
    this.ended = true;
    this.onEnd(this, options);
  }
}
