export interface Skill {
  name: string;           // e.g., "commit"
  command: string;        // e.g., "/commit"
  description: string;    // Short description for help
  prompt: string;         // Full prompt/instructions
  requiredTools?: string[] | undefined; // Tools this skill needs
  metadata?: Record<string, unknown> | undefined;
}

export interface SkillMatch {
  skill: Skill;
  args: string;  // Arguments passed after the command
}
