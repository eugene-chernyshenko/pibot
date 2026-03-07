import { createLogger } from '../utils/logger.js';
import type { Message } from '../llm/types.js';

const logger = createLogger('SessionManager');

export interface Session {
  id: string;
  userId: string;
  channelName: string;
  createdAt: Date;
  lastActivityAt: Date;
  messages: Message[];
  metadata: Record<string, unknown>;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private userSessions: Map<string, string> = new Map(); // userId:channelName -> sessionId

  getOrCreateSession(userId: string, channelName: string): Session {
    const key = `${userId}:${channelName}`;
    let sessionId = this.userSessions.get(key);

    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastActivityAt = new Date();
        return session;
      }
    }

    // Create new session
    sessionId = this.generateSessionId();
    const session: Session = {
      id: sessionId,
      userId,
      channelName,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      messages: [],
      metadata: {},
    };

    this.sessions.set(sessionId, session);
    this.userSessions.set(key, sessionId);

    logger.info({ sessionId, userId, channelName }, 'Session created');

    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByUser(userId: string, channelName: string): Session | undefined {
    const key = `${userId}:${channelName}`;
    const sessionId = this.userSessions.get(key);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  addMessage(sessionId: string, message: Message): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.lastActivityAt = new Date();
    }
  }

  clearSessionHistory(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      logger.info({ sessionId }, 'Session history cleared');
    }
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const key = `${session.userId}:${session.channelName}`;
      this.userSessions.delete(key);
      this.sessions.delete(sessionId);
      logger.info({ sessionId, userId: session.userId }, 'Session ended');
    }
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  cleanupInactiveSessions(maxInactiveMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivityAt.getTime() > maxInactiveMs) {
        this.endSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Inactive sessions cleaned up');
    }

    return cleaned;
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
