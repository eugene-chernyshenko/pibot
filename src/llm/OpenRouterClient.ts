import { config } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';
import { parseSSEStream } from './streaming.js';
import type {
  Message,
  Tool,
  LLMResponse,
  LLMRequestOptions,
  StreamChunk,
  ToolCall,
} from './types.js';

const logger = createLogger('OpenRouterClient');

interface OpenRouterMessage {
  role: string;
  content: string | null | Array<{ type: string; text?: string; tool_call_id?: string }>;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Tool['parameters'];
  };
}

export class OpenRouterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;

  constructor() {
    this.apiKey = config.openrouter.apiKey;
    this.baseUrl = config.openrouter.baseUrl;
    this.defaultModel = config.openrouter.model;
    this.defaultMaxTokens = config.openrouter.maxTokens;
  }

  private convertMessages(messages: Message[]): OpenRouterMessage[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }

      // Handle complex content
      const textParts: string[] = [];
      const toolCalls: ToolCall[] = [];

      for (const part of msg.content) {
        if (part.type === 'text') {
          textParts.push(part.text);
        } else if (part.type === 'tool_call') {
          toolCalls.push({
            id: part.id,
            type: 'function',
            function: { name: part.name, arguments: part.arguments },
          });
        } else if (part.type === 'tool_result') {
          return {
            role: 'tool',
            content: part.content,
            tool_call_id: part.toolCallId,
          };
        }
      }

      const result: OpenRouterMessage = {
        role: msg.role,
        content: textParts.length > 0 ? textParts.join('\n') : null,
      };

      if (toolCalls.length > 0) {
        result.tool_calls = toolCalls;
        // For assistant messages with only tool calls, content can be null
        if (textParts.length === 0) {
          result.content = null;
        }
      }

      return result;
    });
  }

  private convertTools(tools: Tool[]): OpenRouterTool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    const { messages, tools, maxTokens, temperature } = options;

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: this.convertMessages(messages),
      max_tokens: maxTokens ?? this.defaultMaxTokens,
      stream: false,
    };

    if (temperature !== undefined) {
      body['temperature'] = temperature;
    }

    if (tools && tools.length > 0) {
      body['tools'] = this.convertTools(tools);
    }

    logger.debug({ model: this.defaultModel, messageCount: messages.length }, 'Sending chat request');

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/pibot',
        'X-Title': 'PiBot',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'LLM request failed');
      throw new LLMError(`OpenRouter API error: ${errorText}`, response.status);
    }

    const data = await response.json() as {
      id: string;
      model: string;
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: ToolCall[];
        };
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = data.choices[0];
    if (!choice) {
      throw new LLMError('No response from LLM');
    }

    return {
      id: data.id,
      model: data.model,
      content: choice.message.content,
      toolCalls: choice.message.tool_calls ?? [],
      finishReason: choice.finish_reason as LLMResponse['finishReason'],
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }

  async *chatStream(options: LLMRequestOptions): AsyncGenerator<StreamChunk> {
    const { messages, tools, maxTokens, temperature } = options;

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: this.convertMessages(messages),
      max_tokens: maxTokens ?? this.defaultMaxTokens,
      stream: true,
    };

    if (temperature !== undefined) {
      body['temperature'] = temperature;
    }

    if (tools && tools.length > 0) {
      body['tools'] = this.convertTools(tools);
    }

    logger.debug({ model: this.defaultModel, messageCount: messages.length }, 'Starting streaming chat request');

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/pibot',
        'X-Title': 'PiBot',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Streaming LLM request failed');
      throw new LLMError(`OpenRouter API error: ${errorText}`, response.status);
    }

    yield* parseSSEStream(response);
  }
}
