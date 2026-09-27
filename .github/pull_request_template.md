## Summary

<!-- What changed and why. Link the phase / spec section (docs/02, docs/07). -->

## Responsive (required for any change a user can see)

<!-- Every page must match BOTH prototype boards. Find them with:
     python3 scripts/boards.py list "<keyword>" -->

| Page / route | Phone board (390×844) | Desktop board (1280×800) | Notes |
|---|---|---|---|
|  |  |  |  |

- [ ] Checked at **390×844** against the phone board
- [ ] Checked at **1280×800** against the desktop board
- [ ] Quick check at **768×1024**: no horizontal scroll, nothing clipped
- [ ] RTL correct (sidebar on the right, directional icons mirrored)
- [ ] Portal pages: dark mode checked
- [ ] Missing board or deliberate deviation explained in the Notes column

<!-- Not a UI change? Replace this section with "No UI changes". -->

## Tests

- [ ] Backend tests pass on SQLite and PostgreSQL
- [ ] New or changed endpoints covered by permission tests
- [ ] `pnpm typecheck && pnpm build` pass
