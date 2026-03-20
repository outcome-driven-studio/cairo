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
];
