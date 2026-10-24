import { expect, test } from "@playwright/test";

import { offscreen } from "./helpers";

// Public pages: nothing sticks out past the edge of the screen (phone and desktop).
const PORTAL_PUBLIC = ["/login", "/register", "/forgot-password", "/apply", "/track"];
const SITE = ["/ar/", "/ar/contact", "/ar/news", "/ar/events", "/ar/programs", "/ar/about"];

for (const path of PORTAL_PUBLIC) {
  test(`fits the screen — portal ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await offscreen(page), path).toEqual([]);
  });
}

for (const path of SITE) {
  test(`fits the screen — site ${path}`, async ({ page }) => {
    await page.goto(`${process.env.E2E_SITE_URL}${path}`);
    await page.waitForLoadState("networkidle");
    expect(await offscreen(page), path).toEqual([]);
  });
}

// «طلباتي» with every kind of card: a reply box, a request for documents, an inquiry thread.
for (const [width, rem] of [
  [320, 16],
  [360, 16],
  [390, 16],
  [360, 22],
  [360, 28],
  [320, 24],
]) {
  test(`fits the screen — portal /track with applications, a reply box and an inquiry at ${width}px, text ${Math.round((rem / 16) * 100)}%`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const at = "2026-10-01T09:00:00Z";
    const app = (id: string, status: string, extra = {}) => ({
      public_id: id,
      reference_no: `APP-2026-33770${id}`,
      program_name: "بكالوريوس تقنية المعلومات",
      status,
      submitted_at: at,
      can_edit: false,
      history: [{ to_status: status, note: "أرفق شهادة الثانوية بصورة واضحة", at }],
      messages: [{ id: 1, from_college: true, body: "مسجل القسم: الف مبروك", sent_at: at }],
      required_documents: [
        { key: "certificate", label: "شهادة الثانوية العامة أو ما يعادلها", required: true },
        { key: "passport", label: "جواز السفر" },
      ],
      documents: [{ doc_type: "passport", name: "passport.pdf" }],
      ...extra,
    });
    await page.addInitScript(() =>
      sessionStorage.setItem(
        "ecst-visitor",
        JSON.stringify({
          token: "t",
          expires_at: new Date(Date.now() + 1_800_000).toISOString(),
          name: "سلمى",
          email: "aramko.long.address@gmail.com",
        }),
      ),
    );
    await page.route("**/api/visitor/me", (route) =>
      route.fulfill({
        json: {
          name: "سلمى",
          applications: [
            app("1", "registered"),
            app("2", "missing_documents"),
            app("3", "draft", { submitted_at: null }),
          ],
          inquiries: [
            {
              public_id: "9",
              reference_no: "INQ-2026-000009",
              subject: "هل يوجد سكن للطلاب القادمين من خارج الدولة؟",
              status: "open",
              status_label: "مفتوح",
              created_at: at,
              messages: [{ from_college: true, body: "نعم، يتوفر سكن", sent_at: at }],
            },
          ],
        },
      }),
    );
    await page.goto("/track");
    await expect(page.getByText("APP-2026-337701")).toBeVisible();
    await page.waitForLoadState("networkidle");
    if (process.env.FIT_PROBE === "measure") {
      console.log(
        "MEASURE",
        JSON.stringify(
          await page.evaluate(() =>
            [...document.querySelectorAll("form.flex")].slice(0, 1).map((f) => ({
              form: f.getBoundingClientRect().width,
              input: (f.querySelector("input") as HTMLElement).getBoundingClientRect().width,
              font: getComputedStyle(f.querySelector("input") as HTMLElement).fontSize,
              card: f.parentElement!.getBoundingClientRect().width,
            })),
          ),
        ),
      );
    }
    if (process.env.FIT_PROBE && process.env.FIT_PROBE !== "measure") {
      await page.evaluate(() => {
        const el = document.createElement("div");
        el.style.cssText = "position:absolute;left:-60px;width:100px;height:20px;top:50px";
        el.textContent = "probe";
        document.body.append(el);
      });
      console.log("PROBE", JSON.stringify(await offscreen(page)));
      await page.screenshot({ path: `${process.env.FIT_PROBE}/track-${width}-${rem}.png` });
    }
    expect(await offscreen(page)).toEqual([]);
  });
}
