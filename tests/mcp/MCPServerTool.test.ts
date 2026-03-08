import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPServerTool } from '../../src/mcp/MCPServerTool.js';
import type { MCPServerConnection } from '../../src/mcp/MCPServerConnection.js';
import type { MCPToolDefinition, MCPResource, MCPToolCallResult } from '../../src/mcp/types.js';

// Mock MCPServerConnection
function createMockConnection(
  serverName: string,
  tools: MCPToolDefinition[] = [],
  resources: MCPResource[] = []
): MCPServerConnection {
  return {
    serverName,
    getTools: vi.fn(() => tools),
    getResources: vi.fn(() => resources),
    hasResources: resources.length > 0,
    callTool: vi.fn(),
    readResource: vi.fn(),
  } as unknown as MCPServerConnection;
}

describe('MCPServerTool', () => {
  describe('getTools', () => {
    it('should convert MCP tools to Tool format', () => {
      const mcpTools: MCPToolDefinition[] = [
        {
          name: 'get_screenshot',
          description: 'Takes a screenshot',
          inputSchema: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: 'Node ID' },
              scale: { type: 'number', description: 'Scale factor' },
            },
            required: ['nodeId'],
          },
        },
      ];

      const connection = createMockConnection('figma', mcpTools);
      const serverTool = new MCPServerTool(connection, 'mcp__figma__');

      const tools = serverTool.getTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('mcp__figma__get_screenshot');
      expect(tools[0].description).toBe('Takes a screenshot');
      expect(tools[0].parameters.properties).toHaveProperty('nodeId');
      expect(tools[0].parameters.properties).toHaveProperty('scale');
      expect(tools[0].parameters.required).toEqual(['nodeId']);
    });

    it('should add resource tools when server has resources', () => {
      const resources: MCPResource[] = [
        { uri: 'file:///test.txt', name: 'test.txt' },
      ];

      const connection = createMockConnection('filesystem', [], resources);
      const serverTool = new MCPServerTool(connection, 'mcp__filesystem__');

      const tools = serverTool.getTools();

      expect(tools).toHaveLength(2);
      expect(tools.some((t) => t.name === 'mcp__filesystem__list_resources')).toBe(true);
      expect(tools.some((t) => t.name === 'mcp__filesystem__read_resource')).toBe(true);
    });

    it('should not add resource tools when server has no resources', () => {
      const connection = createMockConnection('simple', [], []);
      const serverTool = new MCPServerTool(connection, 'mcp__simple__');

      const tools = serverTool.getTools();

      expect(tools).toHaveLength(0);
    });

    it('should handle nested properties', () => {
      const mcpTools: MCPToolDefinition[] = [
        {
          name: 'complex_tool',
          description: 'A complex tool',
          inputSchema: {
            type: 'object',
            properties: {
              config: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  options: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      ];

      const connection = createMockConnection('complex', mcpTools);
      const serverTool = new MCPServerTool(connection, 'mcp__complex__');

      const tools = serverTool.getTools();
      const configProp = tools[0].parameters.properties.config;

      expect(configProp.type).toBe('object');
      expect(configProp.properties).toHaveProperty('enabled');
      expect(configProp.properties).toHaveProperty('options');
    });
  });

  describe('execute', () => {
    it('should call MCP tool and return success', async () => {
      const mcpTools: MCPToolDefinition[] = [
        {
          name: 'echo',
          description: 'Echo tool',
          inputSchema: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      ];

      const mockResult: MCPToolCallResult = {
        content: [{ type: 'text', text: 'Hello World' }],
        isError: false,
      };

      const connection = createMockConnection('test', mcpTools);
      (connection.callTool as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const serverTool = new MCPServerTool(connection, 'mcp__test__');
      const result = await serverTool.execute('mcp__test__echo', { message: 'Hello' });

      expect(result.isError).toBe(false);
      expect(result.result).toBe('Hello World');
      expect(connection.callTool).toHaveBeenCalledWith('echo', { message: 'Hello' });
    });

    it('should return error when MCP tool returns error', async () => {
      const mcpTools: MCPToolDefinition[] = [
        {
          name: 'failing',
          description: 'Failing tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const mockResult: MCPToolCallResult = {
        content: [{ type: 'text', text: 'Tool failed' }],
        isError: true,
      };

      const connection = createMockConnection('test', mcpTools);
      (connection.callTool as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const serverTool = new MCPServerTool(connection, 'mcp__test__');
      const result = await serverTool.execute('mcp__test__failing', {});

      expect(result.isError).toBe(true);
      expect(result.result).toContain('Tool failed');
    });

    it('should handle tool execution exception', async () => {
      const mcpTools: MCPToolDefinition[] = [
        {
          name: 'throws',
          description: 'Throws exception',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const connection = createMockConnection('test', mcpTools);
      (connection.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection lost')
      );

      const serverTool = new MCPServerTool(connection, 'mcp__test__');
      const result = await serverTool.execute('mcp__test__throws', {});

      expect(result.isError).toBe(true);
      expect(result.result).toContain('Connection lost');
    });

    it('should return error for unknown tool', async () => {
      const connection = createMockConnection('test', []);
      const serverTool = new MCPServerTool(connection, 'mcp__test__');

      const result = await serverTool.execute('mcp__test__unknown', {});

      expect(result.isError).toBe(true);
      expect(result.result).toContain('Unknown tool');
    });

    it('should handle list_resources synthetic tool', async () => {
      const resources: MCPResource[] = [
        { uri: 'file:///a.txt', name: 'a.txt', description: 'File A' },
        { uri: 'file:///b.txt', name: 'b.txt', mimeType: 'text/plain' },
      ];

      const connection = createMockConnection('fs', [], resources);
      const serverTool = new MCPServerTool(connection, 'mcp__fs__');

      const result = await serverTool.execute('mcp__fs__list_resources', {});

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.result);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].uri).toBe('file:///a.txt');
    });

    it('should handle read_resource synthetic tool', async () => {
      const resources: MCPResource[] = [
        { uri: 'file:///test.txt', name: 'test.txt' },
      ];

      const connection = createMockConnection('fs', [], resources);
      (connection.readResource as ReturnType<typeof vi.fn>).mockResolvedValue([
        { uri: 'file:///test.txt', text: 'File contents here' },
      ]);

      const serverTool = new MCPServerTool(connection, 'mcp__fs__');
      const result = await serverTool.execute('mcp__fs__read_resource', {
        uri: 'file:///test.txt',
      });

      expect(result.isError).toBe(false);
      expect(result.result).toBe('File contents here');
    });

    it('should parse string args as JSON', async () => {
      const mcpTools: MCPToolDefinition[] = [
        {
          name: 'json_tool',
          description: 'Tool with JSON args',
          inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
        },
      ];

      const mockResult: MCPToolCallResult = {
        content: [{ type: 'text', text: 'OK' }],
        isError: false,
      };

      const connection = createMockConnection('test', mcpTools);
      (connection.callTool as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const serverTool = new MCPServerTool(connection, 'mcp__test__');
      await serverTool.execute('mcp__test__json_tool', '{"data":"value"}');

      expect(connection.callTool).toHaveBeenCalledWith('json_tool', { data: 'value' });
    });

    it('should format image content type', async () => {
      const mcpTools: MCPToolDefinition[] = [
        {
          name: 'image_tool',
          description: 'Returns image',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const mockResult: MCPToolCallResult = {
        content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
        isError: false,
      };

      const connection = createMockConnection('test', mcpTools);
      (connection.callTool as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const serverTool = new MCPServerTool(connection, 'mcp__test__');
      const result = await serverTool.execute('mcp__test__image_tool', {});

      expect(result.isError).toBe(false);
      expect(result.result).toContain('[Image: image/png]');
    });
  });

  describe('properties', () => {
    it('should have correct name', () => {
      const connection = createMockConnection('figma', []);
      const serverTool = new MCPServerTool(connection, 'mcp__figma__');

      expect(serverTool.name).toBe('mcp_figma');
    });

    it('should have correct description', () => {
      const connection = createMockConnection('figma', []);
      const serverTool = new MCPServerTool(connection, 'mcp__figma__');

      expect(serverTool.description).toContain('figma');
    });
  });
});
