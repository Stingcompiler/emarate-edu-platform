// Hides the demo's sample content from visitors (design review U01).
//
// The demo's texts all say they are examples: «(مثال)» / «(Example)» (backend
// core/management/commands/_sample_site.py). A visitor must not see a licence number of
// 000/0000, a dean's message that says it is sample text, or an announcement of «sample» news
// beside the real invitation to apply. Applied to everything the site reads from the API:
//
//  - an item (news, event, figure …) whose own title/label carries the mark is dropped;
//  - a text field that carries it is blanked, a list of lines loses the marked lines;
//  - a page's content blocks that carry it are dropped, and a page left with none is dropped;
//  - the home image goes when its description says it is a sample picture.
//
// Once the college's real texts replace the samples (docs/runbook.md §10) nothing matches and
// this changes nothing. `SITE_SHOW_SAMPLE=1` shows the samples (the e2e tests use them).

// «(مثال)» / «(Example)» on texts, images and news; «(نص تجريبي)» and the demo note on the
// official pages' placeholder text, and the system's own draft note (backend content/official.py).
// and the demo's fake contact details (seed_demo): the demo e-mail domain, a phone or WhatsApp
// number of zeros, «عنوان تجريبي» (design review B5).
const MARK =
  /\(\s*مثال\s*\)|\(\s*example\s*\)|\(\s*نص تجريبي\s*\)|نص تجريبي للعرض فقط|مسودة أنشأها النظام|demo\.ecst\.test|\+?249[\s-]?0{3}[\s-]?0{3}[\s-]?0{3}|عنوان تجريبي/i;
/** Fields that name an item: a mark here means the whole item is a sample. */
const IDENTITY = ["title", "title_ar", "title_en", "label_ar", "label_en"];
const DROP = Symbol("drop");

export const hasMark = (text) => typeof text === "string" && MARK.test(text);

const anyMark = (value) =>
  typeof value === "string"
    ? hasMark(value)
    : Array.isArray(value)
      ? value.some(anyMark)
      : value && typeof value === "object"
        ? Object.values(value).some(anyMark)
        : false;

function strip(value, key) {
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      if (typeof item === "string") {
        if (!hasMark(item)) out.push(item);
      } else if (key === "blocks" && anyMark(item)) {
        // A page's content block: any marked text drops the block.
      } else {
        const kept = strip(item);
        if (kept !== DROP) out.push(kept);
      }
    }
    return out;
  }
  if (!value || typeof value !== "object") return value;
  if (IDENTITY.some((k) => hasMark(value[k]))) return DROP;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = hasMark(v) ? "" : v;
    else if (v && typeof v === "object") {
      const kept = strip(v, k);
      out[k] = kept === DROP ? null : kept;
    } else out[k] = v;
  }
  // The sample home picture: its description says so; without it the picture goes too.
  if (hasMark(value.hero_image_alt_ar)) out.hero_image_url = null;
  // A page whose blocks were all samples has nothing left to show: bare headings are not content.
  if (
    Array.isArray(value.blocks) &&
    value.blocks.length &&
    out.blocks.every((block) => block.type === "heading")
  ) {
    return DROP;
  }
  return out;
}

/** The data as visitors should see it. A top-level item that is itself a sample is `null`. */
export function hideSample(value) {
  const kept = strip(value);
  return kept === DROP ? null : kept;
}

/** Whether samples are hidden in this build (the default; `SITE_SHOW_SAMPLE=1` shows them). */
export const sampleHidden = (env) => env?.SITE_SHOW_SAMPLE !== "1";
