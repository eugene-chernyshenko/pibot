import { BaseTool, type ToolResult } from '../BaseTool.js';
import type { Tool } from '../../llm/types.js';
import { readFile, writeFile, readdir, mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';
import { config } from '../../config/index.js';

export class FileSystemTool extends BaseTool {
  readonly name = 'filesystem';
  readonly description = 'Safe file system operations within allowed directories';

  private allowedDirs: string[];

  constructor() {
    super();
    // Only allow access to tools directory and data directory
    this.allowedDirs = [
      resolve(process.cwd(), 'tools'),
      resolve(config.memory.dataDir),
    ];
  }

  getTools(): Tool[] {
    return [
      {
        name: 'fs_read',
        description: 'Read a file from the tools or data directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file (e.g., "tools/MyTool.ts" or "data/notes.md")',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'fs_write',
        description: 'Write content to a file in the tools or data directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'fs_list',
        description: 'List files in a directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the directory (default: "tools")',
            },
          },
        },
      },
      {
        name: 'fs_delete',
        description: 'Delete a file (use with caution)',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file to delete',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'fs_exists',
        description: 'Check if a file or directory exists',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to check',
            },
          },
          required: ['path'],
        },
      },
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const params = args as Record<string, unknown>;

    switch (toolName) {
      case 'fs_read':
        return this.readFile(params);
      case 'fs_write':
        return this.writeFile(params);
      case 'fs_list':
        return this.listDir(params);
      case 'fs_delete':
        return this.deleteFile(params);
      case 'fs_exists':
        return this.exists(params);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private resolvePath(relativePath: string): string | null {
    const absolutePath = resolve(process.cwd(), relativePath);

    // Check if path is within allowed directories
    const isAllowed = this.allowedDirs.some(dir => {
      const rel = relative(dir, absolutePath);
      return !rel.startsWith('..') && !rel.startsWith('/');
    });

    if (!isAllowed) {
      return null;
    }

    return absolutePath;
  }

  private async readFile(params: Record<string, unknown>): Promise<ToolResult> {
    const path = params['path'] as string;
    if (!path) {
      return this.error('path is required');
    }

    const absolutePath = this.resolvePath(path);
    if (!absolutePath) {
      return this.error(`Access denied: ${path} is outside allowed directories`);
    }

    try {
      const content = await readFile(absolutePath, 'utf-8');
      return this.success(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.error(`File not found: ${path}`);
      }
      return this.error(`Failed to read file: ${(error as Error).message}`);
    }
  }

  private async writeFile(params: Record<string, unknown>): Promise<ToolResult> {
    const path = params['path'] as string;
    const content = params['content'] as string;

    if (!path) {
      return this.error('path is required');
    }
    if (content === undefined) {
      return this.error('content is required');
    }

    const absolutePath = this.resolvePath(path);
    if (!absolutePath) {
      return this.error(`Access denied: ${path} is outside allowed directories`);
    }

    try {
      // Ensure directory exists
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');
      this.logger.info({ path }, 'File written');
      return this.success(`File written successfully: ${path}`);
    } catch (error) {
      return this.error(`Failed to write file: ${(error as Error).message}`);
    }
  }

  private async listDir(params: Record<string, unknown>): Promise<ToolResult> {
    const path = (params['path'] as string) || 'tools';

    const absolutePath = this.resolvePath(path);
    if (!absolutePath) {
      return this.error(`Access denied: ${path} is outside allowed directories`);
    }

    try {
      const entries = await readdir(absolutePath, { withFileTypes: true });
      const result = entries.map(entry => {
        const type = entry.isDirectory() ? '[DIR]' : '[FILE]';
        return `${type} ${entry.name}`;
      }).join('\n');

      return this.success(result || '(empty directory)');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.error(`Directory not found: ${path}`);
      }
      return this.error(`Failed to list directory: ${(error as Error).message}`);
    }
  }

  private async deleteFile(params: Record<string, unknown>): Promise<ToolResult> {
    const path = params['path'] as string;
    if (!path) {
      return this.error('path is required');
    }

    const absolutePath = this.resolvePath(path);
    if (!absolutePath) {
      return this.error(`Access denied: ${path} is outside allowed directories`);
    }

    // Extra safety: don't allow deleting directories
    try {
      const stats = await stat(absolutePath);
      if (stats.isDirectory()) {
        return this.error('Cannot delete directories for safety reasons');
      }
    } catch {
      return this.error(`File not found: ${path}`);
    }

    try {
      await rm(absolutePath);
      this.logger.info({ path }, 'File deleted');
      return this.success(`File deleted: ${path}`);
    } catch (error) {
      return this.error(`Failed to delete file: ${(error as Error).message}`);
    }
  }

  private async exists(params: Record<string, unknown>): Promise<ToolResult> {
    const path = params['path'] as string;
    if (!path) {
      return this.error('path is required');
    }

    const absolutePath = this.resolvePath(path);
    if (!absolutePath) {
      return this.error(`Access denied: ${path} is outside allowed directories`);
    }

    try {
      const stats = await stat(absolutePath);
      const type = stats.isDirectory() ? 'directory' : 'file';
      return this.success(`Exists: ${type}`);
    } catch {
      return this.success('Does not exist');
    }
  }
}
