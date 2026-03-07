import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../src/tools/ToolRegistry.js';
import { DateTimeTool } from '../src/tools/builtin/DateTime.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register a tool', () => {
    const tool = new DateTimeTool();
    registry.register(tool);

    expect(registry.getTool('datetime')).toBe(tool);
  });

  it('should get all functions', () => {
    const tool = new DateTimeTool();
    registry.register(tool);

    const functions = registry.getAllFunctions();
    expect(functions.length).toBeGreaterThan(0);
    expect(functions.some(t => t.name === 'get_current_time')).toBe(true);
  });

  it('should execute a function', async () => {
    const tool = new DateTimeTool();
    registry.register(tool);

    const result = await registry.execute('get_current_time', {});
    expect(result.isError).toBe(false);
    expect(result.result).toBeTruthy();
  });

  it('should return error for unknown function', async () => {
    const result = await registry.execute('unknown_function', {});
    expect(result.isError).toBe(true);
    expect(result.result).toContain('Unknown function');
  });
});

describe('DateTimeTool', () => {
  let tool: DateTimeTool;

  beforeEach(() => {
    tool = new DateTimeTool();
  });

  it('should have required functions', () => {
    const functions = tool.getTools();
    const funcNames = functions.map(t => t.name);

    expect(funcNames).toContain('get_current_time');
    expect(funcNames).toContain('parse_date');
    expect(funcNames).toContain('calculate_date_diff');
  });

  it('should get current time', async () => {
    const result = await tool.execute('get_current_time', {});
    expect(result.isError).toBe(false);
    expect(result.result).toBeTruthy();
  });

  it('should get current time in ISO format', async () => {
    const result = await tool.execute('get_current_time', { format: 'iso' });
    expect(result.isError).toBe(false);
    expect(result.result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should get current time as unix timestamp', async () => {
    const result = await tool.execute('get_current_time', { format: 'unix' });
    expect(result.isError).toBe(false);
    expect(parseInt(result.result)).toBeGreaterThan(0);
  });

  it('should parse a date', async () => {
    const result = await tool.execute('parse_date', {
      dateString: '2024-01-15',
      outputFormat: 'iso'
    });
    expect(result.isError).toBe(false);
    expect(result.result).toContain('2024-01-15');
  });

  it('should return error for invalid date', async () => {
    const result = await tool.execute('parse_date', {
      dateString: 'not a date'
    });
    expect(result.isError).toBe(true);
  });

  it('should calculate date difference', async () => {
    const result = await tool.execute('calculate_date_diff', {
      startDate: '2024-01-01',
      endDate: '2024-01-10',
      unit: 'days'
    });
    expect(result.isError).toBe(false);
    expect(result.result).toBe('9 days');
  });

  it('should calculate date difference in hours', async () => {
    const result = await tool.execute('calculate_date_diff', {
      startDate: '2024-01-01T00:00:00',
      endDate: '2024-01-01T12:00:00',
      unit: 'hours'
    });
    expect(result.isError).toBe(false);
    expect(result.result).toBe('12 hours');
  });
});
