import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./app.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ComponentType, lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { RequireAuth } from "./lib/auth";
import { Login } from "./routes/Login";
import { ConfirmProvider } from "./components/Confirm";
import { ToastProvider } from "./components/Toast";
import { NoAccess } from "./components/NoAccess";
import { QueryErrorBanner } from "./components/QueryErrorBanner";
import { ROUTE_ACCESS } from "./lib/access";
import { queryClient } from "./lib/queryClient";

/**
 * Pages load on demand, one chunk each (review 2026-10-04 D2: one 1 MB bundle held every
 * page). After a deploy the old chunk names are gone; a page that fails to load reloads the
 * app once to pick up the new ones instead of showing an error.
 */
const RELOADED = "chunk-reload";
function remember(set: boolean): boolean {
  // sessionStorage can be blocked; then the page simply shows the error instead of looping.
  try {
    if (set) sessionStorage.setItem(RELOADED, "1");
    else sessionStorage.removeItem(RELOADED);
    return true;
  } catch {
    return false;
  }
}
function reloadedOnce(): boolean {
  try {
    return sessionStorage.getItem(RELOADED) !== null;
  } catch {
    return true;
  }
}
function page<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(async () => {
    try {
      const module = await load();
      remember(false);
      return { default: module[name] as ComponentType };
    } catch (error) {
      if (!reloadedOnce() && remember(true)) {
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw error;
    }
  });
}

function RouteLoading() {
  return (
    <p role="status" className="grid min-h-dvh place-items-center text-sm text-text-muted">
      جارٍ التحميل…
    </p>
  );
}

