import { join } from 'node:path';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { readMarkdownFile, writeMarkdownFile, formatTimestamp } from '../utils/markdown.js';

const logger = createLogger('KnowledgeBase');

const DEFAULT_MEMORY_CONTENT = `# PiBot Memory

This file stores distilled knowledge and important information.

## User Preferences

(No preferences recorded yet)

## Important Notes

(No notes recorded yet)

---
*Last updated: ${formatTimestamp()}*
`;

export class KnowledgeBase {
  private memoryFile: string;
  private content: string | null = null;

  constructor() {
    this.memoryFile = join(config.memory.dataDir, 'MEMORY.md');
  }

  async initialize(): Promise<void> {
    this.content = await readMarkdownFile(this.memoryFile);

    if (this.content === null) {
      await this.createDefaultMemory();
    }

    logger.info({ file: this.memoryFile }, 'Knowledge base initialized');
  }

  async get(): Promise<string> {
    if (this.content === null) {
      this.content = await readMarkdownFile(this.memoryFile);
      if (this.content === null) {
        await this.createDefaultMemory();
      }
    }
    return this.content!;
  }

  async update(newContent: string): Promise<void> {
    this.content = newContent;
    await writeMarkdownFile(this.memoryFile, newContent);
    logger.info('Knowledge base updated');
  }

  async appendSection(section: string, content: string): Promise<void> {
    const current = await this.get();

    const sectionHeader = `## ${section}`;
    const sectionIndex = current.indexOf(sectionHeader);

    let newContent: string;

    if (sectionIndex === -1) {
      // Add new section before the footer
      const footerIndex = current.lastIndexOf('---');
      if (footerIndex !== -1) {
        newContent =
          current.slice(0, footerIndex) +
          `\n${sectionHeader}\n\n${content}\n\n` +
          current.slice(footerIndex);
      } else {
        newContent = current + `\n\n${sectionHeader}\n\n${content}`;
      }
    } else {
      // Find the end of the section (next ## or ---)
      let sectionEnd = current.indexOf('\n## ', sectionIndex + 1);
      if (sectionEnd === -1) {
        sectionEnd = current.indexOf('\n---', sectionIndex);
      }
      if (sectionEnd === -1) {
        sectionEnd = current.length;
      }

      // Append to existing section
      newContent =
        current.slice(0, sectionEnd) +
        `\n\n${content}` +
        current.slice(sectionEnd);
    }

    // Update footer timestamp
    const footerRegex = /\*Last updated: [^*]+\*/;
    newContent = newContent.replace(
      footerRegex,
      `*Last updated: ${formatTimestamp()}*`
    );

    await this.update(newContent);
  }

  async search(query: string): Promise<string[]> {
    const content = await this.get();
    const lines = content.split('\n');
    const queryLower = query.toLowerCase();

    return lines.filter((line) => line.toLowerCase().includes(queryLower));
  }

  private async createDefaultMemory(): Promise<void> {
    this.content = DEFAULT_MEMORY_CONTENT;
    await writeMarkdownFile(this.memoryFile, this.content);
    logger.info('Default knowledge base created');
  }
}
