import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { PortalShell } from "../components/PortalShell";
import { Segmented } from "../components/motion";
import {
  Avatar,
  Button,
  Card,
  Field,
  Notice,
  SectionLabel,
  Switch,
  WithSide,
  problemMessage,
} from "../components/ui";
import { OtpInput } from "../components/OtpInput";
import { api, ok } from "../lib/api";
import { initials } from "../lib/reports";
import { formData, postWithProgress } from "../lib/upload";
import { type Upload as UploadItem, UploadStatus } from "../components/UploadStatus";
import { hasRole, useMe, useSignOut } from "../lib/auth";
import { disablePush, enablePush, pushState, type PushState } from "../lib/push";
import { type Density, useDensity } from "../lib/density";
import { type Theme, useTheme } from "../lib/theme";

type Preference = Schemas["Preference"];

const LABELS: Record<Preference["category"], string> = {
  course: "المواد: المحاضرات والواجبات والتصحيح",
  college: "إعلانات الكلية والقسم",
  results: "النتائج",
  account: "الحساب والتسجيل",
  hr: "الموارد البشرية",
  ops: "تنبيهات تشغيل المنصة (الأعطال وامتلاء القرص)",
};
const CHANNELS = [
  { key: "inapp", label: "داخل التطبيق" },
  { key: "push", label: "Push" },
  { key: "email", label: "بريد" },
] as const;

