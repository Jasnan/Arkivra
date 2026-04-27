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

export type RuntimeOllamaNormalizationSettings = {
  enabled: boolean;
  host: string;
  model: string;
  minTokenLength: number;
  maxCandidates: number;
  batchSize: number;
  maxInputChars: number;
  logRequests: boolean;
};

type OllamaChat = (args: {
  model: string;
  format?: 'json';
  think?: boolean;
  options?: {
    temperature?: number;
  };
  messages: Array<{ role: 'user'; content: string }>;
}) => Promise<{ message?: { content?: string } }>;

const normalizeBatchDecisionSchema = z.object({
  outputs: z.array(z.string().min(1)),
});

export const IDENTITY_DOCUMENT_NORMALIZATION_PROMPT_TEMPLATE = `You are an elite Data Normalization Engine specializing in global identity documents (passports, national IDs, visas, etc.). Your task is to read highly unstructured, noisy OCR text from ANY country and transform it into a clean, semantically consistent Markdown document optimized for retrieval and embedding.

-----------------------
STRICT RULES (MANDATORY)
-----------------------

1. OUTPUT FORMAT:
- You MUST output ONLY Markdown.
- No explanations, no JSON, no commentary.
- No code fences.
- No extra text before or after the Markdown.
- Do not include any preface such as "Here is the extracted text", "Here is the Markdown", or "I could not extract".
- Your entire response must be the document content itself, and nothing else.

2. STRUCTURE:
- Use a flat, label-based structure (no nesting, no tables, no bullet lists).
- Each field must be on its own line using this exact format:
  Field Name: Value
- Group fields logically using simple section headers.

3. COMPLETENESS:
- Extract ALL meaningful fields present in the text.
- If a field is unclear but likely present, include:
  Field Name: [uncertain]
- Never invent a field name or its value

4. NOISE HANDLING:
- Ignore OCR garbage, broken tokens, or unreadable fragments.
- DO NOT include meaningless strings in structured fields.

5. FALLBACK:
- Do NOT append a "Raw OCR Text" section.
- If you cannot make sense of most of the document, do not spend time trying to infer fields.
- In that case, return only the cleaned raw OCR text as quickly as possible.
- The raw fallback must still contain no explanations, no labels, no wrappers, and no extra text before or after.

-----------------------
GOAL
-----------------------

Produce a clean, minimal, and semantically consistent Markdown document that:
- is easy for a human to read
- is optimized for vector embeddings
- avoids redundancy and noise

-----------------------
INPUT
-----------------------

Here is the OCR text:

{{input_text}}`;

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

  const arrayStart = outputsKeyIndex === -1
    ? normalized.indexOf('[')
    : normalized.indexOf('[', outputsKeyIndex);

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

function getIdentityNormalizationSourceText(input: GluedWordNormalizerInput) {
  return (input.text.trim().length > 0 ? input.text : input.markdown).trim();
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeMarkdownModelOutput(value: string) {
  const normalized = normalizeModelResponseEnvelope(value).trim();
  const fenced = normalized.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? normalized).trim();
}

