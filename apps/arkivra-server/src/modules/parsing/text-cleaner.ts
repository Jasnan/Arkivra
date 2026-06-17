/**
 * Formatting-only text cleaner. Runs AFTER the parser, BEFORE the chunker.
 *
 * Safe rules only. The cleaner MUST NOT:
 *   - change case
 *   - rewrite words or split concatenated tokens via a dictionary
 *   - summarize or drop content
 *   - normalize URLs, emails, currencies, dates
 *
 * For semantic repairs (e.g. `GOVERNMENTOFKERALA` → `GOVERNMENT OF KERALA`)
 * swap in an LLM-backed implementation of {@link TextCleaner}.
 */

export type TextCleanerInput = {
  text: string;
  markdown: string;
};

export type TextCleanerOutput = TextCleanerInput;

export interface TextCleaner {
  readonly name: string;
  clean: (input: TextCleanerInput) => Promise<TextCleanerOutput>;
}

const OCR_LIGATURES: ReadonlyArray<readonly [string, string]> = [
  ['\uFB00', 'ff'],
  ['\uFB01', 'fi'],
  ['\uFB02', 'fl'],
  ['\uFB03', 'ffi'],
  ['\uFB04', 'ffl'],
  ['\uFB05', 'ft'],
  ['\uFB06', 'st'],
];

function replaceLigatures(value: string) {
  let out = value;
  for (const [from, to] of OCR_LIGATURES) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
    }
  }
  return out;
}

function joinHyphenatedLineBreaks(value: string) {
  // `certi-\nficate` → `certificate`. Requires a lowercase letter either side,
  // so we never glue together legitimate hyphenated compound words that happen
  // to straddle a newline (e.g., `well-\nknown` — same rule still applies, but
  // that is an acceptable join for our ingestion use case).
  return value.replace(/([a-z])-\n([a-z])/g, '$1$2');
}

function collapseInlineWhitespace(value: string) {
  // Collapse any run of 2+ spaces/tabs to a single space. Preserves newlines.
  return value.replace(/[ \t]{2,}/g, ' ');
}

function collapseBlankLines(value: string) {
  return value.replace(/\n{3,}/g, '\n\n');
}

function trimLineEnds(value: string) {
  return value.replace(/[ \t]+\n/g, '\n');
}

function spaceAfterSentencePunctuation(value: string) {
  // Insert a space after `.`, `!`, `?`, `:`, `;`, `,` when the punctuation is
  // preceded by a lowercase letter and immediately followed by an uppercase
  // letter with no space. The preceding-lowercase guard avoids mangling
  // acronyms like `U.S.A.` or `P.O.Box`.
  return value.replace(/([a-z])([.!?:;,])([A-Z])/g, '$1$2 $3');
}

function applyCommonRules(value: string) {
  let out = value.normalize('NFKC');
  out = replaceLigatures(out);
  out = joinHyphenatedLineBreaks(out);
  out = trimLineEnds(out);
  out = collapseBlankLines(out);
  return out;
}

function cleanPlainText(value: string) {
  if (value.length === 0) return value;
  let out = applyCommonRules(value);
  out = collapseInlineWhitespace(out);
  out = spaceAfterSentencePunctuation(out);
  return out.trim();
}

function cleanMarkdown(value: string) {
  if (value.length === 0) return value;

  // Preserve fenced code blocks verbatim — text cleanup could corrupt code.
  const parts = value.split(/(```[\s\S]*?```)/g);
  const cleaned = parts.map((part, index) => {
    if (index % 2 === 1) {
      // fenced block
      return part;
    }
    let out = applyCommonRules(part);
    out = collapseInlineWhitespace(out);
    out = spaceAfterSentencePunctuation(out);
    return out;
  });

  return cleaned.join('').trim();
}

/**
 * No-op cleaner. Useful when cleanup is explicitly disabled.
 */
export function createNoopTextCleaner(): TextCleaner {
  return {
    name: 'noop',
    clean: async (input) => ({ text: input.text, markdown: input.markdown }),
  };
}

/**
 * Default deterministic cleaner. Pure, no I/O, safe for unit testing.
 */
export function createDeterministicTextCleaner(): TextCleaner {
  return {
    name: 'deterministic',
    clean: async (input) => ({
      text: cleanPlainText(input.text),
      markdown: cleanMarkdown(input.markdown),
    }),
  };
}

export const __testing = {
  cleanPlainText,
  cleanMarkdown,
  replaceLigatures,
  joinHyphenatedLineBreaks,
  spaceAfterSentencePunctuation,
  collapseInlineWhitespace,
  collapseBlankLines,
};
