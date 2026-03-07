import type { Channel, MessageHandler, IncomingMessage, OutgoingMessage, StreamingMessage } from './types.js';
import { createLogger } from '../utils/logger.js';
import type { Logger } from 'pino';

export abstract class BaseChannel implements Channel {
  abstract readonly name: string;
  protected readonly logger: Logger;
  protected handlers: MessageHandler[] = [];
  protected isRunning = false;

  constructor() {
    this.logger = createLogger(this.constructor.name);
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(userId: string, message: OutgoingMessage): Promise<void>;

  sendStreaming?(
    userId: string,
    messageId: string,
    stream: AsyncIterable<StreamingMessage>
  ): Promise<void>;

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  protected async emitMessage(message: IncomingMessage): Promise<void> {
    this.logger.debug({ userId: message.userId, content: message.content.slice(0, 50) }, 'Message received');

    for (const handler of this.handlers) {
      try {
        await handler(message);
      } catch (error) {
        this.logger.error({ error, messageId: message.id }, 'Handler error');
      }
    }
  }

  protected generateMessageId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
