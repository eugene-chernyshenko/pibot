export class PibotError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PibotError';
  }
}

export class ConfigError extends PibotError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class LLMError extends PibotError {
  constructor(message: string, public readonly statusCode?: number) {
    super(message, 'LLM_ERROR');
    this.name = 'LLMError';
  }
}

export class ChannelError extends PibotError {
  constructor(message: string, public readonly channel: string) {
    super(message, 'CHANNEL_ERROR');
    this.name = 'ChannelError';
  }
}

export class SkillError extends PibotError {
  constructor(message: string, public readonly skill: string) {
    super(message, 'SKILL_ERROR');
    this.name = 'SkillError';
  }
}

export class AgentError extends PibotError {
  constructor(message: string) {
    super(message, 'AGENT_ERROR');
    this.name = 'AgentError';
  }
}
