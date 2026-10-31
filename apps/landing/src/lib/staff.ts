/** Words shared by the staff cards and pages (owner, 2026-10-30). */
export const DEGREE_EN: Record<string, string> = {
  phd: "PhD",
  master: "Master's",
  higher_diploma: "Higher diploma",
  bachelor: "Bachelor's",
  diploma: "Diploma",
  other: "",
};

export const ROLE_LABEL: Record<string, { ar: string; en: string }> = {
  manager: { ar: "رئيس القسم", en: "Head of department" },
  teacher: { ar: "", en: "" },
  ta: { ar: "معيد", en: "Teaching assistant" },
};

/** The first letter of a name, after any title (د. / أ. / Dr …). */
export const initialOf = (name: string) =>
  (name.replace(/^(د|أ|م|Dr|Prof|Mr|Ms)\.?\s+/u, "").trim()[0] ?? "").toUpperCase();
