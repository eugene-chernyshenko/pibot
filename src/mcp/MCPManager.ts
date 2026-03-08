/**
 * MCPManager - orchestrates multiple MCP server connections
 * Handles server lifecycle, tool registration, and provides unified interface
 */

import { createLogger } from '../utils/logger.js';
import { MCPServerConnection } from './MCPServerConnection.js';
import { MCPServerTool } from './MCPServerTool.js';
import { MCPConfigLoader } from './MCPConfigLoader.js';
import type { MCPConfig, MCPConnectionStatus } from './types.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';

const logger = createLogger('MCPManager');

export class MCPManager {
  private connections: Map<string, MCPServerConnection> = new Map();
  private serverTools: Map<string, MCPServerTool> = new Map();
  private configLoader: MCPConfigLoader;
  private toolRegistry: ToolRegistry | null = null;

  constructor(basePath?: string) {
    this.configLoader = new MCPConfigLoader(basePath);
  }

  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  async initialize(): Promise<void> {
    const config = await this.configLoader.load();

    if (!config) {
      logger.info('No MCP configuration found, skipping MCP initialization');
      return;
    }

    await this.startServers(config);
  }

  private async startServers(config: MCPConfig): Promise<void> {
    const serverEntries = Object.entries(config.mcpServers);
    logger.info({ servers: serverEntries.map(([name]) => name) }, 'Starting MCP servers');

    const results = await Promise.allSettled(
      serverEntries.map(([name, serverConfig]) => this.startServer(name, serverConfig))
    );

    // Log results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const serverEntry = serverEntries[i];
      if (!result || !serverEntry) continue;

      const [serverName] = serverEntry;

      if (result.status === 'fulfilled') {
        logger.info({ serverName }, 'MCP server started successfully');
      } else {
        logger.error(
          { serverName, error: result.reason },
          'Failed to start MCP server'
        );
      }
    }
  }

  private async startServer(
    name: string,
    config: MCPConfig['mcpServers'][string]
  ): Promise<void> {
    // Check if already connected
    if (this.connections.has(name)) {
      logger.warn({ serverName: name }, 'MCP server already connected');
      return;
    }

    const connection = new MCPServerConnection(name, config);

    try {
      await connection.connect();
      this.connections.set(name, connection);

      // Create and register tool adapter
      const toolPrefix = `mcp__${name}__`;
      const serverTool = new MCPServerTool(connection, toolPrefix);
      this.serverTools.set(name, serverTool);

      // Register with tool registry if available
      if (this.toolRegistry) {
        this.toolRegistry.register(serverTool);
      }

      logger.info(
        {
          serverName: name,
          tools: connection.getTools().map((t) => t.name),
          resources: connection.getResources().length,
        },
        'MCP server registered'
      );
    } catch (error) {
      logger.error({ serverName: name, error }, 'Failed to connect to MCP server');
      throw error;
    }
  }

  async stopServer(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) {
      logger.warn({ serverName: name }, 'MCP server not found');
      return;
    }

    logger.info({ serverName: name }, 'Stopping MCP server');

    // Unregister tool from registry
    if (this.toolRegistry) {
      const serverTool = this.serverTools.get(name);
      if (serverTool) {
        this.toolRegistry.unregister(serverTool.name);
      }
    }

    await connection.disconnect();
    this.connections.delete(name);
    this.serverTools.delete(name);

    logger.info({ serverName: name }, 'MCP server stopped');
  }

  async stopAll(): Promise<void> {
    logger.info('Stopping all MCP servers');

    const stopPromises = Array.from(this.connections.keys()).map((name) =>
      this.stopServer(name).catch((error) => {
        logger.error({ serverName: name, error }, 'Error stopping MCP server');
      })
    );

    await Promise.all(stopPromises);

    logger.info('All MCP servers stopped');
  }

  getConnection(name: string): MCPServerConnection | undefined {
    return this.connections.get(name);
  }

  getAllConnections(): MCPServerConnection[] {
    return Array.from(this.connections.values());
  }

  getStatus(): MCPConnectionStatus[] {
    return Array.from(this.connections.values()).map((conn) => conn.getStatus());
  }

  getServerNames(): string[] {
    return Array.from(this.connections.keys());
  }

  isServerConnected(name: string): boolean {
    const connection = this.connections.get(name);
    return connection?.isReady ?? false;
  }

  get serverCount(): number {
    return this.connections.size;
  }
}
