# Phase 9 FAC115 offline correction

Date: 2026-07-23  
Provider calls: `0`  
Additional spend: `$0.00`

## Outcome

The provider-neutral rendered-page defect is corrected. The correction improved exact expected-answer binding from `8/23` to `13/23` without changing source files, frozen answers, historical candidates, or expected statuses.

The live pilot is still not valid. Ten answers remain genuine extraction misses or an ambiguous repeated quotation, the official FAC115 source lacks three required adversarial case types, the reserved pilot does not fit an existing phase ceiling, and no Phase 9 provider call is authorized.

## Rendered-page correction

Version: `massachusetts-fac115-rendered-page-reanchor-v1`

For every extracted candidate, the correction searches only that candidate's quotation across rendered pages in the same document:

- one exact or normalized-exact page: retain or re-anchor;
- no page: fail closed;
- multiple pages: fail closed as ambiguous.

It does not read expected answers, use lexical similarity, select by expected page, alter candidate text, or overwrite the historical population. Thirty-one candidates received a unique rendered-page correction; five additional expected-answer bindings became valid. The manifest records every candidate outcome and has its own stable hash.

## Remaining mapping failures

- Nine extraction misses: `conference-old-date`, `conference-active-date`, `question-deadline`, `narrative-page-limit`, `original-form-format`, `replacement-guard-pool`, `price-sheet-v2`, `price-components`, and `sdp-evaluation-weight`.
- One ambiguous repeated quotation: `post-award-forms-not-bid-attachments`, found on rendered pages 24 and 34.

Creating candidates from the expected-answer sheet would make extraction evaluation circular, so the correction deliberately does not do that.

## Security-control companion

`phase9-security-control-companion-v1` references the frozen synthetic `verification-cases-v2` cases for:

- genuine unresolved conflict;
- parser uncertainty;
- prompt injection.

It is marked:

- `partOfMassachusettsSource=false`;
- `eligibleForFac115SourceMetrics=false`;
- `eligibleForFac115LivePilot=false`.

This proves the controls provider-free without inventing Commonwealth source text. Using the companion in a live pilot requires an explicit change to the current source-only pilot instruction.

## Live decision

No live call should occur yet. A future valid pilot requires:

1. fresh extraction for the missing FAC115 obligations, or authorization to test verification independently with a separately frozen candidate set;
2. an explicit decision about whether synthetic adversarial controls may accompany, but remain separate from, FAC115 metrics;
3. a new frozen pilot population and hash;
4. a dedicated Phase 9 budget and provider-call authorization.

## Provider-free regression result

- Unit: `370/370`
- Sequential Supabase integration/RLS/isolation: `82/82` across 9 files
- FAC115 frozen citation check: `22/22`
- Synthetic verification evaluator: 24 cases, all accuracy/schema metrics `1.0`, zero critical failures, zero cost
- Lint, formatting, type-check, production build, offline dependency audit, secret scan, and invariant checklist: passed
