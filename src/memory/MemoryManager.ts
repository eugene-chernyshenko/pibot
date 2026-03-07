import { createLogger } from '../utils/logger.js';
import { SessionStore } from './SessionStore.js';
import { DailyLog } from './DailyLog.js';
import { KnowledgeBase } from './KnowledgeBase.js';

const logger = createLogger('MemoryManager');

export class MemoryManager {
  readonly sessionStore: SessionStore;
  readonly dailyLog: DailyLog;
  readonly knowledgeBase: KnowledgeBase;

  constructor() {
    this.sessionStore = new SessionStore();
    this.dailyLog = new DailyLog();
    this.knowledgeBase = new KnowledgeBase();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing memory manager...');

    await Promise.all([
      this.sessionStore.initialize(),
      this.dailyLog.initialize(),
      this.knowledgeBase.initialize(),
    ]);

    logger.info('Memory manager initialized');
  }

  async cleanup(): Promise<void> {
    logger.info('Running memory cleanup...');

    // Clean up old sessions (older than 7 days)
    const sessionsCleared = await this.sessionStore.cleanup(7 * 24 * 60 * 60 * 1000);

    logger.info({ sessionsCleared }, 'Memory cleanup complete');
  }

  async logMessage(
    userId: string,
    channelName: string,
    content: string,
    isAssistant: boolean = false
  ): Promise<void> {
    await this.dailyLog.log({
      type: 'message',
      userId,
      channelName,
      content: `${isAssistant ? '[ASSISTANT]' : '[USER]'} ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`,
    });
  }

  async logToolCall(
    toolName: string,
    args: unknown,
    userId?: string,
    channelName?: string
  ): Promise<void> {
    await this.dailyLog.log({
      type: 'tool_call',
      userId,
      channelName,
      content: `${toolName}(${JSON.stringify(args).slice(0, 100)})`,
    });
  }

  async logToolResult(
    toolName: string,
    result: string,
    isError: boolean,
    userId?: string,
    channelName?: string
  ): Promise<void> {
    await this.dailyLog.log({
      type: 'tool_result',
      userId,
      channelName,
      content: `${toolName} -> ${isError ? 'ERROR: ' : ''}${result.slice(0, 100)}`,
    });
  }

  async logError(
    error: string,
    userId?: string,
    channelName?: string
  ): Promise<void> {
    await this.dailyLog.log({
      type: 'error',
      userId,
      channelName,
      content: error,
    });
  }

  async logSystem(content: string): Promise<void> {
    await this.dailyLog.log({
      type: 'system',
      content,
    });
  }
}
