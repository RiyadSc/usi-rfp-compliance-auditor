# New Jersey 08-X-39231 Source-Only Benchmark Preparation

This directory is deliberately outside application runtime.

- `source-pages-v1.json` is a hash-pinned export of the 48 public solicitation pages.
- `critical-obligation-cases-v1.ts` is a source-only authoring worksheet.
- `critical-obligations-draft-v1.json` is the validated draft answer set.

The source exporter reads only the repository-authorized public document record and page text. It
does not query Phase 9 candidates, findings, review decisions, provider artifacts, or application
results.

The draft covers critical bid obligations with exact page citations, but remains pending an
independent human subject-matter review. It is not used by extraction, prioritization, the review
queue, publication, or any production path. It must not be described as a precision/recall ground
truth until that independent review is complete.
