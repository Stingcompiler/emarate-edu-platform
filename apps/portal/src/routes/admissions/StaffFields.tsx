import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button, Card, Notice, SectionLabel, Switch, problemMessage } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { api } from "../../lib/api";
import type { Field } from "../../lib/visitor";
import { FieldInput } from "../visitor/Apply";

/**
 * The college's own fields on an application (owner, 2026-11-01): admission data the
 * applicant may see once released (university number, admitted level, admission type) and
 * registration data for staff only. The registration staff type the university number;
 * registering the student uses it. A released field shows to the applicant only with a value.
 */
export function StaffFields({
  id,
  fields,
  saved,
  released,
}: {
  id: string;
  fields: Field[];
  saved: Record<string, unknown>;
  released: string[];
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(saved);
  const [shown, setShown] = useState<string[]>(released);
  useEffect(() => setAnswers(saved), [saved]);
  useEffect(() => setShown(released), [released]);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const client = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: async () => {
      const body = Object.fromEntries(fields.map((f) => [f.key, answers[f.key] ?? ""]));
      const { data, error } = await api.PATCH("/api/v1/applications/{public_id}/staff-answers", {
        params: { path: { public_id: id } },
        body: { answers: body, released: shown },
      });
      if (!data) throw error;
    },
    onMutate: () => setProblems({}),
    onSuccess: () => {
      toast("حُفظت بيانات القبول والتسجيل");
      void client.invalidateQueries({ queryKey: ["applications", id] });
    },
    onError: (error) => {
      const found = (error as { errors?: Record<string, string[]> } | null)?.errors ?? {};
      setProblems(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v[0] ?? ""])));
    },
  });
  const changed =
    JSON.stringify(fields.map((f) => answers[f.key] ?? "")) !==
      JSON.stringify(fields.map((f) => saved[f.key] ?? "")) ||
    [...shown].sort().join() !== [...released].sort().join();
  const groups: [string, Field[]][] = [
    ["بيانات القبول — تظهر للمتقدم حين تتيحها", fields.filter((f) => f.audience === "release")],
    ["بيانات التسجيل — للموظفين فقط", fields.filter((f) => f.audience !== "release")],
  ];
  return (
    <>
      {groups.map(([title, items]) =>
        items.length ? (
          <div key={title}>
            <SectionLabel>{title}</SectionLabel>
            <Card className="grid gap-4 p-4 lg:grid-cols-2">
              {items.map((f) => (
                <div key={f.key} className={f.width === "half" ? "" : "lg:col-span-2"}>
                  <FieldInput
                    field={{ ...f, required: false }}
                    value={answers[f.key]}
                    error={problems[f.key]}
                    onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))}
                  />
                  {f.audience === "release" && (
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-text-muted">
                      <span>
                        {shown.includes(f.key)
                          ? answers[f.key]
                            ? "يظهر للمتقدم في «متابعة طلبي»"
                            : "مُتاح، ويظهر حين تُدخل قيمته"
                          : "لا يظهر للمتقدم"}
                      </span>
                      <Switch
                        checked={shown.includes(f.key)}
                        label={`إتاحة «${f.label}» للمتقدم`}
                        onChange={(on) =>
                          setShown((s) => (on ? [...s, f.key] : s.filter((k) => k !== f.key)))
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </Card>
          </div>
        ) : null,
      )}
      {(problems.released || problems.answers) && (
        <Notice>{problems.released || problems.answers}</Notice>
      )}
      {save.isError && !Object.keys(problems).length && (
        <Notice>{problemMessage(save.error)}</Notice>
      )}
      <Button
        onClick={() => save.mutate()}
        disabled={save.isPending || !changed}
        why={changed ? undefined : "لا تغييرات للحفظ"}
      >
        حفظ بيانات القبول والتسجيل
      </Button>
    </>
  );
}
