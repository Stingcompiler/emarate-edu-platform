import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { api, ok } from "./api";
import { useMe } from "./auth";
import { ALL } from "../components/Pager";

/**
 * The department the dashboard is about: a department role's own department
 * (the first, if several); college-wide roles see the first department and switch with
 * `?department=` — read from the router, so the switcher (DepartmentSwitch) and links
 * update the page (review 2026-09-29, P6).
 */
export function useDepartment() {
  const me = useMe();
  const [params] = useSearchParams();
  const scope = me.data?.capabilities?.["courses.view"] as
    { everything?: boolean; departments?: number[] } | undefined;
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/departments", { params: { query: ALL } }))?.results ?? [],
  });
  const fromUrl = Number(params.get("department")) || undefined;
  const allowed = scope?.everything
    ? (departments.data ?? []).map((d) => d.id)
    : (scope?.departments ?? []);
  const id = fromUrl && allowed.includes(fromUrl) ? fromUrl : allowed[0];
  const department = departments.data?.find((d) => d.id === id);
  return {
    id,
    department,
    choices: (departments.data ?? []).filter((d) => allowed.includes(d.id)),
    loading: me.isPending || departments.isPending,
  };
}

export function useCurrentTerm() {
  return useQuery({
    queryKey: ["terms", "current"],
    queryFn: async () => {
      const list =
        ok(await api.GET("/api/v1/terms", { params: { query: { ...ALL, is_current: true } } }))
          ?.results ?? [];
      return list[0] ?? null;
    },
  });
}

export function useOfferings(department?: number, term?: number) {
  return useQuery({
    queryKey: ["offerings", department, term],
    enabled: !!department && !!term,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/offerings", {
          params: { query: { course__department: department, term, page_size: 100 } },
        }),
      )?.results ?? [],
  });
}
