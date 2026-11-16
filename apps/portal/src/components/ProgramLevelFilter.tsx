import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { api, ok } from "../lib/api";
import { planSemester, planSemesters } from "../lib/format";
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
 * (owner, 2026-11-15). The semester is the programme's own — «الفصل الأول» to «الفصل العاشر»
 * through its levels, as the plan counts them (owner, 2026-11-16: not only first and second);
 * a chosen level narrows it to that level's two. Kept in the address
 * (?program=&level=&semester=), so a page opened again or shared shows the same list. A
 * programme's head, who sees one programme, finds it chosen.
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
  const levelShown = level && level <= top ? level : null;
  // The plan's semesters (1…2×levels), those of the chosen level when there is one.
  const semesters = planSemesters(top).filter((s) => levelShown == null || s.level === levelShown);
  const askedSemester = Number(params.get("semester")) || null;
  const semester = semesters.some((s) => s.n === askedSemester) ? askedSemester : null;

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
    (semester == null ||
      planSemester(course.default_level, course.default_term_order) === semester);

  return {
    programs: list,
    program,
    level: levelShown,
    semester,
    levels: Array.from({ length: top }, (_, i) => i + 1),
    semesters,
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
  const { programs, program, level, semester, levels, semesters } = filter;
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
        {semesters.map((s) => (
          <option key={s.n} value={s.n}>
            {level == null ? s.label : s.label.split(" — ")[0]}
          </option>
        ))}
      </Select>
    </div>
  );
}
