import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./app.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { Structure } from "./routes/admin/Structure";
import { AdminUser } from "./routes/admin/User";
import { AdminUsers } from "./routes/admin/Users";
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
import { Notifications } from "./routes/Notifications";
import { Register } from "./routes/Register";
import { Settings } from "./routes/Settings";

// TanStack Query holds all server state (docs/04, D-no-Zustand).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

const signedIn = (element: React.ReactNode) => <RequireAuth>{element}</RequireAuth>;

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  // Visitors (no account): apply and track — the public site links here (docs/03 §4).
  { path: "/apply", element: <Apply /> },
  { path: "/track", element: <Track /> },
  // Role dashboards arrive with Phase 10; until then home is the notification centre.
  { path: "/", element: signedIn(<Home />) },
  { path: "/courses", element: signedIn(<Courses />) },
  { path: "/courses/:id", element: signedIn(<Course />) },
  { path: "/courses/:id/students", element: signedIn(<Students />) },
  { path: "/lectures/new", element: signedIn(<LectureEditor />) },
  { path: "/lectures/:id", element: signedIn(<Lecture />) },
  { path: "/lectures/:id/edit", element: signedIn(<LectureEditor />) },
  { path: "/assignments/new", element: signedIn(<AssignmentEditor />) },
  { path: "/assignments/:id", element: signedIn(<Assignment />) },
  { path: "/assignments/:id/edit", element: signedIn(<AssignmentEditor />) },
  { path: "/submissions/:id", element: signedIn(<Grade />) },
  { path: "/grading", element: signedIn(<Grading />) },
  { path: "/tasks", element: signedIn(<Tasks />) },
  { path: "/me", element: signedIn(<Me />) },
  { path: "/me/status", element: signedIn(<MyStatus />) },
  { path: "/results-office", element: signedIn(<ResultsHome />) },
  { path: "/academic", element: signedIn(<AcademicHome />) },
  { path: "/affairs", element: signedIn(<AffairsHome />) },
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
  { path: "/live", element: signedIn(<LiveList />) },
  { path: "/live/new", element: signedIn(<LiveNew />) },
  { path: "/announcements", element: signedIn(<Announcements />) },
  { path: "/announcements/new", element: signedIn(<AnnouncementNew />) },
  { path: "/inquiries", element: signedIn(<Inquiries />) },
  { path: "/inquiries/:id", element: signedIn(<Inquiries />) },
  { path: "/site", element: signedIn(<SiteHome />) },
  { path: "/site/pages/:id", element: signedIn(<PageEditor />) },
  { path: "/site/news/:id", element: signedIn(<NewsEditor />) },
  { path: "/site/media", element: signedIn(<SiteMedia />) },
  { path: "/site/redirects", element: signedIn(<Redirects />) },
  { path: "/events", element: signedIn(<Events />) },
  { path: "/events/:id", element: signedIn(<EventEditor />) },
  { path: "/applications", element: signedIn(<Applications />) },
  { path: "/applications/:id", element: signedIn(<ApplicationDetail />) },
  { path: "/admissions/cycles", element: signedIn(<Cycles />) },
  { path: "/admissions/forms", element: signedIn(<FormBuilder />) },
  { path: "/registrar", element: signedIn(<RegistrarHome />) },
  { path: "/students", element: signedIn(<StudentRecords />) },
  { path: "/students/:id", element: signedIn(<StudentRecord />) },
  { path: "/student-imports", element: signedIn(<StudentImports />) },
  { path: "/student-imports/:id", element: signedIn(<StudentImportDetail />) },
  { path: "/registrars", element: signedIn(<Registrars />) },
  { path: "/department", element: signedIn(<DepartmentDashboard />) },
  { path: "/department/courses", element: signedIn(<Offerings />) },
  { path: "/department/lectures", element: signedIn(<DepartmentLectures />) },
  { path: "/department/teachers", element: signedIn(<Members />) },
  { path: "/department/students", element: signedIn(<DepartmentStudents />) },
  { path: "/department/approvals", element: signedIn(<Approvals />) },
  { path: "/department/audit", element: signedIn(<Audit />) },
  { path: "/reports", element: signedIn(<DepartmentReport />) },
  { path: "/reports/admissions", element: signedIn(<AdmissionsReport />) },
  { path: "/reports/affairs", element: signedIn(<AffairsReport />) },
  { path: "/hr", element: signedIn(<HRHome />) },
  { path: "/hr/teachers", element: signedIn(<Teachers />) },
  { path: "/hr/teachers/:id", element: signedIn(<TeacherProfile />) },
  { path: "/hr/notices/new", element: signedIn(<NoticeNew />) },
  { path: "/hr/report", element: signedIn(<HRReport />) },
  { path: "/hr-notices/:id", element: signedIn(<MyNotice />) },
  { path: "/transcripts", element: signedIn(<TranscriptLookup />) },
  { path: "/print/report/:id", element: signedIn(<PrintReport />) },
  { path: "/print/transcript/:number", element: signedIn(<PrintTranscript />) },
  { path: "/print/my-results", element: signedIn(<PrintMyResults />) },
  { path: "/cases", element: signedIn(<Cases />) },
  { path: "/cases/new", element: signedIn(<CaseNew />) },
  { path: "/cases/:id", element: signedIn(<CaseDetail />) },
  { path: "/system", element: signedIn(<AdminHome />) },
  { path: "/system/users", element: signedIn(<AdminUsers />) },
  { path: "/system/users/:id", element: signedIn(<AdminUser />) },
  { path: "/system/structure", element: signedIn(<Structure />) },
  { path: "/system/settings", element: signedIn(<AdminSettings />) },
  { path: "/audit", element: signedIn(<Audit />) },
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
