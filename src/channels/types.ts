export interface IncomingMessage {
  id: string;
  channelName: string;
  userId: string;
  userName?: string | undefined;
  content: string;
  timestamp: Date;
  replyToMessageId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface OutgoingMessage {
  content: string;
  replyToMessageId?: string;
  parseMode?: 'text' | 'markdown' | 'html';
  metadata?: Record<string, unknown>;
}

export interface StreamingMessage {
  type: 'start' | 'chunk' | 'end' | 'error';
  messageId?: string;
  content?: string;
  error?: string;
}

export type MessageHandler = (message: IncomingMessage) => void | Promise<void>;

export interface Channel {
  readonly name: string;

  start(): Promise<void>;
  stop(): Promise<void>;

  onMessage(handler: MessageHandler): void;

  send(userId: string, message: OutgoingMessage): Promise<void>;

  sendStreaming?(
    userId: string,
    messageId: string,
    stream: AsyncIterable<StreamingMessage>
  ): Promise<void>;
}
