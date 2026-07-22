# Large-document data flow

1. A member creates a short-lived workspace-scoped upload intent. The server validates extension, declared MIME, byte limit, and detected signature/OOXML container.
2. The private object is registered with its source format and SHA-256 hash. A versioned durable job is created before queueing.
3. A format adapter inspects and normalizes the source. Active HTML is never executed. Archives are read lazily with entry, expanded-size, ratio, nesting, and type limits.
4. The worker persists the normalized document, logical pages, heading hierarchy, ordered blocks, tables, cells, warnings, and a legacy page projection for Phase 2–8 compatibility.
5. Page work units and stage progress are persisted. Leases recover after worker interruption. A failed PDF page can be re-decoded and upserted without replacing the other pages.
6. `requirement-prefilter-v1` classifies all blocks deterministically. `whole-document-selection-v1` selects signal pages and neighbors across the complete document, then creates bounded batches. It never slices the leading N pages silently.
7. Retrieval records preserve workspace, document class, section path, page/sheet/cell coordinates, table headers, parser confidence, and source hash. Bounded context reports every truncation reason.
8. Tier 0 is deterministic. Mock tier 1 classifies, tier 2 extracts, tier 3 independently verifies, and tier 4 represents ambiguity escalation. Extraction candidates stay unverified and cannot serve as their own verification.
9. Cache keys bind source/document-set hashes and every material parser, OCR, table, prefilter, index, prompt, model, schema, evaluator, and feature version. New addenda invalidate downstream analysis while unchanged normalized source artifacts remain reusable.
10. The stage estimator persists expected low, expected high, hard maximum, call range, duration, and largest cost stage. Normal application processing remains `MockProvider`; no API key alone enables paid execution.

Durable stages and units use server-controlled concurrency. Default ceilings are OCR 1, embedding 2, classification 2, extraction 1, verification 1, and reporting 1. Operators may lower them; configured maxima prevent unsafe increases.
