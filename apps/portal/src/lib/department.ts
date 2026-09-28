import { useQuery } from "@tanstack/react-query";

import { api } from "./api";
import { useMe } from "./auth";

/**
 * The department the dashboard is about: a department role's own department
 * (the first, if several); college-wide roles see the first department and can
 * switch with `?department=`.
 */
export function useDepartment() {
  const me = useMe();
  const scope = me.data?.capabilities?.["courses.view"] as
    { everything?: boolean; departments?: number[] } | undefined;
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await api.GET("/api/v1/departments")).data?.results ?? [],
  });
  const fromUrl =
    Number(new URLSearchParams(window.location.search).get("department")) || undefined;
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
        (await api.GET("/api/v1/terms", { params: { query: { is_current: true } } })).data
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
      (
        await api.GET("/api/v1/offerings", {
          params: { query: { course__department: department, term, page_size: 100 } },
        })
      ).data?.results ?? [],
  });
}
