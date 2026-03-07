import { SkillRegistry } from './SkillRegistry.js';
import type { ToolResult } from './BaseSkill.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ToolRunner');

export class ToolRunner {
  constructor(private registry: SkillRegistry) {}

  async run(toolName: string, args: unknown): Promise<ToolResult> {
    logger.debug({ tool: toolName, args }, 'Running tool');

    try {
      const result = await this.registry.execute(toolName, args);
      return result;
    } catch (error) {
      logger.error({ error, tool: toolName }, 'Tool execution error');
      return {
        result: `Tool execution failed: ${(error as Error).message}`,
        isError: true,
      };
    }
  }

  async runMultiple(
    calls: Array<{ toolName: string; args: unknown }>
  ): Promise<ToolResult[]> {
    const results = await Promise.all(
      calls.map(({ toolName, args }) => this.run(toolName, args))
    );
    return results;
  }
}
