# Large-Document Ingestion and Cost-Efficient Analysis — Implementation Plan

Date: 2026-07-22

Authorized scope: post-roadmap ingestion, normalization, durable processing, retrieval, cost controls, prepared demo, and evaluation. Paid provider calls and production rollout are excluded.

## Baseline and stable contracts

The current system accepts only PDF, flattens page text, parses a document in one worker job, and replaces every page on retry. Extraction then slices a fixed leading page window. These behaviors are unsuitable for mixed-format or 400-page procurement packages.

The new layer is additive. It preserves immutable source objects, existing `documents` and `document_pages` compatibility, the Phase 4 qualified fingerprint, extraction/verification independence, exact evidence, separate status axes, Phase 5–8 deterministic engines, private storage, workspace RLS, and append-only human/audit history. Existing downstream code receives a compatible page-text projection from the normalized representation while new code consumes source blocks/tables directly.

## Implementation sequence

1. Make Phase 8 provisioning provably idempotent for three consecutive identical runs.
2. Add versioned normalized document, block, table, inspection, OCR-selection, package, and cost schemas.
3. Add signature-led adapters for PDF, DOCX, XLSX, HTML, TXT, approved images, and bounded ZIP packages.
4. Add durable document-set jobs, stage records, leased page/block work units, dependency edges, cache records, invalidation records, cost estimates, and analysis modes through additive migrations.
5. Add deterministic prefiltering, hierarchical sections, structured-table retrieval records, bounded context construction, provider-independent model tiers, and dependency-aware invalidation.
6. Project normalized pages into the legacy page contract; update uploads, workers, inspection/progress/recovery UI, and operator cost/cache explanations.
7. Add the 420-page synthetic known-answer corpus, mixed-format fixtures, adversarial tables/archives, selective-OCR fixtures, performance/evaluation artifacts, and a prepared 350+ page demo.
8. Apply only the reviewed migration to `uxmxkdjschbekkbnweby`, inspect RLS, and run all repository gates sequentially.

## Data and migration policy

Migration is additive and performs no delete, rewrite, or content backfill. New machine-owned tables are workspace-scoped, RLS-enabled, authenticated-member SELECT-only, and mutated only by narrowly scoped server/worker paths. Composite scope constraints and triggers reject cross-workspace document, page, block, table, cache, dependency, and job references. Immutable source bytes remain in the existing private bucket.

## Versioned policy identifiers

- normalized document: `normalized-document-v1`
- parser registry: `document-parser-adapters-v1`
- table model/extraction: `normalized-table-v1`
- OCR selection: `selective-ocr-v1`
- structural classification: `document-structure-v1`
- deterministic prefilter: `requirement-prefilter-v1`
- block/table index: `normalized-index-v1`
- cache key/invalidation: `analysis-cache-v1`
- durable orchestration: `large-document-jobs-v1`
- model tiers/bounded context: `analysis-tiers-v1`
- cost estimator: `analysis-cost-estimator-v1`
- analysis modes: `analysis-modes-v1`

## Risk updates

- Word pagination is not reproducible from OOXML alone; DOCX evidence uses part/paragraph/table provenance unless a rendered artifact exists.
- Selective OCR is an adapter boundary. The prepared corpus uses deterministic fixture OCR; production OCR remains fail-closed until an approved local or paid engine is configured.
- Spreadsheet formula values can be stale because OOXML stores cached values; raw formula and cached/display value remain separate and visibly warned.
- ZIP and OOXML parsing is bounded by entry count, compressed/uncompressed bytes, compression ratio, depth, approved types, and path validation.
- PDF table inference from geometry is probabilistic; low-confidence associations remain uncertain and cannot establish exact numeric support.
- A development database already contains synthetic/E2E rows. The migration has no backfill or destructive statement.

## Test strategy

Pure unit fixtures cover signatures, normalized hashes, stable IDs, format adapters, OOXML tables, HTML neutralization, OCR selection, archive traversal/bombs, table-value scoping, prefilter recall, bounded contexts, cache invalidation, cost estimation, analysis modes, and lease rules. Integration tests cover migrations, RLS, duplicate claims, crash/lease recovery, partial retry, cross-workspace denial, cache isolation, reservations, and idempotent Phase 8 provisioning. Mock browser tests cover mixed uploads, inspection, progress, retry/cancel, cost explanations, warnings, and exact evidence navigation. No default test constructs a paid provider.

## External documentation consulted

Context7 `/thejoshwolfe/yauzl` confirms lazy entry iteration, automatic filename traversal validation with decoded strings, strict filenames, and entry-size validation. The implementation additionally imposes aggregate uncompressed size, entry-count, compression-ratio, nesting, and approved-type bounds. Context7 resolved `/naturalintelligence/fast-xml-parser` as the pure-JavaScript XML parser used for controlled OOXML parts; entity processing is disabled and only allowlisted parts are parsed.
