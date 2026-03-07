import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server } from 'node:http';
import { BaseChannel } from './BaseChannel.js';
import type { IncomingMessage, OutgoingMessage, StreamingMessage } from './types.js';
import { config } from '../config/index.js';
import { ChannelError } from '../utils/errors.js';

interface WebChatMessage {
  type: 'message' | 'ping';
  content?: string;
  replyToMessageId?: string;
}

interface ClientInfo {
  ws: WebSocket;
  userId: string;
  userName?: string;
  connectedAt: Date;
}

export class WebChatChannel extends BaseChannel {
  readonly name = 'webchat';
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<connectionId>

  constructor() {
    super();
  }

  async start(): Promise<void> {
    if (this.isRunning || !config.webchat.enabled) {
      if (!config.webchat.enabled) {
        this.logger.info('WebChat is disabled');
      }
      return;
    }

    this.httpServer = createServer();
    this.wss = new WebSocketServer({
      server: this.httpServer,
      path: config.webchat.wsPath,
    });

    this.setupWebSocket();

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(config.webchat.port, () => {
        this.logger.info(
          { port: config.webchat.port, path: config.webchat.wsPath },
          'WebChat server started'
        );
        this.isRunning = true;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    // Close all client connections
    for (const [connectionId, client] of this.clients) {
      client.ws.close(1000, 'Server shutting down');
      this.clients.delete(connectionId);
    }
    this.userSockets.clear();

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    this.isRunning = false;
    this.logger.info('WebChat server stopped');
  }

  async send(userId: string, message: OutgoingMessage): Promise<void> {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      this.logger.warn({ userId }, 'No active connections for user');
      return;
    }

    const payload = JSON.stringify({
      type: 'message',
      content: message.content,
      replyToMessageId: message.replyToMessageId,
      timestamp: new Date().toISOString(),
    });

    for (const connectionId of sockets) {
      const client = this.clients.get(connectionId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  async sendStreaming(
    userId: string,
    messageId: string,
    stream: AsyncIterable<StreamingMessage>
  ): Promise<void> {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      this.logger.warn({ userId }, 'No active connections for user');
      return;
    }

    const sendToAll = (data: object) => {
      const payload = JSON.stringify(data);
      for (const connectionId of sockets) {
        const client = this.clients.get(connectionId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(payload);
        }
      }
    };

    for await (const chunk of stream) {
      sendToAll({
        type: 'stream',
        streamType: chunk.type,
        messageId,
        content: chunk.content,
        error: chunk.error,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private setupWebSocket(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws, req) => {
      const connectionId = this.generateConnectionId();
      const userId = this.generateUserId(); // In real app, this would come from auth

      const clientInfo: ClientInfo = {
        ws,
        userId,
        connectedAt: new Date(),
      };

      this.clients.set(connectionId, clientInfo);

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(connectionId);

      this.logger.info({ connectionId, userId, ip: req.socket.remoteAddress }, 'Client connected');

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        userId,
        connectionId,
        timestamp: new Date().toISOString(),
      }));

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString()) as WebChatMessage;
          await this.handleMessage(connectionId, clientInfo, message);
        } catch (error) {
          this.logger.error({ error, connectionId }, 'Failed to handle message');
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format',
          }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(connectionId);
        const userConnections = this.userSockets.get(userId);
        if (userConnections) {
          userConnections.delete(connectionId);
          if (userConnections.size === 0) {
            this.userSockets.delete(userId);
          }
        }
        this.logger.info({ connectionId, userId }, 'Client disconnected');
      });

      ws.on('error', (error) => {
        this.logger.error({ error, connectionId }, 'WebSocket error');
      });
    });
  }

  private async handleMessage(
    connectionId: string,
    clientInfo: ClientInfo,
    message: WebChatMessage
  ): Promise<void> {
    if (message.type === 'ping') {
      clientInfo.ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (message.type === 'message' && message.content) {
      const incomingMessage: IncomingMessage = {
        id: this.generateMessageId(),
        channelName: this.name,
        userId: clientInfo.userId,
        userName: clientInfo.userName,
        content: message.content,
        timestamp: new Date(),
        replyToMessageId: message.replyToMessageId,
        metadata: { connectionId },
      };

      await this.emitMessage(incomingMessage);
    }
  }

  private generateConnectionId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private generateUserId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
