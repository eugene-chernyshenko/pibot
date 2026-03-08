/**
 * Manages connection to a single MCP server
 * Handles initialization, tool discovery, and tool execution
 */

import { createLogger } from '../utils/logger.js';
import { JsonRpcTransport } from './protocol/JsonRpcTransport.js';
import {
  MCP_METHODS,
  MCP_PROTOCOL_VERSION,
  type JsonRpcNotification,
} from './protocol/messages.js';
import {
  MCPConnectionError,
  MCPProtocolError,
  MCPToolError,
} from './MCPError.js';
import type {
  MCPServerConfig,
  MCPToolDefinition,
  MCPResource,
  MCPResourceContent,
  MCPInitializeResult,
  MCPToolCallResult,
  MCPConnectionState,
  MCPConnectionStatus,
  MCPServerCapabilities,
} from './types.js';

const logger = createLogger('MCPServerConnection');

interface ToolsListResult {
  tools: MCPToolDefinition[];
}

interface ResourcesListResult {
  resources: MCPResource[];
}

interface ResourcesReadResult {
  contents: MCPResourceContent[];
}

export class MCPServerConnection {
  private transport: JsonRpcTransport;
  private state: MCPConnectionState = 'disconnected';
  private tools: MCPToolDefinition[] = [];
  private resources: MCPResource[] = [];
  private capabilities: MCPServerCapabilities = {};
  private connectedAt?: Date;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;

