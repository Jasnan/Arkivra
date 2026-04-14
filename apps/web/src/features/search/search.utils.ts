const TAG_REGEX = /<[^>]+>/g;
const HIGHLIGHT_SPLIT_REGEX = /(<mark>.*?<\/mark>)/g;
const MARK_BOUNDARY_REGEX = /^<mark>|<\/mark>$/g;

export function stripSnippetMarkup(value: string) {
  return value.replace(TAG_REGEX, '');
}

export function tokenizeSnippet(value: string) {
  return value
    .split(HIGHLIGHT_SPLIT_REGEX)
    .filter(part => part.length > 0)
    .map((part, index) => ({
      key: `${index}-${part}`,
      text: part.replace(MARK_BOUNDARY_REGEX, ''),
      highlighted: part.startsWith('<mark>') && part.endsWith('</mark>'),
    }));
}
