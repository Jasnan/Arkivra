import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { ChatEmptyState } from './chat-empty-state';
import { GLOBAL_GUIDED_PROMPTS } from './chat-utils';

describe('chat empty state', () => {
  it('disables guided prompt cards when chat controls are disabled', async () => {
    await renderWithProviders(
      <ChatEmptyState
        title="Start a chat"
        description="Ask a question"
        promptSuggestions={[]}
        guidedPrompts={[GLOBAL_GUIDED_PROMPTS[0]]}
        disabled
        onPromptSelect={vi.fn()}
        onGuidedPromptSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /find documents about a topic or keyword/i })).toBeDisabled();
  });
});
