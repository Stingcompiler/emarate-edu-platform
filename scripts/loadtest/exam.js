// k6 load test: N students take one exam at the same time (docs/02 Phase 5).
//   k6 run -e BASE=http://127.0.0.1:8100 -e EXAM=<public_id> -e PASSWORD=… scripts/loadtest/exam.js
import { check, sleep } from "k6";
import http from "k6/http";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE || "http://127.0.0.1:8100";
const EXAM = __ENV.EXAM;
const PASSWORD = __ENV.PASSWORD;
const STUDENTS = Number(__ENV.STUDENTS || 500);

const saveAnswer = new Trend("save_answer_ms", true);

export const options = {
  scenarios: {
    exam: {
      executor: "per-vu-iterations",
      vus: STUDENTS,
      iterations: 1,
      maxDuration: "15m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    save_answer_ms: ["p(95)<800"],
    "http_req_duration{name:start}": ["p(95)<1500"],
    "http_req_duration{name:submit}": ["p(95)<1500"],
  },
};

function csrfHeaders(jar) {
  const token = jar.cookiesForURL(BASE).csrftoken?.[0];
  return { "Content-Type": "application/json", "X-CSRFToken": token || "" };
}

export default function () {
  const n = String(__VU).padStart(4, "0");
  const jar = http.cookieJar();
  // Students arrive over the first minute, as a class does. (All 500 opening
  // sockets in the same millisecond overflows macOS's listen backlog of 128.)
  sleep(Math.random() * 60);
  http.get(`${BASE}/api/public/csrf`, { tags: { name: "csrf" } });
  const login = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ identifier: `lt${n}@loadtest.ecst.test`, password: PASSWORD }),
    { headers: csrfHeaders(jar), tags: { name: "login" } },
  );
  check(login, { "logged in": (r) => r.status === 200 });

  sleep(1 + Math.random() * 4); // reading the exam rules
  const start = http.post(`${BASE}/api/v1/exams/${EXAM}/start`, null, {
    headers: csrfHeaders(jar),
    tags: { name: "start" },
  });
  if (!check(start, { started: (r) => r.status === 201 })) return;
  const attempt = start.json();

  for (const question of attempt.questions) {
    sleep(2 + Math.random() * 4); // reading time
    const choice = question.choices[Math.floor(Math.random() * question.choices.length)].id;
    const res = http.put(
      `${BASE}/api/v1/exam-attempts/${attempt.public_id}/answers/${question.id}`,
      JSON.stringify({ answer: choice }),
      { headers: csrfHeaders(jar), tags: { name: "answer" } },
    );
    saveAnswer.add(res.timings.duration);
    check(res, { saved: (r) => r.status === 204 });
  }
  const submit = http.post(`${BASE}/api/v1/exam-attempts/${attempt.public_id}/submit`, null, {
    headers: csrfHeaders(jar),
    tags: { name: "submit" },
  });
  check(submit, { submitted: (r) => r.status === 200 });
}
