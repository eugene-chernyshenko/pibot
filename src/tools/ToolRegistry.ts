import { createLogger } from '../utils/logger.js';
import type { Tool } from '../llm/types.js';
import type { BaseTool, ToolResult } from './BaseTool.js';
import type { ToolExecutor } from '../agent/types.js';

const logger = createLogger('ToolRegistry');

export class ToolRegistry implements ToolExecutor {
  private tools: Map<string, BaseTool> = new Map();
  private functionToTool: Map<string, string> = new Map();

  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      logger.warn({ tool: tool.name }, 'Tool already registered, replacing');
    }

    this.tools.set(tool.name, tool);

    // Map function names to tool
    for (const fn of tool.getTools()) {
      this.functionToTool.set(fn.name, tool.name);
    }

    logger.info(
      { tool: tool.name, functions: tool.getTools().map((t) => t.name) },
      'Tool registered'
    );
  }

  unregister(toolName: string): void {
    const tool = this.tools.get(toolName);
    if (tool) {
      for (const fn of tool.getTools()) {
        this.functionToTool.delete(fn.name);
      }
      this.tools.delete(toolName);
      logger.info({ tool: toolName }, 'Tool unregistered');
    }
  }

  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  getAllFunctions(): Tool[] {
    const functions: Tool[] = [];
    for (const tool of this.tools.values()) {
      functions.push(...tool.getTools());
    }
    return functions;
  }

  async execute(functionName: string, args: unknown): Promise<ToolResult> {
    const toolName = this.functionToTool.get(functionName);
    if (!toolName) {
      logger.error({ function: functionName }, 'Function not found');
      return { result: `Unknown function: ${functionName}`, isError: true };
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      logger.error({ tool: toolName, function: functionName }, 'Tool not found');
      return { result: `Tool not found for function: ${functionName}`, isError: true };
    }

    try {
      logger.debug({ tool: toolName, function: functionName, args }, 'Executing function');
      const result = await tool.execute(functionName, args);
      logger.debug({ tool: toolName, function: functionName, isError: result.isError }, 'Function executed');
      return result;
    } catch (error) {
      logger.error({ error, tool: toolName, function: functionName }, 'Function execution failed');
      return { result: `Error: ${(error as Error).message}`, isError: true };
    }
  }
}
