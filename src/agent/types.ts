import type { Message, Tool } from '../llm/types.js';
import type { Session } from '../gateway/SessionManager.js';

export interface AgentContext {
  session: Session;
  userMessage: string;
  systemPrompt: string;
  tools: Tool[];
  maxTurns: number;
}

export interface AgentEvent {
  type: 'thinking' | 'content' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: unknown;
  };
  toolResult?: {
    toolCallId: string;
    result: string;
    isError: boolean;
  };
  error?: string;
  turns?: number;
}

export interface ToolExecutor {
  execute(name: string, args: unknown): Promise<{
    result: string;
    isError: boolean;
  }>;
}

export interface Agent {
  id: string;
  name: string;
  systemPrompt: string;
  run(context: AgentContext): AsyncGenerator<AgentEvent>;
}
