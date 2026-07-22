# Large-Document Ingestion and Cost-Efficient Analysis — Completion Report

Date: 2026-07-22

Status: complete for the authorized development workstream; not deployed; no paid provider calls.

## 1–6. Implementation, preserved contracts, formats, and canonical parsing

1. **Implementation summary.** Added signature-led mixed-format ingestion, one canonical normalized hierarchy, structured tables, selective OCR policy, durable resumable work, whole-document deterministic selection, bounded model contexts, version-complete caching, targeted invalidation, stage cost estimation, prepared demo data, and operator UI.
2. **Contracts preserved.** Immutable private sources, SHA-256 identity, Phase 2–8 compatibility projections, exact evidence, workspace RLS, machine/human separation, candidate/verification separation, parser uncertainty, protected live flags, the Phase 4 fingerprint, and deterministic Phase 5–8 behavior are unchanged.
3. **Provisioning idempotency.** Phase 8 cache persistence now uses scope-safe upserts. `test-phase8-provision-idempotency-v1` provisions the same scope three times and finishes with one scope, one cache entry, zero calls, and zero spend.
4. **Supported formats.** PDF, DOCX, XLSX, inert HTML, UTF-8 TXT, approved PNG/JPEG/TIFF/WebP images, and bounded ZIP packages. Signature, declared MIME, extension, and OOXML container must agree. Unsupported, malformed, encrypted, active HTML, unsafe archive, and spoofed input fails visibly.
5. **Canonical model.** `normalized-document-v1` stores deterministic document/page-or-unit/section/block/table/cell IDs and hashes, order, confidence, warnings, physical page labels where available, and honest sheet/cell/paragraph/DOM/line provenance where PDF pages do not exist.
6. **Adapter architecture.** `document-parser-adapters-v1` exposes versioned inspect/parse behavior. PDF uses PDF.js geometry and targeted page decoding; DOCX/XLSX parse allowlisted OOXML parts; HTML is never executed; TXT is line-anchored; images are uncertain pending OCR; ZIP is lazy and bounded.

## 7–11. Tables, OCR, durability, retry, and concurrency

7. **Table preservation.** `normalized-table-v1` retains titles/captions, multi-row/row headers, row/column order, spans, formulas/cached values, numeric/date/unit fields, bounding boxes, repeated headers, split-page continuation links, and exact cell provenance. Model contexts include both structured JSON and deterministic rendering.
8. **OCR selection.** `selective-ocr-v1` scores density, character quality, replacement rate, plausible words, reading order, image coverage, warnings, and failure state. Good native text wins; only selected pages enter OCR. The repository adapter is fixture-only and unknown inputs fail closed.
9. **Jobs/work units.** `large-document-jobs-v1` persists workspace/document/run scope, stage/version/input hash, exact progress, attempts, leases, bounded errors, completion artifacts, and terminal states. Sixteen new tables are machine-owned and RLS-enabled.
10. **Retry/resume.** Page parse and OCR units are stable and individually retryable. PDF page retry re-decodes and upserts only the failed page; completed pages are not replaced. Expired leases can be reclaimed; duplicate claims are atomic; cancellation and terminal OCR-unavailable states are explicit.
11. **Concurrency.** Server ceilings default to OCR 1, embedding 2, classification 2, extraction 1, verification 1, and reporting 1. Clients cannot raise limits. Unique bindings, atomic claims, leases, idempotent keys, and budget gates prevent duplicate or unbounded execution.

## 12–19. Selection, models, retrieval, packages, caching, and cost

12. **Prefiltering.** `requirement-prefilter-v1` uses obligation/addendum/form/deadline/insurance/table/date/number signals and confidence. It favors critical recall but never makes source-support decisions.
13. **Hierarchical analysis.** Deterministic heading hierarchy and package/document/section/page/block/table structure guide analysis. `whole-document-selection-v1` scans every page, includes signal-page neighbors and document boundaries, and records exclusions/truncation instead of slicing the leading pages.
14. **Model tiers.** `analysis-tiers-v1` defines deterministic, classification, extraction, independent verification, and ambiguity tiers with bounded inputs/outputs. `MockProvider` implements every tier; extraction output cannot serve as verification.
15. **Retrieval/index.** `normalized-index-v1` indexes block text, heading path, document class, table title/headers/row-cell combinations, parser state, and exact source locators. `bounded-analysis-context-v1` limits records, characters, tokens, pages, and cells and reports omission reasons. Retrieval remains workspace filtered.
16. **Addenda/packages.** ZIP members preserve hierarchy, hashes, deduplication, and reviewable roles. Explicit document relations support amends/supersedes/replaces/clarifies/references/attachment/unknown; upload order alone never establishes precedence.
17. **Cache/invalidation.** `analysis-cache-v1` binds workspace, sources/sets, every parser/OCR/table/prefilter/index/prompt/model/schema/verification/evaluator version, flags, and status. `targeted-cache-invalidation-v1` retains immutable source and unchanged normalization while invalidating dependent extraction/verification/checklist/report work.
18. **Cost estimation.** `analysis-cost-estimator-v1` deterministically reports low/high/hard USD estimates, call range, time, stage breakdown, and largest stage from characters, selected OCR pages, output limits, retry allowance, and server pricing.
19. **Cost control.** Missing pricing/configuration, an excessive hard maximum, failed reservation, or unsupported complexity blocks provider construction. Cache hits cost zero. The workstream made no provider calls and spent $0.

