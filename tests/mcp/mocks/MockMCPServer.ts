/**
 * Mock MCP server for testing
 * Simulates a real MCP server by reading/writing JSON-RPC messages
 */

import { MCP_METHODS, MCP_PROTOCOL_VERSION } from '../../../src/mcp/protocol/messages.js';

export interface MockTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MockResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MockServerConfig {
  name?: string;
  version?: string;
  tools?: MockTool[];
  resources?: MockResource[];
  simulateLatency?: number;
}

export class MockMCPServer {
  private tools: MockTool[];
  private resources: MockResource[];
  private config: MockServerConfig;
  private initialized = false;

  constructor(config: MockServerConfig = {}) {
    this.config = {
      name: 'mock-server',
      version: '1.0.0',
      tools: [],
      resources: [],
      simulateLatency: 0,
      ...config,
    };
    this.tools = this.config.tools || [];
    this.resources = this.config.resources || [];
  }

  async handleMessage(message: string): Promise<string | null> {
    if (this.config.simulateLatency) {
      await new Promise((resolve) => setTimeout(resolve, this.config.simulateLatency));
    }

    const request = JSON.parse(message);

    // Handle notification (no response needed)
    if (!('id' in request)) {
      return null;
    }

    const { id, method, params } = request;

    try {
      const result = await this.handleMethod(method, params);
      return JSON.stringify({
        jsonrpc: '2.0',
        id,
        result,
      });
    } catch (error) {
      return JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: (error as Error).message,
        },
      });
    }
  }

  private async handleMethod(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    switch (method) {
      case MCP_METHODS.INITIALIZE:
        return this.handleInitialize();

      case MCP_METHODS.TOOLS_LIST:
        return this.handleToolsList();

      case MCP_METHODS.TOOLS_CALL:
        return this.handleToolsCall(params as { name: string; arguments: unknown });

      case MCP_METHODS.RESOURCES_LIST:
        return this.handleResourcesList();

      case MCP_METHODS.RESOURCES_READ:
        return this.handleResourcesRead(params as { uri: string });

      case MCP_METHODS.SHUTDOWN:
        return null;

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private handleInitialize() {
    this.initialized = true;
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: this.tools.length > 0 ? {} : undefined,
        resources: this.resources.length > 0 ? {} : undefined,
      },
      serverInfo: {
        name: this.config.name,
        version: this.config.version,
      },
    };
  }

  private handleToolsList() {
    if (!this.initialized) {
      throw new Error('Server not initialized');
    }
    return { tools: this.tools };
  }

  private handleToolsCall(params: { name: string; arguments: unknown }) {
    if (!this.initialized) {
      throw new Error('Server not initialized');
    }

    const tool = this.tools.find((t) => t.name === params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${params.name}` }],
        isError: true,
      };
    }

    // Return mock success response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            tool: params.name,
            args: params.arguments,
            result: 'mock_result',
          }),
        },
      ],
      isError: false,
    };
  }

  private handleResourcesList() {
    if (!this.initialized) {
      throw new Error('Server not initialized');
    }
    return { resources: this.resources };
  }

  private handleResourcesRead(params: { uri: string }) {
    if (!this.initialized) {
      throw new Error('Server not initialized');
    }

    const resource = this.resources.find((r) => r.uri === params.uri);
    if (!resource) {
      throw new Error(`Resource not found: ${params.uri}`);
    }

    return {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType || 'text/plain',
          text: `Content of ${resource.name}`,
        },
      ],
    };
  }

  addTool(tool: MockTool): void {
    this.tools.push(tool);
  }

  addResource(resource: MockResource): void {
    this.resources.push(resource);
  }

  getTools(): MockTool[] {
    return this.tools;
  }

  getResources(): MockResource[] {
    return this.resources;
  }
}

// Helper to create a simple echo tool
export function createEchoTool(): MockTool {
  return {
    name: 'echo',
    description: 'Echoes back the input',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to echo' },
      },
      required: ['message'],
    },
  };
}

// Helper to create a file resource
export function createFileResource(path: string, name: string): MockResource {
  return {
    uri: `file://${path}`,
    name,
    description: `File at ${path}`,
    mimeType: 'text/plain',
  };
}
