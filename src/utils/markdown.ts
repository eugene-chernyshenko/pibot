import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readMarkdownFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeMarkdownFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}

export async function appendToMarkdownFile(path: string, content: string): Promise<void> {
  const existing = await readMarkdownFile(path);
  const newContent = existing ? `${existing}\n${content}` : content;
  await writeMarkdownFile(path, newContent);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

export function formatDateForLog(date: Date = new Date()): string {
  return date.toISOString().split('T')[0] ?? '';
}