const ApplicationDetail = page(
  () => import("./routes/admissions/ApplicationDetail"),
  "ApplicationDetail",
);
const Applications = page(() => import("./routes/admissions/Applications"), "Applications");
const Cycles = page(() => import("./routes/admissions/Cycles"), "Cycles");
const FormBuilder = page(() => import("./routes/admissions/FormBuilder"), "FormBuilder");
const Apply = page(() => import("./routes/visitor/Apply"), "Apply");
const Track = page(() => import("./routes/visitor/Track"), "Track");
const CaseDetail = page(() => import("./routes/affairs/CaseDetail"), "CaseDetail");
const CaseNew = page(() => import("./routes/affairs/CaseNew"), "CaseNew");
const Cases = page(() => import("./routes/affairs/Cases"), "Cases");
const RegulationDetail = page(
  () => import("./routes/affairs/RegulationDetail"),
  "RegulationDetail",
);
const RegulationNew = page(() => import("./routes/affairs/RegulationNew"), "RegulationNew");
const Regulations = page(() => import("./routes/affairs/Regulations"), "Regulations");
const AnnouncementNew = page(
  () => import("./routes/announcements/AnnouncementNew"),
  "AnnouncementNew",
);
const Announcements = page(() => import("./routes/announcements/Announcements"), "Announcements");
const ExamDetail = page(() => import("./routes/exams/ExamDetail"), "ExamDetail");
const Inquiries = page(() => import("./routes/inquiries/Inquiries"), "Inquiries");
const LiveList = page(() => import("./routes/live/LiveList"), "LiveList");
const LiveNew = page(() => import("./routes/live/LiveNew"), "LiveNew");
const EventEditor = page(() => import("./routes/site/Events"), "EventEditor");
const Events = page(() => import("./routes/site/Events"), "Events");
const NewsEditor = page(() => import("./routes/site/NewsEditor"), "NewsEditor");
const PageEditor = page(() => import("./routes/site/PageEditor"), "PageEditor");
const Redirects = page(() => import("./routes/site/Redirects"), "Redirects");
const SiteHome = page(() => import("./routes/site/SiteHome"), "SiteHome");
const SiteMedia = page(() => import("./routes/site/SiteMedia"), "SiteMedia");
const ExamEditor = page(() => import("./routes/exams/ExamEditor"), "ExamEditor");
const ExamMonitor = page(() => import("./routes/exams/ExamMonitor"), "ExamMonitor");
const ExamResult = page(() => import("./routes/exams/ExamResult"), "ExamResult");
const Exams = page(() => import("./routes/exams/Exams"), "Exams");
const ExamStats = page(() => import("./routes/exams/ExamStats"), "ExamStats");
const TakeExam = page(() => import("./routes/exams/TakeExam"), "TakeExam");
const Corrections = page(() => import("./routes/results/Corrections"), "Corrections");
const ResultImportDetail = page(
  () => import("./routes/results/ImportDetail"),
  "ResultImportDetail",
);
const ResultImports = page(() => import("./routes/results/Imports"), "ResultImports");
const MyResults = page(() => import("./routes/results/MyResults"), "MyResults");
const AdminHome = page(() => import("./routes/admin/Home"), "AdminHome");
const AdminSettings = page(() => import("./routes/admin/Settings"), "AdminSettings");
const Roles = page(() => import("./routes/admin/RolesMatrix"), "Roles");
const Structure = page(() => import("./routes/admin/Structure"), "Structure");
const AdminUser = page(() => import("./routes/admin/User"), "AdminUser");
const AdminUsers = page(() => import("./routes/admin/Users"), "AdminUsers");
const Activate = page(() => import("./routes/Activate"), "Activate");
const Home = page(() => import("./routes/Home"), "Home");
const AcademicHome = page(() => import("./routes/homes/AcademicHome"), "AcademicHome");
const AffairsHome = page(() => import("./routes/homes/AffairsHome"), "AffairsHome");
const ResultsHome = page(() => import("./routes/homes/ResultsHome"), "ResultsHome");
const Me = page(() => import("./routes/learning/Me"), "Me");
const MyStatus = page(() => import("./routes/learning/Me"), "MyStatus");
const RegistrarHome = page(() => import("./routes/registrar/Home"), "RegistrarHome");
const StudentImportDetail = page(() => import("./routes/registrar/Imports"), "StudentImportDetail");
const StudentImports = page(() => import("./routes/registrar/Imports"), "StudentImports");
const Registrars = page(() => import("./routes/registrar/Registrars"), "Registrars");
const StudentRecord = page(() => import("./routes/registrar/StudentRecord"), "StudentRecord");
const StudentRecords = page(() => import("./routes/registrar/StudentRecords"), "StudentRecords");
const Approvals = page(() => import("./routes/department/Approvals"), "Approvals");
const Audit = page(() => import("./routes/department/Audit"), "Audit");
const DepartmentDashboard = page(
  () => import("./routes/department/Dashboard"),
  "DepartmentDashboard",
);
const DepartmentLectures = page(() => import("./routes/department/Lectures"), "DepartmentLectures");
const Members = page(() => import("./routes/department/Members"), "Members");
const Offerings = page(() => import("./routes/department/Offerings"), "Offerings");
const DepartmentStudents = page(() => import("./routes/department/Students"), "DepartmentStudents");
const Assignment = page(() => import("./routes/learning/Assignment"), "Assignment");
const AssignmentEditor = page(
  () => import("./routes/learning/AssignmentEditor"),
  "AssignmentEditor",
);
const Grade = page(() => import("./routes/learning/Grade"), "Grade");
const Grading = page(() => import("./routes/learning/Grading"), "Grading");
const LectureEditor = page(() => import("./routes/learning/LectureEditor"), "LectureEditor");
const Students = page(() => import("./routes/learning/Students"), "Students");
const Course = page(() => import("./routes/learning/Course"), "Course");
const Courses = page(() => import("./routes/learning/Courses"), "Courses");
const Lecture = page(() => import("./routes/learning/Lecture"), "Lecture");
const Tasks = page(() => import("./routes/learning/Tasks"), "Tasks");
const HRHome = page(() => import("./routes/hr/Home"), "HRHome");
const MyNotice = page(() => import("./routes/hr/MyNotice"), "MyNotice");
const NoticeNew = page(() => import("./routes/hr/NoticeNew"), "NoticeNew");
const HRReport = page(() => import("./routes/hr/Report"), "HRReport");
const TeacherProfile = page(() => import("./routes/hr/TeacherProfile"), "TeacherProfile");
const Teachers = page(() => import("./routes/hr/Teachers"), "Teachers");
const PrintReport = page(() => import("./routes/print/PrintReport"), "PrintReport");
const PrintMyResults = page(() => import("./routes/print/PrintTranscript"), "PrintMyResults");
const PrintTranscript = page(() => import("./routes/print/PrintTranscript"), "PrintTranscript");
const AdmissionsReport = page(
  () => import("./routes/reports/AdmissionsReport"),
  "AdmissionsReport",
);
const AffairsReport = page(() => import("./routes/reports/AffairsReport"), "AffairsReport");
const DepartmentReport = page(
  () => import("./routes/reports/DepartmentReport"),
  "DepartmentReport",
);
const TranscriptLookup = page(
  () => import("./routes/reports/TranscriptLookup"),
  "TranscriptLookup",
);
const ResultSettings = page(() => import("./routes/results/ResultSettings"), "ResultSettings");
const ResultSearch = page(() => import("./routes/results/Search"), "ResultSearch");
const Compose = page(() => import("./routes/Compose"), "Compose");
const ForgotPassword = page(() => import("./routes/ForgotPassword"), "ForgotPassword");
const Install = page(() => import("./routes/Install"), "Install");
const NotFound = page(() => import("./routes/NotFound"), "NotFound");
const Notifications = page(() => import("./routes/Notifications"), "Notifications");
const Register = page(() => import("./routes/Register"), "Register");
const Settings = page(() => import("./routes/Settings"), "Settings");

