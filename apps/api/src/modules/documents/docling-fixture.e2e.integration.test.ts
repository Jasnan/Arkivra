import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createAuth } from '../auth/auth.services.js';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import {
  authVerificationsTable,
  documentChunkAssetsTable,
  documentChunksTable,
  documentsTable,
  usersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createDoclingParser } from '../parsing/adapters/docling.parser.js';
import { createParsePipeline } from '../parsing/parse-pipeline.js';
import { createParserRegistry } from '../parsing/parser.registry.js';
import { createDeterministicTextCleaner } from '../parsing/text-cleaner.js';
import { createServer } from '../server/server.js';
import { createStorageDriver } from '../storage/storage.services.js';
import { createVaultsServices } from '../vaults/vaults.services.js';
import { createDocumentWorker } from '../worker/document.worker.js';

type TestContext = {
  email: string;
  password: string;
  storagePath: string;
  userId: string | null;
  vaultId: string | null;
  documentId: string | null;
};

const FIXTURE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAr7M6xQAAAAASUVORK5CYII=';
const FIXTURE_IMAGE_BYTES = Buffer.from(FIXTURE_IMAGE_BASE64, 'base64');

function buildDoclingFixtureResponse() {
  const jsonContent = {
    schema_name: 'DoclingDocument',
    body: {
      children: [{ cref: '#/texts/0' }],
    },
    pages: {
      1: { size: { width: 612, height: 792 } },
      2: { size: { width: 612, height: 792 } },
    },
    texts: [
      {
        self_ref: '#/texts/0',
        label: 'document_title',
        text: 'Annual Report',
        parent: { cref: '#/body' },
        children: [{ cref: '#/texts/1' }, { cref: '#/texts/4' }],
        prov: [
          {
            page_no: 1,
            bbox: { l: 72, t: 48, r: 250, b: 76, coord_origin: 'TOPLEFT' },
          },
        ],
      },
      {
        self_ref: '#/texts/1',
        label: 'section_header',
        text: 'Financial Overview',
        parent: { cref: '#/texts/0' },
        children: [
          { cref: '#/texts/2' },
          { cref: '#/tables/0' },
          { cref: '#/texts/3' },
          { cref: '#/pictures/0' },
        ],
        prov: [
          {
            page_no: 1,
            bbox: { l: 72, t: 88, r: 280, b: 114, coord_origin: 'TOPLEFT' },
          },
        ],
      },
      {
        self_ref: '#/texts/2',
        label: 'text',
        text: 'Cash reserves increased to 120 while liabilities declined to 30.',
        parent: { cref: '#/texts/1' },
        children: [],
        prov: [
          {
            page_no: 1,
            bbox: { l: 72, t: 130, r: 520, b: 176, coord_origin: 'TOPLEFT' },
          },
        ],
      },
      {
        self_ref: '#/texts/3',
        label: 'text',
        text: 'Revenue trend accelerated in the second quarter and remained stable into July.',
        parent: { cref: '#/texts/1' },
        children: [],
        prov: [
          {
            page_no: 2,
            bbox: { l: 72, t: 92, r: 520, b: 138, coord_origin: 'TOPLEFT' },
          },
        ],
      },
      {
        self_ref: '#/texts/4',
        label: 'section_header',
        text: 'Appendix',
        parent: { cref: '#/texts/0' },
        children: [{ cref: '#/texts/5' }],
        prov: [
          {
            page_no: 2,
            bbox: { l: 72, t: 390, r: 180, b: 416, coord_origin: 'TOPLEFT' },
          },
        ],
      },
      {
        self_ref: '#/texts/5',
        label: 'text',
        text: 'Supporting note: July reflects provisional settlement timing.',
        parent: { cref: '#/texts/4' },
        children: [],
        prov: [
          {
            page_no: 2,
            bbox: { l: 72, t: 430, r: 520, b: 468, coord_origin: 'TOPLEFT' },
          },
        ],
      },
      {
        self_ref: '#/texts/6',
        label: 'caption',
        text: 'Table 1. Balance sheet summary',
        parent: { cref: '#/tables/0' },
        children: [],
        prov: [
          {
            page_no: 1,
            bbox: { l: 72, t: 196, r: 280, b: 216, coord_origin: 'TOPLEFT' },
          },
        ],
      },
      {
        self_ref: '#/texts/7',
        label: 'caption',
        text: 'Figure 1. Revenue trend',
        parent: { cref: '#/pictures/0' },
        children: [],
        prov: [
          {
            page_no: 2,
            bbox: { l: 72, t: 152, r: 240, b: 172, coord_origin: 'TOPLEFT' },
          },
        ],
      },
    ],
    tables: [
      {
        self_ref: '#/tables/0',
        parent: { cref: '#/texts/1' },
        children: [],
        captions: [{ cref: '#/texts/6' }],
        data: {
          table_cells: [
            {
              start_row_offset_idx: 0,
              end_row_offset_idx: 1,
              start_col_offset_idx: 0,
              end_col_offset_idx: 1,
              text: 'Asset',
              column_header: true,
            },
            {
              start_row_offset_idx: 0,
              end_row_offset_idx: 1,
              start_col_offset_idx: 1,
              end_col_offset_idx: 2,
              text: 'Amount',
              column_header: true,
            },
            {
              start_row_offset_idx: 1,
              end_row_offset_idx: 2,
              start_col_offset_idx: 0,
              end_col_offset_idx: 1,
              text: 'Cash',
            },
            {
              start_row_offset_idx: 1,
              end_row_offset_idx: 2,
              start_col_offset_idx: 1,
              end_col_offset_idx: 2,
              text: '120',
            },
            {
              start_row_offset_idx: 2,
              end_row_offset_idx: 3,
              start_col_offset_idx: 0,
              end_col_offset_idx: 1,
              text: 'Liabilities',
            },
            {
              start_row_offset_idx: 2,
              end_row_offset_idx: 3,
              start_col_offset_idx: 1,
              end_col_offset_idx: 2,
              text: '30',
            },
          ],
        },
        prov: [
          {
            page_no: 1,
            bbox: { l: 72, t: 228, r: 360, b: 330, coord_origin: 'TOPLEFT' },
          },
        ],
      },
    ],
    pictures: [
      {
        self_ref: '#/pictures/0',
        parent: { cref: '#/texts/1' },
        children: [],
        captions: [{ cref: '#/texts/7' }],
        image: {
          mimetype: 'image/png',
          uri: `data:image/png;base64,${FIXTURE_IMAGE_BASE64}`,
        },
        prov: [
          {
            page_no: 2,
            bbox: { l: 72, t: 184, r: 252, b: 364, coord_origin: 'TOPLEFT' },
          },
        ],
      },
    ],
    groups: [],
  } as const;

  return {
    document: {
      md_content: [
        '# Annual Report',
        '',
        '## Financial Overview',
        '',
        'Cash reserves increased to 120 while liabilities declined to 30.',
        '',
        'Table 1. Balance sheet summary',
        '',
        '| Asset | Amount |',
        '| --- | --- |',
        '| Cash | 120 |',
        '| Liabilities | 30 |',
        '',
        'Revenue trend accelerated in the second quarter and remained stable into July.',
        '',
        'Figure 1. Revenue trend',
        '',
        '## Appendix',
        '',
        'Supporting note: July reflects provisional settlement timing.',
      ].join('\n'),
      text_content: [
        'Annual Report',
        'Financial Overview',
        'Cash reserves increased to 120 while liabilities declined to 30.',
        'Table 1. Balance sheet summary',
        'Asset Amount',
        'Cash 120',
        'Liabilities 30',
        'Revenue trend accelerated in the second quarter and remained stable into July.',
        'Figure 1. Revenue trend',
        'Appendix',
        'Supporting note: July reflects provisional settlement timing.',
      ].join('\n'),
      json_content: jsonContent,
      html_content: '',
      doctags_content: '',
    },
    status: 'success',
    processing_time: 0.25,
    errors: [],
  };
}

