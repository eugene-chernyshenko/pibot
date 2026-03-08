/**
 * BaseTool adapter for MCP server tools
 * Exposes MCP tools as regular tools in the ToolRegistry
 */

import { BaseTool, type ToolResult } from '../tools/BaseTool.js';
import type { Tool, ToolParameter } from '../llm/types.js';
import type { MCPServerConnection } from './MCPServerConnection.js';
import type { MCPToolDefinition, MCPToolProperty, MCPToolContent } from './types.js';

export class MCPServerTool extends BaseTool {
  readonly name: string;
  readonly description: string;

  constructor(
    private readonly connection: MCPServerConnection,
    private readonly toolPrefix: string
  ) {
    super();
    this.name = `mcp_${connection.serverName}`;
    this.description = `MCP tools from ${connection.serverName} server`;
  }

  getTools(): Tool[] {
    const tools: Tool[] = [];

    // Convert MCP tools to our Tool format
    for (const mcpTool of this.connection.getTools()) {
      tools.push(this.convertMCPTool(mcpTool));
    }

    // If server has resources, add synthetic resource tools
    if (this.connection.hasResources) {
      tools.push(this.createListResourcesTool());
      tools.push(this.createReadResourceTool());
    }

    return tools;
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;

    // Handle synthetic resource tools
    if (toolName === `${this.toolPrefix}list_resources`) {
      return this.executeListResources();
    }

    if (toolName === `${this.toolPrefix}read_resource`) {
      return this.executeReadResource(parsedArgs as { uri: string });
    }

    // Handle regular MCP tools
    const mcpToolName = this.extractMCPToolName(toolName);
    if (!mcpToolName) {
      return this.error(`Unknown tool: ${toolName}`);
    }

    try {
      const result = await this.connection.callTool(
        mcpToolName,
        parsedArgs as Record<string, unknown>
      );

      // Format the result content
      const formattedContent = this.formatToolContent(result.content);

      if (result.isError) {
        return this.error(formattedContent);
      }

      return this.success(formattedContent);
    } catch (error) {
      this.logger.error({ error, toolName, args }, 'MCP tool execution failed');
      return this.error(`Tool execution failed: ${(error as Error).message}`);
    }
  }

  private convertMCPTool(mcpTool: MCPToolDefinition): Tool {
    const prefixedName = `${this.toolPrefix}${mcpTool.name}`;

    const tool: Tool = {
      name: prefixedName,
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      parameters: {
        type: 'object',
        properties: this.convertProperties(mcpTool.inputSchema.properties || {}),
      },
    };

    if (mcpTool.inputSchema.required) {
      tool.parameters.required = mcpTool.inputSchema.required;
    }

    return tool;
  }

  private convertProperties(
    props: Record<string, MCPToolProperty>
  ): Record<string, ToolParameter> {
    const converted: Record<string, ToolParameter> = {};

    for (const [name, prop] of Object.entries(props)) {
      converted[name] = this.convertProperty(prop);
    }

    return converted;
  }

  private convertProperty(prop: MCPToolProperty): ToolParameter {
    const converted: ToolParameter = {
      type: prop.type,
      description: prop.description,
    };

    if (prop.enum) {
      converted.enum = prop.enum;
    }

    if (prop.items) {
      converted.items = this.convertProperty(prop.items);
    }

    if (prop.properties) {
      converted.properties = this.convertProperties(prop.properties);
    }

    if (prop.required) {
      converted.required = prop.required;
    }

    return converted;
  }

  private createListResourcesTool(): Tool {
    return {
      name: `${this.toolPrefix}list_resources`,
      description: `List available resources from ${this.connection.serverName} MCP server`,
      parameters: {
        type: 'object',
        properties: {},
      },
    };
  }

  private createReadResourceTool(): Tool {
    return {
      name: `${this.toolPrefix}read_resource`,
      description: `Read a resource from ${this.connection.serverName} MCP server`,
      parameters: {
        type: 'object',
        properties: {
          uri: {
            type: 'string',
            description: 'The URI of the resource to read',
          },
        },
        required: ['uri'],
      },
    };
  }

  private async executeListResources(): Promise<ToolResult> {
    try {
      const resources = this.connection.getResources();
      const formatted = resources.map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      }));
      return this.success(JSON.stringify(formatted, null, 2));
    } catch (error) {
      return this.error(`Failed to list resources: ${(error as Error).message}`);
    }
  }

  private async executeReadResource(args: { uri: string }): Promise<ToolResult> {
    try {
      const contents = await this.connection.readResource(args.uri);

      // Format contents
      const formatted = contents.map((c) => {
        if (c.text) {
          return c.text;
        }
        if (c.blob) {
          return `[Binary data: ${c.mimeType || 'unknown type'}]`;
        }
        return JSON.stringify(c);
      });

      return this.success(formatted.join('\n'));
    } catch (error) {
      return this.error(`Failed to read resource: ${(error as Error).message}`);
    }
  }

  private extractMCPToolName(prefixedName: string): string | null {
    if (!prefixedName.startsWith(this.toolPrefix)) {
      return null;
    }
    return prefixedName.slice(this.toolPrefix.length);
  }

  private formatToolContent(content: MCPToolContent[]): string {
    const parts: string[] = [];

    for (const item of content) {
      switch (item.type) {
        case 'text':
          if (item.text) {
            parts.push(item.text);
          }
          break;

        case 'image':
          if (item.data) {
            parts.push(`[Image: ${item.mimeType || 'image'}]`);
          }
          break;

        case 'resource':
          if (item.resource) {
            if (item.resource.text) {
              parts.push(item.resource.text);
            } else if (item.resource.blob) {
              parts.push(`[Resource: ${item.resource.uri}]`);
            }
          }
          break;

        default:
          parts.push(JSON.stringify(item));
      }
    }

    return parts.join('\n');
  }
}