const signedIn = (element: React.ReactNode, path: string) => (
  <RequireAuth allow={ROUTE_ACCESS[path]} denied={<NoAccess />}>
    {element}
  </RequireAuth>
);

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/activate/:token", element: <Activate /> },
  // Visitors (no account): apply and track — the public site links here (docs/03 §4).
  { path: "/apply", element: <Apply /> },
  { path: "/track", element: <Track /> },
  // Role dashboards arrive with Phase 10; until then home is the notification centre.
  { path: "/", element: signedIn(<Home />, "/") },
  { path: "/courses", element: signedIn(<Courses />, "/courses") },
  { path: "/courses/:id", element: signedIn(<Course />, "/courses/:id") },
  { path: "/courses/:id/students", element: signedIn(<Students />, "/courses/:id/students") },
  { path: "/lectures/new", element: signedIn(<LectureEditor />, "/lectures/new") },
  { path: "/lectures/:id", element: signedIn(<Lecture />, "/lectures/:id") },
  { path: "/lectures/:id/edit", element: signedIn(<LectureEditor />, "/lectures/:id/edit") },
  { path: "/assignments/new", element: signedIn(<AssignmentEditor />, "/assignments/new") },
  { path: "/assignments/:id", element: signedIn(<Assignment />, "/assignments/:id") },
  {
    path: "/assignments/:id/edit",
    element: signedIn(<AssignmentEditor />, "/assignments/:id/edit"),
  },
  { path: "/submissions/:id", element: signedIn(<Grade />, "/submissions/:id") },
  { path: "/grading", element: signedIn(<Grading />, "/grading") },
  { path: "/tasks", element: signedIn(<Tasks />, "/tasks") },
  { path: "/me", element: signedIn(<Me />, "/me") },
  { path: "/me/status", element: signedIn(<MyStatus />, "/me/status") },
  { path: "/results-office", element: signedIn(<ResultsHome />, "/results-office") },
  { path: "/academic", element: signedIn(<AcademicHome />, "/academic") },
  { path: "/affairs", element: signedIn(<AffairsHome />, "/affairs") },
  { path: "/notifications", element: signedIn(<Notifications />, "/notifications") },
  { path: "/notifications/new", element: signedIn(<Compose />, "/notifications/new") },
  { path: "/settings", element: signedIn(<Settings />, "/settings") },
  { path: "/install", element: signedIn(<Install />, "/install") },
  { path: "/results", element: signedIn(<MyResults />, "/results") },
  { path: "/results/search", element: signedIn(<ResultSearch />, "/results/search") },
  { path: "/results/settings", element: signedIn(<ResultSettings />, "/results/settings") },
  { path: "/result-imports", element: signedIn(<ResultImports />, "/result-imports") },
  { path: "/result-imports/:id", element: signedIn(<ResultImportDetail />, "/result-imports/:id") },
  { path: "/result-corrections", element: signedIn(<Corrections />, "/result-corrections") },
  { path: "/regulations", element: signedIn(<Regulations />, "/regulations") },
  { path: "/regulations/new", element: signedIn(<RegulationNew />, "/regulations/new") },
  { path: "/regulations/:id", element: signedIn(<RegulationDetail />, "/regulations/:id") },
  { path: "/exams", element: signedIn(<Exams />, "/exams") },
  { path: "/exams/new", element: signedIn(<ExamEditor />, "/exams/new") },
  { path: "/exams/:id", element: signedIn(<ExamDetail />, "/exams/:id") },
  { path: "/exams/:id/edit", element: signedIn(<ExamEditor />, "/exams/:id/edit") },
  { path: "/exams/:id/monitor", element: signedIn(<ExamMonitor />, "/exams/:id/monitor") },
  { path: "/exams/:id/stats", element: signedIn(<ExamStats />, "/exams/:id/stats") },
  // Focused exam shell: no sidebar or tabs at any size (docs/06 §9).
  { path: "/exam-attempts/:id", element: signedIn(<TakeExam />, "/exam-attempts/:id") },
  {
    path: "/exam-attempts/:id/result",
    element: signedIn(<ExamResult />, "/exam-attempts/:id/result"),
  },
  { path: "/live", element: signedIn(<LiveList />, "/live") },
  { path: "/live/new", element: signedIn(<LiveNew />, "/live/new") },
  { path: "/announcements", element: signedIn(<Announcements />, "/announcements") },
  { path: "/announcements/new", element: signedIn(<AnnouncementNew />, "/announcements/new") },
  { path: "/inquiries", element: signedIn(<Inquiries />, "/inquiries") },
  { path: "/inquiries/:id", element: signedIn(<Inquiries />, "/inquiries/:id") },
  { path: "/site", element: signedIn(<SiteHome />, "/site") },
  { path: "/site/pages/:id", element: signedIn(<PageEditor />, "/site/pages/:id") },
  { path: "/site/news/:id", element: signedIn(<NewsEditor />, "/site/news/:id") },
  { path: "/site/media", element: signedIn(<SiteMedia />, "/site/media") },
  { path: "/site/redirects", element: signedIn(<Redirects />, "/site/redirects") },
  { path: "/events", element: signedIn(<Events />, "/events") },
  { path: "/events/:id", element: signedIn(<EventEditor />, "/events/:id") },
  { path: "/applications", element: signedIn(<Applications />, "/applications") },
  { path: "/applications/:id", element: signedIn(<ApplicationDetail />, "/applications/:id") },
  { path: "/admissions/cycles", element: signedIn(<Cycles />, "/admissions/cycles") },
  { path: "/admissions/forms", element: signedIn(<FormBuilder />, "/admissions/forms") },
  { path: "/registrar", element: signedIn(<RegistrarHome />, "/registrar") },
  { path: "/students", element: signedIn(<StudentRecords />, "/students") },
  { path: "/students/:id", element: signedIn(<StudentRecord />, "/students/:id") },
  { path: "/student-imports", element: signedIn(<StudentImports />, "/student-imports") },
  {
    path: "/student-imports/:id",
    element: signedIn(<StudentImportDetail />, "/student-imports/:id"),
  },
  { path: "/registrars", element: signedIn(<Registrars />, "/registrars") },
  { path: "/department", element: signedIn(<DepartmentDashboard />, "/department") },
  { path: "/department/courses", element: signedIn(<Offerings />, "/department/courses") },
  {
    path: "/department/lectures",
    element: signedIn(<DepartmentLectures />, "/department/lectures"),
  },
  { path: "/department/teachers", element: signedIn(<Members />, "/department/teachers") },
  {
    path: "/department/students",
    element: signedIn(<DepartmentStudents />, "/department/students"),
  },
  { path: "/department/approvals", element: signedIn(<Approvals />, "/department/approvals") },
  { path: "/department/audit", element: signedIn(<Audit />, "/department/audit") },
  { path: "/reports", element: signedIn(<DepartmentReport />, "/reports") },
  { path: "/reports/admissions", element: signedIn(<AdmissionsReport />, "/reports/admissions") },
  { path: "/reports/affairs", element: signedIn(<AffairsReport />, "/reports/affairs") },
  { path: "/hr", element: signedIn(<HRHome />, "/hr") },
  { path: "/hr/teachers", element: signedIn(<Teachers />, "/hr/teachers") },
  { path: "/hr/teachers/:id", element: signedIn(<TeacherProfile />, "/hr/teachers/:id") },
  { path: "/hr/notices/new", element: signedIn(<NoticeNew />, "/hr/notices/new") },
  { path: "/hr/report", element: signedIn(<HRReport />, "/hr/report") },
  { path: "/hr-notices/:id", element: signedIn(<MyNotice />, "/hr-notices/:id") },
  { path: "/transcripts", element: signedIn(<TranscriptLookup />, "/transcripts") },
  { path: "/print/report/:id", element: signedIn(<PrintReport />, "/print/report/:id") },
  {
    path: "/print/transcript/:number",
    element: signedIn(<PrintTranscript />, "/print/transcript/:number"),
  },
  { path: "/print/my-results", element: signedIn(<PrintMyResults />, "/print/my-results") },
  { path: "/cases", element: signedIn(<Cases />, "/cases") },
  { path: "/cases/new", element: signedIn(<CaseNew />, "/cases/new") },
  { path: "/cases/:id", element: signedIn(<CaseDetail />, "/cases/:id") },
  { path: "/system", element: signedIn(<AdminHome />, "/system") },
  { path: "/system/users", element: signedIn(<AdminUsers />, "/system/users") },
  { path: "/system/users/:id", element: signedIn(<AdminUser />, "/system/users/:id") },
  { path: "/system/roles", element: signedIn(<Roles />, "/system/roles") },
  { path: "/system/structure", element: signedIn(<Structure />, "/system/structure") },
  { path: "/system/settings", element: signedIn(<AdminSettings />, "/system/settings") },
  { path: "/audit", element: signedIn(<Audit />, "/audit") },
  { path: "*", element: <NotFound /> },
]);

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <ToastProvider>
          <Suspense fallback={<RouteLoading />}>
            <RouterProvider router={router} />
          </Suspense>
        </ToastProvider>
      </ConfirmProvider>
      <QueryErrorBanner />
    </QueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  // In development the worker handles push only (no caching next to Vite's HMR).
  const url = import.meta.env.DEV ? "/sw.js?dev=1" : "/sw.js";
  window.addEventListener("load", () => void navigator.serviceWorker.register(url));
}
