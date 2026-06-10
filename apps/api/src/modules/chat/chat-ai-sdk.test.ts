import { describe, expect, test } from 'vitest';
import { transformChatRequestBody } from './chat-ai-sdk.js';

describe('chat AI SDK helpers', () => {
  test('disables Ollama thinking and requests usage for streaming chat responses', () => {
    expect(
      transformChatRequestBody({
        model: 'gemma4:12b-it-qat',
        stream: true,
        messages: [],
      }),
    ).toMatchObject({
      model: 'gemma4:12b-it-qat',
      stream: true,
      messages: [],
      think: false,
      stream_options: { include_usage: true },
    });
  });

  test('does not request stream usage for non-streaming chat responses', () => {
    expect(
      transformChatRequestBody({
        model: 'gemma4:12b-it-qat',
        stream: false,
        messages: [],
      }),
    ).toMatchObject({
      think: false,
      stream_options: undefined,
    });
  });
});
