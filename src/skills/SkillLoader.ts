import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLogger } from '../utils/logger.js';
import type { BaseSkill } from './BaseSkill.js';
import type { SkillRegistry } from './SkillRegistry.js';

const logger = createLogger('SkillLoader');

export class SkillLoader {
  private skillsDir: string;
  private loadedFiles: Set<string> = new Set();
  private watchInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private registry: SkillRegistry, skillsDir: string = 'skills') {
    this.skillsDir = resolve(process.cwd(), skillsDir);
  }

  async loadAll(): Promise<number> {
    let loaded = 0;

    try {
      const files = await readdir(this.skillsDir);

      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const success = await this.loadSkillFile(join(this.skillsDir, file));
          if (success) loaded++;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info({ dir: this.skillsDir }, 'Skills directory does not exist yet');
      } else {
        logger.error({ error }, 'Failed to load skills');
      }
    }

    return loaded;
  }

  async loadSkillFile(filePath: string): Promise<boolean> {
    const absolutePath = resolve(filePath);

    try {
      // Check if file exists
      await stat(absolutePath);

      // Use timestamp to bust cache
      const fileUrl = pathToFileURL(absolutePath).href + `?t=${Date.now()}`;

      logger.debug({ path: absolutePath }, 'Loading skill file');

      // Dynamic import
      const module = await import(fileUrl);

      // Get the default export or the first class that extends BaseSkill
      const SkillClass = module.default || Object.values(module).find(
        (exp: unknown) => typeof exp === 'function' && exp.prototype?.getTools
      );

      if (!SkillClass) {
        logger.warn({ path: absolutePath }, 'No skill class found in file');
        return false;
      }

      // Instantiate and register
      const instance = new (SkillClass as new () => BaseSkill)();

      // Validate it's a proper skill
      if (!instance.name || !instance.getTools || !instance.execute) {
        logger.warn({ path: absolutePath }, 'Invalid skill: missing required properties');
        return false;
      }

      // Unregister existing skill with same name (for hot-reload)
      if (this.registry.getSkill(instance.name)) {
        this.registry.unregister(instance.name);
        logger.info({ skill: instance.name }, 'Unregistered existing skill for reload');
      }

      this.registry.register(instance);
      this.loadedFiles.add(absolutePath);

      logger.info({ skill: instance.name, path: absolutePath }, 'Skill loaded successfully');
      return true;
    } catch (error) {
      logger.error({ error, path: absolutePath }, 'Failed to load skill file');
      return false;
    }
  }

  async unloadSkill(skillName: string): Promise<boolean> {
    const skill = this.registry.getSkill(skillName);
    if (!skill) {
      return false;
    }

    this.registry.unregister(skillName);
    logger.info({ skill: skillName }, 'Skill unloaded');
    return true;
  }

  startWatching(intervalMs: number = 5000): void {
    if (this.watchInterval) {
      return;
    }

    logger.info({ interval: intervalMs }, 'Starting skill file watcher');

    this.watchInterval = setInterval(async () => {
      await this.checkForNewSkills();
    }, intervalMs);
  }

  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
      logger.info('Stopped skill file watcher');
    }
  }

  private async checkForNewSkills(): Promise<void> {
    try {
      const files = await readdir(this.skillsDir);

      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const absolutePath = join(this.skillsDir, file);

          if (!this.loadedFiles.has(absolutePath)) {
            logger.info({ file }, 'New skill file detected');
            await this.loadSkillFile(absolutePath);
          }
        }
      }
    } catch (error) {
      // Ignore ENOENT - directory might not exist yet
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error({ error }, 'Error checking for new skills');
      }
    }
  }

  getLoadedFiles(): string[] {
    return Array.from(this.loadedFiles);
  }
}
