import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { SkillLoader } from '../src/skills/SkillLoader.js';

const TEST_DIR = '/tmp/pibot-test-skills';

describe('SkillLoader', () => {
  let loader: SkillLoader;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    loader = new SkillLoader(TEST_DIR);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should load skills from markdown files', async () => {
    await writeFile(
      join(TEST_DIR, 'test.md'),
      `---
name: test
description: A test skill
---

# Test Skill

This is a test skill prompt.
`
    );

    const count = await loader.loadAll();
    expect(count).toBe(1);

    const skill = loader.getSkill('/test');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('test');
    expect(skill?.description).toBe('A test skill');
    expect(skill?.prompt).toContain('This is a test skill prompt');
  });

  it('should extract description from content if not in frontmatter', async () => {
    await writeFile(
      join(TEST_DIR, 'nodesc.md'),
      `This is the first line of the skill.

More content here.
`
    );

    await loader.loadAll();
    const skill = loader.getSkill('/nodesc');
    expect(skill?.description).toBe('This is the first line of the skill.');
  });

  it('should parse requiredTools from frontmatter', async () => {
    await writeFile(
      join(TEST_DIR, 'withtools.md'),
      `---
name: withtools
requiredTools: [bash, fs_read, fs_write]
---

Skill with tools.
`
    );

    await loader.loadAll();
    const skill = loader.getSkill('/withtools');
    expect(skill?.requiredTools).toEqual(['bash', 'fs_read', 'fs_write']);
  });

  it('should match command with arguments', async () => {
    await writeFile(join(TEST_DIR, 'commit.md'), '# Commit skill');

    await loader.loadAll();

    const match = loader.matchCommand('/commit fix typo in readme');
    expect(match).not.toBeNull();
    expect(match?.skill.command).toBe('/commit');
    expect(match?.args).toBe('fix typo in readme');
  });

  it('should match exact command', async () => {
    await writeFile(join(TEST_DIR, 'help.md'), '# Help skill');

    await loader.loadAll();

    const match = loader.matchCommand('/help');
    expect(match).not.toBeNull();
    expect(match?.skill.command).toBe('/help');
    expect(match?.args).toBe('');
  });

  it('should return null for non-command messages', async () => {
    await writeFile(join(TEST_DIR, 'test.md'), '# Test');
    await loader.loadAll();

    expect(loader.matchCommand('hello')).toBeNull();
    expect(loader.matchCommand('not a /command')).toBeNull();
  });

  it('should return null for unknown commands', async () => {
    await writeFile(join(TEST_DIR, 'test.md'), '# Test');
    await loader.loadAll();

    expect(loader.matchCommand('/unknown')).toBeNull();
  });

  it('should normalize command lookup', async () => {
    await writeFile(join(TEST_DIR, 'foo.md'), '# Foo skill');
    await loader.loadAll();

    // With and without leading slash
    expect(loader.getSkill('/foo')).toBeDefined();
    expect(loader.getSkill('foo')).toBeDefined();
  });

  it('should generate help text', async () => {
    await writeFile(
      join(TEST_DIR, 'first.md'),
      `---
description: First skill
---
Content`
    );
    await writeFile(
      join(TEST_DIR, 'second.md'),
      `---
description: Second skill
---
Content`
    );

    await loader.loadAll();
    const help = loader.getHelpText();

    expect(help).toContain('Available Skills');
    expect(help).toContain('/first');
    expect(help).toContain('/second');
    expect(help).toContain('First skill');
    expect(help).toContain('Second skill');
  });

  it('should handle empty prompts directory gracefully', async () => {
    await rm(TEST_DIR, { recursive: true, force: true });

    const count = await loader.loadAll();
    expect(count).toBe(0);
    expect(loader.getAllSkills()).toHaveLength(0);
  });
});
