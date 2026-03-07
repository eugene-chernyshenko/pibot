import type { StreamChunk, ToolCall } from './types.js';

export async function* parseSSEStream(
  response: Response
): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentToolCalls: Map<number, Partial<ToolCall>> = new Map();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            yield { type: 'done' };
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];

            if (!choice) continue;

            const delta = choice.delta;
            const finishReason = choice.finish_reason;

            if (finishReason) {
              yield { type: 'done', finishReason };
              continue;
            }

            if (delta?.content) {
              yield { type: 'content', content: delta.content };
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index ?? 0;
                let existing = currentToolCalls.get(index);

                if (!existing) {
                  existing = {
                    id: tc.id,
                    type: 'function',
                    function: { name: '', arguments: '' }
                  };
                  currentToolCalls.set(index, existing);
                }

                if (tc.id) {
                  existing.id = tc.id;
                }
                if (tc.function?.name) {
                  existing.function = existing.function ?? { name: '', arguments: '' };
                  existing.function.name = tc.function.name;
                }
                if (tc.function?.arguments) {
                  existing.function = existing.function ?? { name: '', arguments: '' };
                  existing.function.arguments += tc.function.arguments;
                }

                yield { type: 'tool_call', toolCall: { ...existing } };
              }
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
