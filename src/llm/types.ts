export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolCallContent {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResultContent {
  type: 'tool_result';
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export type MessageContent = TextContent | ToolCallContent | ToolResultContent;

export interface Message {
  role: MessageRole;
  content: string | MessageContent[];
}

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  id: string;
  model: string;
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  type: 'content' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: Partial<ToolCall>;
  error?: string;
  finishReason?: string;
}

export interface LLMRequestOptions {
  messages: Message[];
  tools?: Tool[] | undefined;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  stream?: boolean | undefined;
}
