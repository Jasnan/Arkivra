import { describe, expect, test } from 'vitest';
import { parseOllamaChatStream } from '../ai/providers/ollama-chat.provider.js';
import type { Citation } from '../search/search.types.js';
import {
  buildAnswerPrompt,
  buildCitationContext,
  buildExpandedCitationForChat,
  buildGlobalIntentSystemPrompt,
  encodeSseEvent,
  formatFollowUpAssistantMessage,
  normalizeChatGenerationError,
  rankCitationsForQuestion,
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
  sectionPath: ['Records', 'Retention'],
  sourceElementIds: ['el_chunk_1', 'el_chunk_2'],
  tableSourceElementIds: ['el_table_1'],
  snippet: 'Records are retained for seven years.',
  boundingBoxes: [],
  citationPrecision: 'page',
  assetType: 'table',
  tablesHtml: ['<table><tr><td>Retention</td><td>7 years</td></tr></table>'],
  imageAssetIds: ['cas_1'],
  imageAssets: [{
    assetId: 'cas_1',
    sourceElementId: 'el_image_1',
    caption: 'Figure 1. Records retention timeline',
    pageNumber: 3,
  }],
  score: 0.81,
};

describe('chat service helpers', () => {
  test('builds answer prompts from citation payloads only', () => {
    const prompt = buildAnswerPrompt({
      question: 'How long are records kept?',
      citations: [citation],
      includeInlineCitations: true,
    });

    expect(prompt).toContain('How long are records kept?');
    expect(prompt).toContain('Policy.pdf');
    expect(prompt).toContain('pages 2-3');
    expect(prompt).toContain('Records > Retention');
    expect(prompt).toContain('Records are retained for seven years.');
    expect(prompt).toContain('Table 1:\nRow 1: Retention | 7 years');
    expect(prompt).toContain('Figure 1 (page 3): Figure 1. Records retention timeline');
    expect(prompt).toContain('Respect explicit constraints in the question');
    expect(prompt).toContain('If the retrieved context is insufficient');
  });

  test('merges same-document hits into expanded page context for chat answers', () => {
    const expanded = buildExpandedCitationForChat({
      citations: [
        citation,
        {
          ...citation,
          chunkId: 'chk_2',
          pageStart: 3,
          pageEnd: 3,
          section: 'Refund',
          sourceElementIds: ['el_chunk_3'],
          snippet: 'The account refund amount is listed separately.',
          score: 0.9,
        },
      ],
      contextChunks: [
        {
          chunkId: 'ctx_1',
          chunkIndex: 2,
          pageStart: 2,
          pageEnd: 2,
          section: 'Assessment',
          snippet: 'The notice is for tax year 2018.',
        },
        {
          chunkId: 'ctx_2',
          chunkIndex: 3,
          pageStart: 3,
          pageEnd: 3,
          section: 'Refund',
          snippet: 'A refund of 3,133.65 is returned to the account.',
        },
      ],
    });

    expect(expanded?.pageStart).toBe(2);
    expect(expanded?.pageEnd).toBe(3);
    expect(expanded?.citationPrecision).toBe('page');
    expect(expanded?.score).toBe(0.9);
    expect(expanded?.sourceElementIds).toEqual(['el_chunk_1', 'el_chunk_2', 'el_chunk_3']);
    expect(expanded?.snippet).toContain('Page 2 - Assessment: The notice is for tax year 2018.');
    expect(expanded?.snippet).toContain('Page 3 - Refund: A refund of 3,133.65 is returned to the account.');
  });

  test('prioritizes citations that match explicit year constraints', () => {
    const citation2019: Citation = {
      ...citation,
      chunkId: 'chk_2019',
      documentId: 'doc_2019',
      documentName: 'Tax notice 2019',
      snippet: 'A refund of 179.58 is due for 2019.',
    };
    const citation2018: Citation = {
      ...citation,
      chunkId: 'chk_2018',
      documentId: 'doc_2018',
      documentName: 'Tax notice 2018',
      snippet: 'The 2018 notice shows a refund to the account.',
    };

    expect(rankCitationsForQuestion({
      question: 'Is there a tax refund for 2018?',
      citations: [citation2019, citation2018],
    }).map(item => item.documentId)).toEqual(['doc_2018', 'doc_2019']);
  });

  test('builds compare intent system prompts for guided follow-ups', () => {
    const prompt = buildGlobalIntentSystemPrompt('compare');

    expect(prompt).toContain('You are Arkivra, an AI assistant');
    expect(prompt).toContain('User intent: compare documents.');
    expect(prompt).toContain('Do not proceed until comparison targets are clear.');
  });

  test('formats follow-up assistant questions as two short lines with examples', () => {
    expect(formatFollowUpAssistantMessage({
      intent: 'extract',
      question: 'What kind of information should I extract?',
      examples: ['tax IDs', 'invoice numbers'],
    })).toBe('What kind of information should I extract?\nExamples: tax IDs or invoice numbers');
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
    for await (const chunk of parseOllamaChatStream(new Response(body))) {
      if (chunk.token) {
        tokens.push(chunk.token);
      }
    }

    expect(tokens).toEqual(['Hel', 'lo']);
  });

  test('normalizes invalid stream-controller errors to a user-friendly retry message', () => {
    expect(
      normalizeChatGenerationError(new Error("Invalid state: Controller is already closed")),
    ).toBe('The chat response was interrupted before it finished. Please try again.');
    expect(
      normalizeChatGenerationError(new TypeError('ERR_INVALID_STATE')),
    ).toBe('The chat response was interrupted before it finished. Please try again.');
  });
});
