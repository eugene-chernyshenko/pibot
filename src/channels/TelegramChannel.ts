import { Bot, type Context } from 'grammy';
import { BaseChannel } from './BaseChannel.js';
import type { IncomingMessage, OutgoingMessage, StreamingMessage } from './types.js';
import { config } from '../config/index.js';
import { ChannelError } from '../utils/errors.js';

export class TelegramChannel extends BaseChannel {
  readonly name = 'telegram';
  private bot: Bot;
  private allowedUsers: Set<number> | null;

  constructor() {
    super();
    this.bot = new Bot(config.telegram.botToken);
    this.allowedUsers = config.telegram.allowedUsers
      ? new Set(config.telegram.allowedUsers)
      : null;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.setupHandlers();

    this.bot.catch((err) => {
      this.logger.error({ error: err }, 'Bot error');
    });

    await this.bot.start({
      onStart: () => {
        this.logger.info('Telegram bot started');
        this.isRunning = true;
      },
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    await this.bot.stop();
    this.isRunning = false;
    this.logger.info('Telegram bot stopped');
  }

  async send(userId: string, message: OutgoingMessage): Promise<void> {
    const chatId = parseInt(userId, 10);
    if (isNaN(chatId)) {
      throw new ChannelError(`Invalid user ID: ${userId}`, this.name);
    }

    const options: { parse_mode?: 'Markdown' | 'HTML'; reply_to_message_id?: number } = {};

    if (message.parseMode === 'markdown') {
      options.parse_mode = 'Markdown';
    } else if (message.parseMode === 'html') {
      options.parse_mode = 'HTML';
    }

    if (message.replyToMessageId) {
      options.reply_to_message_id = parseInt(message.replyToMessageId, 10);
    }

    await this.bot.api.sendMessage(chatId, message.content, options);
  }

  async sendStreaming(
    userId: string,
    _messageId: string,
    stream: AsyncIterable<StreamingMessage>
  ): Promise<void> {
    const chatId = parseInt(userId, 10);
    if (isNaN(chatId)) {
      throw new ChannelError(`Invalid user ID: ${userId}`, this.name);
    }

    let sentMessageId: number | null = null;
    let accumulatedContent = '';
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 1000; // Update every second max

    for await (const chunk of stream) {
      if (chunk.type === 'start') {
        const sent = await this.bot.api.sendMessage(chatId, '...');
        sentMessageId = sent.message_id;
      } else if (chunk.type === 'chunk' && chunk.content) {
        accumulatedContent += chunk.content;
        const now = Date.now();

        if (sentMessageId && now - lastUpdateTime > UPDATE_INTERVAL) {
          try {
            await this.bot.api.editMessageText(chatId, sentMessageId, accumulatedContent);
            lastUpdateTime = now;
          } catch {
            // Ignore edit errors (rate limits, etc.)
          }
        }
      } else if (chunk.type === 'end' && sentMessageId) {
        if (accumulatedContent.trim()) {
          try {
            await this.bot.api.editMessageText(chatId, sentMessageId, accumulatedContent);
          } catch {
            // Final edit, ignore errors
          }
        }
      } else if (chunk.type === 'error') {
        if (sentMessageId) {
          await this.bot.api.editMessageText(
            chatId,
            sentMessageId,
            `Error: ${chunk.error ?? 'Unknown error'}`
          );
        } else {
          await this.bot.api.sendMessage(chatId, `Error: ${chunk.error ?? 'Unknown error'}`);
        }
      }
    }
  }

  private setupHandlers(): void {
    this.bot.on('message:text', async (ctx: Context) => {
      if (!ctx.from || !ctx.message || !('text' in ctx.message)) return;

      // Check allowed users
      if (this.allowedUsers && !this.allowedUsers.has(ctx.from.id)) {
        this.logger.warn({ userId: ctx.from.id }, 'Unauthorized user');
        await ctx.reply('Sorry, you are not authorized to use this bot.');
        return;
      }

      const message: IncomingMessage = {
        id: this.generateMessageId(),
        channelName: this.name,
        userId: ctx.from.id.toString(),
        userName: ctx.from.username ?? ctx.from.first_name,
        content: ctx.message.text,
        timestamp: new Date(ctx.message.date * 1000),
        replyToMessageId: ctx.message.reply_to_message?.message_id?.toString(),
        metadata: {
          chatId: ctx.chat?.id,
          telegramMessageId: ctx.message.message_id,
        },
      };

      await this.emitMessage(message);
    });

    this.bot.command('start', async (ctx) => {
      await ctx.reply('Hello! I am PiBot, your personal AI assistant. How can I help you today?');
    });

    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Just send me a message and I will do my best to help!\n\n' +
        'Commands:\n' +
        '/start - Start the bot\n' +
        '/help - Show this help message'
      );
    });
  }
}
