import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { DocumentStructuredTextPreview } from './document-structured-text-preview';
import {
  getStructuredTextLanguage,
  isStructuredTextDocument,
} from './document-structured-text-preview.utils';

describe('document structured text preview', () => {
  it.each([
    ['application/json', 'config', 'json'],
    ['application/vnd.api+json', 'config', 'json'],
    ['application/octet-stream', 'compose.yaml', 'yaml'],
    ['text/xml', 'feed', 'xml'],
    ['application/octet-stream', 'settings.toml', 'toml'],
    ['application/octet-stream', 'app.ini', 'ini'],
    ['text/sql', 'query', 'sql'],
    ['application/octet-stream', 'index.js', 'javascript'],
    ['application/octet-stream', 'types.ts', 'typescript'],
    ['application/octet-stream', 'component.tsx', 'tsx'],
    ['application/octet-stream', 'script.sh', 'bash'],
    ['application/octet-stream', 'Dockerfile', 'docker'],
    ['text/markdown', 'readme', 'markdown'],
  ])('detects %s / %s as %s', (mimeType, name, language) => {
    expect(getStructuredTextLanguage({ mimeType, name, originalName: name })).toBe(language);
  });

  it('does not treat ordinary plain text as structured text', () => {
    expect(
      isStructuredTextDocument({
        mimeType: 'text/plain',
        name: 'notes.txt',
        originalName: 'notes.txt',
      }),
    ).toBe(false);
  });

  it('pretty-prints valid JSON and renders line numbers', async () => {
    const { container } = await renderWithProviders(
      <DocumentStructuredTextPreview
        content={'{"name":"John","roles":["admin","user"]}'}
        mimeType="application/json"
        name="profile.json"
        originalName="profile.json"
      />,
    );

    expect(screen.getByText('"name"')).toBeInTheDocument();
    expect(container.textContent).toContain('"roles"');
    expect(container.textContent).toContain('admin');
    expect(container.textContent).toContain('user');
    expect(container.textContent).toContain('1');
  });

  it('keeps invalid JSON visible instead of failing preview rendering', async () => {
    const { container } = await renderWithProviders(
      <DocumentStructuredTextPreview
        content={'{"unfinished": true'}
        mimeType="application/json"
        name="broken.json"
        originalName="broken.json"
      />,
    );

    expect(container.textContent).toContain('{"unfinished": true');
  });
});