/** Board: StudentSettings / StaffSettings (phone). Desktop: no board — same sections, wider (docs/06 §9). */
export function Settings() {
  const me = useMe();
  const client = useQueryClient();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const staff = hasRole(me.data, "teacher", "ta");

  const prefs = useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: async () => ok(await api.GET("/api/v1/notifications/preferences")) ?? [],
  });
  const save = useMutation({
    mutationFn: async (rows: Preference[]) => {
      const { data } = await api.PUT("/api/v1/notifications/preferences", { body: rows });
      return data ?? rows;
    },
    onMutate: (rows) => client.setQueryData(["notifications", "preferences"], rows),
    onSuccess: (rows) => client.setQueryData(["notifications", "preferences"], rows),
  });

  const rows = (prefs.data ?? []).filter((p) => p.category !== "hr" || staff);

  function toggle(category: Preference["category"], channel: "inapp" | "push" | "email") {
    const next = (prefs.data ?? []).map((p) =>
      p.category === category ? { ...p, [channel]: !p[channel] } : p,
    );
    save.mutate(next);
  }

  return (
    <PortalShell title="الإعدادات">
      <WithSide
        side={
          <div>
            <SectionLabel>المظهر</SectionLabel>
            {/* Four modes: on phones the switch takes its own line, so it fits with larger text. */}
            <Card className="flex min-h-14 flex-col items-stretch gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2">
              <span className="text-sm font-medium text-text">المظهر</span>
              <ThemeSwitch />
            </Card>
            {/* Only on large screens, where the student and results lists can be tighter. */}
            <Card className="mt-3 hidden min-h-14 items-center justify-between gap-3 px-4 py-2 lg:flex">
              <span className="text-sm font-medium text-text">كثافة القوائم</span>
              <DensitySwitch />
            </Card>

            <SectionLabel>الحساب</SectionLabel>
            {me.data?.student ? (
              <MyDetails />
            ) : (
              <Card className="divide-y divide-border-soft">
                <PhotoRow />
                <p className="px-4 py-3 text-sm text-text-muted" dir="ltr">
                  {me.data?.email}
                </p>
              </Card>
            )}
            <Link
              to="/change-password"
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-alt"
            >
              تغيير كلمة المرور
            </Link>
            <Button
              variant="secondary"
              className="mt-4 w-full text-danger-strong lg:hidden"
              onClick={async () => {
                await signOut();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut size={18} aria-hidden className="rtl:-scale-x-100" />
              تسجيل الخروج
            </Button>
          </div>
        }
      >
        <PushCard />
        {hasRole(me.data, "teacher", "ta", "department_manager") && <PublicProfileCard />}

        <SectionLabel>الإشعارات — لكل فئة قنواتها</SectionLabel>
        {/* Phones: one row per category with its channels as labelled switches (no table). */}
        <Card className="divide-y divide-border-soft sm:hidden">
          {rows.map((row) => (
            <div key={row.category} className="px-4 py-3">
              <p className="text-sm font-medium text-text">{LABELS[row.category]}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHANNELS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="switch"
                    aria-checked={row[c.key]}
                    aria-label={`${LABELS[row.category]} — ${c.label}`}
                    onClick={() => toggle(row.category, c.key)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${
                      row[c.key]
                        ? "border-primary bg-primary-soft text-primary-700"
                        : "border-border text-text-muted"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`size-3 rounded-full border-2 ${row[c.key] ? "border-primary bg-primary" : "border-n300"}`}
                    />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <Card className="hidden overflow-hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs text-text-muted">
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  الفئة
                </th>
                {CHANNELS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className="w-16 px-1 py-2.5 text-center font-medium sm:w-24"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {rows.map((row) => (
                <tr key={row.category}>
                  <th scope="row" className="px-4 py-3 text-start font-medium text-text">
                    {LABELS[row.category]}
                  </th>
                  {CHANNELS.map((c) => (
                    <td key={c.key} className="px-1 text-center">
                      <Dot
                        on={row[c.key]}
                        label={`${LABELS[row.category]} — ${c.label}`}
                        onClick={() => toggle(row.category, c.key)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </WithSide>
    </PortalShell>
  );
}

function Dot({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="inline-grid size-11 place-items-center"
    >
      <span
        className={`size-5 rounded-full border-2 ${on ? "border-primary bg-primary" : "border-n300 bg-transparent"}`}
      />
    </button>
  );
}

function DensitySwitch() {
  const { density, set } = useDensity();
  const options: { key: Density; label: string }[] = [
    { key: "comfortable", label: "مريحة" },
    { key: "compact", label: "مدمجة" },
  ];
  return <Segmented label="كثافة القوائم" options={options} value={density} onChange={set} />;
}

function ThemeSwitch() {
  const { theme, set } = useTheme();
  const options: { key: Theme; label: string }[] = [
    { key: "light", label: "فاتح" },
    { key: "warm", label: "دافئ" },
    { key: "dark", label: "داكن" },
    { key: "system", label: "النظام" },
  ];
  return (
    <Segmented
      label="المظهر"
      options={options}
      value={theme}
      onChange={set}
      className="w-full sm:w-auto"
    />
  );
}

const PUSH_TEXT: Record<PushState, string> = {
  on: "تصلك الإشعارات على هذا الجهاز حتى والتطبيق مغلق.",
  off: "فعّلها لتصلك الإشعارات فور إرسالها.",
  denied: "رفضت الإذن سابقًا. فعّله من إعدادات المتصفح لهذا الموقع.",
  "needs-install": "على iPhone تعمل الإشعارات بعد تثبيت التطبيق على الشاشة الرئيسية.",
  unsupported: "هذا المتصفح لا يدعم الإشعارات الفورية.",
};

/**
 * The member's own choice to appear on their department's page of the college site (owner
 * decision 2026-09-30): off until they turn it on, with the title shown beside the name.
 */
function PublicProfileCard() {
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ["me", "public-profile"],
    queryFn: async () => ok(await api.GET("/api/v1/me/public-profile")) ?? null,
  });
  const [draft, setDraft] = useState({
    full_name_en: "",
    academic_title_ar: "",
    academic_title_en: "",
  });
  useEffect(() => {
    const p = profile.data;
    if (p)
      setDraft({
        full_name_en: p.full_name_en ?? "",
        academic_title_ar: p.academic_title_ar ?? "",
        academic_title_en: p.academic_title_en ?? "",
      });
  }, [profile.data]);
  const save = useMutation({
    mutationFn: async (body: Partial<Schemas["PublicProfile"]>) => {
      const { data, error } = await api.PATCH("/api/v1/me/public-profile", { body });
      if (!data) throw error;
      return data;
    },
    onSuccess: (data) => client.setQueryData(["me", "public-profile"], data),
  });
  const p = profile.data;
  if (!p) return null;
  const changed =
    draft.full_name_en !== (p.full_name_en ?? "") ||
    draft.academic_title_ar !== (p.academic_title_ar ?? "") ||
    draft.academic_title_en !== (p.academic_title_en ?? "");
  return (
    <>
      <SectionLabel>الظهور في صفحة القسم على موقع الكلية</SectionLabel>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-text">أظهر اسمي ولقبي في صفحة قسمي</p>
            <p className="mt-0.5 text-xs text-text-muted">
              باختيارك وحدك، وتستطيع إيقافه متى شئت. لا يظهر بريدك ولا هاتفك.
            </p>
          </div>
          <Switch
            checked={p.public_profile ?? false}
            label="أظهر اسمي ولقبي في صفحة قسمي"
            disabled={save.isPending}
            onChange={(value) => save.mutate({ public_profile: value })}
          />
        </div>
        <div className="border-t border-border-soft sm:grid sm:grid-cols-2">
          <Field
            label="اللقب العلمي (مثل: أستاذ مشارك)"
            value={draft.academic_title_ar}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, academic_title_ar: e.target.value })}
          />
          <Field
            label="اللقب بالإنجليزية"
            dir="ltr"
            value={draft.academic_title_en}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, academic_title_en: e.target.value })}
          />
          <Field
            label="الاسم بالإنجليزية (للصفحة الإنجليزية)"
            dir="ltr"
            value={draft.full_name_en}
            maxLength={200}
            onChange={(e) => setDraft({ ...draft, full_name_en: e.target.value })}
          />
          <div className="flex items-center justify-end px-4 py-2.5">
            <Button disabled={!changed || save.isPending} onClick={() => save.mutate(draft)}>
              {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </div>
        </div>
        {save.isError && (
          <div className="px-4 pb-3">
            <Notice>{problemMessage(save.error)}</Notice>
          </div>
        )}
      </Card>
    </>
  );
}

function PushCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    void pushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);
  if (state === null) return null;

  async function flip() {
    setBusy(true);
    setProblem("");
    try {
      setState(state === "on" ? await disablePush() : await enablePush());
    } catch {
      // Silent failures left users thinking push was on (owner, 2026-10-01).
      setProblem("تعذّر تغيير الإشعارات على هذا الجهاز الآن. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <BellRing size={22} className="shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">الإشعارات على هذا الجهاز</p>
        <p className="text-sm leading-relaxed text-text-muted">{PUSH_TEXT[state]}</p>
        {problem && (
          <p className="mt-1 text-xs text-danger-strong" role="alert">
            {problem}
          </p>
        )}
      </div>
      {state === "needs-install" ? (
        <Link to="/install">
          <Button variant="secondary">طريقة التثبيت</Button>
        </Link>
      ) : state === "on" || state === "off" ? (
        <Button variant={state === "on" ? "secondary" : "primary"} onClick={flip} disabled={busy}>
          {state === "on" ? "إيقاف" : "تفعيل"}
        </Button>
      ) : null}
      {busy && (
        <span className="sr-only" role="status">
          لحظة…
        </span>
      )}
    </Card>
  );
}

const PHOTO_MAX_MB = 3;

/**
 * The profile photo, for everyone (owner, 2026-10-30): up to 3 MB, JPG/PNG/WEBP; the server
 * keeps a 512 px square. It replaces the initials wherever the person appears. The upload
 * shows its progress and result.
 */
function PhotoRow() {
  const me = useMe();
  const client = useQueryClient();
  const [upload, setUpload] = useState<UploadItem | null>(null);
  const photoId = me.data?.photo ?? null;
  const choose = async (file: File) => {
    if (file.size > PHOTO_MAX_MB * 1024 * 1024) {
      setUpload({
        state: "error",
        name: file.name,
        message: `حجم الصورة أكبر من ${PHOTO_MAX_MB} ميغابايت — اختر صورة أصغر.`,
      });
      return;
    }
    setUpload({ state: "uploading", name: file.name, progress: null });
    try {
      const stored = await postWithProgress<{ public_id: string }>(
        "/api/v1/files",
        formData({ file, purpose: "photo" }),
        (progress) => setUpload({ state: "uploading", name: file.name, progress }),
      );
      const { error, response } = await api.PATCH("/api/v1/me", {
        body: { photo: stored.public_id },
      });
      if (!response.ok) throw error;
      setUpload({ state: "done", name: file.name, message: "حُدّثت صورتك" });
      await client.invalidateQueries({ queryKey: ["me"] });
    } catch (error) {
      setUpload({ state: "error", name: file.name, message: problemMessage(error) });
    }
  };
  const remove = async () => {
    await api.PATCH("/api/v1/me", { body: { photo: null } });
    setUpload(null);
    await client.invalidateQueries({ queryKey: ["me"] });
  };
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar
          text={initials(me.data?.full_name_ar ?? "")}
          size="2xl"
          tone="primary"
          photo={photoId}
        />
        <span className="min-w-0 flex-1">
          <b className="block text-sm text-text">{me.data?.full_name_ar}</b>
          <span className="flex flex-wrap items-center gap-x-4">
            <label className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
              {photoId ? "تغيير الصورة" : "إضافة صورة"}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void choose(file);
                }}
              />
            </label>
            {photoId && (
              <button
                type="button"
                onClick={() => void remove()}
                className="min-h-11 text-sm text-text-muted hover:text-text"
              >
                إزالة الصورة
              </button>
            )}
          </span>
          <span className="block text-xs text-text-muted">
            JPG أو PNG أو WEBP، حتى {PHOTO_MAX_MB} ميغابايت
          </span>
        </span>
      </div>
      {upload && (
        <UploadStatus
          upload={upload}
          onDismiss={upload.state !== "uploading" ? () => setUpload(null) : undefined}
        />
      )}
    </div>
  );
}

/** A student's email (confirmed by a code sent to the new address), phone and photo
 *  (docs/03 §3.10; review 2026-10-25 decisions, item 13). */
function MyDetails() {
  const me = useMe();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["me"] });
  const [phone, setPhone] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const saveContact = useMutation({
    mutationFn: async (body: { phone_e164?: string; photo?: string | null }) => {
      const { data, error } = await api.PATCH("/api/v1/me", { body });
      if (!data) throw error;
      return data;
    },
    onSuccess: () => {
      setPhone(null);
      void refresh();
    },
  });
  const sendCode = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST("/api/v1/me/email", { body: { email } });
      if (!response.ok) throw error;
    },
    onSuccess: () => setSentTo(email.trim().toLowerCase()),
  });
  const confirm = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/me/email/confirm", {
        body: { email: sentTo!, code },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setSentTo(null);
      setEmail("");
      setCode("");
      void refresh();
    },
  });
  const failed = saveContact.error ?? sendCode.error ?? confirm.error;
  const currentPhone = me.data?.phone_e164 ?? "";
  return (
    <Card className="divide-y divide-border-soft">
      <PhotoRow />
      <div className="px-4 py-3">
        <p className="text-xs text-text-muted">البريد</p>
        <p className="text-sm text-text" dir="ltr">
          {me.data?.email}
        </p>
        {sentTo ? (
          <div className="mt-2 space-y-2">
            <OtpInput label={`الرمز المرسل إلى ${sentTo}`} value={code} onChange={setCode} />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => confirm.mutate()}
                disabled={confirm.isPending}
                why={code.length === 6 ? undefined : "أدخل الرمز المكوّن من 6 أرقام"}
              >
                تأكيد البريد الجديد
              </Button>
              <Button variant="secondary" onClick={() => setSentTo(null)}>
                تراجع
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) sendCode.mutate();
            }}
          >
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد الجديد"
              aria-label="البريد الجديد"
              className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
            />
            <Button type="submit" variant="secondary" disabled={sendCode.isPending}>
              أرسل رمزًا
            </Button>
          </form>
        )}
      </div>
      <form
        className="px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (phone !== null) saveContact.mutate({ phone_e164: phone });
        }}
      >
        <label className="text-xs text-text-muted" htmlFor="my-phone">
          الهاتف
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id="my-phone"
            type="tel"
            dir="ltr"
            value={phone ?? currentPhone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0912345678"
            className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <Button type="submit" variant="secondary" disabled={saveContact.isPending}>
            حفظ
          </Button>
        </div>
      </form>
      {failed && (
        <div className="px-4 py-3">
          <Notice>{problemMessage(failed)}</Notice>
        </div>
      )}
    </Card>
  );
}
