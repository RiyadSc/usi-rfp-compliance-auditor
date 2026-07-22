# Large and Complex RFP Processing Guide

## Supported sources

The application accepts PDF, DOCX, XLSX, HTML, TXT, PNG/JPEG/TIFF/WebP images, and safe ZIP procurement packages. The default practical ceiling is 100 MiB and 500 pages or logical units. Server policy may set a lower limit. Files beyond the ceiling are rejected visibly; content is never silently truncated.

ZIP files are containers, not trusted folders. Each member is checked for traversal, size, compression ratio, nested archives, and an approved extension. Members require a document role such as solicitation, addendum, form, pricing sheet, exhibit, or unknown/review required. Executables and nested ZIPs are rejected.

## What processing does

PDF keeps physical pages, labels, text geometry, and source-page navigation. DOCX keeps paragraph/table order and header/footer provenance but does not pretend rendered page numbers are dependable. XLSX keeps sheet names, hidden state, formulas, cached values, merged ranges, row/column headers, and cells. HTML scripts/styles are neutralized and evidence uses DOM paths. TXT uses line/offset provenance. Images remain parser uncertain unless an approved OCR adapter supplies text.

OCR is selective. Native text is measured for character quality, reading order, plausible words, and image coverage. Good text is retained; blank/image-dominant or damaged pages are marked for OCR. Low-confidence OCR stays uncertain and requires human review. The repository demo uses fixture-only mock OCR and does not call a paid OCR service.

Tables are displayed as tables. Values stay attached to headers, row labels, column labels, spans, page/sheet/cell coordinates, and units. A split table can reference its prior page. Always inspect a warning when table association is uncertain.

## Analysis modes and cost

- Quick scan: deterministic discovery and complexity/cost preview; provider use is not allowed.
- Standard analysis: candidate extraction followed by independent verification.
- Deep audit: standard analysis plus targeted complex-table, addendum, conflict, and ambiguity review.

Before analysis, the interface shows expected low/high cost, a hard maximum, expected calls/time, and the largest stage. These are estimates, not provider invoices. A hard maximum above policy blocks execution. General live verification remains disabled; ordinary application use stays on `MockProvider`.

## Progress, retry, and recovery

Progress is persisted as exact completed/total work units, not a guessed percentage. Jobs and page/block work are idempotent and leased. If a worker stops, an expired lease is reclaimable. Retry only the failed unit when offered. Existing completed pages, human review, and downstream Phase 4–8 records are not erased.

Cache hits require every material binding to match. A changed source, addendum set, parser, prompt, schema, model, or configuration produces a documented miss or targeted invalidation. Failed/incomplete artifacts are never valid cache hits.

## Evidence and human review

Open a document page to see the original PDF page or the original native source, extracted text, parser warnings, and structured table evidence. Non-PDF evidence uses honest native coordinates. Requirements continue to show separate source support, precedence, proof, parser, and human-review axes. Machine output is never human approval, bidder compliance, or a guarantee that submission is safe.

## Prepared demonstration

Run `npm run demo:provision:large-document`, then start the normal web app and worker with live provider flags disabled. Open **Harbor City 420-page Large RFP Demo**. Page 40 shows structured insurance evidence; pages 50–51 demonstrate a split table; pages 101–110 are selective-OCR cases; page 275 carries a parser warning; pages 390 and 409–411 demonstrate an original deadline and addendum changes. The prepared history contains no provider output and incurs no provider spend.

If processing cannot continue, record the exact job, stage, work unit, source hash, parser version, and warning. Do not turn uncertainty into a definitive requirement. See the contingency runbook for recovery.
