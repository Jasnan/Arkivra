import { screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { ChatEmptyState } from './chat-empty-state';

describe('chat empty state', () => {
  it('disables prompt suggestion buttons when chat controls are disabled', async () => {
    await renderWithProviders(
      <ChatEmptyState
        title="Start a chat"
        description="Ask a question"
        promptSuggestions={[{ label: 'Find documents', icon: Search }]}
        disabled
        onPromptSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /find documents/i })).toBeDisabled();
  });

  it('hides the lower typing hint when no prompt suggestions are shown', async () => {
    await renderWithProviders(
      <ChatEmptyState
        title="Start a chat"
        description="Ask a question"
        promptSuggestions={[]}
        onPromptSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText(/^or$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/start typing your question below/i)).not.toBeInTheDocument();
  });
});
