import { describe, expect, test } from 'vitest';
import type { Citation } from '../search/search.types.js';
import {
  buildAnswerPrompt,
  buildCitationContext,
  encodeSseEvent,
  parseOllamaChatStream,
} from './chat.services.js';

const citation: Citation = {
  chunkId: 'chk_1',
  documentId: 'doc_1',
  vaultId: 'vlt_1',
  vaultName: 'Operations',
  documentName: 'Policy.pdf',
  pageStart: 2,
  pageEnd: 3,
  section: 'Retention',
  snippet: 'Records are retained for seven years.',
  boundingBoxes: [],
  citationPrecision: 'page',
  assetType: 'table',
  tablesHtml: ['<table><tr><td>Retention</td><td>7 years</td></tr></table>'],
  imageAssetIds: [],
  score: 0.81,
};

describe('chat service helpers', () => {
  test('builds answer prompts from citation payloads only', () => {
    const prompt = buildAnswerPrompt({
      question: 'How long are records kept?',
      citations: [citation],
    });

    expect(prompt).toContain('How long are records kept?');
    expect(prompt).toContain('Policy.pdf');
    expect(prompt).toContain('pages 2-3');
    expect(prompt).toContain('Records are retained for seven years.');
    expect(prompt).toContain('<table>');
    expect(prompt).toContain('If the retrieved context is insufficient');
  });

  test('renders an explicit empty retrieval context', () => {
    expect(buildCitationContext([])).toBe('(no retrieved context)');
  });

  test('encodes status, token, done, and error events as SSE frames', () => {
    expect(encodeSseEvent({ type: 'status', label: 'retrieval' })).toBe(
      'event: status\ndata: {"label":"retrieval"}\n\n',
    );
    expect(encodeSseEvent({ type: 'token', token: 'Hello' })).toBe(
      'event: token\ndata: {"token":"Hello"}\n\n',
    );
    expect(encodeSseEvent({ type: 'error', message: 'boom' })).toBe(
      'event: error\ndata: {"message":"boom"}\n\n',
    );
  });

  test('parses Ollama newline-delimited chat stream tokens', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('{"message":{"content":"Hel"}}\n'));
        controller.enqueue(encoder.encode('{"message":{"content":"lo"},"done":false}\n'));
        controller.enqueue(encoder.encode('{"done":true}\n'));
        controller.close();
      },
    });

    const tokens: string[] = [];
    for await (const token of parseOllamaChatStream(new Response(body))) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Hel', 'lo']);
  });
});
