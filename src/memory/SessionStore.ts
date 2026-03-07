import { join } from 'node:path';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import type { Message } from '../llm/types.js';

const logger = createLogger('SessionStore');

interface StoredSession {
  id: string;
  userId: string;
  channelName: string;
  createdAt: string;
  lastActivityAt: string;
  messages: Message[];
  metadata: Record<string, unknown>;
}

export class SessionStore {
  private sessionsDir: string;

  constructor() {
    this.sessionsDir = join(config.memory.dataDir, 'sessions');
  }

  async initialize(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    logger.info({ dir: this.sessionsDir }, 'Session store initialized');
  }

  async save(session: StoredSession): Promise<void> {
    const filePath = this.getFilePath(session.id);
    await mkdir(this.sessionsDir, { recursive: true });
    await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
    logger.debug({ sessionId: session.id }, 'Session saved');
  }

  async load(sessionId: string): Promise<StoredSession | null> {
    const filePath = this.getFilePath(sessionId);
    try {
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as StoredSession;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(sessionId: string): Promise<void> {
    const filePath = this.getFilePath(sessionId);
    try {
      await rm(filePath);
      logger.debug({ sessionId }, 'Session deleted');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async listByUser(userId: string): Promise<StoredSession[]> {
    const sessions: StoredSession[] = [];

    try {
      const files = await readdir(this.sessionsDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const sessionId = file.replace('.json', '');
        const session = await this.load(sessionId);

        if (session && session.userId === userId) {
          sessions.push(session);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return sessions.sort((a, b) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );
  }

  async cleanup(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    let cleaned = 0;
    const now = Date.now();

    try {
      const files = await readdir(this.sessionsDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const sessionId = file.replace('.json', '');
        const session = await this.load(sessionId);

        if (session) {
          const lastActivity = new Date(session.lastActivityAt).getTime();
          if (now - lastActivity > maxAgeMs) {
            await this.delete(sessionId);
            cleaned++;
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Old sessions cleaned up');
    }

    return cleaned;
  }

  private getFilePath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.json`);
  }
}
