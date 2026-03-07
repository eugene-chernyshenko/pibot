import { createLogger } from '../utils/logger.js';
import type { IncomingMessage, OutgoingMessage, Channel } from '../channels/types.js';
import type { SessionManager, Session } from './SessionManager.js';
import type { EventBus } from './EventBus.js';

const logger = createLogger('MessageRouter');

export type MessageProcessor = (
  message: IncomingMessage,
  session: Session
) => Promise<string | AsyncIterable<string>>;

export class MessageRouter {
  private channels: Map<string, Channel> = new Map();
  private processor: MessageProcessor | null = null;

  constructor(
    private sessionManager: SessionManager,
    private eventBus: EventBus
  ) {}

  registerChannel(channel: Channel): void {
    this.channels.set(channel.name, channel);

    channel.onMessage(async (message) => {
      await this.handleMessage(message);
    });

    logger.info({ channel: channel.name }, 'Channel registered');
  }

  setProcessor(processor: MessageProcessor): void {
    this.processor = processor;
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    this.eventBus.emit('message:received', message);

    if (!this.processor) {
      logger.warn('No message processor set');
      return;
    }

    const session = this.sessionManager.getOrCreateSession(
      message.userId,
      message.channelName
    );

    try {
      const response = await this.processor(message, session);
      const channel = this.channels.get(message.channelName);

      if (!channel) {
        logger.error({ channelName: message.channelName }, 'Channel not found');
        return;
      }

      if (typeof response === 'string') {
        // Simple response
        const outgoing: OutgoingMessage = {
          content: response,
          replyToMessageId: message.id,
        };
        await channel.send(message.userId, outgoing);
        this.eventBus.emit('message:sent', {
          userId: message.userId,
          channelName: message.channelName,
          message: outgoing,
        });
      } else {
        // Streaming response
        if (channel.sendStreaming) {
          const streamId = `stream-${Date.now()}`;
          const streamingMessages = this.wrapAsStreamingMessages(response);
          await channel.sendStreaming(message.userId, streamId, streamingMessages);
        } else {
          // Fallback: collect all chunks and send as single message
          let fullContent = '';
          for await (const chunk of response) {
            fullContent += chunk;
          }
          const outgoing: OutgoingMessage = {
            content: fullContent,
            replyToMessageId: message.id,
          };
          await channel.send(message.userId, outgoing);
          this.eventBus.emit('message:sent', {
            userId: message.userId,
            channelName: message.channelName,
            message: outgoing,
          });
        }
      }
    } catch (error) {
      logger.error({ error, messageId: message.id }, 'Error processing message');

      const channel = this.channels.get(message.channelName);
      if (channel) {
        await channel.send(message.userId, {
          content: 'Sorry, an error occurred while processing your message.',
        });
      }
    }
  }

  private async *wrapAsStreamingMessages(
    stream: AsyncIterable<string>
  ): AsyncIterable<{ type: 'start' | 'chunk' | 'end'; content?: string }> {
    yield { type: 'start' };

    for await (const chunk of stream) {
      yield { type: 'chunk', content: chunk };
    }

    yield { type: 'end' };
  }

  getChannel(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  getAllChannels(): Channel[] {
    return Array.from(this.channels.values());
  }
}
