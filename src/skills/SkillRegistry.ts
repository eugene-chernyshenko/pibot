import { createLogger } from '../utils/logger.js';
import type { Tool } from '../llm/types.js';
import type { BaseSkill, ToolResult } from './BaseSkill.js';
import type { ToolExecutor } from '../agent/types.js';

const logger = createLogger('SkillRegistry');

export class SkillRegistry implements ToolExecutor {
  private skills: Map<string, BaseSkill> = new Map();
  private toolToSkill: Map<string, string> = new Map();

  register(skill: BaseSkill): void {
    if (this.skills.has(skill.name)) {
      logger.warn({ skill: skill.name }, 'Skill already registered, replacing');
    }

    this.skills.set(skill.name, skill);

    // Map tools to skill
    for (const tool of skill.getTools()) {
      this.toolToSkill.set(tool.name, skill.name);
    }

    logger.info(
      { skill: skill.name, tools: skill.getTools().map((t) => t.name) },
      'Skill registered'
    );
  }

  unregister(skillName: string): void {
    const skill = this.skills.get(skillName);
    if (skill) {
      for (const tool of skill.getTools()) {
        this.toolToSkill.delete(tool.name);
      }
      this.skills.delete(skillName);
      logger.info({ skill: skillName }, 'Skill unregistered');
    }
  }

  getSkill(name: string): BaseSkill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): BaseSkill[] {
    return Array.from(this.skills.values());
  }

  getAllTools(): Tool[] {
    const tools: Tool[] = [];
    for (const skill of this.skills.values()) {
      tools.push(...skill.getTools());
    }
    return tools;
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const skillName = this.toolToSkill.get(toolName);
    if (!skillName) {
      logger.error({ tool: toolName }, 'Tool not found');
      return { result: `Unknown tool: ${toolName}`, isError: true };
    }

    const skill = this.skills.get(skillName);
    if (!skill) {
      logger.error({ skill: skillName, tool: toolName }, 'Skill not found');
      return { result: `Skill not found for tool: ${toolName}`, isError: true };
    }

    try {
      logger.debug({ skill: skillName, tool: toolName, args }, 'Executing tool');
      const result = await skill.execute(toolName, args);
      logger.debug({ skill: skillName, tool: toolName, isError: result.isError }, 'Tool executed');
      return result;
    } catch (error) {
      logger.error({ error, skill: skillName, tool: toolName }, 'Tool execution failed');
      return { result: `Error: ${(error as Error).message}`, isError: true };
    }
  }
}
