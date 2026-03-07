import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { ToolGeneratorTool } from '../src/tools/builtin/ToolGenerator.js';
import { FileSystemTool } from '../src/tools/builtin/FileSystem.js';

const TEST_DIR = '/tmp/pibot-test-tools';

describe('ToolGeneratorTool', () => {
  let tool: ToolGeneratorTool;

  beforeEach(() => {
    tool = new ToolGeneratorTool();
  });

  it('should have required functions', () => {
    const functions = tool.getTools();
    const funcNames = functions.map(t => t.name);

    expect(funcNames).toContain('generate_tool');
    expect(funcNames).toContain('get_tool_template');
    expect(funcNames).toContain('validate_tool_code');
  });

  it('should generate a tool template example', async () => {
    const result = await tool.execute('get_tool_template', {});
    expect(result.isError).toBe(false);

    const template = JSON.parse(result.result);
    expect(template.name).toBe('calculator');
    expect(template.className).toBe('CalculatorTool');
    expect(template.functions).toHaveLength(2);
  });

  it('should generate tool code from definition', async () => {
    const definition = {
      name: 'test_tool',
      className: 'TestTool',
      description: 'A test tool',
      functions: [
        {
          name: 'test_function',
          description: 'A test function',
          parameters: [
            { name: 'input', type: 'string', description: 'Test input', required: true }
          ],
        }
      ]
    };

    const result = await tool.execute('generate_tool', definition);
    expect(result.isError).toBe(false);

    const output = JSON.parse(result.result);
    expect(output.filename).toBe('tools/TestTool.ts');
    expect(output.code).toContain('class TestTool extends BaseTool');
    expect(output.code).toContain("readonly name = 'test_tool'");
    expect(output.code).toContain('test_function');
    expect(output.code).toContain('export default TestTool');
  });

  it('should validate correct tool code', async () => {
    const validCode = `
import { BaseTool, type ToolResult } from '../src/tools/BaseTool.js';
import type { Tool } from '../src/llm/types.js';

export class ValidTool extends BaseTool {
  readonly name = 'valid';
  readonly description = 'A valid tool';

  getTools(): Tool[] {
    return [];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    return this.error('Not implemented');
  }
}

export default ValidTool;
`;

    const result = await tool.execute('validate_tool_code', { code: validCode });
    expect(result.isError).toBe(false);
    expect(result.result).toContain('Validation passed');
  });

  it('should reject invalid tool code', async () => {
    const invalidCode = `
export class InvalidTool {
  // Missing BaseTool extension
  // Missing required properties
}
`;

    const result = await tool.execute('validate_tool_code', { code: invalidCode });
    expect(result.isError).toBe(true);
    expect(result.result).toContain('Missing');
  });

  it('should reject definition without functions', async () => {
    const definition = {
      name: 'empty',
      className: 'EmptyTool',
      description: 'No functions',
      functions: []
    };

    const result = await tool.execute('generate_tool', definition);
    expect(result.isError).toBe(true);
    expect(result.result).toContain('At least one function');
  });
});

describe('FileSystemTool', () => {
  let tool: FileSystemTool;

  beforeEach(async () => {
    tool = new FileSystemTool();
    await mkdir(TEST_DIR, { recursive: true });

    // Temporarily patch cwd to allow test directory
    const originalCwd = process.cwd;
    process.cwd = () => TEST_DIR;

    // Create a fresh tool instance with patched cwd
    tool = new FileSystemTool();

    // Restore original
    process.cwd = originalCwd;
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should have required functions', () => {
    const functions = tool.getTools();
    const funcNames = functions.map(t => t.name);

    expect(funcNames).toContain('fs_read');
    expect(funcNames).toContain('fs_write');
    expect(funcNames).toContain('fs_list');
    expect(funcNames).toContain('fs_delete');
    expect(funcNames).toContain('fs_exists');
  });

  it('should deny access outside allowed directories', async () => {
    const result = await tool.execute('fs_read', { path: '/etc/passwd' });
    expect(result.isError).toBe(true);
    expect(result.result).toContain('Access denied');
  });

  it('should deny access to parent directories', async () => {
    const result = await tool.execute('fs_read', { path: '../../../etc/passwd' });
    expect(result.isError).toBe(true);
    expect(result.result).toContain('Access denied');
  });
});
