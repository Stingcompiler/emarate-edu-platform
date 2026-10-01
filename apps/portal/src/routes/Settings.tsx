import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { PortalShell } from "../components/PortalShell";
import { Segmented } from "../components/motion";
import {
  Button,
  Card,
  Field,
  Notice,
  SectionLabel,
  Switch,
  WithSide,
  problemMessage,
} from "../components/ui";
import { api, ok } from "../lib/api";
import { hasRole, useMe, useSignOut } from "../lib/auth";
import { disablePush, enablePush, pushState, type PushState } from "../lib/push";
import { type Theme, useTheme } from "../lib/theme";

type Preference = Schemas["Preference"];

const LABELS: Record<Preference["category"], string> = {
  course: "المواد: المحاضرات والواجبات والتصحيح",
  college: "إعلانات الكلية والقسم",
  results: "النتائج",
  account: "الحساب والتسجيل",
  hr: "الموارد البشرية",
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
            <Card className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
              <span className="text-sm font-medium text-text">المظهر</span>
              <ThemeSwitch />
            </Card>

            <SectionLabel>الحساب</SectionLabel>
            <Card className="px-4 py-3">
              <p className="text-sm font-semibold text-text">{me.data?.full_name_ar}</p>
              <p className="mt-0.5 text-sm text-text-muted" dir="ltr">
                {me.data?.email}
              </p>
            </Card>
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

function ThemeSwitch() {
  const { theme, set } = useTheme();
  const options: { key: Theme; label: string }[] = [
    { key: "light", label: "فاتح" },
    { key: "dark", label: "داكن" },
    { key: "system", label: "النظام" },
  ];
  return <Segmented label="المظهر" options={options} value={theme} onChange={set} />;
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
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  if (state === null) return null;

  async function flip() {
    setBusy(true);
    try {
      setState(state === "on" ? await disablePush() : await enablePush());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary-700">
        <BellRing size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">الإشعارات على هذا الجهاز</p>
        <p className="text-sm leading-relaxed text-text-muted">{PUSH_TEXT[state]}</p>
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
