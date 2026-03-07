---
name: commit
description: Generate a git commit message for staged changes
requiredTools: [bash]
---

# Git Commit Message Generator

Analyze the staged changes in the current git repository and generate a well-structured commit message.

## Instructions

1. First, run `git diff --cached` to see the staged changes
2. If no changes are staged, run `git diff` to see unstaged changes and inform the user
3. Analyze the changes and determine:
   - What type of change is it (feat, fix, refactor, docs, style, test, chore)
   - What is the scope (optional)
   - What is the main change
4. Generate a commit message following Conventional Commits format:
   - `type(scope): subject` - max 72 chars
   - Empty line
   - Body explaining what and why (not how)

## Output Format

Provide the commit message in a code block that the user can copy:

```
feat(auth): add password reset functionality

Implement password reset flow with email verification.
Users can now request a reset link that expires after 24 hours.
```

If the user provided arguments, use them as hints for the commit message.
