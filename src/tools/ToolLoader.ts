import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLogger } from '../utils/logger.js';
import type { BaseTool } from './BaseTool.js';
import type { ToolRegistry } from './ToolRegistry.js';

const logger = createLogger('ToolLoader');

export class ToolLoader {
  private toolsDir: string;
  private loadedFiles: Set<string> = new Set();
  private watchInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private registry: ToolRegistry, toolsDir: string = 'tools') {
    this.toolsDir = resolve(process.cwd(), toolsDir);
  }

  async loadAll(): Promise<number> {
    let loaded = 0;

    try {
      const files = await readdir(this.toolsDir);

      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const success = await this.loadToolFile(join(this.toolsDir, file));
          if (success) loaded++;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info({ dir: this.toolsDir }, 'Tools directory does not exist yet');
      } else {
        logger.error({ error }, 'Failed to load tools');
      }
    }

    return loaded;
  }

  async loadToolFile(filePath: string): Promise<boolean> {
    const absolutePath = resolve(filePath);

    try {
      // Check if file exists
      await stat(absolutePath);

      // Use timestamp to bust cache
      const fileUrl = pathToFileURL(absolutePath).href + `?t=${Date.now()}`;

      logger.debug({ path: absolutePath }, 'Loading tool file');

      // Dynamic import
      const module = await import(fileUrl);

      // Get the default export or the first class that extends BaseTool
      const ToolClass = module.default || Object.values(module).find(
        (exp: unknown) => typeof exp === 'function' && exp.prototype?.getTools
      );

      if (!ToolClass) {
        logger.warn({ path: absolutePath }, 'No tool class found in file');
        return false;
      }

      // Instantiate and register
      const instance = new (ToolClass as new () => BaseTool)();

      // Validate it's a proper tool
      if (!instance.name || !instance.getTools || !instance.execute) {
        logger.warn({ path: absolutePath }, 'Invalid tool: missing required properties');
        return false;
      }

      // Unregister existing tool with same name (for hot-reload)
      if (this.registry.getTool(instance.name)) {
        this.registry.unregister(instance.name);
        logger.info({ tool: instance.name }, 'Unregistered existing tool for reload');
      }

      this.registry.register(instance);
      this.loadedFiles.add(absolutePath);

      logger.info({ tool: instance.name, path: absolutePath }, 'Tool loaded successfully');
      return true;
    } catch (error) {
      logger.error({ error, path: absolutePath }, 'Failed to load tool file');
      return false;
    }
  }

  async unloadTool(toolName: string): Promise<boolean> {
    const tool = this.registry.getTool(toolName);
    if (!tool) {
      return false;
    }

    this.registry.unregister(toolName);
    logger.info({ tool: toolName }, 'Tool unloaded');
    return true;
  }

  startWatching(intervalMs: number = 5000): void {
    if (this.watchInterval) {
      return;
    }

    logger.info({ interval: intervalMs }, 'Starting tool file watcher');

    this.watchInterval = setInterval(async () => {
      await this.checkForNewTools();
    }, intervalMs);
  }

  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
      logger.info('Stopped tool file watcher');
    }
  }

  private async checkForNewTools(): Promise<void> {
    try {
      const files = await readdir(this.toolsDir);

      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const absolutePath = join(this.toolsDir, file);

          if (!this.loadedFiles.has(absolutePath)) {
            logger.info({ file }, 'New tool file detected');
            await this.loadToolFile(absolutePath);
          }
        }
      }
    } catch (error) {
      // Ignore ENOENT - directory might not exist yet
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error({ error }, 'Error checking for new tools');
      }
    }
  }

  getLoadedFiles(): string[] {
    return Array.from(this.loadedFiles);
  }
}
