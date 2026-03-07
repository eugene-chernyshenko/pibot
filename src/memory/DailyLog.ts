import { join } from 'node:path';
import { mkdir, readdir, readFile, appendFile } from 'node:fs/promises';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { formatTimestamp, formatDateForLog } from '../utils/markdown.js';

const logger = createLogger('DailyLog');

export interface LogEntry {
  timestamp: string;
  type: 'message' | 'tool_call' | 'tool_result' | 'error' | 'system';
  userId?: string | undefined;
  channelName?: string | undefined;
  content: string;
  metadata?: Record<string, unknown> | undefined;
}

export class DailyLog {
  private logsDir: string;

  constructor() {
    this.logsDir = join(config.memory.dataDir, 'logs');
  }

  async initialize(): Promise<void> {
    await mkdir(this.logsDir, { recursive: true });
    logger.info({ dir: this.logsDir }, 'Daily log initialized');
  }

  async log(entry: Omit<LogEntry, 'timestamp'>): Promise<void> {
    const timestamp = formatTimestamp();
    const fullEntry: LogEntry = { timestamp, ...entry };

    const date = formatDateForLog();
    const filePath = this.getFilePath(date);

    const line = this.formatEntry(fullEntry);

    await mkdir(this.logsDir, { recursive: true });
    await appendFile(filePath, line + '\n', 'utf-8');

    logger.debug({ type: entry.type }, 'Log entry added');
  }

  async getLogForDate(date: string): Promise<LogEntry[]> {
    const filePath = this.getFilePath(date);
    try {
      const content = await readFile(filePath, 'utf-8');
      return this.parseLog(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async getRecentLogs(days: number = 7): Promise<Map<string, LogEntry[]>> {
    const logs = new Map<string, LogEntry[]>();
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = formatDateForLog(date);

      const entries = await this.getLogForDate(dateStr);
      if (entries.length > 0) {
        logs.set(dateStr, entries);
      }
    }

    return logs;
  }

  async search(query: string, days: number = 30): Promise<LogEntry[]> {
    const results: LogEntry[] = [];
    const queryLower = query.toLowerCase();

    try {
      const files = await readdir(this.logsDir);
      const sortedFiles = files
        .filter((f) => f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, days);

      for (const file of sortedFiles) {
        const date = file.replace('.md', '');
        const entries = await this.getLogForDate(date);

        for (const entry of entries) {
          if (entry.content.toLowerCase().includes(queryLower)) {
            results.push(entry);
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return results;
  }

  private formatEntry(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.type.toUpperCase()}]`,
    ];

    if (entry.userId) {
      parts.push(`[user:${entry.userId}]`);
    }
    if (entry.channelName) {
      parts.push(`[channel:${entry.channelName}]`);
    }

    parts.push(entry.content);

    return parts.join(' ');
  }

  private parseLog(content: string): LogEntry[] {
    const entries: LogEntry[] = [];
    const lines = content.split('\n').filter((l) => l.trim());

    const regex = /^\[([^\]]+)\]\s*\[([^\]]+)\](?:\s*\[user:([^\]]+)\])?(?:\s*\[channel:([^\]]+)\])?\s*(.*)$/;

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        entries.push({
          timestamp: match[1] ?? '',
          type: (match[2]?.toLowerCase() ?? 'message') as LogEntry['type'],
          userId: match[3],
          channelName: match[4],
          content: match[5] ?? '',
        });
      }
    }

    return entries;
  }

  private getFilePath(date: string): string {
    return join(this.logsDir, `${date}.md`);
  }
}
