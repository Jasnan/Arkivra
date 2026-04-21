function stripDataUris(value: string) {
  return value.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '');
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

export function sanitizeDoclingText(value: string) {
  return normalizeWhitespace(stripDataUris(stripMarkdownImages(value)));
}

export function sanitizeDoclingMarkdown(value: string) {
  return normalizeWhitespace(stripDataUris(stripMarkdownImages(value)));
}
