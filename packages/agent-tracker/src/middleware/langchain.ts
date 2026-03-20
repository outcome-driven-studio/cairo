import { AgentTracker } from '../index';

/**
 * LangChain BaseCallbackHandler integration.
 * Automatically tracks LLM generations, tool calls, and errors from LangChain chains/agents.
 *
 * Usage:
 *   import { CairoCallbackHandler } from '@cairo/agent-tracker/middleware/langchain';
 *   const handler = new CairoCallbackHandler(tracker);
 *   const chain = new LLMChain({ llm, prompt, callbacks: [handler] });
 */
export class CairoCallbackHandler {
  private tracker: AgentTracker;
  private runTimestamps: Map<string, number> = new Map();

  constructor(tracker: AgentTracker) {
    this.tracker = tracker;
  }

  handleLLMStart(llm: { id?: string[] }, prompts: string[], runId: string): void {
    this.runTimestamps.set(runId, Date.now());
  }

  handleLLMEnd(output: {
    generations?: Array<Array<{ text?: string; generationInfo?: Record<string, unknown> }>>;
    llmOutput?: {
      tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
      modelName?: string;
    };
  }, runId: string): void {
    const startTime = this.runTimestamps.get(runId);
    const latencyMs = startTime ? Date.now() - startTime : undefined;
    this.runTimestamps.delete(runId);

    const tokenUsage = output.llmOutput?.tokenUsage;
    this.tracker.generation({
      model: output.llmOutput?.modelName || 'unknown',
      promptTokens: tokenUsage?.promptTokens,
      completionTokens: tokenUsage?.completionTokens,
      totalTokens: tokenUsage?.totalTokens,
      latencyMs,
    });
  }

  handleLLMError(error: Error, runId: string): void {
    this.runTimestamps.delete(runId);
    this.tracker.error({
      type: 'llm_error',
      message: error.message,
      recoverable: true,
    });
  }

  handleToolStart(tool: { id?: string[]; name?: string }, input: string, runId: string): void {
    this.runTimestamps.set(runId, Date.now());
  }

  handleToolEnd(output: string, runId: string): void {
    const startTime = this.runTimestamps.get(runId);
    const latencyMs = startTime ? Date.now() - startTime : undefined;
    this.runTimestamps.delete(runId);

    this.tracker.toolCall({
      tool: 'langchain_tool',
      latencyMs,
      success: true,
    });
  }

  handleToolError(error: Error, runId: string): void {
    const startTime = this.runTimestamps.get(runId);
    const latencyMs = startTime ? Date.now() - startTime : undefined;
    this.runTimestamps.delete(runId);

    this.tracker.toolCall({
      tool: 'langchain_tool',
      latencyMs,
      success: false,
      error: error.message,
    });
  }

  handleChainError(error: Error, runId: string): void {
    this.tracker.error({
      type: 'chain_error',
      message: error.message,
      recoverable: false,
    });
  }
}
