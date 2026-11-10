// Inventory, portal side (review plan 2026-11-10): which roles may open each guarded route, and
// the links each role's navigation shows. scripts/qa/inventory.sh copies this into
// apps/portal/src/lib/, runs it with REGISTER_ME / REGISTER_OUT, and removes the copy.
import { readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import main from "../main.tsx?raw";
import { ROUTE_ACCESS } from "./access";
import type { Me } from "./auth";
import { navFor } from "./nav";

describe.skipIf(!process.env.REGISTER_ME)("route register", () => {
  it("writes the register", () => {
    const users = JSON.parse(readFileSync(process.env.REGISTER_ME!, "utf8")) as Record<string, Me>;
    const paths = [...main.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]!);
    const routes = paths.map((path) => ({
      path,
      guarded: path in ROUTE_ACCESS,
      roles: ROUTE_ACCESS[path]
        ? Object.entries(users)
            .filter(([, me]) => ROUTE_ACCESS[path]!(me))
            .map(([role]) => role)
        : [],
    }));
    const nav: Record<string, string[]> = {};
    for (const [role, me] of Object.entries(users)) nav[role] = navFor(me, 0).map((i) => i.to);
    writeFileSync(process.env.REGISTER_OUT!, JSON.stringify({ routes, nav }, null, 1));
    expect(routes.length).toBeGreaterThan(80);
  });
});
