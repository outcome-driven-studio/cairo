import { v4 as uuidv4 } from 'uuid';
import { HttpClient } from './client';
import { EventQueue } from './queue';
import { Session } from './session';
import {
  AgentTrackerConfig,
  AgentContext,
  GenerationEvent,
  ToolCallEvent,
  DecisionEvent,
  ErrorEvent,
  RetrievalEvent,
  HandoffEvent,
  FeedbackEvent,
  SessionStartOptions,
  SessionEndOptions,
  TrackMessage,
} from './types';

const LIBRARY_NAME = '@cairo/agent-tracker';
const LIBRARY_VERSION = '1.0.0';

const DEFAULT_CONFIG: Partial<AgentTrackerConfig> = {
  host: 'http://localhost:8080',
  flushAt: 50,
  flushInterval: 5000,
  maxRetries: 3,
  timeout: 10000,
  sampleRate: 1.0,
  redactInputs: false,
  maxPropertySize: 4096,
  debug: false,
  enable: true,
};

export class AgentTracker {
  private config: Required<AgentTrackerConfig>;
  private queue: EventQueue;
  private httpClient: HttpClient;
  private flushTimer?: ReturnType<typeof setInterval>;
  private instanceId: string;
  private currentSession: Session | null = null;

  private constructor(config: AgentTrackerConfig) {
    if (!config.writeKey) {
      throw new Error('AgentTracker: writeKey is required');
    }
    if (!config.agentId) {
      throw new Error('AgentTracker: agentId is required');
    }

    this.config = { ...DEFAULT_CONFIG, ...config } as Required<AgentTrackerConfig>;
    this.instanceId = uuidv4();
    this.queue = new EventQueue(this.config.flushAt * 2);
    this.httpClient = new HttpClient({
      host: this.config.host,
      writeKey: this.config.writeKey,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
      debug: this.config.debug,
    });

    this.startFlushTimer();

    if (this.config.debug) {
      console.log('[AgentTracker] Initialized', {
        agentId: this.config.agentId,
        instanceId: this.instanceId,
        host: this.config.host,
      });
    }
  }

  static init(config: AgentTrackerConfig): AgentTracker {
    return new AgentTracker(config);
  }

  // --- Session Management ---

  session(options: SessionStartOptions = {}): Session {
    const session = new Session(
      {
        task: options.task,
        agentType: options.agentType,
        model: options.model,
        config: options.config,
      },
      (sess, endOpts) => this.endSession(sess, endOpts),
    );

    this.currentSession = session;

    this.enqueue('agent.session.start', {
      session_id: session.sessionId,
      agent_type: session.agentType,
      model: session.model,
      task: session.task,
      config: session.config,
    });

    return session;
  }

  private endSession(session: Session, options: SessionEndOptions): void {
    this.enqueue('agent.session.end', {
      session_id: session.sessionId,
      duration_ms: session.durationMs,
      total_tokens: session.accumulator.totalTokens,
      total_cost_usd: session.accumulator.totalCostUsd,
      generation_count: session.accumulator.generationCount,
      tool_call_count: session.accumulator.toolCallCount,
      error_count: session.accumulator.errorCount,
      exit_reason: options.exitReason || 'normal',
      ...options.metadata,
    });

    if (this.currentSession === session) {
      this.currentSession = null;
    }
  }

  // --- Event Methods ---

  generation(event: GenerationEvent): void {
    const totalTokens = event.totalTokens ?? ((event.promptTokens || 0) + (event.completionTokens || 0));

    // Accumulate in session
    if (this.currentSession && !this.currentSession.isEnded) {
      this.currentSession.addGeneration(
        event.promptTokens || 0,
        event.completionTokens || 0,
        event.costUsd || 0,
      );
    }

    this.enqueue('agent.generation', {
      model: event.model,
      prompt_tokens: event.promptTokens,
      completion_tokens: event.completionTokens,
      total_tokens: totalTokens,
      latency_ms: event.latencyMs,
      cost_usd: event.costUsd,
      stop_reason: event.stopReason,
      temperature: event.temperature,
      max_tokens: event.maxTokens,
    });
  }

