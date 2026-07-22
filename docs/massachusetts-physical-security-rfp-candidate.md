# Massachusetts physical-security RFP candidate

Date reviewed: 2026-07-20. Official documents are preserved and hash-pinned. No document was ingested into the application and no provider call was made.

## Recommended test package

**FAC115 — Security Services, Private Investigative Services, and Fence Rental**  
Commonwealth of Massachusetts Operational Services Division  
COMMBUYS bid `BD-22-1080-OSD03-SRC01-70375`

- Official solicitation: <https://www.commbuys.com/bso/external/bidDetail.sdo?docId=BD-22-1080-OSD03-SRC01-70375&external=true&parentUrl=close>
- Official Massachusetts contract guide: <https://www.mass.gov/doc/fac115/download>
- Official procurement-search guidance: <https://www.mass.gov/how-to/search-for-procurements-in-commbuys>

## Why it is a strong test and demo

- It is an official Commonwealth statewide procurement from the Operational Services Division, not a repost or vendor marketing page.
- Category 1 is expressly `Security Guard Services` (UNSPSC 92-12-15), so the demo can stay focused on physical security officers even though the statewide contract also covers investigative services and fence rental.
- The public package includes the Request for Response, bidder response form, security-services price sheet, supplier-diversity form, prompt-payment form, COMMBUYS submission guide, standard contract/terms, and intent-to-bid notice.
- The portal records 14 amendment events. They include a changed pre-bid-conference date, attachment additions, an updated price sheet, and repeated Q&A updates. This directly tests the app's most important precedence behavior: preserving the old statement while identifying the explicitly revised one.
- It contains dates, a conference, electronic submission, forms, pricing tables, signatures/contract terms, category distinctions, and proof-oriented vendor requirements. Those exercise extraction, source verification, deterministic values, parent/child requirements, checklist generation, blockers, draft audit, and evidence navigation.
- It is closed historical material, which is useful for an educational demonstration without suggesting that the user is preparing a current bid. The related statewide contract remains documented by Massachusetts as FAC115.

## Recommended demo scope

Use a curated manifest containing the official portal record, the Request for Response, Category 1 bidder-response material, the applicable price sheet, required forms, standard terms, and the amendment/Q&A record. Keep original downloads and hashes. Exclude vendor-submitted proposals and vendor-specific evidence.

The current app accepts PDF documents. Some FAC115 forms are spreadsheets or other Office formats, so a future fixture should retain the official originals and create clearly labeled, deterministic read-only PDF renditions for the app. That conversion must be recorded in the fixture manifest; it must not be presented as an original Commonwealth PDF.

## Prepared fixture

The repository now contains the provider-unseen fixture under `fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375/`. It preserves eight official public source files and records exact hashes, attachment IDs, Category 1 inclusion decisions, and explicit exclusions. Attachment B is the portal's v2 workbook dated April 8, and amendment 13 is the explicit replacement evidence. The older intent notice remains present as a superseded source rather than being silently discarded.

The answer draft contains 22 source-grounded cases frozen before any provider result. It includes the March 31-to-April 5 conference amendment, the non-mandatory nature of conference attendance, question and submission deadlines, COMMBUYS submission and signature rules, file and page restrictions, experience and licensing requirements, staffing capacity, references, statewide coverage, pricing, prompt pay, SDP requirements, evaluation weighting, quote duration, and the distinction between bid attachments and post-award forms.

The draft is not a valid live scoring set yet. Trusted rendered PDF pages are required for exact citations, and the XLSX inputs must be inspected with the approved spreadsheet tooling. This machine has neither LibreOffice/pdf2image nor `@oai/artifact-tool`, so visual page review and workbook qualification were not represented as complete.

## Provider and budget boundary

No OpenAI call was made for FAC115. The public evaluator now requires an extraction artifact and a complete-population verification plan before verification. The last repository-recorded Phase 4 ledger is `$14.813639/$15`, leaving `$0.186361`, which is not a credible complete-run allowance. FAC115 should use a separately approved public-evaluation ceiling: first authorize extraction only, inspect the frozen candidate population and exact plan, then authorize verification only if the entire population fits.

## Limits

- The solicitation covers three service categories, so context construction must isolate Category 1 to avoid mixing guard, investigative, and fence requirements.
- The portal is amendment evidence and must be ingested as a first-class source, not treated as mere metadata.
- A known-answer sheet must be frozen before any live run.
- Public status does not authorize a provider call. The future run still needs a separate budget and data-governance approval.

## Smaller alternative

The Department of Mental Health's Quincy Mental Health Center FAC115 security-services solicitation (`BD-26-1022-DMH05-5520-118399`) is simpler and more site-specific. Its SOW describes 24/7 coverage, rounds, incident/shift reports, training and shadow shifts, confidentiality acknowledgments, holiday/overtime rules, and a required agency form. It is easier to explain, but it is a weaker stress test because the public package is much smaller and has no comparable amendment chain.
