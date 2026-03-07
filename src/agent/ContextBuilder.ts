import type { Message } from '../llm/types.js';
import type { Session } from '../gateway/SessionManager.js';

const DEFAULT_SYSTEM_PROMPT = `You are PiBot, a helpful personal AI assistant. You are friendly, concise, and helpful.

Guidelines:
- Be direct and concise in your responses
- If you don't know something, say so
- Help the user with their questions and tasks
- Be friendly but professional

Current date: ${new Date().toLocaleDateString()}`;

export class ContextBuilder {
  private customSystemPrompt: string | undefined;

  constructor(customSystemPrompt?: string) {
    this.customSystemPrompt = customSystemPrompt;
  }

  buildMessages(session: Session, userMessage: string): Message[] {
    const messages: Message[] = [];

    // Add system prompt
    const systemPrompt = this.buildSystemPrompt();
    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Add conversation history (limit to last N messages to stay within context)
    const historyLimit = 20;
    const history = session.messages.slice(-historyLimit);
    messages.push(...history);

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

  buildSystemPrompt(): string {
    if (this.customSystemPrompt) {
      return this.customSystemPrompt;
    }
    return DEFAULT_SYSTEM_PROMPT;
  }

  setCustomSystemPrompt(prompt: string): void {
    this.customSystemPrompt = prompt;
  }
}
