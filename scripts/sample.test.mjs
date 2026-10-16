import assert from "node:assert/strict";
import { test } from "node:test";

import { hasMark, hideSample, sampleHidden } from "../apps/landing/src/lib/sample.mjs";

test("the mark is found in Arabic and English, with or without inner spaces", () => {
  assert.equal(hasMark("(مثال) خبر"), true);
  assert.equal(hasMark("( مثال ) خبر"), true);
  assert.equal(hasMark("(Example) news"), true);
  assert.equal(hasMark("(example) news"), true);
  assert.equal(hasMark("(نص تجريبي) الكلمة بنص العميد"), true);
  assert.equal(hasMark("نص تجريبي للعرض فقط — تكتب الكلية النص المعتمد لهذه الصفحة."), true);
  assert.equal(hasMark("مسودة أنشأها النظام: استبدل كل إرشاد بالنص المعتمد"), true);
  assert.equal(hasMark("مثال على ذلك"), false); // the word alone is ordinary text
  assert.equal(hasMark("مرخّصة من الوزارة"), false);
  assert.equal(hasMark(undefined), false);
});

test("news and events whose title is a sample are dropped, real ones stay", () => {
  const news = [
    { slug: "a", title: "(مثال) افتتاح المعمل", summary: "(مثال) ملخص", body: "<p>(مثال)</p>" },
    { slug: "b", title: "بدء التسجيل للفصل الجديد", summary: "ملخص", body: "<p>نص</p>" },
  ];
  assert.deepEqual(
    hideSample(news).map((n) => n.slug),
    ["b"],
  );
});

test("site settings: marked texts are blanked, marked figures dropped, the sample picture goes", () => {
  const site = {
    name_ar: "كلية الإمارات",
    tagline: "(مثال) تعليم تقني يُعدّ الخريج",
    licence_ar: "(مثال) مرخّصة — قرار رقم 000/0000",
    email: "info@college.example",
    seo: { description: "(مثال) وصف" },
    figures: [
      { value: "1,200+", label_ar: "(مثال) خريج" },
      { value: "40", label_ar: "برنامجًا" },
    ],
    hero_image_url: "https://x/sample.jpg",
    hero_image_alt_ar: "(مثال) صورة تجريبية — الحرم",
  };
  const shown = hideSample(site);
  assert.equal(shown.name_ar, "كلية الإمارات");
  assert.equal(shown.email, "info@college.example");
  assert.equal(shown.tagline, "");
  assert.equal(shown.licence_ar, "");
  assert.equal(shown.seo.description, "");
  assert.deepEqual(shown.figures, [{ value: "40", label_ar: "برنامجًا" }]);
  assert.equal(shown.hero_image_url, null);
});

test("a real hero picture stays", () => {
  const site = { hero_image_url: "https://x/campus.jpg", hero_image_alt_ar: "مبنى الكلية" };
  assert.deepEqual(hideSample(site), site);
});

test("a programme keeps its name and loses only its sample texts", () => {
  const programme = {
    code: "BIT",
    name_ar: "بكالوريوس تقنية المعلومات",
    description_ar: "(مثال) برنامج يجمع بين الأساس النظري والتطبيق",
    outcomes_ar: ["(مثال) حل مشكلات عملية", "التواصل مع الفرق"],
    careers_ar: ["(Example) Government", "(Example) Private"],
    intake: { accepting: true },
  };
  const shown = hideSample(programme);
  assert.equal(shown.name_ar, programme.name_ar);
  assert.equal(shown.description_ar, "");
  assert.deepEqual(shown.outcomes_ar, ["التواصل مع الفرق"]);
  assert.deepEqual(shown.careers_ar, []);
  assert.deepEqual(shown.intake, { accepting: true });
});

test("a page loses its sample blocks, and is dropped when nothing real is left", () => {
  const mixed = {
    slug: "about/history",
    title_ar: "تاريخ الكلية",
    blocks: [
      { type: "paragraph", text: "(مثال) نص تجريبي" },
      { type: "paragraph", text: "تأسست الكلية عام 2010." },
    ],
  };
  assert.deepEqual(hideSample(mixed).blocks, [
    { type: "paragraph", text: "تأسست الكلية عام 2010." },
  ]);
  const dean = {
    slug: "about/dean",
    title_ar: "كلمة العميد",
    blocks: [
      { type: "image", url: "https://x/dean.jpg", alt: "(مثال) صورة تجريبية — صورة العميد" },
      { type: "paragraph", text: "(مثال) كلمة تجريبية" },
    ],
  };
  assert.equal(hideSample(dean), null);
  // An official page published with the demo's placeholder text (official.py, demo=True).
  const official = {
    slug: "admissions/fees",
    title_ar: "الرسوم والمنح",
    blocks: [
      { type: "note", text: "نص تجريبي للعرض فقط — تكتب الكلية النص المعتمد لهذه الصفحة." },
      { type: "heading", text: "الرسوم الدراسية" },
      { type: "paragraph", text: "(نص تجريبي) الرسوم المعتمدة لكل برنامج" },
    ],
  };
  assert.equal(hideSample(official), null); // only a heading would be left: nothing to show
  const empty = { slug: "x", title_ar: "فارغة", blocks: [] }; // never had content: kept as is
  assert.deepEqual(hideSample(empty), empty);
});

test("once the real texts replace the samples nothing changes", () => {
  const real = {
    name_ar: "كلية الإمارات",
    tagline: "تعليم تقني",
    figures: [{ value: "40", label_ar: "برنامجًا" }],
    items: ["أ", "ب"],
  };
  assert.deepEqual(hideSample(real), real);
});

test("samples are hidden unless SITE_SHOW_SAMPLE=1", () => {
  assert.equal(sampleHidden({}), true);
  assert.equal(sampleHidden(undefined), true);
  assert.equal(sampleHidden({ SITE_SHOW_SAMPLE: "1" }), false);
});
