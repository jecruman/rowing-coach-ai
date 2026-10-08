// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();
// Set by the "session log saves" step; the session page and suggestion steps use it.
let sessionPath = "";
const SESSION_PATH = /^\/sessions\/[0-9a-f-]{36}$/;

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

// `form` sends a urlencoded body, `json` a JSON body; a JSON response is returned parsed as `body`.
async function request(path, { method = "GET", form, json } = {}) {
  const contentType = form ? "application/x-www-form-urlencoded" : json !== undefined ? "application/json" : undefined;
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : json !== undefined ? JSON.stringify(json) : undefined,
  });
  storeCookies(response);
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : null;
  return { status: response.status, location: response.headers.get("location") ?? "", body };
}

function suggestionPath() {
  return `/api${sessionPath || "/sessions/missing"}/suggestion`;
}

// CI has neither ANTHROPIC_API_KEY nor COACH_EMAILS, so the suggestion is an unstored safe default.
function isUnstoredDefault(body) {
  return (
    body !== null &&
    body.isDefault === true &&
    body.stored === false &&
    ["not_allowed", "not_configured"].includes(body.defaultReason) &&
    typeof body.suggestion?.structure === "string"
  );
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["profile redirects anonymous user", () => request("/profile"), { status: 302, location: "/auth/signin" }],
  ["new session redirects anonymous user", () => request("/sessions/new"), { status: 302, location: "/auth/signin" }],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["profile renders for signed-in user", () => request("/profile"), { status: 200 }],
  [
    "profile saves valid form",
    () => request("/api/profile", { method: "POST", form: { birthYear: "1984", weightKg: "70", boat: "1x" } }),
    { status: 302, location: "/profile?saved=profile" },
  ],
  [
    "erg goal saves",
    () =>
      request("/api/goals", {
        method: "POST",
        form: { sessionType: "erg", action: "save", distanceM: "2000", targetTime: "7:30", eventDate: "" },
      }),
    { status: 302, location: "/profile?saved=erg-goal" },
  ],
  [
    "goal rejects invalid time",
    () =>
      request("/api/goals", {
        method: "POST",
        form: { sessionType: "erg", action: "save", distanceM: "2000", targetTime: "7:75", eventDate: "" },
      }),
    { status: 302, location: "/profile?error=" },
  ],
  ["new session page renders", () => request("/sessions/new"), { status: 200 }],
  [
    "session log saves and opens the session page",
    async () => {
      const actual = await request("/api/sessions", {
        method: "POST",
        form: {
          sessionType: "erg",
          rowedOn: new Date().toISOString().slice(0, 10),
          distanceM: "2000",
          time: "7:30.5",
          splits: "1:52 1:53 1:53.5 1:51",
          spm: "24-26",
          watts: "230",
          comment: "smoke test",
        },
      });
      sessionPath = actual.location;
      return actual;
    },
    { status: 302, match: SESSION_PATH },
  ],
  [
    "session log rejects invalid time",
    () =>
      request("/api/sessions", {
        method: "POST",
        form: { sessionType: "water", rowedOn: "2026-01-01", distanceM: "8000", time: "40:75" },
      }),
    { status: 302, location: "/sessions/new?error=" },
  ],
  ["session page renders", () => request(sessionPath || "/sessions/missing"), { status: 200 }],
  [
    "suggestion for own session is the safe default",
    () => request(suggestionPath(), { method: "POST", json: {} }),
    { status: 200, check: isUnstoredDefault },
  ],
  [
    "suggestion for an unknown session is not found",
    () => request(`/api/sessions/${globalThis.crypto.randomUUID()}/suggestion`, { method: "POST", json: {} }),
    { status: 404 },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "suggestion rejects signed-out user",
    () => request(suggestionPath(), { method: "POST", json: {} }),
    { status: 401 },
  ],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.match === undefined || expected.match.test(actual.location)) &&
    (expected.check === undefined || expected.check(actual.body));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(
      `      expected ${expected.status} ${expected.location ?? expected.match ?? expected.check?.name ?? ""}`,
    );
    // Only the flags, never the suggestion text.
    if (actual.body) {
      const { isDefault, defaultReason, stored, error } = actual.body;
      console.log(`      body ${JSON.stringify({ isDefault, defaultReason, stored, error })}`);
    }
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
