import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../src/skills/SkillRegistry.js';
import { DateTimeSkill } from '../src/skills/builtin/DateTime.js';

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('should register a skill', () => {
    const skill = new DateTimeSkill();
    registry.register(skill);

    expect(registry.getSkill('datetime')).toBe(skill);
  });

  it('should get all tools', () => {
    const skill = new DateTimeSkill();
    registry.register(skill);

    const tools = registry.getAllTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(t => t.name === 'get_current_time')).toBe(true);
  });

  it('should execute a tool', async () => {
    const skill = new DateTimeSkill();
    registry.register(skill);

    const result = await registry.execute('get_current_time', {});
    expect(result.isError).toBe(false);
    expect(result.result).toBeTruthy();
  });

  it('should return error for unknown tool', async () => {
    const result = await registry.execute('unknown_tool', {});
    expect(result.isError).toBe(true);
    expect(result.result).toContain('Unknown tool');
  });
});

describe('DateTimeSkill', () => {
  let skill: DateTimeSkill;

  beforeEach(() => {
    skill = new DateTimeSkill();
  });

  it('should have required tools', () => {
    const tools = skill.getTools();
    const toolNames = tools.map(t => t.name);

    expect(toolNames).toContain('get_current_time');
    expect(toolNames).toContain('parse_date');
    expect(toolNames).toContain('calculate_date_diff');
  });

  it('should get current time', async () => {
    const result = await skill.execute('get_current_time', {});
    expect(result.isError).toBe(false);
    expect(result.result).toBeTruthy();
  });

  it('should get current time in ISO format', async () => {
    const result = await skill.execute('get_current_time', { format: 'iso' });
    expect(result.isError).toBe(false);
    expect(result.result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should get current time as unix timestamp', async () => {
    const result = await skill.execute('get_current_time', { format: 'unix' });
    expect(result.isError).toBe(false);
    expect(parseInt(result.result)).toBeGreaterThan(0);
  });

  it('should parse a date', async () => {
    const result = await skill.execute('parse_date', {
      dateString: '2024-01-15',
      outputFormat: 'iso'
    });
    expect(result.isError).toBe(false);
    expect(result.result).toContain('2024-01-15');
  });

  it('should return error for invalid date', async () => {
    const result = await skill.execute('parse_date', {
      dateString: 'not a date'
    });
    expect(result.isError).toBe(true);
  });

  it('should calculate date difference', async () => {
    const result = await skill.execute('calculate_date_diff', {
      startDate: '2024-01-01',
      endDate: '2024-01-10',
      unit: 'days'
    });
    expect(result.isError).toBe(false);
    expect(result.result).toBe('9 days');
  });

  it('should calculate date difference in hours', async () => {
    const result = await skill.execute('calculate_date_diff', {
      startDate: '2024-01-01T00:00:00',
      endDate: '2024-01-01T12:00:00',
      unit: 'hours'
    });
    expect(result.isError).toBe(false);
    expect(result.result).toBe('12 hours');
  });
});
