# Evidence Intelligence — screen inventory

| Screen             | Route                         | Redesign status | Primary visual treatment          | Notable exceptions               | Screenshot                        |
| ------------------ | ----------------------------- | --------------- | --------------------------------- | -------------------------------- | --------------------------------- |
| Sign-in            | `/login`                      | done            | Split editorial brand + form card | Serif accent on “Evidence”       | `after/00-sign-in.png`            |
| Home               | `/`                           | done            | Hero priorities + portfolio cards | Greeting copy unchanged          | `after/01-home.png`               |
| Opportunities      | `/?view=opportunities`        | done            | Portfolio list (same page, mode)  | Redirect from `/opportunities`   | `after/02-opportunities.png`      |
| My Work            | `/my-work`                    | done            | Focused assignment list           | Empty variant designed           | `after/03-my-work.png`, `03b-*`   |
| Search             | `/search`                     | done            | Quiet search + results            | Empty query state                | `after/04-search.png`, `04b-*`    |
| Overview           | `/w/[id]`                     | done            | Hero command center + journey     | FAC115 branch preserved          | `after/05-overview.png`           |
| Documents          | `/w/[id]/documents`           | done            | List + upload                     | —                                | `after/06-documents.png`          |
| Requirements       | `/w/[id]/requirements`        | done            | Evidence matrix table             | All filters preserved            | `after/07-requirements.png`       |
| Requirement detail | `/w/[id]/requirements/[id]`   | done            | Evidence brief                    | Review controls unchanged        | `after/08-requirement-detail.png` |
| Checklist          | `/w/[id]/checklist`           | done            | Blockers rail + quiet completed   | Generate action preserved        | `after/09-checklist.png`          |
| Checklist item     | `/w/[id]/checklist/[id]`      | done            | Item brief + controls             | —                                | `after/10-checklist-detail.png`   |
| Proposal review    | `/w/[id]/proposal-audit`      | done            | Audit entry                       | —                                | `after/11-proposal-review.png`    |
| Audit detail       | `/w/[id]/proposal-audit/[id]` | done            | Finding cards + dual quotes       | Severity left rail               | `after/12-audit-detail.png`       |
| Reports            | `/w/[id]/reports`             | done            | Snapshot list                     | Export controls quiet            | `after/13-reports.png`            |
| Report detail      | `/w/[id]/reports/[id]`        | done            | Executive brief + tables          | Printable metadata secondary     | `after/14-report-detail.png`      |
| Source page        | documents `?page=`            | done            | Paper page on dark canvas         | Highlight variants               | `after/15-source-page.png`        |
| Document detail    | `/w/[id]/documents/[id]`      | done            | Processing + metadata             | Structured tables restyled       | `after/16-document-detail.png`    |
| Live Analysis      | `/w/[id]/phase9`              | done            | Coverage metrics + findings       | Empty when no run                | `after/17-phase9.png`             |
| Demo entry         | `/w/[id]/demo`                | done            | Guided walkthrough hero           | data-testid intact               | `after/18-demo-entry.png`         |
| Global reports     | `/reports`                    | done            | Cross-workspace index             | —                                | `after/19-reports-global.png`     |
| Not found / denied | invalid workspace             | done            | Neutral unavailable               | Non-enumerating                  | `after/20-not-found.png`          |
| Analysis run       | `/w/[id]/analysis/[id]`       | done            | Candidate extraction              | No dedicated capture (secondary) | —                                 |

Laptop captures live under `artifacts/design/after/laptop/`.
