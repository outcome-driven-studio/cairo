export interface AgentTrackerConfig {
  writeKey: string;
  host?: string;
  agentId: string;
  flushAt?: number;
  flushInterval?: number;
  maxRetries?: number;
  timeout?: number;
  sampleRate?: number;
  redactInputs?: boolean;
  maxPropertySize?: number;
  debug?: boolean;
  enable?: boolean;
}

export interface AgentContext {
  agent_id: string;
  instance_id: string;
  session_id?: string;
  namespace?: string;
  library: {
    name: string;
    version: string;
  };
  [key: string]: unknown;
}

// Base event fields shared by all events
export interface BaseEvent {
  messageId?: string;
  timestamp?: string;
  context?: Partial<AgentContext>;
  userId?: string;
  anonymousId?: string;
  namespace?: string;
}

// Event-specific payloads

export interface GenerationEvent extends BaseEvent {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  costUsd?: number;
  stopReason?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface ToolCallEvent extends BaseEvent {
  tool: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  latencyMs?: number;
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface DecisionEvent extends BaseEvent {
  type: string;
  options: string[];
  chosen: string;
  confidence?: number;
  reasoning?: string;
  [key: string]: unknown;
}

export interface ErrorEvent extends BaseEvent {
  type: string;
  message: string;
  recoverable?: boolean;
  stack?: string;
  [key: string]: unknown;
}

export interface RetrievalEvent extends BaseEvent {
  source: string;
  query: string;
  numResults?: number;
  latencyMs?: number;
  [key: string]: unknown;
}

export interface HandoffEvent extends BaseEvent {
  toAgentId: string;
  reason: string;
  contextSize?: number;
  [key: string]: unknown;
}

export interface FeedbackEvent extends BaseEvent {
  score: number;
  source: string;
  criteria?: string;
  comment?: string;
  [key: string]: unknown;
}

export interface SessionStartOptions extends BaseEvent {
  task?: string;
  agentType?: string;
  model?: string;
  config?: Record<string, unknown>;
}

export interface SessionEndOptions {
  exitReason?: string;
  metadata?: Record<string, unknown>;
}

// Internal message format sent to Cairo
export interface TrackMessage {
  type: 'track';
  event: string;
  messageId: string;
  timestamp: string;
  userId?: string;
  anonymousId?: string;
  properties: Record<string, unknown>;
  context: AgentContext;
}

export interface QueueItem {
  message: TrackMessage;
  attempts: number;
  timestamp: number;
}
