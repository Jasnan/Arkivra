import type { ParserOutput } from './parsed-document.schema.js';

export type ParserEngine = 'docling';

export type ParseInput = {
  documentId: string;
  documentVersionId?: string;
  fileName: string;
  displayFileName?: string;
  mimeType: string;
  fileData: Buffer;
};

export type ParserCapabilities = {
  ocr: boolean;
  tables: boolean;
  supportedMimeTypes: readonly string[] | 'any';
};

export interface DocumentParser {
  readonly engine: ParserEngine;
  readonly engineVersion: string;
  readonly capabilities: ParserCapabilities;
  parse: (input: ParseInput) => Promise<ParserOutput>;
}

export class ParserValidationError extends Error {
  constructor(
    message: string,
    readonly engine: ParserEngine,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ParserValidationError';
  }
}
