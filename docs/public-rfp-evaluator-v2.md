# Public RFP evaluator v2

Date: 2026-07-19. Status: implemented and tested offline; no provider run.

## Purpose

This version corrects the failure modes observed in the San Bernardino County public baseline without changing the qualified Phase 4 production contract.

## Versioned controls

- Extraction batches: `public-extraction-batches-v2`
- Official portal source: `public-portal-source-v1`
- Explicit deadline precedence: `public-explicit-precedence-v1`
- Preliminary quotation gate: `public-preliminary-quote-gate-v1`
- Known-answer matchers: `public-known-answer-matchers-v2`
- Evaluation artifact: `public-rfp-live-evaluation-v2`

## Evaluation rules

1. A long document is submitted as consecutive page batches, never as one whole-document extraction response.
2. The preserved official procurement page is treated as untrusted evidence, not as an instruction or tool source.
3. Deadline precedence requires explicit old/new amendment language. Addendum number, issue date, upload order, filename, and page order do not establish which value controls.
4. A preliminary quotation must occur exactly or after deterministic normalization on the cited page. A fuzzy recovery candidate is rejected rather than silently promoted.
5. Every accepted unique candidate receives candidate-centered verification with no more than two contexts.
6. Every frozen known answer is scored. Extraction alone is insufficient: the candidate must be source-supported and have the correct document, page, quotation, and precedence status.

## Rollout boundary

This evaluator is a public-test harness, not authorization for ordinary live verification. It has not erased or rescored the failed v1 result. A new run would require an explicit public-evaluation flag, a fresh budget authorization, an unchanged frozen answer set, and a new non-secret artifact.
