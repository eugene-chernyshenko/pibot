import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SkillGeneratorSkill } from '../src/skills/builtin/SkillGenerator.js';
import { FileSystemSkill } from '../src/skills/builtin/FileSystem.js';

const TEST_DIR = '/tmp/pibot-test-skills';

describe('SkillGeneratorSkill', () => {
  let skill: SkillGeneratorSkill;

  beforeEach(() => {
    skill = new SkillGeneratorSkill();
  });

  it('should have required tools', () => {
    const tools = skill.getTools();
    const toolNames = tools.map(t => t.name);

    expect(toolNames).toContain('generate_skill');
    expect(toolNames).toContain('get_skill_template');
    expect(toolNames).toContain('validate_skill_code');
  });

  it('should generate a skill template example', async () => {
    const result = await skill.execute('get_skill_template', {});
    expect(result.isError).toBe(false);

    const template = JSON.parse(result.result);
    expect(template.name).toBe('calculator');
    expect(template.className).toBe('CalculatorSkill');
    expect(template.tools).toHaveLength(2);
  });

  it('should generate skill code from definition', async () => {
    const definition = {
      name: 'test_skill',
      className: 'TestSkill',
      description: 'A test skill',
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          parameters: [
            { name: 'input', type: 'string', description: 'Test input', required: true }
          ],
        }
      ]
    };

    const result = await skill.execute('generate_skill', definition);
    expect(result.isError).toBe(false);

    const output = JSON.parse(result.result);
    expect(output.filename).toBe('skills/TestSkill.ts');
    expect(output.code).toContain('class TestSkill extends BaseSkill');
    expect(output.code).toContain("readonly name = 'test_skill'");
    expect(output.code).toContain('test_tool');
    expect(output.code).toContain('export default TestSkill');
  });

  it('should validate correct skill code', async () => {
    const validCode = `
import { BaseSkill, type ToolResult } from '../src/skills/BaseSkill.js';
import type { Tool } from '../src/llm/types.js';

export class ValidSkill extends BaseSkill {
  readonly name = 'valid';
  readonly description = 'A valid skill';

  getTools(): Tool[] {
    return [];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    return this.error('Not implemented');
  }
}

export default ValidSkill;
`;

    const result = await skill.execute('validate_skill_code', { code: validCode });
    expect(result.isError).toBe(false);
    expect(result.result).toContain('Validation passed');
  });

  it('should reject invalid skill code', async () => {
    const invalidCode = `
export class InvalidSkill {
  // Missing BaseSkill extension
  // Missing required properties
}
`;

    const result = await skill.execute('validate_skill_code', { code: invalidCode });
    expect(result.isError).toBe(true);
    expect(result.result).toContain('Missing');
  });

  it('should reject definition without tools', async () => {
    const definition = {
      name: 'empty',
      className: 'EmptySkill',
      description: 'No tools',
      tools: []
    };

    const result = await skill.execute('generate_skill', definition);
    expect(result.isError).toBe(true);
    expect(result.result).toContain('At least one tool');
  });
});

describe('FileSystemSkill', () => {
  let skill: FileSystemSkill;

  beforeEach(async () => {
    skill = new FileSystemSkill();
    await mkdir(TEST_DIR, { recursive: true });

    // Temporarily patch cwd to allow test directory
    const originalCwd = process.cwd;
    process.cwd = () => TEST_DIR;

    // Create a fresh skill instance with patched cwd
    skill = new FileSystemSkill();

    // Restore original
    process.cwd = originalCwd;
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should have required tools', () => {
    const tools = skill.getTools();
    const toolNames = tools.map(t => t.name);

    expect(toolNames).toContain('fs_read');
    expect(toolNames).toContain('fs_write');
    expect(toolNames).toContain('fs_list');
    expect(toolNames).toContain('fs_delete');
    expect(toolNames).toContain('fs_exists');
  });

  it('should deny access outside allowed directories', async () => {
    const result = await skill.execute('fs_read', { path: '/etc/passwd' });
    expect(result.isError).toBe(true);
    expect(result.result).toContain('Access denied');
  });

  it('should deny access to parent directories', async () => {
    const result = await skill.execute('fs_read', { path: '../../../etc/passwd' });
    expect(result.isError).toBe(true);
    expect(result.result).toContain('Access denied');
  });
});
