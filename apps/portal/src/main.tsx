import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./app.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { RequireAuth } from "./lib/auth";
import { ApplicationDetail } from "./routes/admissions/ApplicationDetail";
import { Applications } from "./routes/admissions/Applications";
import { Cycles } from "./routes/admissions/Cycles";
import { FormBuilder } from "./routes/admissions/FormBuilder";
import { Apply } from "./routes/visitor/Apply";
import { Track } from "./routes/visitor/Track";
import { CaseDetail } from "./routes/affairs/CaseDetail";
import { CaseNew } from "./routes/affairs/CaseNew";
import { Cases } from "./routes/affairs/Cases";
import { RegulationDetail } from "./routes/affairs/RegulationDetail";
import { RegulationNew } from "./routes/affairs/RegulationNew";
import { Regulations } from "./routes/affairs/Regulations";
import { AnnouncementNew } from "./routes/announcements/AnnouncementNew";
import { Announcements } from "./routes/announcements/Announcements";
import { ExamDetail } from "./routes/exams/ExamDetail";
import { Inquiries } from "./routes/inquiries/Inquiries";
import { LiveList } from "./routes/live/LiveList";
import { LiveNew } from "./routes/live/LiveNew";
import { EventEditor, Events } from "./routes/site/Events";
import { NewsEditor } from "./routes/site/NewsEditor";
import { PageEditor } from "./routes/site/PageEditor";
import { Redirects } from "./routes/site/Redirects";
import { SiteHome } from "./routes/site/SiteHome";
import { SiteMedia } from "./routes/site/SiteMedia";
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
import { AdminHome } from "./routes/admin/Home";
import { AdminSettings } from "./routes/admin/Settings";
import { Roles } from "./routes/admin/RolesMatrix";
import { Structure } from "./routes/admin/Structure";
import { AdminUser } from "./routes/admin/User";
import { AdminUsers } from "./routes/admin/Users";
import { Activate } from "./routes/Activate";
import { Home } from "./routes/Home";
import { AcademicHome } from "./routes/homes/AcademicHome";
import { AffairsHome } from "./routes/homes/AffairsHome";
import { ResultsHome } from "./routes/homes/ResultsHome";
import { Me, MyStatus } from "./routes/learning/Me";
import { RegistrarHome } from "./routes/registrar/Home";
import { StudentImportDetail, StudentImports } from "./routes/registrar/Imports";
import { Registrars } from "./routes/registrar/Registrars";
import { StudentRecord } from "./routes/registrar/StudentRecord";
import { StudentRecords } from "./routes/registrar/StudentRecords";
import { Approvals } from "./routes/department/Approvals";
import { Audit } from "./routes/department/Audit";
import { DepartmentDashboard } from "./routes/department/Dashboard";
import { DepartmentLectures } from "./routes/department/Lectures";
import { Members } from "./routes/department/Members";
import { Offerings } from "./routes/department/Offerings";
import { DepartmentStudents } from "./routes/department/Students";
import { Assignment } from "./routes/learning/Assignment";
import { AssignmentEditor } from "./routes/learning/AssignmentEditor";
import { Grade } from "./routes/learning/Grade";
import { Grading } from "./routes/learning/Grading";
import { LectureEditor } from "./routes/learning/LectureEditor";
import { Students } from "./routes/learning/Students";
import { Course } from "./routes/learning/Course";
import { Courses } from "./routes/learning/Courses";
import { Lecture } from "./routes/learning/Lecture";
import { Tasks } from "./routes/learning/Tasks";
import { HRHome } from "./routes/hr/Home";
import { MyNotice } from "./routes/hr/MyNotice";
import { NoticeNew } from "./routes/hr/NoticeNew";
import { HRReport } from "./routes/hr/Report";
import { TeacherProfile } from "./routes/hr/TeacherProfile";
import { Teachers } from "./routes/hr/Teachers";
import { PrintReport } from "./routes/print/PrintReport";
import { PrintMyResults, PrintTranscript } from "./routes/print/PrintTranscript";
import { AdmissionsReport } from "./routes/reports/AdmissionsReport";
import { AffairsReport } from "./routes/reports/AffairsReport";
import { DepartmentReport } from "./routes/reports/DepartmentReport";
import { TranscriptLookup } from "./routes/reports/TranscriptLookup";
import { ResultSettings } from "./routes/results/ResultSettings";
import { ResultSearch } from "./routes/results/Search";
import { Compose } from "./routes/Compose";
import { ForgotPassword } from "./routes/ForgotPassword";
import { Install } from "./routes/Install";
import { Login } from "./routes/Login";
import { NotFound } from "./routes/NotFound";
import { ConfirmProvider } from "./components/Confirm";
import { NoAccess } from "./components/NoAccess";
import { QueryErrorBanner } from "./components/QueryErrorBanner";
import { ROUTE_ACCESS } from "./lib/access";
import { queryClient } from "./lib/queryClient";
import { Notifications } from "./routes/Notifications";
import { Register } from "./routes/Register";
import { Settings } from "./routes/Settings";

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
        <RouterProvider router={router} />
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
