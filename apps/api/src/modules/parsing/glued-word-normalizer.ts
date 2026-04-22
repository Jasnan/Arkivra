import { Ollama } from 'ollama';
import { z } from 'zod';

export type GluedWordNormalizerInput = {
  text: string;
  markdown: string;
};

export type GluedWordNormalizerOutput = GluedWordNormalizerInput & {
  replacements: Array<{
    original: string;
    updated: string;
  }>;
};

export interface GluedWordNormalizer {
  readonly name: string;
  normalize: (input: GluedWordNormalizerInput) => Promise<GluedWordNormalizerOutput>;
}

type OllamaChat = (args: {
  model: string;
  messages: Array<{ role: 'user'; content: string }>;
}) => Promise<{ message?: { content?: string } }>;

const normalizeDecisionSchema = z.object({
  output: z.string().min(1),
});

function extractJsonObject(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? value;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1);
}

function previewSnippet(value: string, maxLength = 180) {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, maxLength)}...`;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractDigits(value: string) {
  return value.match(/\d+/g) ?? [];
}

function removeWhitespace(value: string) {
  return value.replace(/\s+/g, '');
}

function splitMarkdownLine(line: string) {
  const heading = line.match(/^(\s*#{1,6}\s+)(.*)$/);
  if (heading) {
    return { prefix: heading[1] ?? '', content: heading[2] ?? '', isStructured: true };
  }

  const bullet = line.match(/^(\s*[-*+]\s+)(.*)$/);
  if (bullet) {
    return { prefix: bullet[1] ?? '', content: bullet[2] ?? '', isStructured: true };
  }

  const ordered = line.match(/^(\s*\d+\.\s+)(.*)$/);
  if (ordered) {
    return { prefix: ordered[1] ?? '', content: ordered[2] ?? '', isStructured: true };
  }

  const quote = line.match(/^(\s*>\s?)(.*)$/);
  if (quote) {
    return { prefix: quote[1] ?? '', content: quote[2] ?? '', isStructured: true };
  }

  const fencedCode = line.match(/^(\s*```.*)$/);
  if (fencedCode) {
    return { prefix: '', content: line, isStructured: true };
  }

  return { prefix: '', content: line, isStructured: false };
}

