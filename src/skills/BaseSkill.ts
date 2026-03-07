import type { Tool } from '../llm/types.js';
import { createLogger } from '../utils/logger.js';
import type { Logger } from 'pino';

export interface ToolResult {
  result: string;
  isError: boolean;
}

export abstract class BaseSkill {
  abstract readonly name: string;
  abstract readonly description: string;
  protected readonly logger: Logger;

  constructor() {
    this.logger = createLogger(this.constructor.name);
  }

  abstract getTools(): Tool[];

  abstract execute(toolName: string, args: unknown): Promise<ToolResult>;

  protected success(result: string): ToolResult {
    return { result, isError: false };
  }

  protected error(message: string): ToolResult {
    return { result: message, isError: true };
  }
}