function buildDoclingFixtureChunkResponse() {
  const convertResponse = buildDoclingFixtureResponse();
  return {
    chunks: [
      {
        filename: 'fixture.pdf',
        chunk_index: 0,
        text: 'Cash reserves increased to 120 while liabilities declined to 30.',
        headings: ['Annual Report', 'Financial Overview'],
        page_numbers: [1],
        doc_items: ['#/texts/2'],
      },
      {
        filename: 'fixture.pdf',
        chunk_index: 1,
        text: 'Table 1. Balance sheet summary\n\nAsset | Amount\nCash | 120\nLiabilities | 30',
        headings: ['Annual Report', 'Financial Overview'],
        page_numbers: [1],
        doc_items: ['#/tables/0'],
      },
      {
        filename: 'fixture.pdf',
        chunk_index: 2,
        text: 'Revenue trend accelerated in the second quarter and remained stable into July.',
        headings: ['Annual Report', 'Financial Overview'],
        page_numbers: [2],
        doc_items: ['#/texts/3'],
      },
      {
        filename: 'fixture.pdf',
        chunk_index: 3,
        text: 'Figure 1. Revenue trend',
        headings: ['Annual Report', 'Financial Overview'],
        page_numbers: [2],
        doc_items: ['#/pictures/0'],
      },
      {
        filename: 'fixture.pdf',
        chunk_index: 4,
        text: 'Supporting note: July reflects provisional settlement timing.',
        headings: ['Annual Report', 'Appendix'],
        page_numbers: [2],
        doc_items: ['#/texts/5'],
      },
    ],
    documents: [
      {
        kind: 'ExportResult' as const,
        content: convertResponse.document,
        status: convertResponse.status,
        errors: convertResponse.errors,
      },
    ],
    processing_time: convertResponse.processing_time,
  };
}

