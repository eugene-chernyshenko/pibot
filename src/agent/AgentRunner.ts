import { createLogger } from '../utils/logger.js';
import { OpenRouterClient } from '../llm/OpenRouterClient.js';
import { ContextBuilder } from './ContextBuilder.js';
import { AgentQueue } from './AgentQueue.js';
import { config } from '../config/index.js';
import type { AgentContext, AgentEvent, ToolExecutor } from './types.js';
import type { Message, Tool, ToolCall } from '../llm/types.js';
import type { Session } from '../gateway/SessionManager.js';

const logger = createLogger('AgentRunner');

export class AgentRunner {
  private llmClient: OpenRouterClient;
  private contextBuilder: ContextBuilder;
  private queue: AgentQueue;
  private toolExecutor: ToolExecutor | null = null;
  private tools: Tool[] = [];

  constructor() {
    this.llmClient = new OpenRouterClient();
    this.contextBuilder = new ContextBuilder(config.agent.systemPrompt);
    this.queue = new AgentQueue();
  }

  setToolExecutor(executor: ToolExecutor): void {
    this.toolExecutor = executor;
  }

  setTools(tools: Tool[]): void {
    this.tools = tools;
    logger.debug({ count: tools.length }, 'Tools updated');
  }

  getToolCount(): number {
    return this.tools.length;
  }

  async processMessage(session: Session, userMessage: string): Promise<string> {
    return this.queue.enqueue(session.id, async () => {
      let response = '';

      for await (const event of this.run(session, userMessage)) {
        if (event.type === 'content' && event.content) {
          response += event.content;
        } else if (event.type === 'error') {
          throw new Error(event.error);
        }
      }

      return response;
    });
  }

  async *processMessageStreaming(
    session: Session,
    userMessage: string
  ): AsyncGenerator<string> {
    // For streaming, we process directly without queue to allow incremental output
    for await (const event of this.run(session, userMessage)) {
      if (event.type === 'content' && event.content) {
        yield event.content;
      }
    }
  }

  private async *run(session: Session, userMessage: string): AsyncGenerator<AgentEvent> {
    const maxTurns = config.agent.maxTurns;
    let turns = 0;

    // Build initial messages
    const messages = this.contextBuilder.buildMessages(session, userMessage);

    // Add user message to session history
    session.messages.push({ role: 'user', content: userMessage });

    yield { type: 'thinking' };

    while (turns < maxTurns) {
      turns++;
      logger.debug({ turn: turns, maxTurns }, 'Agent turn');

      try {
        const response = await this.llmClient.chat({
          messages,
          tools: this.tools.length > 0 ? this.tools : undefined,
        });

        // Handle tool calls
        if (response.toolCalls.length > 0 && this.toolExecutor) {
          // Build assistant message with tool calls
          const assistantContent: Array<{ type: string; text?: string; id?: string; name?: string; arguments?: string }> = [];

          // Add text content if present
          if (response.content) {
            assistantContent.push({ type: 'text', text: response.content });
            yield { type: 'content', content: response.content };
          }

          // Add tool calls to assistant message
          for (const toolCall of response.toolCalls) {
            assistantContent.push({
              type: 'tool_call',
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            });
          }

          // Add assistant message with tool calls
          messages.push({
            role: 'assistant',
            content: assistantContent as Message['content'],
          });

          // Execute each tool and add results
          for (const toolCall of response.toolCalls) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments),
              },
            };

            // Execute tool
            const { result, isError } = await this.executeToolCall(toolCall);

            yield {
              type: 'tool_result',
              toolResult: {
                toolCallId: toolCall.id,
                result,
                isError,
              },
            };

            // Add tool result message
            messages.push({
              role: 'tool',
              content: [
                {
                  type: 'tool_result',
                  toolCallId: toolCall.id,
                  content: result,
                  isError,
                },
              ],
            });
          }

          // Continue loop to get LLM response after tool execution
          continue;
        }

        // Handle text-only response (no tool calls)
        if (response.content) {
          yield { type: 'content', content: response.content };

          // Add assistant message to history
          messages.push({ role: 'assistant', content: response.content });
          session.messages.push({ role: 'assistant', content: response.content });
        }

        // No more tool calls, we're done
        yield { type: 'done', turns };
        return;
      } catch (error) {
        logger.error({ error, turn: turns }, 'Agent turn error');
        yield { type: 'error', error: (error as Error).message };
        return;
      }
    }

    logger.warn({ turns: maxTurns }, 'Max turns reached');
    yield { type: 'done', turns };
  }

  private async executeToolCall(toolCall: ToolCall): Promise<{
    result: string;
    isError: boolean;
  }> {
    if (!this.toolExecutor) {
      return { result: 'Tool executor not available', isError: true };
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      return await this.toolExecutor.execute(toolCall.function.name, args);
    } catch (error) {
      logger.error({ error, tool: toolCall.function.name }, 'Tool execution error');
      return {
        result: `Error: ${(error as Error).message}`,
        isError: true,
      };
    }
  }
}
