/**
 * Loads MCP configuration from mcp.json file
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { MCPConfigError } from './MCPError.js';
import type { MCPConfig, MCPServerConfig } from './types.js';

const logger = createLogger('MCPConfigLoader');

const DEFAULT_CONFIG_FILENAME = 'mcp.json';

export class MCPConfigLoader {
  private configPath: string;

  constructor(basePath: string = process.cwd()) {
    this.configPath = join(basePath, DEFAULT_CONFIG_FILENAME);
  }

  async load(): Promise<MCPConfig | null> {
    if (!existsSync(this.configPath)) {
      logger.debug({ path: this.configPath }, 'MCP config file not found');
      return null;
    }

    logger.info({ path: this.configPath }, 'Loading MCP configuration');

    try {
      const content = await readFile(this.configPath, 'utf-8');
      const config = JSON.parse(content) as unknown;

      this.validate(config);

      const validConfig = config as MCPConfig;
      logger.info(
        { servers: Object.keys(validConfig.mcpServers) },
        'MCP configuration loaded'
      );

      return validConfig;
    } catch (error) {
      if (error instanceof MCPConfigError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new MCPConfigError(`Invalid JSON in ${this.configPath}: ${error.message}`);
      }
      throw new MCPConfigError(`Failed to load ${this.configPath}: ${(error as Error).message}`);
    }
  }

  private validate(config: unknown): asserts config is MCPConfig {
    if (!config || typeof config !== 'object') {
      throw new MCPConfigError('Config must be an object');
    }

    const obj = config as Record<string, unknown>;

    if (!obj.mcpServers || typeof obj.mcpServers !== 'object') {
      throw new MCPConfigError('Config must have "mcpServers" object');
    }

    const servers = obj.mcpServers as Record<string, unknown>;

    for (const [name, serverConfig] of Object.entries(servers)) {
      this.validateServerConfig(name, serverConfig);
    }
  }

  private validateServerConfig(name: string, config: unknown): asserts config is MCPServerConfig {
    if (!config || typeof config !== 'object') {
      throw new MCPConfigError(`Server "${name}" config must be an object`);
    }

    const obj = config as Record<string, unknown>;

    if (typeof obj.command !== 'string' || !obj.command) {
      throw new MCPConfigError(`Server "${name}" must have a "command" string`);
    }

    if (obj.args !== undefined && !Array.isArray(obj.args)) {
      throw new MCPConfigError(`Server "${name}" args must be an array`);
    }

    if (obj.args) {
      for (const arg of obj.args) {
        if (typeof arg !== 'string') {
          throw new MCPConfigError(`Server "${name}" args must be strings`);
        }
      }
    }

    if (obj.env !== undefined && (typeof obj.env !== 'object' || obj.env === null)) {
      throw new MCPConfigError(`Server "${name}" env must be an object`);
    }

    if (obj.env) {
      for (const [key, value] of Object.entries(obj.env as Record<string, unknown>)) {
        if (typeof value !== 'string') {
          throw new MCPConfigError(`Server "${name}" env.${key} must be a string`);
        }
      }
    }

    if (obj.timeout !== undefined && typeof obj.timeout !== 'number') {
      throw new MCPConfigError(`Server "${name}" timeout must be a number`);
    }

    if (obj.retries !== undefined && typeof obj.retries !== 'number') {
      throw new MCPConfigError(`Server "${name}" retries must be a number`);
    }
  }

  getConfigPath(): string {
    return this.configPath;
  }

  static exists(basePath: string = process.cwd()): boolean {
    return existsSync(join(basePath, DEFAULT_CONFIG_FILENAME));
  }
}
