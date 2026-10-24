import path from "node:path";

import { type Page, expect } from "@playwright/test";

export const PASSWORD = process.env.DEMO_PASSWORD ?? "e2e-pass-2026";

/** Sign in through the real login form (cookies + CSRF exactly as in production). */
export async function signIn(page: Page, identifier: string) {
  await page.goto("/login");
  await page.getByLabel("الرقم الجامعي أو البريد").fill(identifier);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 }); // a busy machine signs in slowly
}

const MAIL_DIR = path.resolve(__dirname, "../../backend/sent-emails-e2e");

/** The 6-digit code in the newest email sent to `address` (dev mail backend writes files). */
export async function lastCode(address: string): Promise<string> {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  for (let attempt = 0; attempt < 20; attempt++) {
    const names = await readdir(MAIL_DIR).catch(() => [] as string[]);
    const files = await Promise.all(
      names.map(async (name) => ({ name, at: (await stat(path.join(MAIL_DIR, name))).mtimeMs })),
    );
    for (const { name } of files.sort((a, b) => b.at - a.at)) {
      const text = await readFile(path.join(MAIL_DIR, name), "utf8");
      const messages = text.split(/^-{20,}$/m).reverse();
      const mine = messages.find((m) => m.includes(address));
      const code = mine?.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no code emailed to ${address}`);
}

/**
 * Elements that stick out past the left or right edge of the screen and are not inside a
 * scrolling box made for it (a table wrapper with `overflow-x: auto`). `scrollWidth` alone
 * misses them in RTL: what overflows to the left is neither scrollable nor counted, it is simply
 * cut off (a reply box pushed its «إرسال» button off the phone, 2026-10-24). Returns one line
 * per outermost offender.
 */
export async function offscreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    const seen = new Set<Element>();
    // Past the edge of the box it sits in (a card, a row): still on screen, but pushed out of
    // its container, so the layout is broken even where the page does not scroll.
    const stickingOut = (el: Element, box: DOMRect) => {
      const parent = el.parentElement;
      if (!parent || parent === document.body || parent.tagName === "MAIN") return false;
      const own = getComputedStyle(el);
      if (["absolute", "fixed", "sticky"].includes(own.position)) return false;
      // A negative margin (`-me-2`) is a way of lining a tap target up with its field.
      if (parseFloat(own.marginLeft) < 0 || parseFloat(own.marginRight) < 0) return false;
      const around = getComputedStyle(parent);
      if (around.display === "contents" || around.overflowX !== "visible") return false;
      const edge = parent.getBoundingClientRect();
      if (edge.width === 0) return false;
      return box.left < edge.left - 1 || box.right > edge.right + 1;
    };
    const scrolls = (el: Element) => {
      for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
        const x = getComputedStyle(up).overflowX;
        if (x === "auto" || x === "scroll") {
          const box = up.getBoundingClientRect();
          if (box.left >= -1 && box.right <= width + 1) return true;
        }
      }
      return false;
    };
    for (const el of document.body.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (el.closest("[aria-hidden='true'], [inert], .sr-only, svg, script, style")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const outside = box.left < -1 || box.right > width + 1;
      if (!outside && !stickingOut(el, box)) continue;
      if (style.position === "fixed" && box.right <= 0) continue;
      if (scrolls(el)) continue;
      if (el.parentElement && seen.has(el.parentElement)) continue;
      seen.add(el);
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      const cls = String(el.getAttribute("class") ?? "").slice(0, 70);
      out.push(
        `<${el.tagName.toLowerCase()} class="${cls}"> «${text}» x ${Math.round(box.left)}…${Math.round(box.right)} of ${width}`,
      );
    }
    return out;
  });
}
