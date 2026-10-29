# Redesign plan — generalising the 2026-10-29 mockups

The owner shared three mockups (visitor home, college administration overview, student
"اليوم") and asked for the design to be generalised across every role. This plan carries out
the recommendations discussed on 2026-10-29; one PR per phase, each merged when CI is green.

## Decisions taken (owner: «نفذ جميع توصياتك»)

| Question | Decision |
|---|---|
| Course cards with tinted icons (student mockup) | Not adopted: courses stay quiet rows (#173). The mockup's frame and its "what you can do now" card are adopted. |
| Tinted squares behind icons | Still banned by `lint:ui`. Counts in «يحتاج إجراءك» sit in a neutral square (`bg-surface-alt`), not a tinted one. |
| Phone tabs for admin roles | Already five (four destinations + «المزيد»); kept. |
| Photos on the visitor site | No generated people presented as students: the layout keeps the college's own images and placeholders until the college sends photos. |
| Mockup text | Not copied (typos, 2025 dates, invented names). Content comes from the platform's data or the college. |

## Phases

1. **Shell** — navy sidebar the full height of the screen with the college mark at its top;
   a white top bar with a search over the pages the person can open, the bell and the account.
   One change in `AppShell`/`PortalShell`, so every role gets it at once. D20 untouched (no
   section of the department manager dashboard changes).
2. **Dashboard kit** — shared components in `components/dashboard.tsx`: `NextStepCard`
   ("يمكنك إنجازه الآن"), `ActionList` («يحتاج إجراءك»: count, title, line, button),
   `DeadlineList`, `AckBanner`, `QuickLinks`, `ActivityList`; with tests.
3. **Three representative screens** — student «اليوم», system administration overview, visitor
   home; before/after comparison sent to the owner.
4. **Other role homes** from the same kit (teacher/TA, registrar, admissions, department
   manager — additions only, HR, student affairs, site manager, results).
5. **Shared list pieces** (cards, filters, badges) and the programme pages' structure on the
   visitor site (content from the college).

Every phase: phone 390 and desktop 1280, light and dark, `offscreen()` guard, e2e, then merge,
auto-deploy and a production check.
