import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { createLogger } from '../utils/logger.js';
import type { Skill } from './types.js';

const logger = createLogger('SkillLoader');

interface SkillFrontmatter {
  name?: string;
  description?: string;
  requiredTools?: string[];
}

export class SkillLoader {
  private promptsDir: string;
  private skills: Map<string, Skill> = new Map();

  constructor(promptsDir: string = 'prompts') {
    this.promptsDir = resolve(process.cwd(), promptsDir);
  }

  async loadAll(): Promise<number> {
    this.skills.clear();
    let loaded = 0;

    try {
      const files = await readdir(this.promptsDir);

      for (const file of files) {
        if (file.endsWith('.md')) {
          const success = await this.loadSkillFile(join(this.promptsDir, file));
          if (success) loaded++;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info({ dir: this.promptsDir }, 'Prompts directory does not exist yet');
      } else {
        logger.error({ error }, 'Failed to load skills');
      }
    }

    return loaded;
  }

  private async loadSkillFile(filePath: string): Promise<boolean> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const filename = basename(filePath, '.md');

      // Parse frontmatter if present
      const { frontmatter, body } = this.parseFrontmatter(content);

      const skill: Skill = {
        name: frontmatter.name || filename,
        command: `/${filename}`,
        description: frontmatter.description || this.extractDescription(body),
        prompt: body.trim(),
        requiredTools: frontmatter.requiredTools,
      };

      this.skills.set(skill.command, skill);
      logger.info({ skill: skill.name, command: skill.command }, 'Skill loaded');

      return true;
    } catch (error) {
      logger.error({ error, path: filePath }, 'Failed to load skill file');
      return false;
    }
  }

  private parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const frontmatterStr = match[1] ?? '';
    const body = match[2] ?? '';
    const frontmatter: SkillFrontmatter = {};

    // Simple YAML-like parsing
    for (const line of frontmatterStr.split('\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();

        // Handle arrays (simple format: [item1, item2])
        if (value.startsWith('[') && value.endsWith(']')) {
          const items = value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
          (frontmatter as Record<string, unknown>)[key] = items;
        } else {
          // Remove quotes if present
          value = value.replace(/^['"]|['"]$/g, '');
          (frontmatter as Record<string, unknown>)[key] = value;
        }
      }
    }

    return { frontmatter, body };
  }

  private extractDescription(content: string): string {
    // Extract first paragraph or first line as description
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    return lines[0]?.slice(0, 100) || 'No description';
  }

  getSkill(command: string): Skill | undefined {
    // Normalize command
    if (!command.startsWith('/')) {
      command = '/' + command;
    }
    return this.skills.get(command);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  matchCommand(message: string): { skill: Skill; args: string } | null {
    const trimmed = message.trim();

    if (!trimmed.startsWith('/')) {
      return null;
    }

    // Find matching skill
    for (const [command, skill] of this.skills) {
      if (trimmed === command || trimmed.startsWith(command + ' ')) {
        const args = trimmed.slice(command.length).trim();
        return { skill, args };
      }
    }

    return null;
  }

  getHelpText(): string {
    const skills = this.getAllSkills();

    if (skills.length === 0) {
      return 'No skills available.';
    }

    const lines = ['**Available Skills:**', ''];

    for (const skill of skills) {
      lines.push(`\`${skill.command}\` - ${skill.description}`);
    }

    return lines.join('\n');
  }
}
