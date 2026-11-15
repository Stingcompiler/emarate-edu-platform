import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { api, ok } from "../lib/api";
import { SEMESTERS } from "../lib/format";
import { ALL } from "./Pager";
import { Select } from "./Select";

/** What the filter needs of a course (an offering's ``course_detail``). */
type CourseLike = {
  program?: number | null;
  default_level?: number | null;
  default_term_order?: number | null;
};

const NONE = "none"; // courses from before programmes

/**
 * Inside a department's courses and lectures: the programme, then its level, then the semester
 * (owner, 2026-11-15). Kept in the address (?program=&level=&semester=), so a page opened again
 * or shared shows the same list. A programme's head, who sees one programme, finds it chosen.
 */
export function useProgramLevelFilter(department: number | undefined) {
  const [params, setParams] = useSearchParams();
  const programs = useQuery({
    queryKey: ["programs", department],
    enabled: !!department,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/programs", {
          params: { query: { ...ALL, department: department! } },
        }),
      )?.results ?? [],
  });
  const list = programs.data ?? [];
  const asked = params.get("program");
  const program =
    asked === NONE
      ? NONE
      : (list.find((p) => String(p.id) === asked)?.id ?? (list.length === 1 ? list[0]!.id : null));
  const chosen = typeof program === "number" ? list.find((p) => p.id === program) : undefined;
  const top = chosen?.levels_count ?? Math.max(1, ...list.map((p) => p.levels_count ?? 1));
  const level = Number(params.get("level")) || null;
  const semester = Number(params.get("semester")) || null;
  const levelShown = level && level <= top ? level : null;

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const matches = (course: CourseLike) =>
    (program == null || (program === NONE ? course.program == null : course.program === program)) &&
    (levelShown == null || (course.default_level ?? 1) === levelShown) &&
    (semester == null || (course.default_term_order ?? 1) === semester);

  return {
    programs: list,
    program,
    level: levelShown,
    semester,
    levels: Array.from({ length: top }, (_, i) => i + 1),
    matches,
    setProgram: (value: string) => set({ program: value === "all" ? null : value, level: null }),
    setLevel: (value: string) => set({ level: value === "all" ? null : value }),
    setSemester: (value: string) => set({ semester: value === "all" ? null : value }),
  };
}

const BOX = "min-h-10 rounded-full border border-border-soft bg-surface px-3 text-sm";

/** The three pickers, side by side where there is room and wrapping on a phone. */
export function ProgramLevelSelects({
  filter,
  withoutProgramme = false,
}: {
  filter: ReturnType<typeof useProgramLevelFilter>;
  /** Some courses have no programme yet: offer them as a choice. */
  withoutProgramme?: boolean;
}) {
  const { programs, program, level, semester, levels } = filter;
  return (
    <div className="flex flex-wrap items-center gap-2" data-program-filter>
      {(programs.length > 1 || withoutProgramme) && (
        <Select
          value={program == null ? "all" : String(program)}
          onChange={(e) => filter.setProgram(e.target.value)}
          aria-label="البرنامج"
          className={BOX}
        >
          <option value="all">كل البرامج</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name_ar}
            </option>
          ))}
          {withoutProgramme && <option value={NONE}>بلا برنامج</option>}
        </Select>
      )}
      <Select
        value={level == null ? "all" : String(level)}
        onChange={(e) => filter.setLevel(e.target.value)}
        aria-label="المستوى"
        className={BOX}
      >
        <option value="all">كل المستويات</option>
        {levels.map((n) => (
          <option key={n} value={n}>
            المستوى {n.toLocaleString("ar-u-nu-latn")}
          </option>
        ))}
      </Select>
      <Select
        value={semester == null ? "all" : String(semester)}
        onChange={(e) => filter.setSemester(e.target.value)}
        aria-label="الفصل الدراسي"
        className={BOX}
      >
        <option value="all">كل الفصول</option>
        {SEMESTERS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
