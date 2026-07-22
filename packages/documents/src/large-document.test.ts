import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  ANALYSIS_MODES,
  buildAnalysisCacheKey,
  canClaimWorkUnit,
  classifyBlock,
  compareTableFacts,
  declaredFormat,
  detectSourceFormat,
  estimateAnalysisCost,
  explainCacheDecision,
  extractTableFacts,
  normalizedContentHash,
  planTargetedCacheInvalidation,
  MockOcrAdapter,
  renderTableForModel,
  selectWholeDocumentPages,
  selectOcr,
  stableSourceId,
  type NormalizedTable,
} from './index';
import {
  DocxParserAdapter,
  HtmlParserAdapter,
  TxtParserAdapter,
  XlsxParserAdapter,
  ZipPackageParserAdapter,
  assertSafePackageEntries,
  readBoundedArchive,
} from './parser';

const input = (bytes: Uint8Array, filename: string, declaredMime: string) => ({
  workspaceId: 'workspace-a',
  sourceDocumentId: 'document-a',
  bytes: new Uint8Array(bytes),
  filename,
  declaredMime,
});

describe('format-independent normalized ingestion', () => {
  it('detects signatures and rejects declared extension/MIME disagreements', () => {
    expect(detectSourceFormat(strToU8('%PDF-1.7'), 'x.txt', 'text/plain')).toMatchObject({
      format: 'pdf',
    });
    expect(() => declaredFormat('x.pdf', 'text/plain')).toThrow(/same approved format/);
  });

  it('normalizes TXT deterministically with line provenance', async () => {
    const source = input(
      strToU8('REQUIREMENTS\nVendor shall submit Form A-1.'),
      'request.txt',
      'text/plain',
    );
    const adapter = new TxtParserAdapter();
    const first = await adapter.parse(source);
    const second = await adapter.parse(source);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.pages[0]?.blocks[1]?.metadata.lineNumber).toBe(2);
    expect(first.warnings[0]?.code).toBe('page_navigation_unavailable');
  });

  it('neutralizes active HTML and preserves table cells', async () => {
    const html =
      '<html><body><script>steal()</script><h1>Bid</h1><p>Introduction</p><h2>Insurance</h2><table><tr><th>Coverage</th><th>Limit</th></tr><tr><td>Liability</td><td>$2M</td></tr></table></body></html>';
    const result = await new HtmlParserAdapter().parse(
      input(strToU8(html), 'bid.html', 'text/html'),
    );
    expect(result.pages[0]?.blocks.some((block) => block.text.includes('steal'))).toBe(false);
    expect(result.pages[0]?.tables[0]?.cells).toHaveLength(4);
    expect(
      result.sections.map((section) => ({ title: section.title, level: section.level })),
    ).toEqual([
      { title: 'Bid', level: 1 },
      { title: 'Insurance', level: 2 },
    ]);
    expect(result.sections[1]?.parentSectionId).toBe(result.sections[0]?.id);
  });

  it('preserves DOCX paragraph order and explicit no-pagination warning', async () => {
    const bytes = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': strToU8(
        '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>First</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Insurance limits</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Second</w:t></w:r></w:p></w:body></w:document>',
      ),
    });
    const result = await new DocxParserAdapter().parse(
      input(
        bytes,
        'request.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    );
    expect(result.pages[0]?.blocks.map((block) => block.text)).toEqual([
      'First',
      'Insurance limits',
      'Second',
    ]);
    expect(result.pages[0]?.tables[0]?.cells[0]).toMatchObject({
      rawText: 'Insurance limits',
      columnSpan: 2,
    });
    expect(result.warnings.some((w) => w.code === 'page_navigation_unavailable')).toBe(true);
  });

  it('preserves XLSX sheet, formula, cell, row and column context', async () => {
    const bytes = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8(
        '<workbook xmlns:r="r"><sheets><sheet name="Insurance" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Coverage</t></is></c><c r="B1" t="inlineStr"><is><t>Limit</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Liability</t></is></c><c r="B2"><f>1000000*2</f><v>2000000</v></c></row></sheetData><mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>',
      ),
    });
    const result = await new XlsxParserAdapter().parse(
      input(
        bytes,
        'cost.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    );
    const table = result.pages[0]?.tables[0];
    expect(result.pages[0]?.displayedPageLabel).toBe('Insurance');
    expect(table?.cells.find((cell) => cell.provenance.cellRange === 'B2')).toMatchObject({
      formula: '1000000*2',
      numericValue: 2000000,
    });
    expect(
      table?.cells.find((cell) => cell.rowIndex === 0 && cell.columnIndex === 0),
    ).toMatchObject({ columnSpan: 2, provenance: { cellRange: 'A1:B1' } });
  });

  it('bounds ZIPs, blocks nested/unapproved members, and requires classification', async () => {
    const bytes = zipSync({
      'rfp.txt': strToU8('shall submit'),
      'forms/form-a.pdf': strToU8('%PDF-1.4'),
    });
    const entries = await readBoundedArchive(bytes);
    expect(entries.size).toBe(2);
    expect(() => assertSafePackageEntries(new Map([['nested.zip', Buffer.from('x')]]))).toThrow(
      /Nested/,
    );
    const result = await new ZipPackageParserAdapter().parse(
      input(bytes, 'package.zip', 'application/zip'),
    );
    expect(result.pages[0]?.blocks).toHaveLength(2);
    await expect(readBoundedArchive(zipSync({ '../escape.txt': strToU8('x') }))).rejects.toThrow();
    await expect(
      readBoundedArchive(zipSync({ 'bomb.txt': new Uint8Array(20_000) }), {
        maxEntries: 2,
        maxEntryBytes: 30_000,
        maxTotalUncompressedBytes: 30_000,
        maxCompressionRatio: 2,
      }),
    ).rejects.toThrow(/compression ratio/i);
  });
});

