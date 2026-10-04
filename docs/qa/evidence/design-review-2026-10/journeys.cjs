/* Review the complete admission wizard using one disposable local applicant.
 * This writes synthetic test data to the E2E SQLite database and dev mail only.
 * Never point it at production. OTP/session values are not saved in evidence. */
const fs = require("node:fs"),
  path = require("node:path");
const root = process.cwd();
const { chromium } = require(path.join(root, "node_modules/@playwright/test"));
const out = path.join(root, "docs/qa/evidence/design-review-2026-10/journeys.json");
const rows = [];
const sizes = [
  [390, 844],
  [768, 1024],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];
async function capture(p, step) {
  for (const [width, height] of sizes) {
    await p.setViewportSize({ width, height });
    await p.waitForTimeout(150);
    rows.push({
      step,
      width,
      height,
      overflow: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      title: await p.locator("h1").innerText(),
      fields: await p.locator("input,select,textarea").count(),
    });
    await p.screenshot({ path: `/tmp/ecst-design-review/apply-step-${step}-${width}.png` });
  }
  fs.writeFileSync(
    out,
    JSON.stringify({ source: "local synthetic application only", rows }, null, 2),
  );
  console.log(`Application step ${step}`);
}
(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  const p = await b.newPage({ locale: "ar", reducedMotion: "reduce" });
  const email = `design-review-${Date.now()}@example.test`;
  await p.goto("http://localhost:5184/apply?program=BIT");
  await p.getByLabel("الاسم الكامل").fill("متقدم مراجعة التصميم");
  await p.getByLabel("البريد الإلكتروني").fill(email);
  await p.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await p.getByLabel("رمز التحقق").waitFor();
  const dir = path.join(root, "backend/sent-emails-e2e");
  let code;
  for (const file of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, file), "utf8");
    if (t.includes(email)) code = t.match(/\b(\d{6})\b/)?.[1];
  }
  if (!code) throw new Error("Local test OTP not found");
  await p.getByLabel("رمز التحقق").fill(code);
  await p.getByRole("button", { name: "متابعة", exact: true }).click();
  await p.getByRole("button", { name: /البرنامج الذي اخترته من الموقع/ }).waitFor();
  await capture(p, 2);
  await p.getByRole("button", { name: /البرنامج الذي اخترته من الموقع/ }).click();
  await p.getByLabel("الاسم الكامل *").waitFor();
  await p.getByLabel("الهاتف").fill("+249912345678");
  await p.getByLabel("تاريخ الميلاد *").fill("2008-05-01");
  await p.getByLabel("نوع الشهادة *").selectOption("سودانية");
  await p.getByLabel("النسبة المئوية *").fill("82.5");
  await p.getByLabel("المدرسة").fill("مدرسة بيانات العرض");
  await capture(p, 3);
  await p.getByRole("button", { name: "التالي: المستندات" }).click();
  await p.locator('input[type="file"]').first().waitFor({ state: "attached" });
  await capture(p, 4);
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  await p
    .locator('input[type="file"]')
    .nth(0)
    .setInputFiles({ name: "review-certificate.pdf", mimeType: "application/pdf", buffer: pdf });
  await p.getByRole("button", { name: "المراجعة (ينقص 1)" }).waitFor();
  await p
    .locator('input[type="file"]')
    .nth(1)
    .setInputFiles({ name: "review-identity.pdf", mimeType: "application/pdf", buffer: pdf });
  await p.getByRole("button", { name: "التالي: المراجعة" }).click();
  await p.getByRole("button", { name: "إرسال الطلب" }).waitFor();
  await capture(p, 5);
  await p.getByRole("button", { name: "إرسال الطلب" }).click();
  await p.getByRole("heading", { name: /وصل طلبك/ }).waitFor();
  await capture(p, "success");
  await p.getByRole("button", { name: "متابعة طلبي" }).click();
  await p.waitForURL(/\/track/);
  await capture(p, "track");
  // A second fresh applicant isolates the displayed autosave promise from the
  // successful wizard (whose Next button explicitly persists the form).
  const c2 = await b.newContext({ locale: "ar", viewport: { width: 390, height: 844 } });
  const q = await c2.newPage();
  const draftEmail = `design-draft-${Date.now()}@example.test`;
  await q.goto("http://localhost:5184/apply?program=BIT");
  await q.getByLabel("الاسم الكامل").fill("متقدم فحص المسودة");
  await q.getByLabel("البريد الإلكتروني").fill(draftEmail);
  await q.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await q.getByLabel("رمز التحقق").waitFor();
  let draftCode;
  for (const file of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, file), "utf8");
    if (t.includes(draftEmail)) draftCode = t.match(/\b(\d{6})\b/)?.[1];
  }
  if (!draftCode) throw new Error("Draft probe OTP not found");
  await q.getByLabel("رمز التحقق").fill(draftCode);
  await q.getByRole("button", { name: "متابعة", exact: true }).click();
  await q.getByRole("button", { name: /البرنامج الذي اخترته من الموقع/ }).click();
  await q.getByLabel("المدرسة").fill("نص فحص المسودة قبل التالي");
  await q.locator("h1").click();
  await q.waitForTimeout(1500);
  const before = await q.getByLabel("المدرسة").inputValue();
  const promise = (await q.locator("main").innerText()).includes("المسودة تُحفظ تلقائيًا");
  await q.screenshot({
    path: "/tmp/ecst-design-review/apply-draft-before-390.png",
    fullPage: true,
  });
  await q.reload({ waitUntil: "networkidle" });
  const after = await q.getByLabel("المدرسة").inputValue();
  await q.screenshot({ path: "/tmp/ecst-design-review/apply-draft-after-390.png", fullPage: true });
  fs.writeFileSync(
    path.join(root, "docs/qa/evidence/design-review-2026-10/draft-probe.json"),
    JSON.stringify(
      {
        source: "second disposable local draft; no OTP/cookie saved",
        displayedAutosavePromise: promise,
        before,
        after,
        waitAfterBlurMs: 1500,
        pressedNext: false,
      },
      null,
      2,
    ),
  );
  await b.close();
  console.log(`${rows.length} admission state checks; draft probe completed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
