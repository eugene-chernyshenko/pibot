import { EventEmitter } from 'node:events';
import { createLogger } from '../utils/logger.js';
import type { IncomingMessage, OutgoingMessage } from '../channels/types.js';

export interface GatewayEvents {
  'message:received': IncomingMessage;
  'message:sent': { userId: string; channelName: string; message: OutgoingMessage };
  'session:created': { sessionId: string; userId: string };
  'session:ended': { sessionId: string; userId: string };
  'agent:started': { sessionId: string };
  'agent:completed': { sessionId: string; turns: number };
  'agent:error': { sessionId: string; error: Error };
  'channel:started': { channelName: string };
  'channel:stopped': { channelName: string };
  'channel:error': { channelName: string; error: Error };
}

type EventName = keyof GatewayEvents;

const logger = createLogger('EventBus');

export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<K extends EventName>(event: K, data: GatewayEvents[K]): void {
    logger.debug({ event, data }, 'Event emitted');
    this.emitter.emit(event, data);
  }

  on<K extends EventName>(event: K, handler: (data: GatewayEvents[K]) => void): void {
    this.emitter.on(event, handler);
  }

  once<K extends EventName>(event: K, handler: (data: GatewayEvents[K]) => void): void {
    this.emitter.once(event, handler);
  }

  off<K extends EventName>(event: K, handler: (data: GatewayEvents[K]) => void): void {
    this.emitter.off(event, handler);
  }

  removeAllListeners(event?: EventName): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}
