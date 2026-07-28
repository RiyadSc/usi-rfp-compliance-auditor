# Evidence Budget

**Date:** 2026-07-25  
**Status:** Active design rule (Track 2) — not a new process framework  
**Pairs with:** Information Value Hierarchy (`25-…`) · Decision Confidence Map (`24-…`)

---

## Rule

> Every primary surface should answer the user’s highest-priority decisions first.  
> Everything else must justify why it competes for attention.

This is not a fixed widget count. It is a **budget on competing claims** for attention before the user drills deeper.

---

## Budget by surface type

| Surface                 | Attention budget (first viewport)                 | Must serve                 | Must not compete                        |
| ----------------------- | ------------------------------------------------- | -------------------------- | --------------------------------------- |
| Home / opportunity card | ≤4 Level-1 signals + one next action              | Resume / pick bid          | Full matrices, tech meta                |
| Overview                | Level-1 strip + next action + ≤3 decision signals | D09, D02, pending judgment | Equalized metric walls; journey as hero |
| Requirements list       | Filters/presets + scannable obligations           | D02, D04 entry             | Full evidence panels inline             |
| Requirement detail      | Obligation + axes + proof + decision              | D04, D05, D06              | Fingerprints/hashes as peers            |
| Checklist               | Blocking group first                              | D02, D09                   | Flat undifferentiated tables            |
| Proposal review         | Issue counts + latest revision path               | D07, D10                   | Run-centric chrome as hero              |
| Briefing/report         | Status + freshness + top issues                   | D09, D16, D01 boundary     | Export mechanics before judgment        |

Level 4 (parser, provider, hashes, Live Analysis internals) spends **zero** of the primary budget unless the user opened Technical disclosure or a recovery path.

---

## Spend check (before adding UI to a primary surface)

```text
What Level-1 decision does this help (ID)?
What existing first-viewport item does it displace or dilute?
Is drill-in enough instead?
If we cut this, which high-consequence decision gets harder?
Budget OK? Yes / No
```

If it cannot displace something weaker or move to drill-in → **do not add**.

---

## Overview specifically (anti–dumping-ground)

Allowed to grow only when:

1. It improves a Highest/Very high/High decision, **and**
2. It fits L1 order, **and**
3. Something of lower value is demoted or removed from the first viewport, **and**
4. It passes the spend check above.

Nine-step journey, activity feeds, and director cadence tips are **Level 3 context** — useful below the fold, not equal to blockers.

---

## Relation to shipped Track 2

UX-T2-001 spent budget on blockers → judgment → proof before completion %.  
Future Overview additions must pass this budget or wait for Session evidence.
