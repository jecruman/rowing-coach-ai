// Session integrity checks: prove that what a rower logs is what the pages show, and that a failed write is
// reported as a failure. Expected values are literals worked out by hand from the PRD, never computed with app code.
// Zero dependencies, like smoke. Run against a production preview with local Supabase:
// BASE_URL=http://localhost:4321 node scripts/session-integrity.mjs

import { createHttpClient } from "./lib/http.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const password = "Integrity-Test-Passw0rd!";
const SESSION_PATH = /^\/sessions\/[0-9a-f-]{36}$/;
const LOG_FAILED = "Could not save your session. Please try again.";
let userCount = 0;

// A fresh user per check group, so seeded sessions never mix. Without a signed-in user every check would only
// see sign-in redirects, so a failed sign-in aborts the run instead of reporting a page of misleading FAILs.
async function signUpUser() {
  const email = `integrity-${Date.now()}-${++userCount}@example.com`;
  const { request } = createHttpClient(BASE_URL);
  const signup = await request("/api/auth/signup", { method: "POST", form: { email, password } });
  const signin = await request("/api/auth/signin", { method: "POST", form: { email, password } });
  if (signin.status !== 302 || signin.location !== "/dashboard") {
    console.log(`ABORT  could not sign in ${email}`);
    console.log(`      signup -> ${signup.status} ${signup.location}`);
    console.log(`      signin -> ${signin.status} ${signin.location} (expected 302 /dashboard)`);
    process.exit(1);
  }
  return request;
}

// Logs a session through the same endpoint the form posts to and returns its page path (/sessions/<id>).
async function logSession(request, fields) {
  const actual = await request("/api/sessions", { method: "POST", form: fields });
  if (actual.status !== 302 || !SESSION_PATH.test(actual.location)) {
    throw new Error(`log session -> ${actual.status} ${actual.location} (expected 302 /sessions/<id>)`);
  }
  return actual.location;
}

// The message the endpoint put in `?error=`, decoded the way the page reads it.
function errorMessage(location) {
  const query = location.split("?")[1] ?? "";
  return new URLSearchParams(query).get("error") ?? "";
}

const probeRequest = await signUpUser();
// Valid in every field except the date: Postgres has no year 0, but the app's date rule only bounds it above.
const probeSession = { sessionType: "erg", rowedOn: "0000-01-01", distanceM: "2000", time: "8:00" };

// Each check returns the line shown after its name and the list of failures (empty when it passes).
const checks = [
  [
    "log with year 0000 is rejected by the database",
    async () => {
      const actual = await probeRequest("/api/sessions", { method: "POST", form: probeSession });
      const message = errorMessage(actual.location);
      const failures = [];
      if (actual.status !== 302 || !actual.location.startsWith("/sessions/new?error=")) {
        failures.push(`expected 302 /sessions/new?error=..., got ${actual.status} ${actual.location}`);
      }
      // A validation message here means the app rejected the date before the database saw it (Phase 3 route B).
      if (message !== LOG_FAILED) failures.push(`expected message "${LOG_FAILED}", got "${message}"`);
      return { summary: `${actual.status} ${actual.location}`, failures };
    },
  ],
  [
    // Proves the probe's other fields are valid, so the year is the only reason the probe was rejected.
    "same session with a real date saves",
    async () => {
      const path = await logSession(probeRequest, { ...probeSession, rowedOn: "2026-03-01" });
      return { summary: `302 ${path}`, failures: [] };
    },
  ],
];

let failed = 0;
for (const [name, run] of checks) {
  let result;
  try {
    result = await run();
  } catch (error) {
    result = { summary: "error", failures: [error instanceof Error ? error.message : String(error)] };
  }
  const ok = result.failures.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${result.summary}`);
  if (!ok) {
    failed++;
    for (const failure of result.failures) console.log(`      ${failure}`);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll integrity checks passed");
process.exit(failed ? 1 : 0);
