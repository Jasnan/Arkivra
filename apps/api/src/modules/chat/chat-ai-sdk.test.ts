import { describe, expect, test } from 'vitest';
import { resolveChatProviderApiKey, transformChatRequestBody } from './chat-ai-sdk.js';

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

  test('uses the default Gemini API key environment variable when the stored secret ref is blank', () => {
    expect(
      resolveChatProviderApiKey({
        provider: 'gemini',
        apiKeySecretRef: '   ',
        env: {
          GEMINI_API_KEY: 'configured',
        },
      }),
    ).toBe('configured');
  });

  test('prefers the Gemini provider secret ref over the chat-level secret ref', () => {
    expect(
      resolveChatProviderApiKey({
        provider: 'gemini',
        apiKeySecretRef: 'CHAT_GEMINI_KEY',
        providerApiKeySecretRef: 'PROVIDER_GEMINI_KEY',
        env: {
          CHAT_GEMINI_KEY: 'chat-key',
          PROVIDER_GEMINI_KEY: 'provider-key',
        },
      }),
    ).toBe('provider-key');
  });

  test('ignores raw-looking Gemini keys in secret ref fields and falls back to GEMINI_API_KEY', () => {
    expect(
      resolveChatProviderApiKey({
        provider: 'gemini',
        apiKeySecretRef: `AIza${'x'.repeat(32)}`,
        providerApiKeySecretRef: `AIza${'y'.repeat(32)}`,
        env: {
          GEMINI_API_KEY: 'configured',
        },
      }),
    ).toBe('configured');
  });

  test('does not require a default API key for Ollama', () => {
    expect(
      resolveChatProviderApiKey({
        provider: 'ollama',
        apiKeySecretRef: null,
        env: {
          GEMINI_API_KEY: 'configured',
        },
      }),
    ).toBeUndefined();
  });
});
