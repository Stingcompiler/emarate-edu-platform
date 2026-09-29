import { BellRing, CloudDownload, Share, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { PortalShell } from "../components/PortalShell";
import { Segmented } from "../components/motion";
import { Button, Card, Notice } from "../components/ui";
import { isStandalone } from "../lib/push";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

const STEPS = {
  ios: [
    { title: "افتح الموقع في Safari", body: "التثبيت على iPhone يعمل من Safari فقط." },
    { title: "اضغط زر المشاركة", body: "الأيقونة ⬆︎ أسفل الشاشة." },
    {
      title: "اختر «إضافة إلى الشاشة الرئيسية»",
      body: "ثم «إضافة» أعلى اليمين، ستظهر الأيقونة بين تطبيقاتك.",
    },
    {
      title: "افتح التطبيق واسمح بالإشعارات",
      body: "من الإعدادات ← الإشعارات على هذا الجهاز ← تفعيل.",
    },
  ],
  android: [
    { title: "افتح الموقع في Chrome", body: "أو أي متصفح يدعم تثبيت التطبيقات." },
    { title: "اضغط «تثبيت التطبيق»", body: "من الزر أدناه، أو من قائمة ⋮ ← «تثبيت التطبيق»." },
    {
      title: "افتح التطبيق واسمح بالإشعارات",
      body: "من الإعدادات ← الإشعارات على هذا الجهاز ← تفعيل.",
    },
  ],
};

/** Board: StudentInstall (phone). Desktop: no board — same content in the desktop shell (docs/06 §9). */
export function Install() {
  const [platform, setPlatform] = useState<"ios" | "android">(
    /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "android",
  );
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <PortalShell title="تثبيت التطبيق" back={{ label: "الإعدادات", to: "/settings" }}>
      {/* Desktop: why install on one side, the steps for the phone on the other. */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <div>
          <div className="text-center lg:text-start">
            <img
              src="/icons/icon-192.png"
              alt=""
              width={72}
              height={72}
              className="mx-auto rounded-2xl shadow-md lg:mx-0"
            />
            <h2 className="mt-4 text-xl font-bold text-text">ثبّت بوابة الكلية على هاتفك</h2>
            <p className="mt-1 text-sm text-text-muted">
              تفتح كتطبيق بأيقونتها، وتصلك الإشعارات فورًا.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            {[
              { icon: BellRing, label: "إشعارات فورية" },
              { icon: CloudDownload, label: "يعمل مع اتصال ضعيف" },
              { icon: Zap, label: "فتح أسرع" },
            ].map(({ icon: Icon, label }) => (
              <Card
                key={label}
                className="flex flex-col items-center gap-1.5 px-2 py-3 text-center"
              >
                <Icon size={20} className="text-primary" aria-hidden />
                <span className="text-xs text-text">{label}</span>
              </Card>
            ))}
          </div>
        </div>
        <div className="lg:mt-0">
          {installed ? (
            <div className="mt-6 lg:mt-0">
              <Notice tone="success">التطبيق مثبّت على هذا الجهاز.</Notice>
            </div>
          ) : (
            <>
              <Segmented
                label="نوع الهاتف"
                className="mt-6 lg:mt-0"
                options={[
                  { key: "ios", label: "iPhone" },
                  { key: "android", label: "Android" },
                ]}
                value={platform}
                onChange={setPlatform}
              />
              <ol className="mt-4 divide-y divide-border-soft">
                {STEPS[platform].map((step, index) => (
                  <li key={step.title} className="flex gap-3 py-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
                      {(index + 1).toLocaleString("ar-u-nu-latn")}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-text">{step.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-text-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {platform === "android" && prompt && (
                <Button
                  className="mt-2 w-full"
                  onClick={async () => {
                    await prompt.prompt();
                    if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
                    setPrompt(null);
                  }}
                >
                  تثبيت التطبيق
                </Button>
              )}
              {platform === "ios" && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                  <Share size={14} aria-hidden /> تعمل الإشعارات على iPhone بدءًا من iOS 16.4 بعد
                  التثبيت.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
