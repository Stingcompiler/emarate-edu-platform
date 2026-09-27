import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./app.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";

import { RequireAuth } from "./lib/auth";
import { Compose } from "./routes/Compose";
import { ForgotPassword } from "./routes/ForgotPassword";
import { Install } from "./routes/Install";
import { Login } from "./routes/Login";
import { NotFound } from "./routes/NotFound";
import { Notifications } from "./routes/Notifications";
import { Register } from "./routes/Register";
import { Settings } from "./routes/Settings";
import { SystemStatus } from "./routes/SystemStatus";

// TanStack Query holds all server state (docs/04, D-no-Zustand).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

const signedIn = (element: React.ReactNode) => <RequireAuth>{element}</RequireAuth>;

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  // Role dashboards arrive with Phase 10; until then home is the notification centre.
  { path: "/", element: signedIn(<Navigate to="/notifications" replace />) },
  { path: "/notifications", element: signedIn(<Notifications />) },
  { path: "/notifications/new", element: signedIn(<Compose />) },
  { path: "/settings", element: signedIn(<Settings />) },
  { path: "/install", element: signedIn(<Install />) },
  { path: "/system", element: <SystemStatus /> },
  { path: "*", element: <NotFound /> },
]);

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  // In development the worker handles push only (no caching next to Vite's HMR).
  const url = import.meta.env.DEV ? "/sw.js?dev=1" : "/sw.js";
  window.addEventListener("load", () => void navigator.serviceWorker.register(url));
}
