/** A wa.me link to the college's number, optionally with a ready first message. */
export function whatsappUrl(e164: string, text?: string): string {
  const number = e164.replace(/\D/g, "");
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** The first message names the page the visitor asks from, so the reply can start there. */
export function askAbout(lang: "ar" | "en", subject: string): string {
  return lang === "ar"
    ? `مرحبًا، أستفسر عن: ${subject}`
    : `Hello, I have a question about: ${subject}`;
}
