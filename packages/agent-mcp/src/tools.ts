import { GenerationInput, ToolCallInput, DecisionInput, ErrorInput, SessionStartInput, SessionEndInput } from './types';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'track_generation',
    description: 'Report an LLM generation event including model, token counts, latency, and cost',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model identifier (e.g., claude-sonnet-4-20250514)' },
        promptTokens: { type: 'number', description: 'Number of input tokens' },
        completionTokens: { type: 'number', description: 'Number of output tokens' },
        latencyMs: { type: 'number', description: 'Response latency in milliseconds' },
        costUsd: { type: 'number', description: 'Cost in USD' },
        stopReason: { type: 'string', description: 'Why generation stopped (e.g., end_turn, max_tokens)' },
      },
      required: ['model'],
    },
  },
  {
    name: 'track_tool_call',
    description: 'Report a tool invocation with its name, success status, latency, and any errors',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Tool name that was called' },
        input: { type: 'object', description: 'Tool input parameters' },
        output: { type: 'object', description: 'Tool output' },
        latencyMs: { type: 'number', description: 'Execution time in milliseconds' },
        success: { type: 'boolean', description: 'Whether the tool call succeeded' },
        error: { type: 'string', description: 'Error message if failed' },
      },
      required: ['tool', 'success'],
    },
  },
  {
    name: 'track_decision',
    description: 'Report a routing or branching decision the agent made',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Decision type (e.g., routing, classification)' },
        options: { type: 'array', items: { type: 'string' }, description: 'Available options' },
        chosen: { type: 'string', description: 'The option that was chosen' },
        confidence: { type: 'number', description: 'Confidence score (0-1)' },
        reasoning: { type: 'string', description: 'Why this option was chosen' },
      },
      required: ['type', 'options', 'chosen'],
    },
  },
  {
    name: 'track_error',
    description: 'Report an error encountered during agent execution',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Error type/category' },
        message: { type: 'string', description: 'Error message' },
        recoverable: { type: 'boolean', description: 'Whether the agent can recover from this error' },
      },
      required: ['type', 'message'],
    },
  },
  {
    name: 'start_session',
    description: 'Start a new tracking session for an agent task',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Description of the task being performed' },
        agentType: { type: 'string', description: 'Type of agent (e.g., customer-support, code-review)' },
        model: { type: 'string', description: 'Primary model being used' },
      },
    },
  },
  {
    name: 'end_session',
    description: 'End the current tracking session',
    inputSchema: {
      type: 'object',
      properties: {
        exitReason: { type: 'string', description: 'Why the session ended (e.g., task_complete, error, timeout)' },
      },
    },
  },
  {
    name: 'capture_error',
    description: 'Capture an error event (Sentry-like). Supports stack traces, severity levels, and context.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Error message' },
        stackTrace: { type: 'string', description: 'Stack trace' },
        type: { type: 'string', description: 'Error type (error, exception, rejection)' },
        level: { type: 'string', description: 'Severity: fatal, error, warning, info' },
        sourceFile: { type: 'string', description: 'Source file path' },
        sourceLine: { type: 'number', description: 'Line number' },
        context: { type: 'object', description: 'Additional context' },
        tags: { type: 'object', description: 'Tags for filtering' },
        release: { type: 'string', description: 'Release/version' },
        environment: { type: 'string', description: 'Environment (production, staging)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'query_events',
    description: 'Query CDP events. Returns recent events matching filters.',
    inputSchema: {
      type: 'object',
      properties: {
        eventType: { type: 'string', description: 'Filter by event type' },
        userEmail: { type: 'string', description: 'Filter by user email' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        since: { type: 'string', description: 'ISO timestamp: only events after this time' },
      },
    },
  },
  {
    name: 'lookup_user',
    description: 'Look up a user by email. Returns profile and recent activity.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email to look up' },
      },
      required: ['email'],
    },
  },
  {
    name: 'list_error_groups',
    description: 'List error groups (like Sentry issues). Filter by status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter: open, resolved, ignored' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'system_health',
    description: 'Get Cairo system health: database, uptime, event counts, error counts.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
