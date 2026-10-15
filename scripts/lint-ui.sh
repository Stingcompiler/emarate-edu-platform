#!/usr/bin/env bash
# Text scan for the card patterns docs/ui-profile.md bans (review guide, part A §3 and §10).
# Prints each hit and fails; prints nothing and passes when clean. It finds known spellings
# only: it does not judge elegance and does not replace looking at the screenshots.
# An exception is documented on the same line: `{/* ui-allow: the active navigation marker */}`.
set -u
cd "$(dirname "$0")/.."
SRC=(apps/portal/src apps/landing/src packages/ui/src)
fail=0

scan() { # description, pattern
  local hits
  hits=$(grep -rnE "$2" "${SRC[@]}" --include='*.tsx' --include='*.astro' --include='*.css' 2>/dev/null |
    grep -v 'ui-allow:' | grep -v '\.test\.')
  if [ -n "$hits" ]; then
    echo "✘ $1"
    echo "$hits" | cut -c1-200 | sed 's/^/    /'
    fail=1
  fi
}

# A thin coloured bar on one edge of a card or row (border, pseudo-element or inset shadow).
scan "accent bar on one edge (border-s/e/l/r/t/b-2|4|8)" \
  'border-(s|e|l|r|t|b)-(2|4|8)\b|border-(s|e|l|r|t|b)-\[[2-8]px\]'
scan "accent bar drawn as a pseudo-element or inset shadow" \
  '(before|after):(absolute|block)[^"]*(w-1|w-\[[2-6]px\]|h-1|h-\[[2-6]px\])[^"]*bg-|shadow-\[inset_[0-9]+px_0'
# An icon (or a number) in a circle or square tinted with the status colour: use the shared
# StatusBadge / Avatar instead, which say the status in words.
scan "tinted icon circle/square (grid place-items-center rounded-* bg-*-soft)" \
  'place-items-center[^"]*rounded-(full|lg|xl|md)[^"]*bg-[a-z0-9]+-soft|rounded-(full|lg|xl|md)[^"]*bg-[a-z0-9]+-soft[^"]*place-items-center'
# One card per number, with an icon: a metric tile row.
scan "gradient on buttons, headings or cards" 'bg-gradient-to|from-(primary|accent|navy)|linear-gradient\('
scan "continuous ambient animation on static content" 'animate-(pulse|ping|bounce)'

exit $fail
