import type { ParserOutput } from '../parsed-document.schema.js';

export function mergeEmbeddedImages(
  ...sources: Array<NonNullable<ParserOutput['embeddedImages']> | undefined>
): NonNullable<ParserOutput['embeddedImages']> | undefined {
  const merged = sources.flatMap(source => source ?? []);
  if (merged.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  const deduped: NonNullable<ParserOutput['embeddedImages']> = [];

  for (const image of merged) {
    const key = `${image.mimeType}:${image.data.toString('base64')}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(image);
  }

  return deduped;
}
