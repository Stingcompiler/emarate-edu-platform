/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

// Read from disk: Vitest hands CSS imports over empty, `?raw` included (and Vite rewrites a
// `new URL("….css", import.meta.url)` into an asset, so the path is joined by hand).
const UI = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/ui/src");
const read = (file: string) => readFileSync(join(UI, file), "utf8");
const theme = read("theme.css");
const tokens = read("tokens.css");

// The warm mode's colours (packages/ui/src/tokens.css) checked by arithmetic, not only by the axe
// audits of a few pages (review 2026-11-12): every ink on every warm ground keeps WCAG AA (4.5:1),
// so a surface darkened later fails here, whichever page would have shown it.

/** `--name: value;` pairs of one CSS block. */
const declarations = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );

const scales = declarations(/@theme static \{([\s\S]*?)\n\}/.exec(theme)![1]!);
const warm = declarations(/:root\[data-theme="warm"\] \{([\s\S]*?)\n\}/.exec(tokens)![1]!);

/** A warm token's colour, following `var(--…)` into the warm block, then the raw scales. */
function colour(name: string): string {
  let value = warm[name] ?? scales[name];
  for (let hops = 0; value?.startsWith("var("); hops++) {
    if (hops > 5) throw new Error(`--${name}: var() loop`);
    const next = /var\(--([\w-]+)\)/.exec(value)![1]!;
    value = warm[next] ?? scales[next];
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${name}: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const STATES = ["success", "warning", "danger", "info", "neutral", "pending"];
const INKS = [
  "text",
  "text-muted",
  "primary",
  "primary-hover",
  "accent",
  "accent-hover",
  ...STATES.map((s) => `color-${s}-strong`),
];
const GROUNDS = [
  "bg",
  "bg-subtle",
  "surface",
  "surface-alt",
  "primary-soft",
  "accent-soft",
  ...STATES.map((s) => `color-${s}-soft`),
];

it("every warm ink keeps 4.5:1 on every warm ground", () => {
  const low = INKS.flatMap((ink) =>
    GROUNDS.map((ground) => [ink, ground, ratio(colour(ink), colour(ground))] as const),
  )
    .filter(([, , r]) => r < 4.5)
    .map(([ink, ground, r]) => `--${ink} on --${ground}: ${r.toFixed(2)}:1`);
  expect(low).toEqual([]);
});

it("white text on the warm mode's filled buttons keeps 4.5:1", () => {
  for (const fill of ["primary", "primary-hover", "accent", "accent-hover"])
    expect(ratio(colour("on-primary"), colour(fill)), fill).toBeGreaterThanOrEqual(4.5);
});
