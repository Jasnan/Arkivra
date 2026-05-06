function stripDataUris(value: string) {
  return value.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '');
}

export function extractDataUriImages(value: string) {
  const images: Array<{ mimeType: string; data: Buffer<ArrayBufferLike> }> = [];

  for (const match of value.matchAll(/data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g)) {
    const mimeType = match[1] ?? '';
    const base64Data = match[2] ?? '';

    if (!mimeType || !base64Data) {
      continue;
    }

    const data = Buffer.from(base64Data, 'base64');
    if (data.length === 0) {
      continue;
    }

    images.push({
      mimeType,
      data,
    });
  }

  return images;
}

function stripMarkdownImages(value: string) {
  return value.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
}

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
    .replace(/```[\s\S]*?```/g, block => block.replace(/```/g, '').trim())
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

export function sanitizeDoclingText(value: string) {
  return normalizeWhitespace(stripDataUris(stripMarkdownImages(value)));
}

export function sanitizeDoclingMarkdown(value: string) {
  return normalizeWhitespace(stripDataUris(stripMarkdownImages(value)));
}

export function deriveDoclingPlainText({
  text,
  markdown,
}: {
  text: string;
  markdown: string;
}) {
  return text.length > 0 ? text : markdownToPlainText(markdown);
}
