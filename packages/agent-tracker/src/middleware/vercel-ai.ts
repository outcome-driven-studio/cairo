import { AgentTracker } from '../index';

/**
 * Vercel AI SDK middleware hook.
 * Wraps the `generateText` / `streamText` result to track generations.
 *
 * Usage:
 *   import { trackVercelAI } from '@cairo/agent-tracker/middleware/vercel-ai';
 *   const result = await generateText({ model, prompt });
 *   trackVercelAI(tracker, result);
 */

interface VercelAIResult {
  text?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  finishReason?: string;
  response?: {
    modelId?: string;
  };
  roundtrips?: Array<{
    usage?: { promptTokens?: number; completionTokens?: number };
  }>;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    toolName: string;
    result: unknown;
  }>;
}

interface TrackOptions {
  latencyMs?: number;
  costUsd?: number;
}

export function trackVercelAI(
  tracker: AgentTracker,
  result: VercelAIResult,
  options: TrackOptions = {},
): void {
  // Track the generation
  tracker.generation({
    model: result.response?.modelId || 'unknown',
    promptTokens: result.usage?.promptTokens,
    completionTokens: result.usage?.completionTokens,
    totalTokens: result.usage?.totalTokens,
    latencyMs: options.latencyMs,
    costUsd: options.costUsd,
    stopReason: result.finishReason,
  });

  // Track tool calls if present
  if (result.toolCalls) {
    for (const toolCall of result.toolCalls) {
      const toolResult = result.toolResults?.find(r => r.toolName === toolCall.toolName);
      tracker.toolCall({
        tool: toolCall.toolName,
        input: toolCall.args,
        output: toolResult ? { result: toolResult.result } : undefined,
        success: true,
      });
    }
  }
}

/**
 * Creates a wrapper for generateText that auto-tracks.
 *
 * Usage:
 *   const trackedGenerate = createTrackedGenerateText(tracker, generateText);
 *   const result = await trackedGenerate({ model, prompt });
 */
export function createTrackedGenerateText(
  tracker: AgentTracker,
  generateText: (...args: any[]) => Promise<VercelAIResult>,
): (...args: any[]) => Promise<VercelAIResult> {
  return async (...args: any[]): Promise<VercelAIResult> => {
    const start = Date.now();

    try {
      const result = await generateText(...args);
      trackVercelAI(tracker, result, { latencyMs: Date.now() - start });
      return result;
    } catch (error) {
      tracker.error({
        type: 'vercel_ai_error',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
      throw error;
    }
  };
}
