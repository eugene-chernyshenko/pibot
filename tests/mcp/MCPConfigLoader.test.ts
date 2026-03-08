import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MCPConfigLoader } from '../../src/mcp/MCPConfigLoader.js';
import { MCPConfigError } from '../../src/mcp/MCPError.js';

describe('MCPConfigLoader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `mcp-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return null when config file does not exist', async () => {
    const loader = new MCPConfigLoader(tempDir);
    const config = await loader.load();
    expect(config).toBeNull();
  });

  it('should load valid config', async () => {
    const configPath = join(tempDir, 'mcp.json');
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          figma: {
            command: 'npx',
            args: ['-y', '@anthropic/mcp-server-figma'],
            env: { FIGMA_API_KEY: '${FIGMA_API_KEY}' },
          },
        },
      })
    );

    const loader = new MCPConfigLoader(tempDir);
    const config = await loader.load();

    expect(config).not.toBeNull();
    expect(config?.mcpServers).toHaveProperty('figma');
    expect(config?.mcpServers.figma.command).toBe('npx');
    expect(config?.mcpServers.figma.args).toEqual(['-y', '@anthropic/mcp-server-figma']);
  });

  it('should throw error for invalid JSON', async () => {
    const configPath = join(tempDir, 'mcp.json');
    await writeFile(configPath, 'not valid json');

    const loader = new MCPConfigLoader(tempDir);
    await expect(loader.load()).rejects.toThrow(MCPConfigError);
  });

  it('should throw error for missing mcpServers', async () => {
    const configPath = join(tempDir, 'mcp.json');
    await writeFile(configPath, JSON.stringify({}));

    const loader = new MCPConfigLoader(tempDir);
    await expect(loader.load()).rejects.toThrow(MCPConfigError);
    await expect(loader.load()).rejects.toThrow('mcpServers');
  });

  it('should throw error for missing command', async () => {
    const configPath = join(tempDir, 'mcp.json');
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          test: { args: ['--test'] },
        },
      })
    );

    const loader = new MCPConfigLoader(tempDir);
    await expect(loader.load()).rejects.toThrow(MCPConfigError);
    await expect(loader.load()).rejects.toThrow('command');
  });

  it('should throw error for non-array args', async () => {
    const configPath = join(tempDir, 'mcp.json');
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          test: { command: 'node', args: '--flag' },
        },
      })
    );

    const loader = new MCPConfigLoader(tempDir);
    await expect(loader.load()).rejects.toThrow(MCPConfigError);
    await expect(loader.load()).rejects.toThrow('args must be an array');
  });

  it('should throw error for non-object env', async () => {
    const configPath = join(tempDir, 'mcp.json');
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          test: { command: 'node', env: 'string' },
        },
      })
    );

    const loader = new MCPConfigLoader(tempDir);
    await expect(loader.load()).rejects.toThrow(MCPConfigError);
    await expect(loader.load()).rejects.toThrow('env must be an object');
  });

  it('should validate multiple servers', async () => {
    const configPath = join(tempDir, 'mcp.json');
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          server1: { command: 'cmd1' },
          server2: { command: 'cmd2', args: ['--flag'] },
          server3: { command: 'cmd3', env: { VAR: 'value' } },
        },
      })
    );

    const loader = new MCPConfigLoader(tempDir);
    const config = await loader.load();

    expect(config?.mcpServers).toHaveProperty('server1');
    expect(config?.mcpServers).toHaveProperty('server2');
    expect(config?.mcpServers).toHaveProperty('server3');
  });

  it('should check if config exists', () => {
    expect(MCPConfigLoader.exists(tempDir)).toBe(false);
  });

  it('should return config path', () => {
    const loader = new MCPConfigLoader(tempDir);
    expect(loader.getConfigPath()).toBe(join(tempDir, 'mcp.json'));
  });
});