async function createFixturePdfBuffer() {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fixtureImage = await pdfDoc.embedPng(FIXTURE_IMAGE_BYTES);

  const page1 = pdfDoc.addPage([612, 792]);
  page1.drawText('Annual Report', {
    x: 72,
    y: 720,
    size: 22,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page1.drawText('Financial Overview', {
    x: 72,
    y: 685,
    size: 18,
    font: bold,
    color: rgb(0.15, 0.15, 0.15),
  });
  page1.drawText('Cash reserves increased to 120 while liabilities declined to 30.', {
    x: 72,
    y: 648,
    size: 12,
    font: regular,
    maxWidth: 440,
    lineHeight: 16,
  });
  page1.drawText('Table 1. Balance sheet summary', {
    x: 72,
    y: 608,
    size: 11,
    font: regular,
  });

  const tableLeft = 72;
  const tableTop = 586;
  const rowHeight = 24;
  const colWidths: [number, number] = [180, 108];
  const rows = [
    ['Asset', 'Amount'],
    ['Cash', '120'],
    ['Liabilities', '30'],
  ];

  for (let rowIndex = 0; rowIndex <= rows.length; rowIndex += 1) {
    const y = tableTop - rowIndex * rowHeight;
    page1.drawLine({
      start: { x: tableLeft, y },
      end: { x: tableLeft + colWidths[0] + colWidths[1], y },
      thickness: 1,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  let currentX = tableLeft;
  for (const width of [0, ...colWidths]) {
    page1.drawLine({
      start: { x: currentX, y: tableTop },
      end: { x: currentX, y: tableTop - rows.length * rowHeight },
      thickness: 1,
      color: rgb(0.35, 0.35, 0.35),
    });
    currentX += width;
  }

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      page1.drawText(cell, {
        x: tableLeft + 10 + (colIndex === 0 ? 0 : colWidths[0]),
        y: tableTop - 17 - rowIndex * rowHeight,
        size: 11,
        font: rowIndex === 0 ? bold : regular,
      });
    });
  });

  const page2 = pdfDoc.addPage([612, 792]);
  page2.drawText(
    'Revenue trend accelerated in the second quarter and remained stable into July.',
    {
      x: 72,
      y: 684,
      size: 12,
      font: regular,
      maxWidth: 440,
      lineHeight: 16,
    },
  );
  page2.drawText('Figure 1. Revenue trend', {
    x: 72,
    y: 646,
    size: 11,
    font: regular,
  });
  page2.drawImage(fixtureImage, {
    x: 72,
    y: 430,
    width: 180,
    height: 180,
  });
  page2.drawText('Appendix', {
    x: 72,
    y: 360,
    size: 18,
    font: bold,
  });
  page2.drawText('Supporting note: July reflects provisional settlement timing.', {
    x: 72,
    y: 328,
    size: 12,
    font: regular,
    maxWidth: 440,
    lineHeight: 16,
  });

  return Buffer.from(await pdfDoc.save());
}

function getSessionCookie(response: Response) {
  const rawCookie = response.headers.get('set-cookie');

  expect(rawCookie).toBeTruthy();
  expect(rawCookie).toContain('better-auth.session_token=');

  return rawCookie!.split(';', 1)[0];
}

describe.sequential('Docling fixture worker e2e', () => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const testContext: TestContext = {
    email: `docling-fixture-${uniqueSuffix}@example.com`,
    password: 'Passw0rd!123',
    storagePath: '',
    userId: null,
    vaultId: null,
    documentId: null,
  };

  let documentWorker: ReturnType<typeof createDocumentWorker> | null = null;
  let pool: ReturnType<typeof setupDatabase>['pool'] | null = null;
  let db: ReturnType<typeof setupDatabase>['db'] | null = null;
  let app: ReturnType<typeof createServer>['app'] | null = null;

  beforeAll(async () => {
    testContext.storagePath = await mkdtemp(join(tmpdir(), 'arkivra-docling-fixture-e2e-'));

    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PROCESS_MODE: 'all',
        ARKIVRA_DATABASE_URL:
          process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
        ARKIVRA_DOCLING_URL: 'http://docling-fixture.invalid',
        ARKIVRA_SERVER_BASE_URL: 'http://localhost:1221',
        ARKIVRA_CORS_ORIGINS: 'http://localhost:1221',
        ARKIVRA_AUTH_TRUSTED_ORIGINS: 'http://localhost:1221',
        ARKIVRA_STORAGE_FS_PATH: testContext.storagePath,
      },
    });

    const database = setupDatabase({ config });
    db = database.db;
    pool = database.pool;

    const { auth } = createAuth({ db, config });
    const encryption = createEncryptionServices({ kekKeysRaw: config.encryption.keys });
    const storage = createStorageDriver({ config });

    const parserRegistry = createParserRegistry({
      parsers: [createDoclingParser({
        doclingClient: {
          convertFile: async () => buildDoclingFixtureResponse(),
          chunkFile: async () => buildDoclingFixtureChunkResponse(),
        },
        engineVersion: config.docling.engineVersion,
      })],
      defaultEngine: 'docling',
    });
    const parsePipeline = createParsePipeline({
      parserRegistry,
      cleaner: createDeterministicTextCleaner(),
    });
    documentWorker = createDocumentWorker({
      db,
      storage,
      encryption,
      parsePipeline,
      startPolling: false,
    });

    app = createServer({
      config,
      auth,
      db,
      storage,
      encryption,
    }).app;
  });

  afterAll(async () => {
    if (testContext.vaultId !== null && db !== null) {
      await db.delete(vaultsTable).where(eq(vaultsTable.id, testContext.vaultId)).catch(() => undefined);
    }

    if (testContext.userId !== null && db !== null) {
      await db.delete(usersTable).where(eq(usersTable.id, testContext.userId)).catch(() => undefined);
    }

    if (db !== null) {
      await db
        .delete(authVerificationsTable)
        .where(eq(authVerificationsTable.identifier, testContext.email))
        .catch(() => undefined);
    }

    if (documentWorker !== null) {
      await documentWorker.close();
    }

    if (pool !== null) {
      await pool.end();
    }

    await rm(testContext.storagePath, { recursive: true, force: true }).catch(() => undefined);
  });

  test('processes the fixture PDF through the worker and preserves chunk, asset, page, and citation provenance', async () => {
    if (app === null || db === null) {
      throw new Error('Test app dependencies were not initialized');
    }

    const signUpResponse = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:1221',
      },
      body: JSON.stringify({
        name: 'Fixture Tester',
        email: testContext.email,
        password: testContext.password,
      }),
    });

    expect(signUpResponse.status).toBe(200);
    const signUpBody = (await signUpResponse.json()) as { user: { id: string } };
    testContext.userId = signUpBody.user.id;
    const sessionCookie = getSessionCookie(signUpResponse);

    const vaultsServices = createVaultsServices({ db });
    const createdVault = await vaultsServices.createVault({
      userId: testContext.userId,
      name: 'Docling Fixture Vault',
      description: null,
    });
    testContext.vaultId = createdVault.id;

    const formData = new FormData();
    formData.append(
      'file',
      new File([await createFixturePdfBuffer()], 'docling-fixture.pdf', { type: 'application/pdf' }),
    );

    const uploadResponse = await app.request(`/api/vaults/${testContext.vaultId}/documents`, {
      method: 'POST',
      headers: { cookie: sessionCookie },
      body: formData,
    });

    expect(uploadResponse.status).toBe(201);
    const uploadBody = (await uploadResponse.json()) as { document: { id: string } };
    testContext.documentId = uploadBody.document.id;

    if (documentWorker === null) {
      throw new Error('Document worker was not initialized');
    }

    await documentWorker.processDocument({
      data: {
        documentId: testContext.documentId,
        vaultId: testContext.vaultId,
      },
      updateProgress: async () => undefined,
    } as never);

    const [document] = await db
      .select({
        content: documentsTable.content,
        rawText: documentsTable.rawText,
        rawMarkdown: documentsTable.rawMarkdown,
        parserEngine: documentsTable.parserEngine,
        parserEngineVersion: documentsTable.parserEngineVersion,
        parserStructuredOutput: documentsTable.parserStructuredOutput,
        processingStatus: documentsTable.processingStatus,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, testContext.documentId))
      .limit(1);

    expect(document).toBeDefined();
    expect(document?.processingStatus).toBe('completed');
    expect(document?.parserEngine).toBe('docling');
    expect(document?.parserEngineVersion).toBeTruthy();
    expect(document?.content).toContain('Cash reserves increased to 120');
    expect(document?.content).toContain('Revenue trend accelerated');
    expect(document?.rawText).toContain('Appendix');
    expect(document?.rawMarkdown).toContain('## Financial Overview');
    expect(document?.parserStructuredOutput).toMatchObject({
      schema_name: 'DoclingDocument',
      pages: {
        1: { size: { width: 612, height: 792 } },
        2: { size: { width: 612, height: 792 } },
      },
    });

    const chunks = await db
      .select({
        id: documentChunksTable.id,
        chunkIndex: documentChunksTable.chunkIndex,
        section: documentChunksTable.section,
        sectionPath: documentChunksTable.sectionPath,
        pageStart: documentChunksTable.pageStart,
        pageEnd: documentChunksTable.pageEnd,
        citationPrecision: documentChunksTable.citationPrecision,
        sourceElementIds: documentChunksTable.sourceElementIds,
        tablesHtml: documentChunksTable.tablesHtml,
        boundingBoxes: documentChunksTable.boundingBoxes,
        originalText: documentChunksTable.originalText,
      })
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, testContext.documentId))
      .orderBy(asc(documentChunksTable.chunkIndex));

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      section: 'Annual Report > Financial Overview',
      sectionPath: ['Annual Report', 'Financial Overview'],
      pageStart: 1,
      pageEnd: 2,
      citationPrecision: 'box',
      sourceElementIds: ['#/texts/2', '#/tables/0', '#/texts/3', '#/pictures/0'],
    });
    expect(chunks[0]?.tablesHtml).toEqual([
      '<table><thead><tr><th>Asset</th><th>Amount</th></tr></thead><tbody><tr><td>Cash</td><td>120</td></tr><tr><td>Liabilities</td><td>30</td></tr></tbody></table>',
    ]);
    expect(chunks[0]?.boundingBoxes).toHaveLength(4);
    expect(chunks[0]?.originalText).toContain('Table 1. Balance sheet summary');
    expect(chunks[0]?.originalText).toContain('Figure 1. Revenue trend');
    expect(chunks[1]).toMatchObject({
      chunkIndex: 1,
      section: 'Annual Report > Appendix',
      sectionPath: ['Annual Report', 'Appendix'],
      pageStart: 2,
      pageEnd: 2,
      citationPrecision: 'box',
      sourceElementIds: ['#/texts/5'],
    });

    const assetRows = await db
      .select({
        id: documentChunkAssetsTable.id,
        chunkId: documentChunkAssetsTable.chunkId,
        assetType: documentChunkAssetsTable.assetType,
        sourceElementId: documentChunkAssetsTable.sourceElementId,
        pageNumber: documentChunkAssetsTable.pageNumber,
        mimeType: documentChunkAssetsTable.mimeType,
        inlinePayload: documentChunkAssetsTable.inlinePayload,
        storageKey: documentChunkAssetsTable.storageKey,
      })
      .from(documentChunkAssetsTable)
      .where(eq(documentChunkAssetsTable.documentId, testContext.documentId))
      .orderBy(asc(documentChunkAssetsTable.createdAt));

    expect(assetRows).toHaveLength(2);
    const tableAsset = assetRows.find(asset => asset.assetType === 'table');
    const imageAsset = assetRows.find(asset => asset.assetType === 'image');

    expect(tableAsset).toMatchObject({
      chunkId: chunks[0]?.id,
      sourceElementId: '#/tables/0',
      pageNumber: 1,
      mimeType: 'text/html',
    });
    expect(tableAsset?.inlinePayload).toContain('<table>');
    expect(tableAsset?.storageKey).toBeNull();

    expect(imageAsset).toMatchObject({
      chunkId: chunks[0]?.id,
      sourceElementId: '#/pictures/0',
      pageNumber: 2,
      mimeType: 'image/png',
    });
    expect(imageAsset?.inlinePayload).toBeNull();
    expect(imageAsset?.storageKey).toBeTruthy();

    const hybridResponse = await app.request(`/api/vaults/${testContext.vaultId}/search/hybrid`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: 'cash liabilities revenue trend',
        limit: 5,
        mode: 'fts',
      }),
    });

    expect(hybridResponse.status).toBe(200);
    const hybridBody = (await hybridResponse.json()) as {
      citations: Array<{
        chunkId: string;
        pageStart: number | null;
        pageEnd: number | null;
        section: string | null;
        sectionPath?: string[];
        sourceElementIds?: string[];
        tableSourceElementIds?: string[];
        citationPrecision: string;
        tablesHtml: string[];
        imageAssets?: Array<{
          assetId: string;
          sourceElementId: string | null;
          caption?: string | null;
          pageNumber?: number | null;
        }>;
      }>;
    };

    expect(hybridBody.citations.length).toBeGreaterThanOrEqual(1);
    expect(hybridBody.citations[0]).toMatchObject({
      chunkId: chunks[0]?.id,
      pageStart: 1,
      pageEnd: 2,
      section: 'Annual Report > Financial Overview',
      sectionPath: ['Annual Report', 'Financial Overview'],
      sourceElementIds: ['#/texts/2', '#/tables/0', '#/texts/3', '#/pictures/0'],
      tableSourceElementIds: ['#/tables/0'],
      citationPrecision: 'box',
    });
    expect(hybridBody.citations[0]?.tablesHtml).toHaveLength(1);
    expect(hybridBody.citations[0]?.imageAssets).toEqual([
      {
        assetId: imageAsset?.id,
        sourceElementId: '#/pictures/0',
        caption: 'Figure 1. Revenue trend',
        pageNumber: 2,
      },
    ]);

    const tableAssetResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/chunks/${chunks[0]?.id}/assets/${tableAsset?.id}`,
      {
        method: 'GET',
        headers: { cookie: sessionCookie },
      },
    );

    expect(tableAssetResponse.status).toBe(200);
    expect(tableAssetResponse.headers.get('content-type')).toContain('text/html');
    expect(tableAssetResponse.headers.get('x-arkivra-source-element-id')).toBe('#/tables/0');
    expect(await tableAssetResponse.text()).toContain('<table>');

    const imageAssetResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/chunks/${chunks[0]?.id}/assets/${imageAsset?.id}`,
      {
        method: 'GET',
        headers: { cookie: sessionCookie },
      },
    );

    expect(imageAssetResponse.status).toBe(200);
    expect(imageAssetResponse.headers.get('content-type')).toBe('image/png');
    expect(imageAssetResponse.headers.get('x-arkivra-source-element-id')).toBe('#/pictures/0');
    expect(Buffer.from(await imageAssetResponse.arrayBuffer()).equals(FIXTURE_IMAGE_BYTES)).toBe(true);

    const pageOnePreviewResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/documents/${testContext.documentId}/page/1.png`,
      {
        method: 'GET',
        headers: { cookie: sessionCookie },
      },
    );
    const pageTwoPreviewResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/documents/${testContext.documentId}/page/2.png`,
      {
        method: 'GET',
        headers: { cookie: sessionCookie },
      },
    );

    expect(pageOnePreviewResponse.status).toBe(200);
    expect(pageTwoPreviewResponse.status).toBe(200);
    expect(pageOnePreviewResponse.headers.get('content-type')).toBe('image/png');
    expect(pageTwoPreviewResponse.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await pageOnePreviewResponse.arrayBuffer()).length).toBeGreaterThan(0);
    expect(Buffer.from(await pageTwoPreviewResponse.arrayBuffer()).length).toBeGreaterThan(0);
  }, 60_000);
});
