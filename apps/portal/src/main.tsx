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
import { CaseDetail } from "./routes/affairs/CaseDetail";
import { CaseNew } from "./routes/affairs/CaseNew";
import { Cases } from "./routes/affairs/Cases";
import { RegulationDetail } from "./routes/affairs/RegulationDetail";
import { RegulationNew } from "./routes/affairs/RegulationNew";
import { Regulations } from "./routes/affairs/Regulations";
import { ExamDetail } from "./routes/exams/ExamDetail";
import { ExamEditor } from "./routes/exams/ExamEditor";
import { ExamMonitor } from "./routes/exams/ExamMonitor";
import { ExamResult } from "./routes/exams/ExamResult";
import { Exams } from "./routes/exams/Exams";
import { ExamStats } from "./routes/exams/ExamStats";
import { TakeExam } from "./routes/exams/TakeExam";
import { Corrections } from "./routes/results/Corrections";
import { ResultImportDetail } from "./routes/results/ImportDetail";
import { ResultImports } from "./routes/results/Imports";
import { MyResults } from "./routes/results/MyResults";
import { ResultSettings } from "./routes/results/ResultSettings";
import { ResultSearch } from "./routes/results/Search";
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
  { path: "/results", element: signedIn(<MyResults />) },
  { path: "/results/search", element: signedIn(<ResultSearch />) },
  { path: "/results/settings", element: signedIn(<ResultSettings />) },
  { path: "/result-imports", element: signedIn(<ResultImports />) },
  { path: "/result-imports/:id", element: signedIn(<ResultImportDetail />) },
  { path: "/result-corrections", element: signedIn(<Corrections />) },
  { path: "/regulations", element: signedIn(<Regulations />) },
  { path: "/regulations/new", element: signedIn(<RegulationNew />) },
  { path: "/regulations/:id", element: signedIn(<RegulationDetail />) },
  { path: "/exams", element: signedIn(<Exams />) },
  { path: "/exams/new", element: signedIn(<ExamEditor />) },
  { path: "/exams/:id", element: signedIn(<ExamDetail />) },
  { path: "/exams/:id/edit", element: signedIn(<ExamEditor />) },
  { path: "/exams/:id/monitor", element: signedIn(<ExamMonitor />) },
  { path: "/exams/:id/stats", element: signedIn(<ExamStats />) },
  // Focused exam shell: no sidebar or tabs at any size (docs/06 §9).
  { path: "/exam-attempts/:id", element: signedIn(<TakeExam />) },
  { path: "/exam-attempts/:id/result", element: signedIn(<ExamResult />) },
  { path: "/cases", element: signedIn(<Cases />) },
  { path: "/cases/new", element: signedIn(<CaseNew />) },
  { path: "/cases/:id", element: signedIn(<CaseDetail />) },
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
