import type { DoclingClient } from '../../docling/docling.client.js';
import type { DocumentParser, ParseInput, ParserCapabilities } from '../parser.types.js';
import type { ParserOutput } from '../parsed-document.schema.js';
import { ParserValidationError } from '../parser.types.js';
import { parserOutputSchema } from '../parsed-document.schema.js';
import {
  deriveDoclingPlainText,
  extractDataUriImages,
  sanitizeDoclingMarkdown,
  sanitizeDoclingText,
} from './docling.text.js';

const DOCLING_CAPABILITIES: ParserCapabilities = {
  ocr: true,
  tables: true,
  supportedMimeTypes: 'any',
};

export type DoclingParserOptions = {
  engineVersion?: string;
};

export function createDoclingParser({
  doclingClient,
  engineVersion = 'v1',
}: {
  doclingClient: DoclingClient;
} & DoclingParserOptions): DocumentParser {
  async function parse(input: ParseInput): Promise<ParserOutput> {
    const response = await doclingClient.convertFile({
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileData: input.fileData,
    });

    const rawMarkdown = response.document.md_content ?? '';
    const rawText = response.document.text_content ?? '';
    const embeddedImages = extractDataUriImages(rawMarkdown);
    const markdown = sanitizeDoclingMarkdown(rawMarkdown);
    const text = deriveDoclingPlainText({
      text: sanitizeDoclingText(rawText),
      markdown,
    });

    const warnings: string[] = [];
    if (response.status.toLowerCase() === 'partial_success') {
      warnings.push('docling.partial_success');
    }
    if (Array.isArray(response.errors)) {
      warnings.push(...response.errors);
    }

    const output: ParserOutput = {
      engine: 'docling',
      engineVersion,
      text,
      markdown,
      embeddedImages,
      warnings,
    };

    const validation = parserOutputSchema.safeParse(output);
    if (!validation.success) {
      throw new ParserValidationError(
        `Docling adapter produced an invalid ParserOutput for ${input.documentId}`,
        'docling',
        { issues: validation.error.issues },
      );
    }

    return validation.data;
  }

  return {
    engine: 'docling',
    engineVersion,
    capabilities: DOCLING_CAPABILITIES,
    parse,
  };
}
