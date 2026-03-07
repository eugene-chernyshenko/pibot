---
name: summarize
description: Summarize text, documents, or conversations
---

# Summarizer

Create concise summaries of provided content.

## Instructions

1. If a URL is provided, fetch and summarize the content
2. If a file path is provided, read and summarize it
3. If text is provided directly, summarize it

## Summary Format

### For Articles/Documents:
- **TL;DR** - One sentence summary
- **Key Points** - 3-5 bullet points
- **Details** - Brief elaboration if needed

### For Conversations:
- **Topic** - What was discussed
- **Decisions** - Any decisions made
- **Action Items** - Next steps if any

### For Code Files:
- **Purpose** - What the file does
- **Main Components** - Key classes/functions
- **Dependencies** - External dependencies used

## Guidelines

- Keep summaries under 200 words unless more detail is requested
- Preserve important numbers, names, and dates
- Highlight actionable information
