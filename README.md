# PiBot - Personal Intelligence Bot

A modular AI assistant built with Node.js, featuring Telegram and WebChat interfaces with OpenRouter LLM integration.

## Features

- **Multiple Channels**: Telegram bot and WebSocket-based WebChat
- **OpenRouter Integration**: Access to 41+ LLM models through unified API
- **Skills System**: Extensible tool/plugin architecture
- **Memory System**: Persistent memory with daily logs and knowledge base
- **Session Management**: Per-user conversation history
- **Streaming Support**: Real-time response streaming

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CHANNELS                              │
│  ┌──────────┐  ┌──────────┐                                 │
│  │ Telegram │  │  WebChat │                                 │
│  │ (grammY) │  │  (WS)    │                                 │
│  └────┬─────┘  └────┬─────┘                                 │
└───────┼─────────────┼───────────────────────────────────────┘
        └─────────────┼─────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      GATEWAY                                 │
│  • Message Router  • Session Manager  • Event Bus           │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    AGENT RUNTIME                            │
│  • ReAct Loop  • Tool Runner  • LLM Client (OpenRouter)    │
└─────────────────────────────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│      MEMORY      │    │      SKILLS      │
│  • Sessions      │    │  • DateTime      │
│  • Daily Logs    │    │  • Memory        │
│  • Knowledge Base│    │  • (Custom)      │
└──────────────────┘    └──────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 22+
- OpenRouter API key
- Telegram Bot Token (from @BotFather)

### Installation

```bash
cd pibot
npm install
```

### Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your credentials:
```env
OPENROUTER_API_KEY=your_openrouter_api_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

### Running

Development mode (with hot reload):
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key | Required |
| `OPENROUTER_MODEL` | LLM model to use | `anthropic/claude-sonnet-4` |
| `OPENROUTER_MAX_TOKENS` | Max tokens per response | `4096` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Required |
| `TELEGRAM_ALLOWED_USERS` | Comma-separated user IDs | All users |
| `WEBCHAT_ENABLED` | Enable WebChat server | `true` |
| `WEBCHAT_PORT` | WebChat server port | `3000` |
| `WEBCHAT_WS_PATH` | WebSocket path | `/ws` |
| `DATA_DIR` | Data storage directory | `./data` |
| `AGENT_MAX_TURNS` | Max ReAct loop turns | `10` |
| `LOG_LEVEL` | Logging level | `info` |

## WebChat API

Connect via WebSocket:
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

// Send message
ws.send(JSON.stringify({
  type: 'message',
  content: 'Hello!'
}));

// Receive response
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

### Message Types

**Outgoing (client → server):**
- `{ type: 'message', content: 'text' }` - Send message
- `{ type: 'ping' }` - Keepalive ping

**Incoming (server → client):**
- `{ type: 'connected', userId, connectionId }` - Connection established
- `{ type: 'message', content, timestamp }` - Response message
- `{ type: 'stream', streamType, messageId, content }` - Streaming chunk
- `{ type: 'pong' }` - Keepalive response
- `{ type: 'error', error }` - Error message

## Built-in Skills

### DateTime
- `get_current_time` - Get current date/time
- `parse_date` - Parse date strings
- `calculate_date_diff` - Calculate time between dates

### Memory
- `memory_read` - Read from memory
- `memory_write` - Write to memory
- `memory_list` - List memory keys
- `memory_search` - Search memories

## Creating Custom Skills

```typescript
import { BaseSkill, type ToolResult } from '../skills/BaseSkill.js';
import type { Tool } from '../llm/types.js';

export class MySkill extends BaseSkill {
  readonly name = 'myskill';
  readonly description = 'My custom skill';

  getTools(): Tool[] {
    return [
      {
        name: 'my_tool',
        description: 'Does something useful',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input text' }
          },
          required: ['input']
        }
      }
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const { input } = args as { input: string };
    return this.success(`Processed: ${input}`);
  }
}
```

Register in `src/index.ts`:
```typescript
this.skillRegistry.register(new MySkill());
```

## Project Structure

```
pibot/
├── src/
│   ├── index.ts           # Entry point
│   ├── config/            # Configuration
│   ├── gateway/           # Message routing & sessions
│   ├── channels/          # Telegram, WebChat adapters
│   ├── agent/             # ReAct loop & LLM interaction
│   ├── llm/               # OpenRouter client
│   ├── memory/            # Persistence layer
│   ├── skills/            # Tool/plugin system
│   └── utils/             # Utilities
├── data/                  # Runtime data
│   ├── memory/            # Long-term memory
│   ├── sessions/          # Session data
│   └── logs/              # Daily logs
└── skills/                # Custom skills
```

## Testing

```bash
# Run tests
npm test

# Run tests once
npm run test:run

# Type checking
npm run typecheck
```

## License

MIT
