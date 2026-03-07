import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/gateway/SessionManager.js';
import { EventBus } from '../src/gateway/EventBus.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  it('should create a new session', () => {
    const session = sessionManager.getOrCreateSession('user1', 'telegram');

    expect(session).toBeDefined();
    expect(session.userId).toBe('user1');
    expect(session.channelName).toBe('telegram');
    expect(session.messages).toEqual([]);
  });

  it('should return existing session for same user/channel', () => {
    const session1 = sessionManager.getOrCreateSession('user1', 'telegram');
    const session2 = sessionManager.getOrCreateSession('user1', 'telegram');

    expect(session1.id).toBe(session2.id);
  });

  it('should create different sessions for different channels', () => {
    const telegramSession = sessionManager.getOrCreateSession('user1', 'telegram');
    const webChatSession = sessionManager.getOrCreateSession('user1', 'webchat');

    expect(telegramSession.id).not.toBe(webChatSession.id);
  });

  it('should add messages to session', () => {
    const session = sessionManager.getOrCreateSession('user1', 'telegram');
    sessionManager.addMessage(session.id, { role: 'user', content: 'Hello' });

    expect(session.messages.length).toBe(1);
    expect(session.messages[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('should clear session history', () => {
    const session = sessionManager.getOrCreateSession('user1', 'telegram');
    sessionManager.addMessage(session.id, { role: 'user', content: 'Hello' });
    sessionManager.clearSessionHistory(session.id);

    expect(session.messages).toEqual([]);
  });

  it('should end session', () => {
    const session = sessionManager.getOrCreateSession('user1', 'telegram');
    const sessionId = session.id;
    sessionManager.endSession(sessionId);

    expect(sessionManager.getSession(sessionId)).toBeUndefined();
  });

  it('should get active sessions', () => {
    sessionManager.getOrCreateSession('user1', 'telegram');
    sessionManager.getOrCreateSession('user2', 'telegram');

    const sessions = sessionManager.getActiveSessions();
    expect(sessions.length).toBe(2);
  });
});

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should emit and receive events', () => {
    let received = false;
    eventBus.on('channel:started', () => {
      received = true;
    });

    eventBus.emit('channel:started', { channelName: 'telegram' });
    expect(received).toBe(true);
  });

  it('should pass event data', () => {
    let channelName: string | null = null;
    eventBus.on('channel:started', (data) => {
      channelName = data.channelName;
    });

    eventBus.emit('channel:started', { channelName: 'telegram' });
    expect(channelName).toBe('telegram');
  });

  it('should handle multiple listeners', () => {
    let count = 0;
    eventBus.on('channel:started', () => count++);
    eventBus.on('channel:started', () => count++);

    eventBus.emit('channel:started', { channelName: 'telegram' });
    expect(count).toBe(2);
  });

  it('should remove listeners', () => {
    let count = 0;
    const handler = () => count++;

    eventBus.on('channel:started', handler);
    eventBus.off('channel:started', handler);
    eventBus.emit('channel:started', { channelName: 'telegram' });

    expect(count).toBe(0);
  });

  it('should handle once listeners', () => {
    let count = 0;
    eventBus.once('channel:started', () => count++);

    eventBus.emit('channel:started', { channelName: 'telegram' });
    eventBus.emit('channel:started', { channelName: 'telegram' });

    expect(count).toBe(1);
  });
});
