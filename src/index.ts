import { createLogger } from './utils/logger.js';
import { Gateway } from './gateway/Gateway.js';
import { TelegramChannel } from './channels/TelegramChannel.js';
import { WebChatChannel } from './channels/WebChatChannel.js';
import { AgentRunner } from './agent/AgentRunner.js';
import { ToolRegistry } from './tools/ToolRegistry.js';
import { ToolLoader } from './tools/ToolLoader.js';
import { SkillLoader } from './skills/SkillLoader.js';
import { MemoryManager } from './memory/MemoryManager.js';
import { DateTimeTool } from './tools/builtin/DateTime.js';
import { MemoryTool } from './tools/builtin/Memory.js';
import { FileSystemTool } from './tools/builtin/FileSystem.js';
import { ToolGeneratorTool } from './tools/builtin/ToolGenerator.js';
import { ToolManagerTool } from './tools/builtin/ToolManager.js';
import type { IncomingMessage } from './channels/types.js';
import type { Session } from './gateway/SessionManager.js';

const logger = createLogger('main');

class PiBot {
  private gateway: Gateway;
  private agentRunner: AgentRunner;
  private toolRegistry: ToolRegistry;
  private toolLoader: ToolLoader;
  private skillLoader: SkillLoader;
  private memoryManager: MemoryManager;

  constructor() {
    this.gateway = new Gateway();
    this.agentRunner = new AgentRunner();
    this.toolRegistry = new ToolRegistry();
    this.toolLoader = new ToolLoader(this.toolRegistry);
    this.skillLoader = new SkillLoader();
    this.memoryManager = new MemoryManager();
  }

  async start(): Promise<void> {
    logger.info('Starting PiBot...');

    // Initialize memory
    await this.memoryManager.initialize();
    await this.memoryManager.logSystem('PiBot starting up');

    // Register built-in tools
    this.toolRegistry.register(new DateTimeTool());
    this.toolRegistry.register(new MemoryTool());
    this.toolRegistry.register(new FileSystemTool());
    this.toolRegistry.register(new ToolGeneratorTool());
    this.toolRegistry.register(new ToolManagerTool(this.toolRegistry, this.toolLoader));

    // Load custom tools from tools/ directory
    const loadedCount = await this.toolLoader.loadAll();
    if (loadedCount > 0) {
      logger.info({ count: loadedCount }, 'Loaded custom tools');
    }

    // Load skills from prompts/ directory
    const skillsLoaded = await this.skillLoader.loadAll();
    if (skillsLoaded > 0) {
      logger.info({ count: skillsLoaded }, 'Loaded skills');
    }

    // Start watching for new tools (hot-reload)
    this.toolLoader.startWatching(5000);

    // Configure agent with callback to refresh tools when they change
    this.agentRunner.setToolExecutor(this.toolRegistry);
    this.agentRunner.setTools(this.toolRegistry.getAllFunctions());

    // Listen for tool registry changes to update agent
    this.setupToolChangeListener();

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
    this.toolLoader.stopWatching();
    await this.memoryManager.logSystem('PiBot shutting down');
    await this.gateway.stop();
    logger.info('PiBot stopped');
  }

  private setupToolChangeListener(): void {
    // Refresh agent tools periodically to pick up newly loaded tools
    setInterval(() => {
      const currentTools = this.agentRunner.getToolCount?.() ?? 0;
      const registryTools = this.toolRegistry.getAllFunctions().length;

      if (currentTools !== registryTools) {
        this.agentRunner.setTools(this.toolRegistry.getAllFunctions());
        logger.info({ tools: registryTools }, 'Agent tools updated');
      }
    }, 5000);
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

    // Check for skill command
    let userMessage = message.content;
    let skillContext: string | undefined;

    const skillMatch = this.skillLoader.matchCommand(message.content);
    if (skillMatch) {
      const { skill, args } = skillMatch;
      logger.info({ skill: skill.name, args }, 'Skill command detected');

      // Build skill context to inject
      skillContext = `<skill name="${skill.name}">\n${skill.prompt}\n</skill>`;

      // User message becomes the args (or a default instruction)
      userMessage = args || `Execute the ${skill.name} skill`;
    }

    // Process with agent (skill context will be injected if present)
    const response = await this.agentRunner.processMessage(
      session,
      userMessage,
      skillContext
    );

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
    const skills = this.skillLoader.getAllSkills();
    logger.info('='.repeat(50));
    logger.info('PiBot Status:');
    logger.info(`  Running: ${status.isRunning}`);
    logger.info(`  Channels: ${status.channels.map((c) => c.name).join(', ')}`);
    logger.info(`  Tools: ${this.toolRegistry.getAllTools().map((t) => t.name).join(', ')}`);
    logger.info(`  Functions: ${this.toolRegistry.getAllFunctions().length}`);
    logger.info(`  Skills: ${skills.map((s) => s.command).join(', ') || 'none'}`);
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
