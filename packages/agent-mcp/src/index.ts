#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { TOOL_DEFINITIONS } from './tools';
import {
  McpServerConfig,
  GenerationInput,
  ToolCallInput,
  DecisionInput,
  ErrorInput,
  SessionStartInput,
  SessionEndInput,
} from './types';

// Minimal inline event poster (self-contained, no dependency on agent-tracker package)
class EventPoster {
  private host: string;
  private writeKey: string;
  private agentId: string;
  private instanceId: string;
  private queue: any[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;
  private sessionId: string | null = null;
  private sessionStart: number = 0;
  private totalTokens: number = 0;
  private totalCostUsd: number = 0;

  constructor(config: { host: string; writeKey: string; agentId: string }) {
    this.host = config.host;
    this.writeKey = config.writeKey;
    this.agentId = config.agentId;
    this.instanceId = uuidv4();

    this.flushTimer = setInterval(() => this.flush(), 5000);
    if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      (this.flushTimer as NodeJS.Timeout).unref();
    }
  }

  track(event: string, properties: Record<string, unknown>): void {
    const cleanProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined) cleanProps[key] = value;
    }

    this.queue.push({
      type: 'track',
      event,
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      userId: this.agentId,
      properties: cleanProps,
      context: {
        agent_id: this.agentId,
        instance_id: this.instanceId,
        session_id: this.sessionId,
        library: { name: '@cairo/agent-mcp', version: '1.0.0' },
      },
    });

    if (this.queue.length >= 50) this.flush();
  }

  startSession(input: SessionStartInput): string {
    this.sessionId = uuidv4();
    this.sessionStart = Date.now();
    this.totalTokens = 0;
    this.totalCostUsd = 0;

    this.track('agent.session.start', {
      session_id: this.sessionId,
      task: input.task,
      agent_type: input.agentType,
      model: input.model,
    });

    return this.sessionId;
  }

  endSession(input: SessionEndInput): void {
    if (!this.sessionId) return;

    this.track('agent.session.end', {
      session_id: this.sessionId,
      duration_ms: Date.now() - this.sessionStart,
      total_tokens: this.totalTokens,
      total_cost_usd: this.totalCostUsd,
      exit_reason: input.exitReason || 'normal',
    });

    this.sessionId = null;
  }

  addTokens(tokens: number, cost: number): void {
    this.totalTokens += tokens;
    this.totalCostUsd += cost;
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);

    try {
      await fetch(`${this.host}/v2/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Write-Key': this.writeKey,
        },
        body: JSON.stringify({ batch, sentAt: new Date().toISOString() }),
      });
    } catch {
      // Silent failure - MCP server shouldn't crash on tracking errors
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.sessionId) this.endSession({ exitReason: 'shutdown' });
    await this.flush();
  }
}

// --- MCP Server ---

const config: McpServerConfig = {
  writeKey: process.env.CAIRO_WRITE_KEY || 'default',
  host: process.env.CAIRO_HOST || 'http://localhost:8080',
  agentId: process.env.CAIRO_AGENT_ID || 'mcp-agent',
  debug: process.env.CAIRO_DEBUG === 'true',
};

const poster = new EventPoster({
  host: config.host!,
  writeKey: config.writeKey!,
  agentId: config.agentId!,
});

const server = new Server(
  { name: 'cairo-agent-tracker', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'track_generation': {
      const input = args as unknown as GenerationInput;
      const totalTokens = (input.promptTokens || 0) + (input.completionTokens || 0);
      poster.addTokens(totalTokens, input.costUsd || 0);
      poster.track('agent.generation', {
        model: input.model,
        prompt_tokens: input.promptTokens,
        completion_tokens: input.completionTokens,
        total_tokens: totalTokens,
        latency_ms: input.latencyMs,
        cost_usd: input.costUsd,
        stop_reason: input.stopReason,
      });
      return { content: [{ type: 'text', text: `Tracked generation: ${input.model} (${totalTokens} tokens)` }] };
    }

    case 'track_tool_call': {
      const input = args as unknown as ToolCallInput;
      poster.track('agent.tool_call', {
        tool_name: input.tool,
        input: input.input,
        output: input.output,
        latency_ms: input.latencyMs,
        success: input.success,
        error: input.error,
      });
      return { content: [{ type: 'text', text: `Tracked tool call: ${input.tool} (${input.success ? 'success' : 'failed'})` }] };
    }

    case 'track_decision': {
      const input = args as unknown as DecisionInput;
      poster.track('agent.decision', {
        decision_type: input.type,
        options: input.options,
        chosen: input.chosen,
        confidence: input.confidence,
        reasoning: input.reasoning,
      });
      return { content: [{ type: 'text', text: `Tracked decision: ${input.type} -> ${input.chosen}` }] };
    }

    case 'track_error': {
      const input = args as unknown as ErrorInput;
      poster.track('agent.error', {
        error_type: input.type,
        error_message: input.message,
        recoverable: input.recoverable,
      });
      return { content: [{ type: 'text', text: `Tracked error: ${input.type}` }] };
    }

    case 'start_session': {
      const input = args as unknown as SessionStartInput;
      const sessionId = poster.startSession(input);
      return { content: [{ type: 'text', text: `Session started: ${sessionId}` }] };
    }

    case 'end_session': {
      const input = args as unknown as SessionEndInput;
      poster.endSession(input);
      return { content: [{ type: 'text', text: 'Session ended' }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await poster.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await poster.shutdown();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (config.debug) {
    console.error('[cairo-agent-mcp] Server started on stdio');
  }
}

main().catch((error) => {
  console.error('[cairo-agent-mcp] Fatal error:', error);
  process.exit(1);
});