  toolCall(event: ToolCallEvent): void {
    if (this.currentSession && !this.currentSession.isEnded) {
      this.currentSession.addToolCall();
    }

    const input = this.config.redactInputs ? this.hashValue(event.input) : this.truncate(event.input);
    const output = this.config.redactInputs ? this.hashValue(event.output) : this.truncate(event.output);

    this.enqueue('agent.tool_call', {
      tool_name: event.tool,
      input,
      output,
      latency_ms: event.latencyMs,
      success: event.success,
      error: event.error,
    });
  }

  decision(event: DecisionEvent): void {
    this.enqueue('agent.decision', {
      decision_type: event.type,
      options: event.options,
      chosen: event.chosen,
      confidence: event.confidence,
      reasoning: event.reasoning,
    });
  }

  error(event: ErrorEvent): void {
    if (this.currentSession && !this.currentSession.isEnded) {
      this.currentSession.addError();
    }

    // Errors always bypass sampling
    this.enqueue('agent.error', {
      error_type: event.type,
      error_message: event.message,
      recoverable: event.recoverable,
      stack: event.stack,
    }, true);
  }

  retrieval(event: RetrievalEvent): void {
    this.enqueue('agent.retrieval', {
      source: event.source,
      query: this.config.redactInputs ? '[redacted]' : event.query,
      num_results: event.numResults,
      latency_ms: event.latencyMs,
    });
  }

  handoff(event: HandoffEvent): void {
    this.enqueue('agent.handoff', {
      to_agent_id: event.toAgentId,
      reason: event.reason,
      context_size: event.contextSize,
    });
  }

  feedback(event: FeedbackEvent): void {
    this.enqueue('agent.feedback', {
      score: event.score,
      source: event.source,
      criteria: event.criteria,
      comment: event.comment,
    });
  }

  // --- Flush & Shutdown ---

  async flush(): Promise<void> {
    const messages = this.queue.flush();
    if (messages.length === 0) return;

    try {
      await this.httpClient.sendBatch(messages);
    } catch (err) {
      if (this.config.debug) {
        console.error('[AgentTracker] Flush failed:', err);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // End active session
    if (this.currentSession && !this.currentSession.isEnded) {
      this.currentSession.end({ exitReason: 'shutdown' });
    }

    // Final flush
    await this.flush();

    if (this.config.debug) {
      console.log('[AgentTracker] Shut down');
    }
  }

  // --- Internal ---

  private enqueue(eventName: string, properties: Record<string, unknown>, bypassSampling: boolean = false): void {
    if (!this.config.enable) return;

    // Sampling (session events and errors bypass)
    if (!bypassSampling && this.config.sampleRate < 1.0) {
      const isSessionEvent = eventName.startsWith('agent.session.');
      if (!isSessionEvent && Math.random() > this.config.sampleRate) {
        return;
      }
    }

    // Remove undefined values from properties
    const cleanProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined) {
        cleanProps[key] = value;
      }
    }

    const message: TrackMessage = {
      type: 'track',
      event: eventName,
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      userId: this.config.agentId,
      properties: cleanProps,
      context: this.buildContext(),
    };

    this.queue.add(message);

    if (this.queue.size() >= this.config.flushAt) {
      this.flush();
    }
  }

  private buildContext(): AgentContext {
    const ctx: AgentContext = {
      agent_id: this.config.agentId,
      instance_id: this.instanceId,
      library: {
        name: LIBRARY_NAME,
        version: LIBRARY_VERSION,
      },
    };

    if (this.currentSession && !this.currentSession.isEnded) {
      ctx.session_id = this.currentSession.sessionId;
    }

    return ctx;
  }

  private truncate(value: unknown): unknown {
    if (value === undefined || value === null) return value;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (str.length <= this.config.maxPropertySize) {
      return value;
    }
    return str.slice(0, this.config.maxPropertySize) + '...[truncated]';
  }

  private hashValue(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    // Simple deterministic hash for redaction
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `[redacted:${Math.abs(hash).toString(16)}]`;
  }

  private startFlushTimer(): void {
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushInterval);

      // Don't prevent process exit
      if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        (this.flushTimer as NodeJS.Timeout).unref();
      }
    }
  }
}

// Re-export all types
export * from './types';
export { EventQueue } from './queue';
export { HttpClient } from './client';
export { Session } from './session';
