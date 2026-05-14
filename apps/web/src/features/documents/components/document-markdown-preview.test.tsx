import type { PropsWithChildren } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { DocumentMarkdownPreview } from './document-markdown-preview';

function renderMarkdownPreview(markdown: string) {
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        {children}
      </ThemeProvider>
    );
  }

  return render(<DocumentMarkdownPreview markdown={markdown} />, { wrapper: Wrapper });
}

describe('document markdown preview', () => {
  it('renders GitHub-flavored Markdown as document content', async () => {
    renderMarkdownPreview([
      '# Release Notes',
      '',
      '**Important** _update_ with [docs](https://example.com/docs).',
      '',
      '- First item',
      '- Second item',
      '',
      '> Keep this visible.',
      '',
      '| Name | Status |',
      '| --- | --- |',
      '| Preview | Ready |',
      '',
      '```ts',
      'const enabled = true;',
      '```',
      '',
      '---',
    ].join('\n'));

    expect(screen.getByRole('heading', { level: 1, name: 'Release Notes' })).toBeInTheDocument();
    expect(screen.getByText('Important')).toBeInTheDocument();
    expect(screen.getByText('update')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com/docs');
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('First item')).toBeInTheDocument();
    expect(screen.getByText('Keep this visible.')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'Ready' })).toBeInTheDocument();
    expect(screen.getByText('const enabled = true;')).toBeInTheDocument();
  });

  it('does not render unsafe Markdown URLs or raw HTML as executable elements', async () => {
    const { container } = renderMarkdownPreview([
      '[bad link](javascript:alert(1))',
      '',
      '<img src=x onerror="alert(1)" />',
      '<script>alert(1)</script>',
    ].join('\n'));

    expect(screen.getByText('bad link').closest('a')).not.toHaveAttribute('href');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('alert(1)');
  });
});