## 20–24. Corpus and measured metrics

20. **Corpus.** `large-document-corpus-v1` includes repository-safe native, scanned/hybrid, table-heavy, DOCX, XLSX, HTML, TXT, ZIP, malformed/encrypted/unsupported metadata, and a generated 420-page known-answer PDF. The large fixture has 10 image-like pages, 8 tables, a split table, mandatory form, late deadline, and addendum changes.
21. **Parsing.** Format detection 1.0; page count 1.0; block order 1.0; table precision/recall 1.0/1.0; cell association 1.0; OCR-selection precision/recall 1.0/1.0; warning accuracy 1.0.
22. **Requirement discovery.** Critical precision/recall 1.0/1.0; mandatory-form recall 1.0; deadline recall 1.0; insurance accuracy 1.0; addendum precedence 1.0; citation validity 1.0.
23. **Cost reduction.** 0 provider calls per 100 pages; estimate-versus-simulation 1.0; 94.5238% of blocks excluded before AI; 2.3810% of pages selected for OCR; cache-hit savings $2.5348; simulated low/high/hard cost $1.9011/$2.5348/$5.0696.
24. **Reliability.** Resume, duplicate prevention, page retry, and stale-cache rejection all 1.0. Cross-workspace leaks, destructive overwrites, and invariant violations are zero. Every required dangerous count is zero.

## 25–30. Security, isolation, performance, tests, calls, and migrations

25. **Security.** MIME/signature spoofing, malicious HTML, formula retention, archive traversal/bomb/nesting/type limits, prompt-injection authority, ordinary machine-write denial, unauthorized retry/cancel, and budget bypass are covered. `npm audit` reports zero vulnerabilities after exact `sharp 0.35.3` and `postcss 8.5.19` security pins. Secret scanning covers tracked/untracked candidates and normal/isolated client bundles.
26. **Isolation.** All 16 new tables have RLS. Ordinary members have same-workspace SELECT only. Composite foreign keys and service-path checks reject cross-workspace and cross-document nested evidence, jobs, caches, dependencies, and costs. Integration results: 82/82.
27. **Performance.** On the development Mac/Node 22, the generated 420-page PDF normalized to 820 blocks and 8 tables in 1.598 seconds (262.83 pages/second). Targeted page retry succeeded. The prepared 420-page route passed browser assertions. These are local measurements, not production SLAs.
28. **Automated tests.** Unit: 360/360 in 28 files. Supabase integration: 82/82 in 9 files. Isolated mock Playwright: 21 passed across 10 spec files; one explicitly live-only audit was skipped. Deterministic large-document and Phase 8 evaluations passed; Phase 8 provisioning passed three consecutive runs. Lint, Prettier, type-check, lockfile, production build, dependency audit, secret scan, and invariant checklist passed.
29. **Provider usage.** `MockProvider` only; 0 paid calls; 0 provider spend. General live verification remains disabled.
30. **Migrations.** `20260722000024_large_document_ingestion.sql` adds 16 scoped normalized/job/cache/cost tables, indexes, RLS, policies, and atomic claim RPC. `20260722000025_large_document_scope_hardening.sql` adds composite nested-scope and analysis-run bindings. Both are additive and applied to development project `uxmxkdjschbekkbnweby`.

## 31–35. Documentation, residual risk, commits, cleanliness, completion

31. **Documentation.** Updated architecture, data flow, normalized model, parser/table/OCR/job/cache/cost/provider restrictions, security/threat controls, risk, assumptions, decisions, testing, performance, demo, contingency, build status, invariant result, deployment constraint, and the operator guide.
32. **Residual risks.** Production OCR is deliberately unconfigured; DOCX exact pagination requires a rendered artifact; spreadsheet cached formula values may be stale; PDF table geometry can remain uncertain; large ZIP/worker memory and throughput require target-environment capacity tests; all live/provider and confidential-data paths remain separately gated.
33. **Git commits.** Recorded in the final handoff and repository history after logical schema/core, worker/UI/evaluation, and documentation commits.
34. **Worktree.** Required clean at handoff after the commits below are created.
35. **Completion status.** Every authorized large-document completion gate is satisfied in development. This does not authorize deployment, production/customer data, paid OCR/model calls, or another workstream.

## External documentation consulted

Context7 references for `yauzl` informed lazy/strict ZIP handling and filename/size validation; Context7 references for `fast-xml-parser` informed allowlisted, entity-disabled OOXML parsing. Repository package contracts and official package metadata were used for the dependency security pins.
