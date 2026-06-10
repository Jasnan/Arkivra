import { describe, expect, it } from 'vitest';
import { emptyAssistantResponseMessage } from './chat-utils';

describe('chat UI helpers', () => {
  it('keeps pending empty assistant responses in the loading state', () => {
    expect(
      emptyAssistantResponseMessage({
        generationStatus: 'pending',
        generationError: null,
      }),
    ).toBeNull();
  });

  it('shows a terminal empty-response message for completed assistant responses without text', () => {
    expect(
      emptyAssistantResponseMessage({
        generationStatus: 'completed',
        generationError: null,
      }),
    ).toBe('The model returned an empty answer.');
  });

  it('shows the generation error for failed assistant responses without text', () => {
    expect(
      emptyAssistantResponseMessage({
        generationStatus: 'failed',
        generationError: 'The model returned an empty answer. Please try again.',
      }),
    ).toBe('The model returned an empty answer. Please try again.');
  });
});
