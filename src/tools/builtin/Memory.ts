import { BaseTool, type ToolResult } from '../BaseTool.js';
import type { Tool } from '../../llm/types.js';
import { readMarkdownFile, writeMarkdownFile, appendToMarkdownFile, formatTimestamp } from '../../utils/markdown.js';
import { config } from '../../config/index.js';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

export class MemoryTool extends BaseTool {
  readonly name = 'memory';
  readonly description = 'Read and write to long-term memory';

  private memoryDir: string;

  constructor() {
    super();
    this.memoryDir = join(config.memory.dataDir, 'memory');
  }

  getTools(): Tool[] {
    return [
      {
        name: 'memory_read',
        description: 'Read from long-term memory. Use to recall stored information.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The memory key/topic to read (e.g., "preferences", "projects", "notes")',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'memory_write',
        description: 'Write to long-term memory. Use to store important information for later recall.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The memory key/topic to write to',
            },
            content: {
              type: 'string',
              description: 'The content to store',
            },
            append: {
              type: 'boolean',
              description: 'If true, append to existing content. If false, replace. Default: false',
            },
          },
          required: ['key', 'content'],
        },
      },
      {
        name: 'memory_list',
        description: 'List all available memory keys',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'memory_search',
        description: 'Search through all memories for a keyword',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const params = args as Record<string, unknown>;

    switch (toolName) {
      case 'memory_read':
        return this.read(params);
      case 'memory_write':
        return this.write(params);
      case 'memory_list':
        return this.list();
      case 'memory_search':
        return this.search(params);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async read(params: Record<string, unknown>): Promise<ToolResult> {
    const key = params['key'] as string;
    if (!key) {
      return this.error('key is required');
    }

    const filePath = this.getFilePath(key);
    const content = await readMarkdownFile(filePath);

    if (content === null) {
      return this.success(`No memory found for key: ${key}`);
    }

    return this.success(content);
  }

  private async write(params: Record<string, unknown>): Promise<ToolResult> {
    const key = params['key'] as string;
    const content = params['content'] as string;
    const append = (params['append'] as boolean) || false;

    if (!key) {
      return this.error('key is required');
    }
    if (!content) {
      return this.error('content is required');
    }

    const filePath = this.getFilePath(key);
    const timestamp = formatTimestamp();
    const formattedContent = `\n\n---\n*Updated: ${timestamp}*\n\n${content}`;

    try {
      if (append) {
        await appendToMarkdownFile(filePath, formattedContent);
      } else {
        await writeMarkdownFile(filePath, `# ${key}\n\n${content}\n\n---\n*Created: ${timestamp}*`);
      }
      return this.success(`Memory "${key}" ${append ? 'updated' : 'saved'} successfully`);
    } catch (error) {
      return this.error(`Failed to write memory: ${(error as Error).message}`);
    }
  }

  private async list(): Promise<ToolResult> {
    try {
      const files = await readdir(this.memoryDir);
      const keys = files
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace('.md', ''));

      if (keys.length === 0) {
        return this.success('No memories stored yet.');
      }

      return this.success(`Available memory keys:\n${keys.map((k) => `- ${k}`).join('\n')}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.success('No memories stored yet.');
      }
      return this.error(`Failed to list memories: ${(error as Error).message}`);
    }
  }

  private async search(params: Record<string, unknown>): Promise<ToolResult> {
    const query = params['query'] as string;
    if (!query) {
      return this.error('query is required');
    }

    try {
      const files = await readdir(this.memoryDir);
      const results: Array<{ key: string; matches: string[] }> = [];
      const queryLower = query.toLowerCase();

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const key = file.replace('.md', '');
        const content = await readMarkdownFile(this.getFilePath(key));

        if (content && content.toLowerCase().includes(queryLower)) {
          // Extract matching lines
          const lines = content.split('\n');
          const matches = lines
            .filter((line) => line.toLowerCase().includes(queryLower))
            .slice(0, 3); // Limit to 3 matches per file

          if (matches.length > 0) {
            results.push({ key, matches });
          }
        }
      }

      if (results.length === 0) {
        return this.success(`No matches found for: ${query}`);
      }

      const output = results
        .map((r) => `**${r.key}**:\n${r.matches.map((m) => `  - ${m.trim()}`).join('\n')}`)
        .join('\n\n');

      return this.success(`Search results for "${query}":\n\n${output}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.success(`No matches found for: ${query}`);
      }
      return this.error(`Failed to search memories: ${(error as Error).message}`);
    }
  }

  private getFilePath(key: string): string {
    // Sanitize key to be filename-safe
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.memoryDir, `${safeKey}.md`);
  }
}
