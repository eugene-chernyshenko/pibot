import { BaseSkill, type ToolResult } from '../BaseSkill.js';
import type { Tool } from '../../llm/types.js';
import type { SkillRegistry } from '../SkillRegistry.js';
import type { SkillLoader } from '../SkillLoader.js';

export class SkillManagerSkill extends BaseSkill {
  readonly name = 'skill_manager';
  readonly description = 'Manage skills: load, unload, list, and reload skills at runtime';

  constructor(
    private registry: SkillRegistry,
    private loader: SkillLoader
  ) {
    super();
  }

  getTools(): Tool[] {
    return [
      {
        name: 'list_skills',
        description: 'List all registered skills and their tools',
        parameters: {
          type: 'object',
          properties: {
            verbose: {
              type: 'boolean',
              description: 'If true, include tool details for each skill',
            },
          },
        },
      },
      {
        name: 'load_skill',
        description: 'Load a skill from a file in the skills/ directory',
        parameters: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Filename of the skill to load (e.g., "MySkill.ts")',
            },
          },
          required: ['filename'],
        },
      },
      {
        name: 'unload_skill',
        description: 'Unload a skill by name',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill to unload',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'reload_skill',
        description: 'Reload a skill from its file (unload + load)',
        parameters: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Filename of the skill to reload',
            },
          },
          required: ['filename'],
        },
      },
      {
        name: 'reload_all_skills',
        description: 'Reload all skills from the skills/ directory',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_skill_info',
        description: 'Get detailed information about a specific skill',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill',
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
      case 'list_skills':
        return this.listSkills(params['verbose'] as boolean);
      case 'load_skill':
        return this.loadSkill(params['filename'] as string);
      case 'unload_skill':
        return this.unloadSkill(params['name'] as string);
      case 'reload_skill':
        return this.reloadSkill(params['filename'] as string);
      case 'reload_all_skills':
        return this.reloadAll();
      case 'get_skill_info':
        return this.getSkillInfo(params['name'] as string);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private listSkills(verbose: boolean = false): ToolResult {
    const skills = this.registry.getAllSkills();

    if (skills.length === 0) {
      return this.success('No skills registered');
    }

    if (verbose) {
      const details = skills.map(skill => {
        const tools = skill.getTools().map(t => `    - ${t.name}: ${t.description}`).join('\n');
        return `**${skill.name}** - ${skill.description}\n  Tools:\n${tools}`;
      }).join('\n\n');

      return this.success(details);
    }

    const list = skills.map(skill => {
      const toolCount = skill.getTools().length;
      return `- ${skill.name}: ${skill.description} (${toolCount} tools)`;
    }).join('\n');

    return this.success(`Registered skills:\n${list}`);
  }

  private async loadSkill(filename: string): Promise<ToolResult> {
    if (!filename) {
      return this.error('filename is required');
    }

    // Normalize filename
    if (!filename.endsWith('.ts') && !filename.endsWith('.js')) {
      filename += '.ts';
    }

    const filePath = `skills/${filename}`;

    try {
      const success = await this.loader.loadSkillFile(filePath);

      if (success) {
        return this.success(`Skill loaded successfully from ${filePath}`);
      } else {
        return this.error(`Failed to load skill from ${filePath}. Check that the file exists and has valid skill structure.`);
      }
    } catch (error) {
      return this.error(`Error loading skill: ${(error as Error).message}`);
    }
  }

  private async unloadSkill(name: string): Promise<ToolResult> {
    if (!name) {
      return this.error('name is required');
    }

    // Prevent unloading core skills
    const coreSkills = ['datetime', 'memory', 'filesystem', 'skill_generator', 'skill_manager'];
    if (coreSkills.includes(name)) {
      return this.error(`Cannot unload core skill: ${name}`);
    }

    const success = await this.loader.unloadSkill(name);

    if (success) {
      return this.success(`Skill "${name}" unloaded successfully`);
    } else {
      return this.error(`Skill "${name}" not found`);
    }
  }

  private async reloadSkill(filename: string): Promise<ToolResult> {
    if (!filename) {
      return this.error('filename is required');
    }

    // Normalize filename
    if (!filename.endsWith('.ts') && !filename.endsWith('.js')) {
      filename += '.ts';
    }

    const filePath = `skills/${filename}`;

    try {
      const success = await this.loader.loadSkillFile(filePath);

      if (success) {
        return this.success(`Skill reloaded successfully from ${filePath}`);
      } else {
        return this.error(`Failed to reload skill from ${filePath}`);
      }
    } catch (error) {
      return this.error(`Error reloading skill: ${(error as Error).message}`);
    }
  }

  private async reloadAll(): Promise<ToolResult> {
    try {
      const count = await this.loader.loadAll();
      return this.success(`Reloaded ${count} skills from skills/ directory`);
    } catch (error) {
      return this.error(`Error reloading skills: ${(error as Error).message}`);
    }
  }

  private getSkillInfo(name: string): ToolResult {
    if (!name) {
      return this.error('name is required');
    }

    const skill = this.registry.getSkill(name);

    if (!skill) {
      return this.error(`Skill "${name}" not found`);
    }

    const tools = skill.getTools();
    const toolDetails = tools.map(tool => {
      const params = Object.entries(tool.parameters.properties)
        .map(([pName, pDef]) => {
          const req = tool.parameters.required?.includes(pName) ? ' (required)' : '';
          return `      - ${pName}: ${pDef.type}${req} - ${pDef.description ?? ''}`;
        }).join('\n');

      return `  **${tool.name}**\n    ${tool.description}\n    Parameters:\n${params}`;
    }).join('\n\n');

    return this.success(`
**Skill: ${skill.name}**
Description: ${skill.description}

Tools:
${toolDetails}
`);
  }
}
