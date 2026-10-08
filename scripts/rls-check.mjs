// Access check: proves row-level security on a real database — user B can never see or change user A's rows.
// Zero dependencies on purpose. Run against a Supabase instance with email confirmations off:
// SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_KEY=<anon key> node scripts/rls-check.mjs

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY (anon key). Example:");
  console.error("  SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_KEY=<anon key> npm run rls-check");
  process.exit(1);
}

const password = "Rls-Check-Passw0rd!";

async function call(path, { method = "GET", token, body } = {}) {
  const response = await fetch(SUPABASE_URL + path, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

async function signUp(label) {
  const email = `rls-${label}-${Date.now()}@example.com`;
  const { status, data } = await call("/auth/v1/signup", { method: "POST", body: { email, password } });
  const token = data?.access_token;
  const id = data?.user?.id;
  if (status !== 200 || !token || !id) {
    console.error(`Signup of user ${label} failed (${status}): ${JSON.stringify(data)}`);
    console.error("Email confirmations must be off so signup returns a session.");
    process.exit(1);
  }
  return { token, id };
}

const isEmptyArray = (data) => Array.isArray(data) && data.length === 0;
const ok2xx = (status) => status >= 200 && status < 300;

// A must not be able to hand its own row to B: the update policy's WITH CHECK should reject it (403 / 42501).
// A 2xx is accepted only when no row came back and A's row still reads as A's, unchanged.
async function ownerMoveRejected(table, body, isUnchanged, query = ofA) {
  const r = await call(`/rest/v1/${table}${query}`, { method: "PATCH", token: a.token, body });
  if (!ok2xx(r.status)) return [true, r];
  const reread = await call(`/rest/v1/${table}${query}`, { token: a.token });
  const row = reread.data?.[0];
  const ok = isEmptyArray(r.data) && reread.data?.length === 1 && row.user_id === a.id && isUnchanged(row);
  return [ok, { patch: r, reread }];
}

const a = await signUp("a");
const b = await signUp("b");
const profile = { birth_year: 1990, weight_kg: 82.5, boat: "1x" };
const goal = { session_type: "erg", distance_m: 2000, target_seconds: 420.5 };
const ofA = `?user_id=eq.${a.id}`;
const session = {
  session_type: "erg",
  distance_m: 2000,
  duration_s: 450.5,
  splits_s: [112.5, 113, 112, 113],
  spm_min: 24,
  spm_max: 26,
};
const suggestion = { suggestion: { structure: "Steady row" }, is_default: false, attempts: 1, model: "rls-check" };
// Filled in by the steps below: A's first session (has a suggestion) and second session (has none).
let sessionA;
let sessionA2;
const ofSessionA = () => `?id=eq.${sessionA.id}`;
const ofSuggestionA = () => `?session_id=eq.${sessionA.id}`;
// RLS rejection of an insert: PostgREST answers 401/403 with Postgres code 42501.
const rlsRejected = (r) => !ok2xx(r.status) && r.data?.code === "42501";

// Each step returns [ok, detail]. Every assertion would fail if RLS were disabled or policies were `using (true)`.
const steps = [
  [
    "A inserts own profile",
    async () => {
      const r = await call("/rest/v1/profiles", { method: "POST", token: a.token, body: profile });
      return [r.status === 201 && r.data?.[0]?.user_id === a.id, r];
    },
  ],
  [
    "A inserts own erg goal",
    async () => {
      const r = await call("/rest/v1/goals", { method: "POST", token: a.token, body: goal });
      return [r.status === 201 && r.data?.[0]?.user_id === a.id, r];
    },
  ],
  [
    "A sees own profile and goal",
    async () => {
      const p = await call(`/rest/v1/profiles${ofA}`, { token: a.token });
      const g = await call(`/rest/v1/goals${ofA}`, { token: a.token });
      return [p.data?.length === 1 && g.data?.length === 1, { profiles: p, goals: g }];
    },
  ],
  [
    "B select sees none of A's profile",
    async () => {
      const r = await call(`/rest/v1/profiles${ofA}`, { token: b.token });
      return [r.status === 200 && isEmptyArray(r.data), r];
    },
  ],
  [
    "B select sees none of A's goals",
    async () => {
      const r = await call(`/rest/v1/goals${ofA}`, { token: b.token });
      return [r.status === 200 && isEmptyArray(r.data), r];
    },
  ],
  [
    "B update of A's profile affects 0 rows",
    async () => {
      const r = await call(`/rest/v1/profiles${ofA}`, { method: "PATCH", token: b.token, body: { weight_kg: 99 } });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "B update of A's goal affects 0 rows",
    async () => {
      const r = await call(`/rest/v1/goals${ofA}`, { method: "PATCH", token: b.token, body: { distance_m: 5000 } });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "B delete of A's profile affects 0 rows",
    async () => {
      const r = await call(`/rest/v1/profiles${ofA}`, { method: "DELETE", token: b.token });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "B delete of A's goal affects 0 rows",
    async () => {
      const r = await call(`/rest/v1/goals${ofA}`, { method: "DELETE", token: b.token });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "B insert of a goal owned by A is rejected",
    async () => {
      const body = { user_id: a.id, session_type: "water", distance_m: 1000, target_seconds: 240 };
      const r = await call("/rest/v1/goals", { method: "POST", token: b.token, body });
      return [!ok2xx(r.status), r];
    },
  ],
  [
    "A moving own profile to B is rejected",
    () => ownerMoveRejected("profiles", { user_id: b.id }, (row) => Number(row.weight_kg) === profile.weight_kg),
  ],
  [
    "A moving own goal to B is rejected",
    () =>
      ownerMoveRejected(
        "goals",
        { user_id: b.id },
        (row) => row.session_type === "erg" && row.distance_m === goal.distance_m,
      ),
  ],
  [
    "A's data unchanged on re-read",
    async () => {
      const p = await call(`/rest/v1/profiles${ofA}`, { token: a.token });
      const g = await call(`/rest/v1/goals${ofA}`, { token: a.token });
      const pr = p.data?.[0];
      const gr = g.data?.[0];
      const ok =
        p.data?.length === 1 &&
        pr.user_id === a.id &&
        Number(pr.weight_kg) === profile.weight_kg &&
        g.data?.length === 1 &&
        gr.user_id === a.id &&
        gr.session_type === "erg" &&
        gr.distance_m === goal.distance_m;
      return [ok, { profiles: p, goals: g }];
    },
  ],
  [
    "A inserts own session",
    async () => {
      const r = await call("/rest/v1/sessions", { method: "POST", token: a.token, body: session });
      sessionA = r.data?.[0];
      return [r.status === 201 && sessionA?.user_id === a.id, r];
    },
  ],
  [
    "A inserts a suggestion for own session",
    async () => {
      const body = { ...suggestion, session_id: sessionA.id };
      const r = await call("/rest/v1/coach_suggestions", { method: "POST", token: a.token, body });
      return [r.status === 201 && r.data?.[0]?.user_id === a.id, r];
    },
  ],
  [
    "A sees own session and suggestion",
    async () => {
      const s = await call(`/rest/v1/sessions${ofA}`, { token: a.token });
      const c = await call(`/rest/v1/coach_suggestions${ofA}`, { token: a.token });
      return [s.data?.length === 1 && c.data?.length === 1, { sessions: s, suggestions: c }];
    },
  ],
  [
    "A update of own suggestion affects 0 rows (immutable)",
    async () => {
      const r = await call(`/rest/v1/coach_suggestions${ofSuggestionA()}`, {
        method: "PATCH",
        token: a.token,
        body: { model: "changed" },
      });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "A delete of own suggestion affects 0 rows (no regeneration)",
    async () => {
      const r = await call(`/rest/v1/coach_suggestions${ofSuggestionA()}`, { method: "DELETE", token: a.token });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "B select sees none of A's sessions or suggestions",
    async () => {
      const s = await call(`/rest/v1/sessions${ofA}`, { token: b.token });
      const c = await call(`/rest/v1/coach_suggestions${ofA}`, { token: b.token });
      const ok = s.status === 200 && isEmptyArray(s.data) && c.status === 200 && isEmptyArray(c.data);
      return [ok, { sessions: s, suggestions: c }];
    },
  ],
  [
    "B update of A's session affects 0 rows",
    async () => {
      const r = await call(`/rest/v1/sessions${ofA}`, { method: "PATCH", token: b.token, body: { distance_m: 5000 } });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "B update of A's suggestion affects 0 rows",
    async () => {
      const r = await call(`/rest/v1/coach_suggestions${ofA}`, {
        method: "PATCH",
        token: b.token,
        body: { model: "changed" },
      });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "B delete of A's suggestion affects 0 rows",
    async () => {
      const r = await call(`/rest/v1/coach_suggestions${ofA}`, { method: "DELETE", token: b.token });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "B delete of A's session affects 0 rows",
    async () => {
      const r = await call(`/rest/v1/sessions${ofA}`, { method: "DELETE", token: b.token });
      return [ok2xx(r.status) && isEmptyArray(r.data), r];
    },
  ],
  [
    "B insert of a session owned by A is rejected",
    async () => {
      const r = await call("/rest/v1/sessions", {
        method: "POST",
        token: b.token,
        body: { ...session, user_id: a.id },
      });
      return [!ok2xx(r.status), r];
    },
  ],
  [
    "A moving own session to B is rejected",
    () =>
      ownerMoveRejected(
        "sessions",
        { user_id: b.id },
        (row) => row.session_type === "erg" && row.distance_m === session.distance_m,
        ofSessionA(),
      ),
  ],
  [
    "A inserts a second session (no suggestion yet)",
    async () => {
      const body = { session_type: "water", distance_m: 8000, duration_s: 2400, dps_min: 8.5, dps_max: 9, boat: "1x" };
      const r = await call("/rest/v1/sessions", { method: "POST", token: a.token, body });
      sessionA2 = r.data?.[0];
      return [r.status === 201 && sessionA2?.user_id === a.id, r];
    },
  ],
  [
    "B insert of a suggestion for A's session is rejected",
    async () => {
      // A's second session has no suggestion, so only RLS (not the unique constraint) can stop this.
      const body = { ...suggestion, session_id: sessionA2.id };
      const r = await call("/rest/v1/coach_suggestions", { method: "POST", token: b.token, body });
      return [rlsRejected(r), r];
    },
  ],
  [
    "B insert of a suggestion owned by A is rejected",
    async () => {
      const body = { ...suggestion, session_id: sessionA2.id, user_id: a.id };
      const r = await call("/rest/v1/coach_suggestions", { method: "POST", token: b.token, body });
      return [rlsRejected(r), r];
    },
  ],
  [
    "A's sessions and suggestion unchanged on re-read",
    async () => {
      const s = await call(`/rest/v1/sessions${ofSessionA()}`, { token: a.token });
      const c = await call(`/rest/v1/coach_suggestions${ofA}`, { token: a.token });
      const sr = s.data?.[0];
      const cr = c.data?.[0];
      const ok =
        s.data?.length === 1 &&
        sr.user_id === a.id &&
        sr.distance_m === session.distance_m &&
        c.data?.length === 1 &&
        cr.session_id === sessionA.id &&
        cr.model === suggestion.model;
      return [ok, { sessions: s, suggestions: c }];
    },
  ],
  [
    "anonymous select returns no rows",
    async () => {
      const p = await call(`/rest/v1/profiles${ofA}`);
      const g = await call(`/rest/v1/goals${ofA}`);
      const s = await call(`/rest/v1/sessions${ofA}`);
      const c = await call(`/rest/v1/coach_suggestions${ofA}`);
      // Either RLS hides rows (200 []) or the anon role is refused outright (401/403).
      const hidden = (r) => (r.status === 200 && isEmptyArray(r.data)) || r.status === 401 || r.status === 403;
      const ok = hidden(p) && hidden(g) && hidden(s) && hidden(c);
      return [ok, { profiles: p, goals: g, sessions: s, suggestions: c }];
    },
  ],
];

let failed = 0;
for (const [name, run] of steps) {
  let ok = false;
  let detail;
  try {
    [ok, detail] = await run();
  } catch (error) {
    detail = String(error);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    failed++;
    console.log(`      got ${JSON.stringify(detail)}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll access-check steps passed");
process.exit(failed ? 1 : 0);
