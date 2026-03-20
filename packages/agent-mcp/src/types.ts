export interface McpServerConfig {
  writeKey?: string;
  host?: string;
  agentId?: string;
  debug?: boolean;
}

export interface ToolInput {
  [key: string]: unknown;
}

export interface GenerationInput {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  costUsd?: number;
  stopReason?: string;
}

export interface ToolCallInput {
  tool: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  latencyMs?: number;
  success: boolean;
  error?: string;
}

export interface DecisionInput {
  type: string;
  options: string[];
  chosen: string;
  confidence?: number;
  reasoning?: string;
}

export interface ErrorInput {
  type: string;
  message: string;
  recoverable?: boolean;
}

export interface SessionStartInput {
  task?: string;
  agentType?: string;
  model?: string;
}

export interface SessionEndInput {
  exitReason?: string;
}
