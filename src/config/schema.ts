import { z } from 'zod';

export const configSchema = z.object({
  openrouter: z.object({
    apiKey: z.string().min(1, 'OpenRouter API key is required'),
    model: z.string().default('anthropic/claude-sonnet-4'),
    maxTokens: z.number().int().positive().default(4096),
    baseUrl: z.string().url().default('https://openrouter.ai/api/v1'),
  }),
  telegram: z.object({
    botToken: z.string().min(1, 'Telegram bot token is required'),
    allowedUsers: z.array(z.number().int()).optional(),
  }),
  webchat: z.object({
    enabled: z.boolean().default(true),
    port: z.number().int().min(1).max(65535).default(3000),
    wsPath: z.string().default('/ws'),
  }),
  memory: z.object({
    dataDir: z.string().default('./data'),
  }),
  agent: z.object({
    systemPrompt: z.string().optional(),
    maxTurns: z.number().int().positive().default(10),
  }),
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  }),
});

export type Config = z.infer<typeof configSchema>;
