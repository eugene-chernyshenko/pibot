import { createLogger } from './utils/logger.js';
import { Gateway } from './gateway/Gateway.js';
import { TelegramChannel } from './channels/TelegramChannel.js';
import { WebChatChannel } from './channels/WebChatChannel.js';
import { AgentRunner } from './agent/AgentRunner.js';
import { SkillRegistry } from './skills/SkillRegistry.js';
import { MemoryManager } from './memory/MemoryManager.js';
import { DateTimeSkill } from './skills/builtin/DateTime.js';
import { MemorySkill } from './skills/builtin/Memory.js';
import type { IncomingMessage } from './channels/types.js';
import type { Session } from './gateway/SessionManager.js';

const logger = createLogger('main');

class PiBot {
  private gateway: Gateway;
  private agentRunner: AgentRunner;
  private skillRegistry: SkillRegistry;
  private memoryManager: MemoryManager;

  constructor() {
    this.gateway = new Gateway();
    this.agentRunner = new AgentRunner();
    this.skillRegistry = new SkillRegistry();
    this.memoryManager = new MemoryManager();
  }

  async start(): Promise<void> {
    logger.info('Starting PiBot...');

    // Initialize memory
    await this.memoryManager.initialize();
    await this.memoryManager.logSystem('PiBot starting up');

    // Register built-in skills
    this.skillRegistry.register(new DateTimeSkill());
    this.skillRegistry.register(new MemorySkill());

    // Configure agent
    this.agentRunner.setToolExecutor(this.skillRegistry);
    this.agentRunner.setTools(this.skillRegistry.getAllTools());

    // Register channels
    this.gateway.registerChannel(new TelegramChannel());
    this.gateway.registerChannel(new WebChatChannel());

    // Set up message processing
    this.gateway.setMessageProcessor(this.processMessage.bind(this));

    // Set up event logging
    this.setupEventLogging();

    // Start gateway
    await this.gateway.start();

    logger.info('PiBot started successfully');
    this.printStatus();
  }

  async stop(): Promise<void> {
    logger.info('Stopping PiBot...');
    await this.memoryManager.logSystem('PiBot shutting down');
    await this.gateway.stop();
    logger.info('PiBot stopped');
  }

  private async processMessage(
    message: IncomingMessage,
    session: Session
  ): Promise<string> {
    // Log incoming message
    await this.memoryManager.logMessage(
      message.userId,
      message.channelName,
      message.content
    );

    // Process with agent
    const response = await this.agentRunner.processMessage(session, message.content);

    // Log assistant response
    await this.memoryManager.logMessage(
      message.userId,
      message.channelName,
      response,
      true
    );

    return response;
  }

  private setupEventLogging(): void {
    const eventBus = this.gateway.eventBus;

    eventBus.on('channel:started', ({ channelName }) => {
      logger.info({ channel: channelName }, 'Channel started');
    });

    eventBus.on('channel:stopped', ({ channelName }) => {
      logger.info({ channel: channelName }, 'Channel stopped');
    });

    eventBus.on('channel:error', ({ channelName, error }) => {
      logger.error({ channel: channelName, error }, 'Channel error');
      this.memoryManager.logError(`Channel ${channelName} error: ${error.message}`);
    });

    eventBus.on('message:received', (message) => {
      logger.debug(
        { channel: message.channelName, userId: message.userId },
        'Message received'
      );
    });

    eventBus.on('agent:error', ({ sessionId, error }) => {
      logger.error({ sessionId, error }, 'Agent error');
      this.memoryManager.logError(`Agent error: ${error.message}`);
    });
  }

  private printStatus(): void {
    const status = this.gateway.getStatus();
    logger.info('='.repeat(50));
    logger.info('PiBot Status:');
    logger.info(`  Running: ${status.isRunning}`);
    logger.info(`  Channels: ${status.channels.map((c) => c.name).join(', ')}`);
    logger.info(`  Skills: ${this.skillRegistry.getAllSkills().map((s) => s.name).join(', ')}`);
    logger.info(`  Tools: ${this.skillRegistry.getAllTools().map((t) => t.name).join(', ')}`);
    logger.info('='.repeat(50));
  }
}

// Main execution
const bot = new PiBot();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down...');
  await bot.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});

// Start the bot
bot.start().catch((error) => {
  logger.fatal({ error }, 'Failed to start PiBot');
  process.exit(1);
});
