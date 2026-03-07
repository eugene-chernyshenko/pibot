import { createLogger } from '../utils/logger.js';
import { EventBus } from './EventBus.js';
import { SessionManager } from './SessionManager.js';
import { MessageRouter, type MessageProcessor } from './MessageRouter.js';
import type { Channel } from '../channels/types.js';

const logger = createLogger('Gateway');

export class Gateway {
  readonly eventBus: EventBus;
  readonly sessionManager: SessionManager;
  readonly messageRouter: MessageRouter;

  private isRunning = false;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.eventBus = new EventBus();
    this.sessionManager = new SessionManager();
    this.messageRouter = new MessageRouter(this.sessionManager, this.eventBus);
  }

  registerChannel(channel: Channel): void {
    this.messageRouter.registerChannel(channel);
  }

  setMessageProcessor(processor: MessageProcessor): void {
    this.messageRouter.setProcessor(processor);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Gateway already running');
      return;
    }

    logger.info('Starting gateway...');

    // Start all registered channels
    const channels = this.messageRouter.getAllChannels();
    for (const channel of channels) {
      try {
        await channel.start();
        this.eventBus.emit('channel:started', { channelName: channel.name });
      } catch (error) {
        this.eventBus.emit('channel:error', {
          channelName: channel.name,
          error: error as Error,
        });
        logger.error({ error, channel: channel.name }, 'Failed to start channel');
      }
    }

    // Start session cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.sessionManager.cleanupInactiveSessions();
    }, 5 * 60 * 1000);

    this.isRunning = true;
    logger.info('Gateway started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Gateway not running');
      return;
    }

    logger.info('Stopping gateway...');

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Stop all channels
    const channels = this.messageRouter.getAllChannels();
    for (const channel of channels) {
      try {
        await channel.stop();
        this.eventBus.emit('channel:stopped', { channelName: channel.name });
      } catch (error) {
        logger.error({ error, channel: channel.name }, 'Failed to stop channel');
      }
    }

    // Clean up event bus
    this.eventBus.removeAllListeners();

    this.isRunning = false;
    logger.info('Gateway stopped');
  }

  getStatus(): {
    isRunning: boolean;
    channels: Array<{ name: string; status: string }>;
    activeSessions: number;
  } {
    const channels = this.messageRouter.getAllChannels().map((c) => ({
      name: c.name,
      status: 'registered',
    }));

    return {
      isRunning: this.isRunning,
      channels,
      activeSessions: this.sessionManager.getActiveSessions().length,
    };
  }
}
