---
name: responsive-page
description: Build or change any page, screen, layout or UI component in apps/portal or apps/landing so it matches BOTH prototype references — the phone board (390×844) and the desktop board (1280×800) — and verify it at both sizes before calling it done. Use whenever a task touches what a user sees in the browser.
---

# Responsive pages: every page matches the phone AND the large-screen design

**Owner's rule (non-negotiable):** we do not build for mobile only. Every page
is responsive and must match *both* designs in the reference prototype — the
phone board and the desktop board. A page is not done until it has been
checked at both sizes.

## 1. Find the two references before writing code

```bash
python3 scripts/boards.py list "<keyword from the page title>"
```

- Phone boards are 390×844; desktop boards are 1280×800 (files `Desktop*.dc.html`).
- The page's route and contents come from `docs/07-pages-spec.md`; the boards
  show how it looks. If they disagree, follow the spec and flag it.
- **Only one board exists?** Derive the missing size from the shell rules below
  (usually: the desktop version is the phone content widened into the desktop
  shell; the phone version of a desktop table is a card list). Write
  "no <phone|desktop> board — derived from docs/06 §9" in the PR.

## 2. Layout contract (docs/06 §4, §9 · docs/07 §3)

| Width | Tailwind | Portal shell | Content |
|---|---|---|---|
| < 768 | base, `sm` | Top bar with large title; **floating bottom tab bar** (student/teacher, 5 tabs; admins 3 tabs) + drawer; sheets instead of dialogs | single column; **tables become card lists**; touch targets ≥ 44px; works at **375px** |
| 768–1023 | `md` | same as phone, content may use 2 columns | no horizontal page scroll |
| ≥ 1024 | `lg` | **TopBar (navy) + Sidebar on the right, 264px (collapsed 72px)** + `PageHeader` + body; bottom tabs hidden | multi-column as in the desktop board; tables allowed |
| ≥ 1280 | `xl` | portal content max 1280px; public site max 1200px | — |

Other rules:
- **Mobile-first CSS:** base styles are the phone board; `lg:` adds the desktop board.
  Never hide essential content at one size. Only reposition it (sidebar ⇄ tabs,
  table ⇄ cards, side panel ⇄ sheet).
- **One component, two layouts.** Don't build separate "mobile page" and
  "desktop page" components. The same data, state and actions render
  responsively.
- **RTL:** use logical utilities (`ps/pe/ms/me/start/end`); the sidebar sits on
  the right in Arabic; mirror directional icons with `rtl:-scale-x-100`.
- **Tokens only:** colours, radius, shadow and fonts come from `@ecst/ui/theme.css`
  (e.g. `bg-surface text-text border-border-soft`). No hex values in pages.
- **Typography:** Plex everywhere; secondary text ≥ 12px (11px only for chips);
  Noto Kufi (`font-display`) only for public-site headings ≥ 1.5rem.
- **Special shells:** exam (focused, no sidebar at any size), auth (centred
  440px card), visitor tracking (800px card inside the public site).

## 3. Verify at both sizes (required before "done")

1. Run the app (`pnpm dev`) and the boards (`python3 scripts/boards.py serve`, add
   `--ref …` if needed).
2. In the browser pane, for **390×844** then **1280×800** (and a quick **768×1024**):
   `resize_window` → screenshot the page → screenshot the matching board at
   the same size → compare structure: shell, section order, hierarchy, key
   components and states. The goal is the same layout, not pixel identity.
3. Check at every size:
   - no horizontal scroll: `document.documentElement.scrollWidth <= innerWidth`;
   - nothing clipped or overlapping; the bottom tab bar does not cover content;
   - dark mode (portal only): `resize_window` with `colorScheme: "dark"`.
4. Reset the viewport (`preset: "desktop"`) when finished.

   Tooling notes: use the browser pane for **phone sizes**. Headless Chrome
   enforces a minimum window width of about 500px, so its 390px captures look
   clipped even when the page is fine. The pane shrinks large viewports to fit;
   for a readable full-size **1280×800** image, capture with headless Chrome
   (`open -n -a "Google Chrome" --args --headless=new --window-size=1280,800
   --virtual-time-budget=6000 --screenshot=<file.png> <url>`) and open the PNG.
5. In the PR, fill the "Responsive" checklist in the template. For each page,
   list the boards compared, and any board that was missing or where you deviated
   and why.

If a size can't be verified (the page needs data that doesn't exist yet), say
so in the PR. Don't tick the box.
