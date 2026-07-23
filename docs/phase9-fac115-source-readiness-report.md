# Phase 9 Massachusetts FAC115 source-readiness report

Date: 2026-07-23  
Solicitation: `BD-22-1080-OSD03-SRC01-70375`  
Stage: provider-free preparation only

## Decision

The frozen Massachusetts source package is ready for deterministic citation work, but the Phase 9 live pilot is not ready. No provider was constructed and no OpenAI call or spend occurred.

The official COMMBUYS record confirms the solicitation title, Operational Services Division issuer, May 3, 2022 bid opening, April 5 bidder conference, seven preserved attachment IDs, and amendment 13's update to Attachment B:

<https://www.commbuys.com/bso/external/bidDetail.sdo?docId=BD-22-1080-OSD03-SRC01-70375&external=true&parentUrl=close>

## Source and rendition checks

- All eight source files match the frozen byte counts and SHA-256 hashes in `massachusetts-fac115-source-manifest-v1`.
- The preserved official portal contains every recorded attachment ID.
- The source set contains no bidder proposal, vendor submission, USI document, or confidential company material.
- All seven PDF renditions match `massachusetts-fac115-rendition-manifest-v1`.
- The rendered package contains 84 PDF pages plus the single preserved portal evidence page.
- All 23 Phase 9 expected quotations resolve on the exact rendered page using exact or normalized-exact matching.
- PDF parser warnings and empty-page counts are recorded in the Stage 0 artifact. No citation was accepted from an empty or unresolved page.

The source package is Category 1 scoped. Category 3 fence-rental pricing and generic post-award reference documents remain explicitly excluded rather than silently merged.

## Native Office provenance

The Phase 9 contract keeps the official Office original and its read-only PDF rendition distinct.

- DOCX evidence stores the original file, native section, rendition file, and rendered page.
- XLSX evidence stores the original workbook, sheet, cell range, rendition file, and rendered page.
- Formulas and cached values remain separately represented by the normalized XLSX parser warning; a cached value is not silently treated as current truth.
- Spreadsheet evidence does not become ordinary flattened PDF text.

The added workbook-native pricing case resolves exactly to:

- Original: `FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.xlsx`
- Sheet/cell: `Guard Services!I11`
- Exact value: `Union Rate Markup % (must list, even if 0%)`
- Read-only rendition: `FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.pdf`
- Rendered page: `3`

## Expected-answer contract

The historical 22 answers remain unchanged. `massachusetts-fac115-phase9-policy-v1` adds stable candidate IDs, separate source/precedence/proof expectations, scope, comparison operators, typed dates and numbers, and native provenance. It also adds one objective workbook-native pricing case.

- Version: `massachusetts-fac115-phase9-expected-v1`
- Cases: `23`
- SHA-256: `8f97d2df60b5b82fbf126520f08b1c5684b1edeaa81f46e37f944c7723274db5`

The official package contains no genuine unresolved amendment conflict, parser-uncertain planted requirement, or malicious prompt-injection passage. Those absences are recorded as coverage gaps. They are not filled with invented source text.

A separate `phase9-security-control-companion-v1` points to the already frozen synthetic `verification-cases-v2` conflict, parser-uncertainty, and injection controls. It is explicitly marked as non-Massachusetts, ineligible for FAC115 source metrics, and ineligible for the FAC115 live pilot.

## Provider-free rendered-page correction

`massachusetts-fac115-rendered-page-reanchor-v1` validates every historical candidate's own quotation against every rendered page in the same document. It:

- does not read or use expected answers;
- changes a page only when one exact or normalized-exact match exists;
- refuses zero-match and multiple-match cases;
- preserves the historical extraction artifact;
- records the original page, resolved page, all matching pages, and a stable manifest hash.

This correction recovers five expected-answer bindings, increasing exact mappings from `8/23` to `13/23`. Ten expected requirements remain extraction misses or ambiguous. No candidate was generated from an expected answer.

## Artifacts

- `fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375/phase9-expected-answers-v1.json`
- `artifacts/evaluation/phase9-fac115-stage0-readiness-v1.json`
- `artifacts/evaluation/phase9-fac115-candidate-mapping-failures-v1.json`
- `artifacts/evaluation/phase9-fac115-rendered-page-reanchor-v1.json`
- `fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375/phase9-security-control-companion-v1.json`
