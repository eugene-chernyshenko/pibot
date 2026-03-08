/**
 * JSON-RPC 2.0 transport over stdio
 * Handles spawning subprocess and bidirectional communication
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { createLogger } from '../../utils/logger.js';
import type {
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcMessage,
} from './messages.js';
import { isJsonRpcError } from './messages.js';
import { MCPConnectionError, MCPTimeoutError, MCPProtocolError } from '../MCPError.js';

const logger = createLogger('JsonRpcTransport');

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface TransportOptions {
  command: string;
  args?: string[] | undefined;
  env?: Record<string, string> | undefined;
  timeout?: number | undefined;
  serverName: string;
}

interface ResolvedTransportOptions {
  command: string;
  args: string[];
  env: Record<string, string>;
  timeout: number;
  serverName: string;
}

export class JsonRpcTransport extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests: Map<number | string, PendingRequest> = new Map();
  private buffer = '';
  private isConnected = false;
  private readonly options: ResolvedTransportOptions;

  constructor(options: TransportOptions) {
    super();
    this.options = {
      command: options.command,
      serverName: options.serverName,
      args: options.args ?? [],
      env: options.env ?? {},
      timeout: options.timeout ?? 30000,
    };
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const { command, args, env, serverName } = this.options;

    logger.info({ serverName, command, args }, 'Spawning MCP server process');

    return new Promise((resolve, reject) => {
      try {
        // Merge process env with custom env, expanding ${VAR} references
        const processEnv = { ...process.env };
        for (const [key, value] of Object.entries(env)) {
          processEnv[key] = this.expandEnvVar(value);
        }

        this.process = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: processEnv,
        });

        const connectionTimeout = setTimeout(() => {
          this.cleanup();
          reject(new MCPConnectionError(serverName, 'Connection timeout'));
        }, this.options.timeout);

        this.process.on('error', (error) => {
          clearTimeout(connectionTimeout);
          this.cleanup();
          reject(new MCPConnectionError(serverName, error.message, error));
        });

        this.process.on('exit', (code, signal) => {
          logger.info({ serverName, code, signal }, 'MCP server process exited');
          this.handleDisconnect();
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            logger.debug({ serverName, stderr: message }, 'MCP server stderr');
          }
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleData(data);
        });

        // Consider connected once process is spawned and stdio is ready
        this.process.stdout?.once('readable', () => {
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          logger.info({ serverName }, 'MCP server process connected');
          resolve();
        });

        // Also resolve if we get any data (some servers don't emit readable)
        this.process.stdout?.once('data', () => {
          if (!this.isConnected) {
            clearTimeout(connectionTimeout);
            this.isConnected = true;
            logger.info({ serverName }, 'MCP server process connected (data)');
            resolve();
          }
        });

        // Fallback: resolve after a short delay if process is running
        setTimeout(() => {
          if (!this.isConnected && this.process && !this.process.killed) {
            clearTimeout(connectionTimeout);
            this.isConnected = true;
            logger.info({ serverName }, 'MCP server process connected (timeout fallback)');
            resolve();
          }
        }, 1000);
      } catch (error) {
        reject(new MCPConnectionError(serverName, (error as Error).message, error as Error));
      }
    });
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.process) {
      return;
    }

    logger.info({ serverName: this.options.serverName }, 'Disconnecting from MCP server');

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new MCPConnectionError(this.options.serverName, 'Disconnected'));
      this.pendingRequests.delete(id);
    }

    this.cleanup();
  }

  async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.isConnected || !this.process) {
      throw new MCPConnectionError(this.options.serverName, 'Not connected');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params && { params }),
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new MCPTimeoutError(this.options.serverName, method, this.options.timeout));
      }, this.options.timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
      });

      this.send(request);
    });
  }

  notify(method: string, params?: Record<string, unknown>): void {
    if (!this.isConnected || !this.process) {
      logger.warn({ serverName: this.options.serverName }, 'Cannot send notification: not connected');
      return;
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params && { params }),
    };

    this.send(notification);
  }

  private send(message: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.process?.stdin?.writable) {
      throw new MCPConnectionError(this.options.serverName, 'stdin not writable');
    }

    const json = JSON.stringify(message);
    logger.debug({ serverName: this.options.serverName, message: json }, 'Sending message');
    this.process.stdin.write(json + '\n');
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete lines (JSON-RPC messages are newline-delimited)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed) as JsonRpcMessage;
        this.handleMessage(message);
      } catch (error) {
        logger.warn(
          { serverName: this.options.serverName, line: trimmed, error },
          'Failed to parse JSON-RPC message'
        );
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    logger.debug({ serverName: this.options.serverName, message }, 'Received message');

    // Check if it's a response (has id and either result or error)
    if ('id' in message && message.id !== null && ('result' in message || 'error' in message)) {
      const response = message as JsonRpcResponse;
      const responseId = response.id;
      if (responseId === null) {
        return;
      }
      const pending = this.pendingRequests.get(responseId);

      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(responseId);

        if (isJsonRpcError(response)) {
          pending.reject(
            new MCPProtocolError(
              this.options.serverName,
              response.error.message,
              response.error.code
            )
          );
        } else {
          pending.resolve(response.result);
        }
      } else {
        logger.warn(
          { serverName: this.options.serverName, id: responseId },
          'Received response for unknown request'
        );
      }
    } else if ('method' in message && !('id' in message)) {
      // It's a notification from the server
      this.emit('notification', message as JsonRpcNotification);
    }
  }

  private handleDisconnect(): void {
    if (!this.isConnected) return;

    this.isConnected = false;
    this.emit('disconnect');

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new MCPConnectionError(this.options.serverName, 'Server disconnected'));
      this.pendingRequests.delete(id);
    }
  }

  private cleanup(): void {
    this.isConnected = false;

    if (this.process) {
      this.process.stdin?.end();
      this.process.stdout?.removeAllListeners();
      this.process.stderr?.removeAllListeners();
      this.process.removeAllListeners();

      if (!this.process.killed) {
        this.process.kill('SIGTERM');

        // Force kill after timeout
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
        }, 5000);
      }

      this.process = null;
    }

    this.buffer = '';
    this.removeAllListeners();
  }

  private expandEnvVar(value: string): string {
    // Replace ${VAR_NAME} with environment variable value
    return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || '';
    });
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
