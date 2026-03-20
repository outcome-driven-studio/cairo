import { AgentTracker } from '../index';

/**
 * OpenAI client wrapper that automatically tracks generations.
 *
 * Usage:
 *   import { wrapOpenAI } from '@cairo/agent-tracker/middleware/openai';
 *   const openai = wrapOpenAI(new OpenAI(), tracker);
 *   // All chat.completions.create calls are now tracked
 */

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface ChatCompletionResponse {
  id?: string;
  model?: string;
  usage?: ChatCompletionUsage;
  choices?: Array<{ finish_reason?: string }>;
}

interface ChatCompletionsAPI {
  create: (...args: any[]) => Promise<ChatCompletionResponse>;
}

interface OpenAIClient {
  chat: {
    completions: ChatCompletionsAPI;
  };
}

export function wrapOpenAI<T extends OpenAIClient>(client: T, tracker: AgentTracker): T {
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = async function (...args: any[]): Promise<ChatCompletionResponse> {
    const start = Date.now();
    let response: ChatCompletionResponse;

    try {
      response = await originalCreate(...args);
    } catch (error) {
      const latencyMs = Date.now() - start;
      tracker.error({
        type: 'openai_error',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
      tracker.generation({
        model: (args[0] as any)?.model || 'unknown',
        latencyMs,
      });
      throw error;
    }

    const latencyMs = Date.now() - start;

    tracker.generation({
      model: response.model || (args[0] as any)?.model || 'unknown',
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      latencyMs,
      stopReason: response.choices?.[0]?.finish_reason,
    });

    return response;
  } as any;

  return client;
}