function buildIdentityDocumentNormalizationPrompt(inputText: string) {
  return IDENTITY_DOCUMENT_NORMALIZATION_PROMPT_TEMPLATE.replace('{{input_text}}', inputText);
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

  async function normalizeSnippets(snippets: string[]): Promise<string[]> {
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
      'Return only the JSON object.',
      'Do not include any explanations, introductions, apologies, markdown, or code fences.',
      'Do not start with text like "Here are the corrected snippets".',
      'The JSON schema is exactly: {"outputs":["...", "..."]}',
      'The outputs array length must exactly match the snippets array length.',
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
        format: 'json',
        think: false,
        options: {
          temperature: 0,
        },
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
      if (snippets.length > 1) {
        return (await Promise.all(snippets.map(snippet => normalizeSnippets([snippet])))).flat();
      }
      return snippets;
    }

    if (outputs.length !== snippets.length) {
      if (logRequests) {
        console.warn(
          `[ollama-normalizer] response length mismatch, expected ${snippets.length} output(s) and got ${outputs.length}; keeping original batch`,
        );
      }
      if (snippets.length > 1) {
        return (await Promise.all(snippets.map(snippet => normalizeSnippets([snippet])))).flat();
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

export function createOllamaIdentityDocumentNormalizer({
  model,
  host,
  logRequests = false,
  chat,
}: {
  model: string;
  host?: string;
  logRequests?: boolean;
  chat?: OllamaChat;
}): GluedWordNormalizer {
  const ollamaClient = chat ? null : new Ollama({ host });
  const client = chat ?? ollamaClient!.chat.bind(ollamaClient);

  async function normalizeDocument(input: GluedWordNormalizerInput) {
    const sourceText = getIdentityNormalizationSourceText(input);
    if (sourceText.length === 0) {
      return null;
    }

    const prompt = buildIdentityDocumentNormalizationPrompt(sourceText);

    if (logRequests) {
      console.info(
        `[ollama-identity-normalizer] sending document normalization request to ${host ?? 'default-host'} with model=${model}: ${previewSnippet(sourceText)}`,
      );
    }

    let response: Awaited<ReturnType<OllamaChat>>;
    try {
      response = await client({
        model,
        think: false,
        options: {
          temperature: 0,
        },
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (error) {
      console.error(
        `[ollama-identity-normalizer] request failed for model=${model}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }

    const markdown = normalizeMarkdownModelOutput(response.message?.content ?? '');
    if (markdown.length === 0) {
      if (logRequests) {
        console.warn('[ollama-identity-normalizer] empty model response, keeping original parser output');
      }
      return null;
    }

    if (logRequests) {
      console.info(
        `[ollama-identity-normalizer] accepted normalized markdown: ${previewSnippet(markdown)}`,
      );
    }

    return markdown;
  }

  return {
    name: 'ollama-identity-document',
    normalize: async (input) => {
      const markdown = await normalizeDocument(input);
      if (markdown === null) {
        return {
          text: input.text,
          markdown: input.markdown,
          replacements: [],
        };
      }

      return {
        text: markdown,
        markdown,
        replacements: [{
          original: input.text.trim().length > 0 ? input.text : input.markdown,
          updated: markdown,
        }],
      };
    },
  };
}

export function createRuntimeConfiguredGluedWordNormalizer({
  resolveSettings,
  chat,
}: {
  resolveSettings: () => Promise<RuntimeOllamaNormalizationSettings>;
  chat?: OllamaChat;
}): GluedWordNormalizer {
  const noopNormalizer = createNoopGluedWordNormalizer();
  let cachedKey: string | null = null;
  let cachedNormalizer: GluedWordNormalizer | null = null;

  return {
    name: 'runtime-configured',
    normalize: async (input) => {
      let settings: RuntimeOllamaNormalizationSettings;

      try {
        settings = await resolveSettings();
      } catch (error) {
        console.error(
          '[ollama-normalizer] could not resolve runtime AI settings, skipping normalization:',
          error instanceof Error ? error.message : error,
        );
        return noopNormalizer.normalize(input);
      }

      if (!settings.enabled) {
        return noopNormalizer.normalize(input);
      }

      const sourceText = getIdentityNormalizationSourceText(input);
      if (settings.maxInputChars > 0 && sourceText.length > settings.maxInputChars) {
        if (settings.logRequests) {
          console.info(
            `[ollama-identity-normalizer] skipped input with ${sourceText.length} character(s); limit is ${settings.maxInputChars}`,
          );
        }
        return noopNormalizer.normalize(input);
      }

      const nextKey = JSON.stringify(settings);

      if (cachedNormalizer === null || cachedKey !== nextKey) {
        cachedKey = nextKey;
        cachedNormalizer = createOllamaIdentityDocumentNormalizer({
          host: settings.host,
          model: settings.model,
          logRequests: settings.logRequests,
          chat,
        });
      }

      return cachedNormalizer.normalize(input);
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
  buildIdentityDocumentNormalizationPrompt,
  normalizeMarkdownModelOutput,
  normalizeBatchDecisionSchema,
};
