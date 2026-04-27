function normalizeWhitespace(value: string) {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripMarkdownLinks(value: string) {
  return value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

function stripMarkdownEmphasis(value: string) {
  return value
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2');
}

function stripMarkdownCode(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '').trim())
    .replace(/`([^`]+)`/g, '$1');
}

export function markdownToPlainText(value: string) {
  return normalizeWhitespace(
    stripMarkdownCode(
      stripMarkdownEmphasis(
        stripMarkdownLinks(
          value
            .replace(/^#{1,6}[ \t]+/gm, '')
            .replace(/^[ \t]*[-*+][ \t]+/gm, '')
            .replace(/^[ \t]*\d+\.[ \t]+/gm, '')
            .replace(/^\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?$/gm, '')
            .replace(/\|/g, ' ')
            .replace(/^[>-][ \t]?/gm, ''),
        ),
      ),
    ),
  );
}
