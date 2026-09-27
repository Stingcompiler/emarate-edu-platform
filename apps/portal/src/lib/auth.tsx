import type { Schemas } from "@ecst/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { api } from "./api";

export type Me = Schemas["Me"];

/** The signed-in user (null when signed out). All permission checks in the UI
 *  read `capabilities` from here; the server enforces them again. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      const { data, response } = await api.GET("/api/v1/me");
      if (response.status === 401) return null;
      if (!data) throw new Error(`HTTP ${response.status}`);
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function hasRole(me: Me | null | undefined, ...roles: string[]): boolean {
  return !!me?.roles.some((r) => roles.includes(r.role));
}

export function useSignOut() {
  const client = useQueryClient();
  return async () => {
    await api.POST("/api/v1/auth/logout");
    client.setQueryData(["me"], null);
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  };
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Splash />;
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg-subtle" aria-busy="true">
      <img src="/favicon.svg" alt="" width={56} height={56} className="animate-pulse" />
    </div>
  );
}
