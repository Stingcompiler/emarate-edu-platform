import path from "node:path";

import { type Page, expect } from "@playwright/test";

export const PASSWORD = process.env.DEMO_PASSWORD ?? "e2e-pass-2026";

/** Sign in through the real login form (cookies + CSRF exactly as in production). */
export async function signIn(page: Page, identifier: string) {
  await page.goto("/login");
  await page.getByLabel("الرقم الجامعي أو البريد").fill(identifier);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).not.toHaveURL(/\/login/);
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
