import type { Database } from '../database/database.js';
import type { ParsedDocument } from './parsed-document.schema.js';
import { eq } from 'drizzle-orm';
import { documentChunksTable, documentsTable } from '../database/schema/index.js';

/**
 * Persist a {@link ParsedDocument} into `documents` + `document_chunks`.
 * This is the sole writer of parser output — the worker never touches chunk
 * columns directly.
 */
export async function persistParsedDocument({
  db,
  documentId,
  vaultId,
  parsed,
}: {
  db: Database;
  documentId: string;
  vaultId: string;
  parsed: ParsedDocument;
}) {
  // Replace all existing chunks for idempotent re-processing.
  await db.delete(documentChunksTable).where(eq(documentChunksTable.documentId, documentId));

  if (parsed.chunks.length > 0) {
    await db.insert(documentChunksTable).values(
      parsed.chunks.map((chunk, index) => ({
        documentId,
        vaultId,
        chunkIndex: index,
        chunkKey: chunk.id,
        content: chunk.text,
        section: chunk.section,
        pageNumber: chunk.pageNumber,
        chunkType: chunk.type,
        tokenCount:
          typeof chunk.metadata.tokenCount === 'number' ? chunk.metadata.tokenCount : null,
        parserEngine: parsed.engine,
        metadata: chunk.metadata,
      })),
    );
  }

  await db
    .update(documentsTable)
    .set({
      content: parsed.text,
      rawText: parsed.rawText,
      parserEngine: parsed.engine,
      parserEngineVersion: parsed.engineVersion,
      parserWarnings: parsed.warnings,
      processingStatus: 'completed',
      updatedAt: new Date(),
    })
    .where(eq(documentsTable.id, documentId));
}
