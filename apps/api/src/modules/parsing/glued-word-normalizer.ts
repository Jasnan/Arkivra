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
  think?: boolean;
  messages: Array<{ role: 'user'; content: string }>;
}) => Promise<{ message?: { content?: string } }>;

const normalizeBatchDecisionSchema = z.object({
  outputs: z.array(z.string().min(1)),
});

function normalizeModelResponseEnvelope(value: string) {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<\/?think>/gi, ' ');
}

function extractJsonObject(value: string) {
  const normalized = normalizeModelResponseEnvelope(value);
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? normalized).trim();
  const starts: number[] = [];

  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] === '{') {
      starts.push(index);
    }
  }

  for (const start of starts) {
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = start; index < candidate.length; index += 1) {
      const char = candidate[index];

      if (char === undefined) {
        continue;
      }

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
          continue;
        }

        if (char === '\\') {
          isEscaped = true;
          continue;
        }

        if (char === '"') {
          inString = false;
        }

        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char !== '}') {
        continue;
      }

      depth -= 1;
      if (depth !== 0) {
        continue;
      }

      const json = candidate.slice(start, index + 1);
      try {
        JSON.parse(json);
        return json;
      } catch {
        break;
      }
    }
  }

  return null;
}

function extractJsonArray(value: string, start: number) {
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (char === undefined) {
      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[') {
      depth += 1;
      continue;
    }

    if (char !== ']') {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return value.slice(start, index + 1);
    }
  }

  return null;
}

