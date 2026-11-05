# Evidence — review 2026-11 axis 8 (keyboard, contrast, Arabic)

`e2e_probes.spec.ts`: Playwright probes, each expecting the old fault (copy into `e2e/tests/` to run). On `main` before this PR: 21 reproduced (phone + desktop). After it: all fail.

| ID | Sev | Probe | Finding | Fix |
|---|---|---|---|---|
| R64 | 🟠 | FB1 | moving a field with its arrow dropped the focus (rows keyed by index) | rows keyed by field; focus stays on the moved field's arrow |
| R65 | 🟠 | FB2 | a field could change section only by dragging | at a section's edge the arrows move it into the previous/next section |
| R66 | 🟢 | FB3 | «أضف حقلًا» added a field on the first arrow key (phone) | choose, then «إضافة»; added keys never collide |
| R67 | 🟢 | ST1 | closing a structure form dropped the focus | focus returns to the button that opened it |
| R68 | 🟢 | ST2 | «تعديل البرنامج» opened its form below every row, focus behind | edit forms take the focus and scroll into view |
| R69 | 🟠 | PH1, AP2 | file pickers (photo, applicant documents, …) showed no focus | `label:has(input[type=file]:focus-visible)` ring (app.css) |
| R70 | 🟢 | AP1 | a refused submission returned with the focus on the page | the first invalid field takes the focus |
| R71 | 🟢 | TH1, TH2 | mode menu/radios ignored arrows; focus lost after choosing/Esc | arrow keys (RTL-aware), one Tab stop per radio group, focus back to «المظهر» |
| R72 | 🟢 | AR1 | form builder subtitle «default · …», chips «v2» | «الاستمارة الافتراضية · الإصدار n» |
| R73 | 🟠 | AR2 | check_schema messages were English with field keys («school: …») | gettext with the field's label, Arabic in django.po |
| R74 | 🟠 | — | 13 gettext strings added since 2026-10-25 had no Arabic | translated; `core/tests/test_translations.py` fails on any gettext string without Arabic |

Verified OK: confirm dialog focus trap and Esc; applicant form focus order; release/staff fields absent for the applicant; taking an exam by keyboard; axe AA in warm and dark modes on the new pages; Western digits in new pages.

Regression tests: `e2e/tests/keyboard.spec.ts`, `backend/core/tests/test_translations.py`.