function shouldSkipMarkdownLine(content: string) {
  const trimmed = content.trim();
  return /^\|.*\|$/.test(trimmed) || /^```/.test(trimmed);
}

function hasLongAllCapsRun(line: string, minTokenLength: number) {
  const pattern = new RegExp(`[A-Z]{${minTokenLength},}`);
  return pattern.test(line);
}

function hasSuspiciousWordBoundaryPattern(line: string) {
  return /[a-z]{2,}[A-Z][a-z]/.test(line)
    || /[A-Za-z]\([A-Za-z]/.test(line)
    || /\)[A-Za-z]/.test(line)
    || /[A-Za-z]\.[A-Za-z]/.test(line);
}

function isSuspiciousLine(line: string, minTokenLength: number) {
  const { content } = splitMarkdownLine(line);
  const trimmed = content.trim();

  if (trimmed.length < minTokenLength || shouldSkipMarkdownLine(trimmed)) {
    return false;
  }

  return hasLongAllCapsRun(trimmed, minTokenLength) || hasSuspiciousWordBoundaryPattern(trimmed);
}

function collectLineCandidates({
  value,
  minTokenLength,
  maxCandidates,
}: {
  value: string;
  minTokenLength: number;
  maxCandidates: number;
}) {
  const seen = new Set<string>();
  const candidates: Array<{ original: string; snippet: string; updated: (next: string) => string }> = [];

  for (const line of value.split('\n')) {
    const { prefix, content } = splitMarkdownLine(line);
    const trimmed = content.trim();

    if (!trimmed || seen.has(line) || !isSuspiciousLine(line, minTokenLength)) {
      continue;
    }

    seen.add(line);
    candidates.push({
      original: line,
      snippet: content,
      updated: next => `${prefix}${next}`,
    });

    if (candidates.length >= maxCandidates) {
      break;
    }
  }

  return candidates;
}

function validateDigitPreservingNormalization({
  original,
  updated,
}: {
  original: string;
  updated: string;
}) {
  const trimmed = updated.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const originalDigits = extractDigits(original);
  const updatedDigits = extractDigits(trimmed);
  if (originalDigits.length !== updatedDigits.length) {
    return null;
  }
  for (const [index, group] of originalDigits.entries()) {
    if (updatedDigits[index] !== group) {
      return null;
    }
  }

  const collapsedOriginal = collapseWhitespace(original);
  const collapsedUpdated = collapseWhitespace(trimmed);

  if (collapsedUpdated === collapsedOriginal) {
    return null;
  }

  return trimmed;
}

function applyReplacements(value: string, replacements: Array<{ original: string; updated: string }>) {
  let next = value;

  for (const replacement of replacements) {
    next = next.split(replacement.original).join(replacement.updated);
  }

  return next;
}

export function createNoopGluedWordNormalizer(): GluedWordNormalizer {
  return {
    name: 'none',
    normalize: async (input) => ({
      text: input.text,
      markdown: input.markdown,
      replacements: [],
    }),
  };
}

export function createOllamaGluedWordNormalizer({
  model,
  host,
  minTokenLength = 12,
  maxCandidates = 100,
  logRequests = false,
  chat,
}: {
  model: string;
  host?: string;
  minTokenLength?: number;
  maxCandidates?: number;
  logRequests?: boolean;
  chat?: OllamaChat;
}): GluedWordNormalizer {
  const ollamaClient = chat ? null : new Ollama({ host });
  const client = chat ?? ollamaClient!.chat.bind(ollamaClient);

  async function normalizeSnippet(snippet: string) {
    const prompt = [
      'You are correcting OCR whitespace and word-boundary errors.',
      'Rewrite the snippet to improve OCR text quality.',
      'You may insert, remove, or move spaces and line breaks.',
      'You may correct non-numeric OCR mistakes in letters and punctuation when needed.',
      'Do not change, add, remove, reorder, split, or merge any digits or digit groups.',
      'Every number must stay exactly the same and in the same order.',
      'Prefer meaningful whole words over awkward splits.',
      'Bad: "GOVERNMEN TOF KERALA"',
      'Good: "GOVERNMENT OF KERALA"',
      'Bad: "DEPARTMEN TOF PANCHAYAT"',
      'Good: "DEPARTMENT OF PANCHAYAT"',
      'Bad: "underrule11(1)oftheKeralaRegistrationofMarriages"',
      'Good: "under rule 11(1) of the Kerala Registration of Marriages"',
      'If a split would create unnatural fragments, keep the surrounding letters together and try a different whitespace placement.',
      'If unsure, keep the snippet unchanged.',
      'Return JSON only: {"output":"..."}',
      `Snippet: ${snippet}`,
    ].join('\n');

    if (logRequests) {
      console.info(
        `[ollama-normalizer] sending request to ${host ?? 'default-host'} with model=${model}: ${previewSnippet(snippet)}`,
      );
    }

    let response: Awaited<ReturnType<OllamaChat>>;
    try {
      response = await client({
        model,
        think: false,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (error) {
      console.error(
        `[ollama-normalizer] request failed for model=${model}:`,
        error instanceof Error ? error.message : error,
      );
      return snippet;
    }

    const content = response.message?.content ?? '';
    const json = extractJsonObject(content);
    if (json === null) {
      if (logRequests) {
        console.warn(
          `[ollama-normalizer] response was not valid JSON, keeping original: ${previewSnippet(content)}`,
        );
      }
      return snippet;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      if (logRequests) {
        console.warn('[ollama-normalizer] response JSON parsing failed, keeping original snippet');
      }
      return snippet;
    }

    const parsed = normalizeDecisionSchema.safeParse(payload);
    if (!parsed.success) {
      if (logRequests) {
        console.warn('[ollama-normalizer] response schema invalid, keeping original snippet');
      }
      return snippet;
    }

    const validated = validateDigitPreservingNormalization({
      original: snippet,
      updated: parsed.data.output,
    });

    if (logRequests) {
      console.info(
        validated === null
          ? `[ollama-normalizer] rejected response because it changed numeric content`
          : `[ollama-normalizer] accepted normalization: ${previewSnippet(validated)}`,
      );
    }

    return validated ?? snippet;
  }

  async function normalizeValue(value: string) {
    const candidates = collectLineCandidates({
      value,
      minTokenLength,
      maxCandidates,
    });

    if (candidates.length === 0) {
      return {
        value,
        replacements: [] as Array<{ original: string; updated: string }>,
      };
    }

    console.info(
      `[ollama-normalizer] found ${candidates.length} suspicious OCR line(s) for model=${model}`,
    );

    const replacements: Array<{ original: string; updated: string }> = [];

    for (const candidate of candidates) {
      const updated = await normalizeSnippet(candidate.snippet);

      if (updated !== candidate.snippet) {
        replacements.push({
          original: candidate.original,
          updated: candidate.updated(updated),
        });
      }
    }

    console.info(
      `[ollama-normalizer] applied ${replacements.length} whitespace normalization replacement(s)`,
    );

    if (replacements.length === 0) {
      return {
        value,
        replacements,
      };
    }

    return {
      value: applyReplacements(value, replacements),
      replacements,
    };
  }

  return {
    name: 'ollama',
    normalize: async (input) => {
      const textResult = await normalizeValue(input.text);
      const markdownResult = await normalizeValue(input.markdown);
      const dedupedReplacements = [
        ...textResult.replacements,
        ...markdownResult.replacements.filter(markdownReplacement =>
          !textResult.replacements.some(textReplacement =>
            textReplacement.original === markdownReplacement.original
            && textReplacement.updated === markdownReplacement.updated,
          )),
      ];

      return {
        text: textResult.value,
        markdown: markdownResult.value,
        replacements: dedupedReplacements,
      };
    },
  };
}

export const __testing = {
  applyReplacements,
  collectLineCandidates,
  extractJsonObject,
  hasLongAllCapsRun,
  hasSuspiciousWordBoundaryPattern,
  isSuspiciousLine,
  previewSnippet,
  extractDigits,
  removeWhitespace,
  splitMarkdownLine,
  validateDigitPreservingNormalization,
};