function parseLooseOutputsArray(value: string) {
  const normalized = normalizeModelResponseEnvelope(value);
  const outputsKeyIndex = normalized.search(/["']?outputs["']?\s*:/i);

  if (outputsKeyIndex === -1) {
    return null;
  }

  const arrayStart = normalized.indexOf('[', outputsKeyIndex);
  if (arrayStart === -1) {
    return null;
  }

  const arrayText = extractJsonArray(normalized, arrayStart);
  if (arrayText === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(arrayText);
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : null;
  } catch {
    const strings = [...arrayText.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(match =>
      JSON.parse(`"${match[1] ?? ''}"`),
    );
    return strings.length > 0 ? strings : null;
  }
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

function hasSuspiciousLowercaseGlue(line: string, minTokenLength: number) {
  const words = line.match(/[a-z]{2,}/g) ?? [];

  return words.some((word) => {
    if (word.length < minTokenLength + 2) {
      return false;
    }

    return /^(the|and|for|with|from|into|upon|that|this|these|those|his|her|their|our|your)[a-z]{4,}$/i.test(word)
      || /[a-z]{5,}(address|department|engineer|husband|wife|daughter|mother|father|secretary|registrar)$/i.test(word);
  });
}

function isSuspiciousLine(line: string, minTokenLength: number) {
  const { content } = splitMarkdownLine(line);
  const trimmed = content.trim();

  if (trimmed.length < minTokenLength || shouldSkipMarkdownLine(trimmed)) {
    return false;
  }

  return hasLongAllCapsRun(trimmed, minTokenLength)
    || hasSuspiciousWordBoundaryPattern(trimmed)
    || hasSuspiciousLowercaseGlue(trimmed, minTokenLength);
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

function validateNormalization({
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

function createSnippetUpdateMap({
  candidates,
  normalizedSnippets,
}: {
  candidates: Array<{ snippet: string }>;
  normalizedSnippets: string[];
}) {
  const updates = new Map<string, string>();

  for (const [index, candidate] of candidates.entries()) {
    const updated = normalizedSnippets[index] ?? candidate.snippet;
    if (!updates.has(candidate.snippet)) {
      updates.set(candidate.snippet, updated);
    }
  }

  return updates;
}

function buildReplacements({
  candidates,
  snippetUpdates,
}: {
  candidates: Array<{ original: string; snippet: string; updated: (next: string) => string }>;
  snippetUpdates: Map<string, string>;
}) {
  const replacements: Array<{ original: string; updated: string }> = [];

  for (const candidate of candidates) {
    const updated = snippetUpdates.get(candidate.snippet) ?? candidate.snippet;
    if (updated !== candidate.snippet) {
      replacements.push({
        original: candidate.original,
        updated: candidate.updated(updated),
      });
    }
  }

  return replacements;
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
  batchSize = 10,
  logRequests = false,
  chat,
}: {
  model: string;
  host?: string;
  minTokenLength?: number;
  maxCandidates?: number;
  batchSize?: number;
  logRequests?: boolean;
  chat?: OllamaChat;
}): GluedWordNormalizer {
  const ollamaClient = chat ? null : new Ollama({ host });
  const client = chat ?? ollamaClient!.chat.bind(ollamaClient);

  async function normalizeSnippets(snippets: string[]) {
    if (snippets.length === 0) {
      return [];
    }

    const prompt = [
      'You are correcting OCR whitespace and word-boundary errors.',
      'Rewrite each snippet to improve OCR text quality.',
      'You may insert, remove, or move spaces and line breaks.',
      'You may correct OCR mistakes in letters, punctuation, and numbers when needed.',
      'Your job is to restore likely missing or misplaced spaces created by OCR.',
      'Prefer meaningful whole words, names, titles, and phrases over awkward fragments.',
      'Split merged lowercase words when they form common word sequences.',
      'Split merged CamelCase or TitleCase compounds when they read like separate words.',
      'Split merged ALLCAPS compounds when they read like multiple words.',
      'Repair spacing around punctuation, brackets, initials, abbreviations, and rule references when OCR has collapsed them.',
      'Keep natural names together when possible; do not introduce random breaks inside a likely name.',
      'If a token could be split in several ways, choose the most natural reading.',
      'If a split would create unnatural fragments, keep the surrounding letters together and try a different whitespace placement.',
      'If unsure, keep a snippet unchanged.',
      'Examples of the kind of fixes you may make:',
      'Bad: "CITYOFFICE" -> Good: "CITY OFFICE"',
      'Bad: "ProjectManager" -> Good: "Project Manager"',
      'Bad: "currentaddress" -> Good: "current address"',
      'Bad: "underrule7(2)oftheCode" -> Good: "under rule 7(2) of the Code"',
      'Bad: "A RahmanKhan" -> Good: "A Rahman Khan"',
      'Return JSON only: {"outputs":["...", "..."]}',
      'Return exactly one output for each input snippet, in the same order.',
      `Snippets: ${JSON.stringify(snippets)}`,
    ].join('\n');

    if (logRequests) {
      console.info(
        `[ollama-normalizer] sending batch request to ${host ?? 'default-host'} with model=${model}, size=${snippets.length}: ${previewSnippet(snippets.join(' | '))}`,
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
      return snippets;
    }

    const content = response.message?.content ?? '';
    const json = extractJsonObject(content);
    let outputs: string[] | null = null;

    if (json !== null) {
      try {
        const payload = JSON.parse(json);
        const parsed = normalizeBatchDecisionSchema.safeParse(payload);
        if (parsed.success) {
          outputs = parsed.data.outputs;
        }
      } catch {
        outputs = null;
      }
    }

    if (outputs === null) {
      outputs = parseLooseOutputsArray(content);
    }

    if (outputs === null) {
      if (logRequests) {
        console.warn(
          `[ollama-normalizer] could not parse outputs array, keeping original: ${previewSnippet(content)}`,
        );
      }
      return snippets;
    }

    if (outputs.length !== snippets.length) {
      if (logRequests) {
        console.warn(
          `[ollama-normalizer] response length mismatch, expected ${snippets.length} output(s) and got ${outputs.length}; keeping original batch`,
        );
      }
      return snippets;
    }

    return snippets.map((snippet, index) => {
      const validated = validateNormalization({
        original: snippet,
        updated: outputs[index] ?? snippet,
      });

      if (logRequests) {
        console.info(
          validated === null
            ? `[ollama-normalizer] candidate left unchanged by model: ${previewSnippet(snippet)}`
            : `[ollama-normalizer] accepted normalization: ${previewSnippet(validated)}`,
        );
      }

      return validated ?? snippet;
    });
  }

  return {
    name: 'ollama',
    normalize: async (input) => {
      const textCandidates = collectLineCandidates({
        value: input.text,
        minTokenLength,
        maxCandidates,
      });
      const markdownCandidates = collectLineCandidates({
        value: input.markdown,
        minTokenLength,
        maxCandidates,
      });
      const uniqueCandidates = [
        ...new Map(
          [...textCandidates, ...markdownCandidates].map(candidate => [candidate.snippet, candidate] as const),
        ).values(),
      ];

      if (uniqueCandidates.length === 0) {
        return {
          text: input.text,
          markdown: input.markdown,
          replacements: [],
        };
      }

      console.info(
        `[ollama-normalizer] found ${textCandidates.length} suspicious text line(s), ${markdownCandidates.length} suspicious markdown line(s), ${uniqueCandidates.length} unique snippet(s) for model=${model}`,
      );

      const normalizedSnippets: string[] = [];
      for (let index = 0; index < uniqueCandidates.length; index += batchSize) {
        const batch = uniqueCandidates.slice(index, index + batchSize);
        const updatedBatch = await normalizeSnippets(batch.map(candidate => candidate.snippet));
        normalizedSnippets.push(...updatedBatch);
      }

      const snippetUpdates = createSnippetUpdateMap({
        candidates: uniqueCandidates,
        normalizedSnippets,
      });
      const textReplacements = buildReplacements({
        candidates: textCandidates,
        snippetUpdates,
      });
      const markdownReplacements = buildReplacements({
        candidates: markdownCandidates,
        snippetUpdates,
      });
      const dedupedReplacements = [
        ...textReplacements,
        ...markdownReplacements.filter(markdownReplacement =>
          !textReplacements.some(textReplacement =>
            textReplacement.original === markdownReplacement.original
            && textReplacement.updated === markdownReplacement.updated,
          )),
      ];

      console.info(
        `[ollama-normalizer] applied ${textReplacements.length} text replacement(s) and ${markdownReplacements.length} markdown replacement(s)`,
      );

      return {
        text: textReplacements.length === 0 ? input.text : applyReplacements(input.text, textReplacements),
        markdown:
          markdownReplacements.length === 0
            ? input.markdown
            : applyReplacements(input.markdown, markdownReplacements),
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
  hasSuspiciousLowercaseGlue,
  hasSuspiciousWordBoundaryPattern,
  isSuspiciousLine,
  normalizeModelResponseEnvelope,
  parseLooseOutputsArray,
  previewSnippet,
  extractDigits,
  removeWhitespace,
  splitMarkdownLine,
  validateNormalization,
  buildReplacements,
  createSnippetUpdateMap,
  normalizeBatchDecisionSchema,
};
