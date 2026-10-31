import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Avatar,
  Button,
  Card,
  Field,
  Notice,
  problemMessage,
  SectionLabel,
  StatusBadge,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { type Upload as UploadItem, UploadStatus } from "../../components/UploadStatus";
import { can } from "../../lib/nav";
import { formData, postWithProgress } from "../../lib/upload";
import type { Schemas } from "@ecst/api";
import { useMe } from "../../lib/auth";
import { initials, useDepartments } from "../../lib/reports";
import { DEPARTMENT_ROLES, ROLE_LABEL, ROLE_ORDER } from "./roles";
import { useConfirm } from "../../components/Confirm";
import { useToast } from "../../components/Toast";

/** Board: SystemAdminUser (phone); desktop derived — account beside roles and scopes. */
export function AdminUser() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const departments = useDepartments();
  const user = useQuery({
    queryKey: ["user", id],
    queryFn: async () =>
      ok(await api.GET("/api/v1/users/{public_id}", { params: { path: { public_id: id } } })) ??
      null,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["user", id] });
    void client.invalidateQueries({ queryKey: ["users"] });
  };
  // Only roles the server lets this user grant (rbac.GRANTS).
  const me = useMe();
  const grantable = me.data?.grantable_roles ?? [];
  const [picked, setRole] = useState("");
  const role = picked; // nothing preselected: the admin chooses (review 2026-09-29)
  const [department, setDepartment] = useState("");
  const toast = useToast();
  const grant = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/role-assignments", {
        body: {
          user: id,
          role: role as never,
          department: DEPARTMENT_ROLES.has(role) && department ? Number(department) : null,
        },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      toast("مُنح الدور");
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: async (assignment: number) => {
      const { error, response } = await api.DELETE("/api/v1/role-assignments/{id}", {
        params: { path: { id: assignment } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: refresh,
  });
  const active = useMutation({
    mutationFn: async (value: boolean) => {
      const { data, error } = await api.POST("/api/v1/users/{public_id}/set-active", {
        params: { path: { public_id: id } },
        body: { is_active: value },
      });
      if (!data) throw error;
    },
    onSuccess: refresh,
  });
  // Only an account nothing points at can go; one with a history is refused (409) and is
  // disabled instead, because its records keep their author.
  const remove = useMutation({
    mutationFn: async () => {
      const { response, error } = await api.DELETE("/api/v1/users/{public_id}", {
        params: { path: { public_id: id } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["users"] });
      toast("حُذف الحساب");
      navigate("/system/users", { replace: true });
    },
  });
  // The temporary password is shown once, here only, and never kept in the query cache.
  const [temporary, setTemporary] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/users/{public_id}/reset-password", {
        params: { path: { public_id: id } },
      });
      if (!data) throw error;
      return data.temporary_password;
    },
    onSuccess: (password) => setTemporary(password),
  });
  const copyTemporary = async () => {
    try {
      await navigator.clipboard.writeText(temporary ?? "");
      toast("نُسخت كلمة المرور المؤقتة");
    } catch {
      toast("تعذّر النسخ؛ انسخها يدويًا");
    }
  };
  const u = user.data;
  const err = grant.error ?? revoke.error ?? active.error ?? reset.error ?? remove.error;
  return (
    <PortalShell
      title={u?.full_name_ar ?? "مستخدم"}
      subtitle={u?.email}
      back={{ label: "المستخدمون", to: "/system/users" }}
    >
      {u && (
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className="space-y-4">
            <Card className="flex items-center gap-3 p-4">
              <Avatar text={initials(u.full_name_ar)} size="xl" tone="primary" />
              <span className="min-w-0 flex-1">
                <b className="block text-text">{u.full_name_ar}</b>
                <bdi className="block break-all text-xs text-text-muted">{u.email}</bdi>
              </span>
              <StatusBadge
                status={u.is_active ? (u.last_login ? "approved" : "pending") : "closed"}
                label={u.is_active ? (u.last_login ? "نشط" : "دعوة معلّقة") : "معطّل"}
              />
            </Card>
            {can(me.data, "users.rename") && (
              <ProfileCard
                key={`${u.public_id}:${u.full_name_ar}:${u.email}:${u.photo ?? ""}`}
                user={u}
                onSaved={refresh}
              />
            )}
            <SectionLabel>الحساب</SectionLabel>
            <Card className="divide-y divide-border-soft text-sm">
              {[
                ["الهاتف", u.phone_e164 ? <bdi key="p">{u.phone_e164}</bdi> : "—"],
                [
                  "آخر دخول",
                  u.last_login
                    ? new Date(u.last_login).toLocaleString("ar-u-nu-latn")
                    : "لم يفعّل الحساب بعد",
                ],
              ].map(([k, v]) => (
                <p key={String(k)} className="flex justify-between px-4 py-2.5">
                  <span className="text-text-muted">{k}</span>
                  <span className="min-w-0 break-words">{v}</span>
                </p>
              ))}
            </Card>
            {err ? <Notice>{problemMessage(err)}</Notice> : null}
            <Button
              variant="secondary"
              className={u.is_active ? "text-danger-strong" : ""}
              onClick={async () =>
                (!u.is_active ||
                  (await confirm({
                    title: `تعطيل حساب ${u.full_name_ar}؟`,
                    body: "يخرج من كل أجهزته ولا يستطيع الدخول حتى يُعاد تفعيله. لا يُحذف شيء.",
                    confirm: "تعطيل الحساب",
                  }))) &&
                active.mutate(!u.is_active)
              }
              disabled={active.isPending}
            >
              {u.is_active ? "تعطيل الحساب" : "إعادة تفعيل الحساب"}
            </Button>
            <p className="text-xs text-text-muted">
              التعطيل يُنهي كل جلساته فورًا ولا يحذف شيئًا من سجلاته.
            </p>
            {u.is_active && (
              <>
                <Button
                  variant="secondary"
                  className="min-h-11 w-full"
                  disabled={reset.isPending}
                  onClick={async () =>
                    (await confirm({
                      title: `إعادة تعيين كلمة مرور ${u.full_name_ar}؟`,
                      body: "تُنشأ كلمة مرور مؤقتة تظهر لك مرة واحدة فقط، وتنتهي جلساته على كل أجهزته فورًا، ويُطلب منه تغييرها عند دخوله التالي.",
                      confirm: "إعادة التعيين",
                    })) && reset.mutate()
                  }
                >
                  <KeyRound size={18} aria-hidden />
                  إعادة تعيين كلمة المرور
                </Button>
                {temporary && (
                  <Card className="space-y-3 border-warning-strong p-4" role="status">
                    <p className="text-sm font-semibold text-text">
                      كلمة المرور المؤقتة لـ {u.full_name_ar}
                    </p>
                    <div className="flex items-center gap-2">
                      <bdi className="min-w-0 flex-1 select-all break-all rounded-lg bg-surface-alt px-3 py-2 font-mono text-lg tracking-wide text-text">
                        {temporary}
                      </bdi>
                      <Button
                        variant="secondary"
                        className="min-h-11 shrink-0"
                        onClick={() => void copyTemporary()}
                        aria-label="نسخ كلمة المرور المؤقتة"
                      >
                        <Copy size={16} aria-hidden />
                      </Button>
                    </div>
                    <p className="text-xs leading-relaxed text-text-muted">
                      لا تظهر هذه الكلمة مرة أخرى ولا تُحفظ في أي سجل. أعطِها له مباشرة أو بقناة
                      آمنة؛ سيُطلب منه اختيار كلمة مرور خاصة عند أول دخول.
                    </p>
                    <Button variant="ghost" className="min-h-11" onClick={() => setTemporary(null)}>
                      تم، أخفِ الكلمة
                    </Button>
                  </Card>
                )}
              </>
            )}
            <Button
              variant="secondary"
              className="min-h-11 w-full text-danger-strong"
              disabled={remove.isPending}
              onClick={async () =>
                (await confirm({
                  title: `حذف حساب ${u.full_name_ar} نهائيًا؟`,
                  body: "يُحذف الحساب ولا يمكن التراجع. يصلح هذا لحساب أُنشئ بالخطأ ولم يُستعمل؛ أما الحساب الذي له سجل (عمليات أو درجات أو محتوى) فيرفض النظام حذفه ويُعطَّل بدل ذلك.",
                  confirm: "حذف الحساب",
                })) && remove.mutate()
              }
            >
              <Trash2 size={18} aria-hidden />
              حذف الحساب
            </Button>
          </div>
          <div className="mt-6 space-y-4 lg:mt-0">
            <SectionLabel>الأدوار والنطاقات</SectionLabel>
            <Card className="divide-y divide-border-soft">
              {u.roles.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <b className="block">{ROLE_LABEL[r.role] ?? r.role}</b>
                    <span className="text-xs text-text-muted">
                      {r.department_name ? `النطاق: ${r.department_name}` : "على مستوى الكلية"}
                    </span>
                  </span>
                  {grantable.includes(r.role) && (
                    <button
                      type="button"
                      aria-label="سحب الدور"
                      onClick={async () =>
                        (await confirm({
                          title: `سحب دور «${r.role_label}»؟`,
                          body: r.department_name
                            ? `من ${u.full_name_ar} في ${r.department_name}.`
                            : `من ${u.full_name_ar}.`,
                          confirm: "سحب الدور",
                        })) && revoke.mutate(r.id)
                      }
                      className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-surface-alt hover:text-danger-strong"
                    >
                      <X size={15} aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {!u.roles.length && <p className="px-4 py-3 text-sm text-text-muted">بلا أدوار.</p>}
            </Card>
            {(grant.isError || revoke.isError) && (
              <Notice>{problemMessage(grant.error ?? revoke.error)}</Notice>
            )}
            {grantable.length > 0 && (
              <Card className="space-y-2 p-4">
                <p className="text-sm font-semibold">+ إضافة دور أو نطاق</p>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                  aria-label="الدور"
                >
                  <option value="">اختر الدور…</option>
                  {ROLE_ORDER.filter(
                    (k) =>
                      grantable.includes(k) &&
                      // A department role can be held for several departments; others only once.
                      (DEPARTMENT_ROLES.has(k) || !u.roles.some((r) => r.role === k)),
                  ).map((k) => (
                    <option key={k} value={k}>
                      {ROLE_LABEL[k]}
                    </option>
                  ))}
                </select>
                {DEPARTMENT_ROLES.has(role) && (
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                    aria-label="القسم"
                  >
                    <option value="">اختر القسم</option>
                    {(departments.data ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name_ar}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  className="w-full"
                  disabled={!role || (DEPARTMENT_ROLES.has(role) && !department) || grant.isPending}
                  onClick={() => grant.mutate()}
                >
                  إضافة
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}

type Profile = {
  full_name_ar: string;
  full_name_en: string;
  email: string;
  phone_e164: string;
  academic_title_ar: string;
  academic_title_en: string;
  research_interests: string;
};

/**
 * The system admin edits a user's profile (owner, 2026-10-30): name, email, phone, titles,
 * research interests and photo. A student's name stays with the student record; whether
 * someone appears on the site stays their own choice, so it is not here.
 */
function ProfileCard({ user, onSaved }: { user: Schemas["User"]; onSaved: () => void }) {
  const toast = useToast();
  const student = !!user.is_student;
  const start: Profile = {
    full_name_ar: user.full_name_ar,
    full_name_en: user.full_name_en ?? "",
    email: user.email,
    phone_e164: user.phone_e164 ?? "",
    academic_title_ar: user.academic_title_ar ?? "",
    academic_title_en: user.academic_title_en ?? "",
    research_interests: user.research_interests ?? "",
  };
  const [draft, setDraft] = useState(start);
  const [upload, setUpload] = useState<UploadItem | null>(null);
  const set = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));
  const changes = Object.fromEntries(
    Object.entries(draft).filter(([k, v]) => v.trim() !== start[k as keyof Profile].trim()),
  ) as Partial<Profile>;
  const send = async (body: Record<string, unknown>) => {
    const { data, error } = await api.PATCH("/api/v1/users/{public_id}", {
      params: { path: { public_id: user.public_id } },
      body: body as never,
    });
    if (!data) throw error;
  };
  const save = useMutation({
    mutationFn: () => send(changes),
    onSuccess: () => {
      toast("حُفظ الملف الشخصي");
      onSaved();
    },
  });
  const choosePhoto = async (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      setUpload({ state: "error", name: file.name, message: "حجم الصورة أكبر من 3 ميغابايت." });
      return;
    }
    setUpload({ state: "uploading", name: file.name, progress: null });
    try {
      const stored = await postWithProgress<{ public_id: string }>(
        "/api/v1/files",
        formData({ file, purpose: "photo" }),
        (progress) => setUpload({ state: "uploading", name: file.name, progress }),
      );
      await send({ photo: stored.public_id });
      setUpload({ state: "done", name: file.name, message: "حُدّثت الصورة" });
      onSaved();
    } catch (error) {
      setUpload({ state: "error", name: file.name, message: problemMessage(error) });
    }
  };
  const removePhoto = useMutation({
    mutationFn: () => send({ photo: null }),
    onSuccess: () => {
      setUpload(null);
      onSaved();
    },
  });
  const nameMissing = !student && !draft.full_name_ar.trim();
  return (
    <>
      <SectionLabel>الملف الشخصي</SectionLabel>
      <Card className="divide-y divide-border-soft">
        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar text={initials(user.full_name_ar)} size="2xl" photo={user.photo} />
            <span className="flex flex-wrap items-center gap-x-4 text-sm">
              <label className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
                {user.photo ? "تغيير الصورة" : "إضافة صورة"}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void choosePhoto(file);
                  }}
                />
              </label>
              {user.photo && (
                <button
                  type="button"
                  onClick={() => removePhoto.mutate()}
                  className="min-h-11 text-text-muted hover:text-text"
                >
                  إزالة الصورة
                </button>
              )}
            </span>
          </div>
          {upload && (
            <UploadStatus
              upload={upload}
              onDismiss={upload.state !== "uploading" ? () => setUpload(null) : undefined}
            />
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (Object.keys(changes).length && !nameMissing) save.mutate();
          }}
        >
          <div className="sm:grid sm:grid-cols-2">
            {student ? (
              <p className="px-4 py-3 text-sm text-text-muted sm:col-span-2">
                اسم الطالب يُعدَّل من سجل الطالب لدى المسجل.
              </p>
            ) : (
              <>
                <Field
                  label="الاسم بالعربية"
                  value={draft.full_name_ar}
                  onChange={(e) => set({ full_name_ar: e.target.value })}
                  maxLength={200}
                  required
                />
                <Field
                  label="الاسم بالإنجليزية (اختياري)"
                  dir="ltr"
                  value={draft.full_name_en}
                  onChange={(e) => set({ full_name_en: e.target.value })}
                  maxLength={200}
                />
              </>
            )}
            <Field
              label="البريد الإلكتروني"
              dir="ltr"
              type="email"
              value={draft.email}
              onChange={(e) => set({ email: e.target.value })}
              hint="يُبلَّغ البريد القديم بالتغيير"
            />
            <Field
              label="الهاتف"
              dir="ltr"
              inputMode="tel"
              value={draft.phone_e164}
              onChange={(e) => set({ phone_e164: e.target.value })}
            />
            {!student && (
              <>
                <Field
                  label="اللقب العلمي"
                  value={draft.academic_title_ar}
                  onChange={(e) => set({ academic_title_ar: e.target.value })}
                  maxLength={100}
                />
                <Field
                  label="اللقب بالإنجليزية"
                  dir="ltr"
                  value={draft.academic_title_en}
                  onChange={(e) => set({ academic_title_en: e.target.value })}
                  maxLength={100}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="الاهتمامات البحثية"
                    value={draft.research_interests}
                    onChange={(e) => set({ research_interests: e.target.value })}
                    maxLength={300}
                  />
                </div>
              </>
            )}
          </div>
          {save.isError && (
            <div className="px-4 pb-3">
              <Notice>{problemMessage(save.error)}</Notice>
            </div>
          )}
          <div className="px-4 py-3">
            <Button
              type="submit"
              className="min-h-11 w-full"
              disabled={save.isPending || nameMissing || !Object.keys(changes).length}
              why={
                nameMissing
                  ? "الاسم بالعربية مطلوب"
                  : Object.keys(changes).length
                    ? undefined
                    : "لم يتغيّر شيء"
              }
            >
              حفظ الملف الشخصي
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
