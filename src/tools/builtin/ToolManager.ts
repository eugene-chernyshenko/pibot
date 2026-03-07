import { BaseTool, type ToolResult } from '../BaseTool.js';
import type { Tool } from '../../llm/types.js';
import type { ToolRegistry } from '../ToolRegistry.js';
import type { ToolLoader } from '../ToolLoader.js';

export class ToolManagerTool extends BaseTool {
  readonly name = 'tool_manager';
  readonly description = 'Manage tools: load, unload, list, and reload tools at runtime';

  constructor(
    private registry: ToolRegistry,
    private loader: ToolLoader
  ) {
    super();
  }

  getTools(): Tool[] {
    return [
      {
        name: 'list_tools',
        description: 'List all registered tools and their functions',
        parameters: {
          type: 'object',
          properties: {
            verbose: {
              type: 'boolean',
              description: 'If true, include function details for each tool',
            },
          },
        },
      },
      {
        name: 'load_tool',
        description: 'Load a tool from a file in the tools/ directory',
        parameters: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Filename of the tool to load (e.g., "MyTool.ts")',
            },
          },
          required: ['filename'],
        },
      },
      {
        name: 'unload_tool',
        description: 'Unload a tool by name',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the tool to unload',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'reload_tool',
        description: 'Reload a tool from its file (unload + load)',
        parameters: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Filename of the tool to reload',
            },
          },
          required: ['filename'],
        },
      },
      {
        name: 'reload_all_tools',
        description: 'Reload all tools from the tools/ directory',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_tool_info',
        description: 'Get detailed information about a specific tool',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the tool',
            },
          },
          required: ['name'],
        },
      },
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const params = args as Record<string, unknown>;

    switch (toolName) {
      case 'list_tools':
        return this.listTools(params['verbose'] as boolean);
      case 'load_tool':
        return this.loadTool(params['filename'] as string);
      case 'unload_tool':
        return this.unloadTool(params['name'] as string);
      case 'reload_tool':
        return this.reloadTool(params['filename'] as string);
      case 'reload_all_tools':
        return this.reloadAll();
      case 'get_tool_info':
        return this.getToolInfo(params['name'] as string);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private listTools(verbose: boolean = false): ToolResult {
    const tools = this.registry.getAllTools();

    if (tools.length === 0) {
      return this.success('No tools registered');
    }

    if (verbose) {
      const details = tools.map(tool => {
        const functions = tool.getTools().map(t => `    - ${t.name}: ${t.description}`).join('\n');
        return `**${tool.name}** - ${tool.description}\n  Functions:\n${functions}`;
      }).join('\n\n');

      return this.success(details);
    }

    const list = tools.map(tool => {
      const funcCount = tool.getTools().length;
      return `- ${tool.name}: ${tool.description} (${funcCount} functions)`;
    }).join('\n');

    return this.success(`Registered tools:\n${list}`);
  }

  private async loadTool(filename: string): Promise<ToolResult> {
    if (!filename) {
      return this.error('filename is required');
    }

    // Normalize filename
    if (!filename.endsWith('.ts') && !filename.endsWith('.js')) {
      filename += '.ts';
    }

    const filePath = `tools/${filename}`;

    try {
      const success = await this.loader.loadToolFile(filePath);

      if (success) {
        return this.success(`Tool loaded successfully from ${filePath}`);
      } else {
        return this.error(`Failed to load tool from ${filePath}. Check that the file exists and has valid tool structure.`);
      }
    } catch (error) {
      return this.error(`Error loading tool: ${(error as Error).message}`);
    }
  }

  private async unloadTool(name: string): Promise<ToolResult> {
    if (!name) {
      return this.error('name is required');
    }

    // Prevent unloading core tools
    const coreTools = ['datetime', 'memory', 'filesystem', 'tool_generator', 'tool_manager'];
    if (coreTools.includes(name)) {
      return this.error(`Cannot unload core tool: ${name}`);
    }

    const success = await this.loader.unloadTool(name);

    if (success) {
      return this.success(`Tool "${name}" unloaded successfully`);
    } else {
      return this.error(`Tool "${name}" not found`);
    }
  }

  private async reloadTool(filename: string): Promise<ToolResult> {
    if (!filename) {
      return this.error('filename is required');
    }

    // Normalize filename
    if (!filename.endsWith('.ts') && !filename.endsWith('.js')) {
      filename += '.ts';
    }

    const filePath = `tools/${filename}`;

    try {
      const success = await this.loader.loadToolFile(filePath);

      if (success) {
        return this.success(`Tool reloaded successfully from ${filePath}`);
      } else {
        return this.error(`Failed to reload tool from ${filePath}`);
      }
    } catch (error) {
      return this.error(`Error reloading tool: ${(error as Error).message}`);
    }
  }

  private async reloadAll(): Promise<ToolResult> {
    try {
      const count = await this.loader.loadAll();
      return this.success(`Reloaded ${count} tools from tools/ directory`);
    } catch (error) {
      return this.error(`Error reloading tools: ${(error as Error).message}`);
    }
  }

  private getToolInfo(name: string): ToolResult {
    if (!name) {
      return this.error('name is required');
    }

    const tool = this.registry.getTool(name);

    if (!tool) {
      return this.error(`Tool "${name}" not found`);
    }

    const functions = tool.getTools();
    const funcDetails = functions.map(fn => {
      const params = Object.entries(fn.parameters.properties)
        .map(([pName, pDef]) => {
          const req = fn.parameters.required?.includes(pName) ? ' (required)' : '';
          return `      - ${pName}: ${pDef.type}${req} - ${pDef.description ?? ''}`;
        }).join('\n');

      return `  **${fn.name}**\n    ${fn.description}\n    Parameters:\n${params}`;
    }).join('\n\n');

    return this.success(`
**Tool: ${tool.name}**
Description: ${tool.description}

Functions:
${funcDetails}
`);
  }
}