describe('deterministic policies', () => {
  it('selects requirements and addenda across the complete document without a leading-page cutoff', () => {
    const pages = Array.from({ length: 420 }, (_, index) => ({
      pageNumber: index + 1,
      text:
        index === 399
          ? 'Addendum 4 revises the proposal deadline to 2027-08-20.'
          : index === 210
            ? 'The bidder shall submit Form A-1.'
            : `Background narrative page ${index + 1}`,
    }));
    const selection = selectWholeDocumentPages(pages, { maxPagesPerBatch: 3 });
    expect(selection.selectedPages.map((page) => page.pageNumber)).toEqual(
      expect.arrayContaining([1, 210, 211, 212, 399, 400, 401, 420]),
    );
    expect(selection.batches.every((batch) => batch.length <= 3)).toBe(true);
    expect(selection.excludedPageNumbers).toContain(100);
  });

  it('selects OCR only for low-text image-dominant pages', () => {
    expect(
      selectOcr({
        characterCount: 0,
        printableCharacterRatio: 0,
        replacementCharacterRatio: 0,
        plausibleWordRatio: 0,
        readingOrderScore: 0,
        imageCoverageRatio: 1,
        parserWarningCount: 0,
        parserFailed: false,
      }).classification,
    ).toBe('ocr_required');
    expect(
      selectOcr({
        characterCount: 500,
        printableCharacterRatio: 1,
        replacementCharacterRatio: 0,
        plausibleWordRatio: 0.9,
        readingOrderScore: 0.9,
        imageCoverageRatio: 0,
        parserWarningCount: 0,
        parserFailed: false,
      }).classification,
    ).toBe('native_text_sufficient');
  });

  it('keeps fixture OCR explicit and fails closed for unknown inputs', async () => {
    const adapter = new MockOcrAdapter({
      known: { text: 'Form A-1 is required', confidence: 0.91 },
    });
    expect(await adapter.recognize({ bytes: new Uint8Array(), inputHash: 'known' })).toMatchObject({
      engineId: 'mock-ocr',
      meanConfidence: 0.91,
    });
    await expect(
      adapter.recognize({ bytes: new Uint8Array(), inputHash: 'unknown' }),
    ).rejects.toThrow(/fixture_missing/);
  });

  it('prefilters requirement, addendum, table, and uncertain blocks without deciding support', () => {
    expect(
      classifyBlock({
        type: 'paragraph',
        text: 'Vendor shall submit Form A-1 by 2027-04-03',
        confidence: 1,
        metadata: {},
      }).classification,
    ).toBe('likely_requirement');
    expect(
      classifyBlock({
        type: 'paragraph',
        text: 'Addendum 2 replaces the deadline',
        confidence: 1,
        metadata: {},
      }).classification,
    ).toBe('addendum_precedence_relevant');
    expect(
      classifyBlock({ type: 'table', text: '', confidence: 1, metadata: {} }).classification,
    ).toBe('table_requiring_structured_review');
    expect(
      classifyBlock({ type: 'paragraph', text: 'required', confidence: 0.2, metadata: {} })
        .classification,
    ).toBe('parser_uncertain');
  });

  it('keeps table numeric facts attached to row and column scope', () => {
    const table: NormalizedTable = {
      id: 'table',
      sourceDocumentId: 'doc',
      blockId: 'block',
      title: 'Insurance',
      headerRows: [0],
      rowCount: 3,
      columnCount: 2,
      confidence: 1,
      warnings: [],
      repeatedHeader: false,
      cells: [
        {
          id: 'h1',
          rowIndex: 0,
          columnIndex: 0,
          rowSpan: 1,
          columnSpan: 1,
          rawText: 'Coverage',
          normalizedText: 'Coverage',
          role: 'header',
          confidence: 1,
          provenance: { sourceDocumentId: 'doc', sourceFormat: 'xlsx' },
        },
        {
          id: 'h2',
          rowIndex: 0,
          columnIndex: 1,
          rowSpan: 1,
          columnSpan: 1,
          rawText: 'Per occurrence minimum',
          normalizedText: 'Per occurrence minimum',
          role: 'header',
          confidence: 1,
          provenance: { sourceDocumentId: 'doc', sourceFormat: 'xlsx' },
        },
        {
          id: 'r1',
          rowIndex: 1,
          columnIndex: 0,
          rowSpan: 1,
          columnSpan: 1,
          rawText: 'General Liability',
          normalizedText: 'General Liability',
          role: 'row_header',
          confidence: 1,
          provenance: { sourceDocumentId: 'doc', sourceFormat: 'xlsx' },
        },
        {
          id: 'v1',
          rowIndex: 1,
          columnIndex: 1,
          rowSpan: 1,
          columnSpan: 1,
          rawText: '$2M',
          normalizedText: '$2M',
          role: 'data',
          confidence: 1,
          provenance: { sourceDocumentId: 'doc', sourceFormat: 'xlsx' },
        },
        {
          id: 'r2',
          rowIndex: 2,
          columnIndex: 0,
          rowSpan: 1,
          columnSpan: 1,
          rawText: 'Automobile',
          normalizedText: 'Automobile',
          role: 'row_header',
          confidence: 1,
          provenance: { sourceDocumentId: 'doc', sourceFormat: 'xlsx' },
        },
        {
          id: 'v2',
          rowIndex: 2,
          columnIndex: 1,
          rowSpan: 1,
          columnSpan: 1,
          rawText: '$1,000,000',
          normalizedText: '$1,000,000',
          role: 'data',
          confidence: 1,
          provenance: { sourceDocumentId: 'doc', sourceFormat: 'xlsx' },
        },
      ],
    };
    const facts = extractTableFacts(table);
    expect(facts[0]).toMatchObject({
      normalizedValue: 2_000_000,
      rowLabel: 'General Liability',
      columnLabel: 'Per occurrence minimum',
      operator: 'minimum',
    });
    expect(compareTableFacts(facts[0]!, facts[1]!)).toBe('scope_incompatible');
    expect(renderTableForModel(table)).toContain('| General Liability | $2M |');
  });

  it('builds complete cache keys and explains fail-closed misses', () => {
    const sourceHash = 'a'.repeat(64);
    const setHash = 'b'.repeat(64);
    const value = {
      workspaceId: 'w',
      sourceDocumentId: 'd',
      sourceFileHash: sourceHash,
      documentSetHash: setHash,
      parserAdapterId: 'p',
      parserVersion: '1',
      normalizationVersion: '1',
      ocrPolicyVersion: '1',
      tableExtractionVersion: '1',
      prefilterVersion: '1',
      indexVersion: '1',
      promptSetVersion: '1',
      modelId: 'mock',
      modelConfiguration: { reasoning: 'none' },
      extractionSchemaVersion: '1',
      verificationVersion: '1',
      evaluatorVersion: '1',
      featureFlags: { tables: true },
    };
    expect(buildAnalysisCacheKey(value)).toBe(
      buildAnalysisCacheKey({ ...value, modelConfiguration: { reasoning: 'none' } }),
    );
    expect(
      explainCacheDecision({
        expectedKey: 'x',
        storedKey: 'x',
        workspaceMatches: true,
        completed: true,
        parserFailed: false,
        invalidated: false,
      }),
    ).toBe('hit');
    expect(
      explainCacheDecision({
        expectedKey: 'x',
        storedKey: 'x',
        workspaceMatches: false,
        completed: true,
        parserFailed: false,
        invalidated: false,
      }),
    ).toBe('miss_workspace_mismatch');
    expect(
      planTargetedCacheInvalidation({
        changed: [
          {
            dependencyType: 'document',
            dependencyKey: 'addendum-2',
            previousHash: sourceHash,
            currentHash: 'c'.repeat(64),
          },
        ],
        dependencies: [
          {
            cacheEntryId: 'verification-addendum',
            dependencyType: 'document',
            dependencyKey: 'addendum-2',
            dependencyHash: sourceHash,
            stage: 'independent_verification',
          },
          {
            cacheEntryId: 'parse-primary',
            dependencyType: 'document',
            dependencyKey: 'primary',
            dependencyHash: setHash,
            stage: 'normalizing',
          },
        ],
      }),
    ).toMatchObject({
      cacheEntryIds: ['verification-addendum'],
      stages: ['independent_verification'],
    });
  });

  it('estimates stage costs, analysis-mode boundaries, and expired leases', () => {
    const estimate = estimateAnalysisCost({
      ocrPages: 10,
      embeddingTokens: 100_000,
      classificationCalls: 5,
      extractionCalls: 2,
      verificationCalls: 2,
      ambiguityCalls: 0,
      averageInputTokens: 2000,
      outputLimits: { classification: 200, extraction: 1000, verification: 800, ambiguity: 1000 },
      pricesPerMillion: { input: 1, output: 4, embedding: 0.02, ocrPage: 0.01 },
      retryAllowance: 1,
      estimatedMillisecondsPerCall: 1000,
    });
    expect(estimate.hardMaximumUsd).toBeGreaterThanOrEqual(estimate.highUsd);
    expect(ANALYSIS_MODES.quick_scan.finalVerification).toBe(false);
    expect(
      canClaimWorkUnit({
        status: 'leased',
        leaseExpiresAt: new Date(0),
        now: new Date(1),
        attempts: 1,
        maxAttempts: 3,
      }),
    ).toBe(true);
  });

  it('produces stable IDs and canonical hashes independent of key order', () => {
    expect(stableSourceId('a', 1)).toBe(stableSourceId('a', 1));
    expect(normalizedContentHash({ a: 1, b: 2 })).toBe(normalizedContentHash({ b: 2, a: 1 }));
  });
});
