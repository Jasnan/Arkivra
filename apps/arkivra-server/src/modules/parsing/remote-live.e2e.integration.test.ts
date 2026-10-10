import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { loadApiEnvFiles } from '../config/env-loader.js';
import { createPrivatemodeParser } from './adapters/privatemode.parser.js';
import { createPrivatemodeEmbeddingProvider } from '../ai/providers/privatemode.provider.js';
import { createGotenbergDocumentConverter } from '../document-conversion/gotenberg.converter.js';

// Explicit opt-in: submits only synthetic fixtures and incurs provider usage.
describe.skipIf(process.env.ARKIVRA_TEST_REMOTE_LIVE !== '1')(
  'live Privatemode synthetic ingestion',
  () => {
    loadApiEnvFiles();
    const parser = createPrivatemodeParser();
    const base = {
      documentId: 'doc_synthetic_remote',
      fileName: 'fixture.txt',
      mimeType: 'text/plain',
      fileData: Buffer.from('Reference ZX987654\nContact Ada Example'),
    };
    it.each([
      ['txt', 'text/plain'],
      ['md', 'text/markdown'],
      ['json', 'application/json'],
    ])(
      'parses and chunks synthetic %s remotely',
      async (extension, mimeType) => {
        const fileData =
          extension === 'json'
            ? Buffer.from('{"reference":"ZX987654","contact":"Ada Example"}')
            : base.fileData;
        const result = await parser.parse({
          ...base,
          fileName: `fixture.${extension}`,
          mimeType,
          fileData,
        });
        expect(result.chunks?.map((c) => c.text).join(' ')).toContain('ZX987654');
        expect(result.chunks?.map((c) => c.text).join(' ')).toContain('Ada Example');
        expect(result.chunks?.every((c) => c.pageNumber === null)).toBe(true);
      },
      180_000,
    );
    it('oCRs every synthetic digital PDF page and retains boxes', async () => {
      const pdf = await PDFDocument.create();
      pdf.addPage().drawText('Reference ZX987654', { x: 70, y: 700, size: 18 });
      pdf.addPage().drawText('Contact Ada Example', { x: 70, y: 700, size: 18 });
      const result = await parser.parse({
        ...base,
        fileName: 'fixture.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from(await pdf.save()),
      });
      const text = result.chunks?.map((c) => c.text).join(' ');
      expect(text).toContain('ZX987654');
      expect(text).toContain('Ada Example');
      expect(new Set(result.chunks?.map((c) => c.pageNumber))).toEqual(new Set([1, 2]));
      expect(result.chunks?.every((c) => c.boundingBoxes.length > 0)).toBe(true);
    }, 180_000);
    it('oCRs a synthetic image remotely', async () => {
      const canvas = createCanvas(1000, 300);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 1000, 300);
      ctx.fillStyle = 'black';
      ctx.font = '40px sans-serif';
      ctx.fillText('Reference ZX987654', 50, 100);
      ctx.fillText('Contact Ada Example', 50, 180);
      const result = await parser.parse({
        ...base,
        fileName: 'fixture.png',
        mimeType: 'image/png',
        fileData: Buffer.from(await canvas.encode('png')),
      });
      expect(result.chunks?.map((c) => c.text).join(' ')).toContain('ZX987654');
      expect(result.chunks?.[0]?.boundingBoxes.length).toBeGreaterThan(0);
    }, 180_000);
    it.skipIf(!process.env.ARKIVRA_TEST_REMOTE_DOCX)(
      'converts synthetic Word to PDF then OCRs and chunks remotely',
      async () => {
        const converter = createGotenbergDocumentConverter({
          baseUrl: process.env.ARKIVRA_GOTENBERG_URL ?? 'http://127.0.0.1:3001',
        });
        const converted = await converter.convertToPdf({
          fileName: 'fixture.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileData: await readFile(process.env.ARKIVRA_TEST_REMOTE_DOCX!),
        });
        const result = await parser.parse({ ...base, ...converted });
        expect(result.chunks?.map((c) => c.text).join(' ')).toContain('ZX987654');
        expect(result.chunks?.map((c) => c.text).join(' ')).toContain('Ada Example');
        expect(result.chunks?.[0]?.boundingBoxes.length).toBeGreaterThan(0);
      },
      180_000,
    );
    it('embeds documents and queries remotely with consistent dimensions', async () => {
      const provider = createPrivatemodeEmbeddingProvider();
      const config = {
        provider: 'privatemode' as const,
        model: 'qwen3-embedding-4b',
        dimensions: 1024,
      };
      const documents = await provider.embed({
        texts: [base.fileData.toString()],
        config,
        purpose: 'document',
      });
      const queries = await provider.embed({
        texts: ['What is the reference?'],
        config,
        purpose: 'query',
      });
      expect(documents[0]).toHaveLength(1024);
      expect(queries[0]).toHaveLength(1024);
    }, 180_000);
  },
);