  constructor(
    public readonly serverName: string,
    private readonly config: MCPServerConfig
  ) {
    this.maxReconnectAttempts = config.retries ?? 3;
    this.transport = new JsonRpcTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env ?? {},
      timeout: config.timeout ?? 30000,
      serverName,
    });

    this.setupTransportListeners();
  }

  private setupTransportListeners(): void {
    this.transport.on('disconnect', () => {
      logger.warn({ serverName: this.serverName }, 'MCP server disconnected');
      this.state = 'disconnected';
      this.handleReconnect();
    });

    this.transport.on('notification', (notification: JsonRpcNotification) => {
      this.handleNotification(notification);
    });
  }

  async connect(): Promise<void> {
    if (this.state === 'ready') {
      return;
    }

    this.state = 'connecting';
    logger.info({ serverName: this.serverName }, 'Connecting to MCP server');

    try {
      await this.transport.connect();
      this.state = 'initializing';

      await this.initialize();
      await this.discoverCapabilities();

      this.state = 'ready';
      this.connectedAt = new Date();
      this.reconnectAttempts = 0;

      logger.info(
        {
          serverName: this.serverName,
          tools: this.tools.length,
          resources: this.resources.length,
        },
        'MCP server connected and initialized'
      );
    } catch (error) {
      this.state = 'error';
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.state === 'disconnected' || this.state === 'closed') {
      return;
    }

    logger.info({ serverName: this.serverName }, 'Disconnecting from MCP server');

    try {
      // Try graceful shutdown
      if (this.transport.connected) {
        await this.transport.request(MCP_METHODS.SHUTDOWN).catch(() => {
          // Ignore shutdown errors
        });
      }
    } finally {
      await this.transport.disconnect();
      this.state = 'closed';
    }
  }

  private async initialize(): Promise<void> {
    const result = await this.transport.request<MCPInitializeResult>(
      MCP_METHODS.INITIALIZE,
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          // Client capabilities
        },
        clientInfo: {
          name: 'pibot',
          version: '1.0.0',
        },
      }
    );

    logger.debug(
      { serverName: this.serverName, result },
      'MCP server initialized'
    );

    this.capabilities = result.capabilities;

    // Send initialized notification
    this.transport.notify(MCP_METHODS.INITIALIZED);
  }

  private async discoverCapabilities(): Promise<void> {
    // Discover tools
    if (this.capabilities.tools !== undefined) {
      await this.refreshTools();
    }

    // Discover resources
    if (this.capabilities.resources !== undefined) {
      await this.refreshResources();
    }
  }

  async refreshTools(): Promise<void> {
    try {
      const result = await this.transport.request<ToolsListResult>(
        MCP_METHODS.TOOLS_LIST
      );
      this.tools = result.tools || [];
      logger.debug(
        { serverName: this.serverName, count: this.tools.length },
        'Tools discovered'
      );
    } catch (error) {
      logger.error(
        { serverName: this.serverName, error },
        'Failed to list tools'
      );
      this.tools = [];
    }
  }

  async refreshResources(): Promise<void> {
    try {
      const result = await this.transport.request<ResourcesListResult>(
        MCP_METHODS.RESOURCES_LIST
      );
      this.resources = result.resources || [];
      logger.debug(
        { serverName: this.serverName, count: this.resources.length },
        'Resources discovered'
      );
    } catch (error) {
      logger.error(
        { serverName: this.serverName, error },
        'Failed to list resources'
      );
      this.resources = [];
    }
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    if (this.state !== 'ready') {
      throw new MCPConnectionError(
        this.serverName,
        `Server not ready (state: ${this.state})`
      );
    }

    logger.debug(
      { serverName: this.serverName, toolName, args },
      'Calling MCP tool'
    );

    try {
      const result = await this.transport.request<MCPToolCallResult>(
        MCP_METHODS.TOOLS_CALL,
        {
          name: toolName,
          arguments: args,
        }
      );

      logger.debug(
        { serverName: this.serverName, toolName, isError: result.isError },
        'MCP tool call completed'
      );

      return result;
    } catch (error) {
      if (error instanceof MCPProtocolError) {
        throw new MCPToolError(this.serverName, toolName, error.message);
      }
      throw error;
    }
  }

  async readResource(uri: string): Promise<MCPResourceContent[]> {
    if (this.state !== 'ready') {
      throw new MCPConnectionError(
        this.serverName,
        `Server not ready (state: ${this.state})`
      );
    }

    logger.debug(
      { serverName: this.serverName, uri },
      'Reading MCP resource'
    );

    const result = await this.transport.request<ResourcesReadResult>(
      MCP_METHODS.RESOURCES_READ,
      { uri }
    );

    return result.contents;
  }

  private handleNotification(notification: JsonRpcNotification): void {
    logger.debug(
      { serverName: this.serverName, method: notification.method },
      'Received notification'
    );

    switch (notification.method) {
      case MCP_METHODS.TOOLS_LIST_CHANGED:
        this.refreshTools().catch((error) => {
          logger.error({ error }, 'Failed to refresh tools after notification');
        });
        break;

      case MCP_METHODS.RESOURCES_LIST_CHANGED:
        this.refreshResources().catch((error) => {
          logger.error({ error }, 'Failed to refresh resources after notification');
        });
        break;

      default:
        logger.debug(
          { serverName: this.serverName, method: notification.method },
          'Unknown notification'
        );
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.state === 'closed') {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        { serverName: this.serverName, attempts: this.reconnectAttempts },
        'Max reconnection attempts reached'
      );
      this.state = 'error';
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts - 1) * 1000; // Exponential backoff: 1s, 2s, 4s

    logger.info(
      { serverName: this.serverName, attempt: this.reconnectAttempts, delay },
      'Attempting to reconnect'
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      // Create new transport instance
      this.transport = new JsonRpcTransport({
        command: this.config.command,
        args: this.config.args ?? [],
        env: this.config.env ?? {},
        timeout: this.config.timeout ?? 30000,
        serverName: this.serverName,
      });
      this.setupTransportListeners();

      await this.connect();
    } catch (error) {
      logger.error(
        { serverName: this.serverName, error },
        'Reconnection failed'
      );
      this.handleReconnect();
    }
  }

  getTools(): MCPToolDefinition[] {
    return this.tools;
  }

  getResources(): MCPResource[] {
    return this.resources;
  }

  getStatus(): MCPConnectionStatus {
    return {
      serverName: this.serverName,
      state: this.state,
      toolCount: this.tools.length,
      resourceCount: this.resources.length,
      connectedAt: this.connectedAt,
    };
  }

  get isReady(): boolean {
    return this.state === 'ready';
  }

  get hasResources(): boolean {
    return this.capabilities.resources !== undefined && this.resources.length > 0;
  }
}
