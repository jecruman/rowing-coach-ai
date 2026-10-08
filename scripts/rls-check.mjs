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

const a = await signUp("a");
const b = await signUp("b");
const profile = { birth_year: 1990, weight_kg: 82.5, boat: "1x" };
const goal = { session_type: "erg", distance_m: 2000, target_seconds: 420.5 };
const ofA = `?user_id=eq.${a.id}`;

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
    "A's data unchanged on re-read",
    async () => {
      const p = await call(`/rest/v1/profiles${ofA}`, { token: a.token });
      const g = await call(`/rest/v1/goals${ofA}`, { token: a.token });
      const pr = p.data?.[0];
      const gr = g.data?.[0];
      const ok =
        p.data?.length === 1 &&
        Number(pr.weight_kg) === profile.weight_kg &&
        g.data?.length === 1 &&
        gr.session_type === "erg" &&
        gr.distance_m === goal.distance_m;
      return [ok, { profiles: p, goals: g }];
    },
  ],
  [
    "anonymous select returns no rows",
    async () => {
      const p = await call(`/rest/v1/profiles${ofA}`);
      const g = await call(`/rest/v1/goals${ofA}`);
      // Either RLS hides rows (200 []) or the anon role is refused outright (401/403).
      const hidden = (r) => (r.status === 200 && isEmptyArray(r.data)) || r.status === 401 || r.status === 403;
      return [hidden(p) && hidden(g), { profiles: p, goals: g }];
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
