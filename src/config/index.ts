import { config as dotenvConfig } from 'dotenv';
import { configSchema, type Config } from './schema.js';

dotenvConfig();

function parseAllowedUsers(value: string | undefined): number[] | undefined {
  if (!value || value.trim() === '') {
    return undefined;
  }
  return value.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
}

function loadConfig(): Config {
  const rawConfig = {
    openrouter: {
      apiKey: process.env['OPENROUTER_API_KEY'] ?? '',
      model: process.env['OPENROUTER_MODEL'],
      maxTokens: process.env['OPENROUTER_MAX_TOKENS'] ? parseInt(process.env['OPENROUTER_MAX_TOKENS'], 10) : undefined,
      baseUrl: process.env['OPENROUTER_BASE_URL'],
    },
    telegram: {
      botToken: process.env['TELEGRAM_BOT_TOKEN'] ?? '',
      allowedUsers: parseAllowedUsers(process.env['TELEGRAM_ALLOWED_USERS']),
    },
    webchat: {
      enabled: process.env['WEBCHAT_ENABLED'] !== 'false',
      port: process.env['WEBCHAT_PORT'] ? parseInt(process.env['WEBCHAT_PORT'], 10) : undefined,
      wsPath: process.env['WEBCHAT_WS_PATH'],
    },
    memory: {
      dataDir: process.env['DATA_DIR'],
    },
    agent: {
      systemPrompt: process.env['AGENT_SYSTEM_PROMPT'],
      maxTurns: process.env['AGENT_MAX_TURNS'] ? parseInt(process.env['AGENT_MAX_TURNS'], 10) : undefined,
    },
    logging: {
      level: process.env['LOG_LEVEL'],
    },
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues.map(issue =>
      `  - ${issue.path.join('.')}: ${issue.message}`
    ).join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}

export const config = loadConfig();
export type { Config };
