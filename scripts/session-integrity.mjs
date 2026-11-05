// Session integrity checks: prove that what a rower logs is what the pages show, and that a failed write is
// reported as a failure. Expected values are literals worked out by hand from the PRD, never computed with app code.
// Zero dependencies, like smoke. Run against a production preview with local Supabase:
// BASE_URL=http://localhost:4321 node scripts/session-integrity.mjs

import { createHttpClient } from "./lib/http.mjs";
import { definitionPairs, leafTexts, links, sections } from "./lib/html.mjs";

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

// --- Value assertions. Each pushes "label: expected …, got …" onto `failures` instead of throwing, so one check
// reports every wrong value at once.

// Whitespace is collapsed, and the gap between a value and its parenthesised delta is not significant.
function normalise(text) {
  return text.replace(/\s+/g, " ").replace(/\s*\(/g, " (").trim();
}

function expectValue(failures, label, expected, actual) {
  if (normalise(actual) !== normalise(expected)) failures.push(`${label}: expected "${expected}", got "${actual}"`);
}

// Same items in the same order.
function expectList(failures, label, expected, actual) {
  const same =
    expected.length === actual.length && expected.every((item, i) => normalise(item) === normalise(actual[i]));
  if (!same) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// The one value shown for `label` among `pairs`; a missing or repeated label is a failure.
function expectLabelled(failures, scope, pairs, label, expected) {
  const found = pairs.filter(([name]) => name === label).map(([, value]) => value);
  if (found.length !== 1) {
    failures.push(`${scope} "${label}": expected "${expected}", got ${found.length} values ${JSON.stringify(found)}`);
  } else {
    expectValue(failures, `${scope} "${label}"`, expected, found[0]);
  }
}

// Exactly these labels, in this order, each with its value.
function expectPairs(failures, scope, pairs, expected) {
  expectList(
    failures,
    `${scope} labels`,
    expected.map(([label]) => label),
    pairs.map(([label]) => label),
  );
  for (const [label, value] of expected) expectLabelled(failures, scope, pairs, label, value);
}

// The analysis card's only paragraph after its values is the hard-session note.
function expectHardNote(failures, scope, notes, present) {
  const ok = present ? notes.length === 1 && notes[0].startsWith("Hard session:") : notes.length === 0;
  if (!ok) {
    failures.push(
      `${scope} hard-session note: expected ${present ? "present" : "absent"}, got ${JSON.stringify(notes)}`,
    );
  }
}

const probeRequest = await signUpUser();
// Valid in every field except the date: Postgres has no year 0, but the app's date rule only bounds it above.
const probeSession = { sessionType: "erg", rowedOn: "0000-01-01", distanceM: "2000", time: "8:00" };

// --- Oracle history (Risk #1). Every expected value below is worked out by hand from the PRD's rules: pace per
// 500 m = time × 500 / distance; baseline = average of the last 3 earlier sessions of the same type; "Pace: good
// improvement" at 5 s or more faster; hard = pace at or faster than goal pace + 5 s (goal 2000 m in 7:30 → 1:57.5).
// Fixed past dates keep the checks independent of the clock.
const oracleRequest = await signUpUser();
const ORACLE_GOAL = { sessionType: "erg", action: "save", distanceM: "2000", targetTime: "7:30", eventDate: "" };
// Logged in this order. Paces: E1 2:30, E2 2:10, W 2:30, E3 2:05, E4 2:00, E5 1:55.
const ORACLE_SESSIONS = {
  E1: { sessionType: "erg", rowedOn: "2026-03-02", distanceM: "2000", time: "10:00" },
  E2: { sessionType: "erg", rowedOn: "2026-03-04", distanceM: "2000", time: "8:40" },
  W: { sessionType: "water", rowedOn: "2026-03-05", distanceM: "8000", time: "40:00", dps: "8.0-8.4", boat: "1x" },
  E3: { sessionType: "erg", rowedOn: "2026-03-06", distanceM: "2000", time: "8:20" },
  E4: { sessionType: "erg", rowedOn: "2026-03-08", distanceM: "2000", time: "8:00" },
  E5: {
    sessionType: "erg",
    rowedOn: "2026-03-10",
    distanceM: "2000",
    time: "7:40",
    splits: "1:56 1:54 1:55 1:55",
    spm: "24-26",
    watts: "250",
  },
};
// Session page path per key, filled by the seed check.
const oraclePaths = {};
const HARD_NOTE = true;
const NO_HARD_NOTE = false;

function oraclePath(key) {
  const path = oraclePaths[key];
  if (!path) throw new Error(`session ${key} was not seeded (see the seed check)`);
  return path;
}

// A row's key (E1…W) from its link, or the link itself when it is not an oracle session.
function oracleKey(href) {
  return Object.keys(oraclePaths).find((key) => oraclePaths[key] === href) ?? href;
}

async function oraclePage(path) {
  const page = await oracleRequest(path);
  if (page.status !== 200) throw new Error(`${path} -> ${page.status} (expected 200)`);
  return page.text;
}

// A session page split into the blocks the checks bind to: the logged values, the analysis rows, the comparison
// text above them, and the labels and notes below them.
async function sessionPage(key) {
  const all = sections(await oraclePage(oraclePath(key)));
  const valueBlocks = all.filter((section) => !section.attrs["aria-labelledby"]);
  const analysis = all.find((section) => section.attrs["aria-labelledby"] === "analysis-heading");
  if (valueBlocks.length !== 1) throw new Error(`${key} page: expected 1 values block, got ${valueBlocks.length}`);
  if (!analysis) throw new Error(`${key} page: no Analysis section`);
  const head = analysis.html.slice(0, analysis.html.indexOf("<dl"));
  const tail = analysis.html.slice(analysis.html.indexOf("</dl>"));
  return {
    values: definitionPairs(valueBlocks[0].html),
    analysis: definitionPairs(analysis.html),
    comparison: leafTexts(head, "p"),
    labels: leafTexts(tail, "li"),
    notes: leafTexts(tail, "p"),
  };
}

// Session rows of a list-like page, newest first as shown.
function sessionRows(html) {
  return links(html).filter((link) => SESSION_PATH.test(link.href));
}

async function listRows() {
  return sessionRows(await oraclePage("/sessions"));
}

// Erg pace trend: its rows, and the "first → latest" change from the trend card.
async function ergPaceTrend() {
  const html = await oraclePage("/sessions/trend?metric=pace&type=erg");
  const card = sections(html).find((section) => section.attrs["aria-labelledby"] === "trend-heading");
  const spans = card ? leafTexts(card.html, "span") : [];
  const at = spans.indexOf("first → latest:");
  return { rows: sessionRows(html), change: at === -1 ? "(no first → latest change)" : (spans[at + 1] ?? "") };
}

// The cells of the row linking to session `key`; a missing row is a failure.
function rowCells(failures, rows, key, tag) {
  const row = rows.find((candidate) => candidate.href === oraclePaths[key]);
  if (!row) {
    failures.push(`${key} row: missing`);
    return null;
  }
  return leafTexts(row.html, tag);
}

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
  [
    "oracle history seeds: erg goal 2000 m in 7:30 and six sessions",
    async () => {
      const goal = await oracleRequest("/api/goals", { method: "POST", form: ORACLE_GOAL });
      if (goal.status !== 302 || goal.location !== "/profile?saved=erg-goal") {
        throw new Error(`erg goal -> ${goal.status} ${goal.location} (expected 302 /profile?saved=erg-goal)`);
      }
      for (const [key, fields] of Object.entries(ORACLE_SESSIONS)) {
        try {
          oraclePaths[key] = await logSession(oracleRequest, fields);
        } catch (error) {
          throw new Error(`${key}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
      }
      return { summary: Object.keys(oraclePaths).join(", "), failures: [] };
    },
  ],
  [
    "E5 page shows the logged values",
    async () => {
      const failures = [];
      expectPairs(failures, "E5 values", (await sessionPage("E5")).values, [
        ["Date", "2026-03-10"],
        ["Distance", "2000 m"],
        ["Time", "7:40"],
        ["Splits /500 m", "1:56 · 1:54 · 1:55 · 1:55"],
        ["Stroke rate", "24–26 spm"],
        ["Average watts", "250 W"],
      ]);
      return { summary: oraclePath("E5"), failures };
    },
  ],
  [
    // Baseline = average of E4, E3, E2 (2:00, 2:05, 2:10) = 2:05; E1 is outside the 3-session window, W is water.
    // No baseline session has splits or a stroke rate, so drift and rate have no delta.
    "E5 analysis: pace −10 s against the last 3 erg sessions, label and hard note",
    async () => {
      const page = await sessionPage("E5");
      const failures = [];
      expectPairs(failures, "E5 analysis", page.analysis, [
        ["Pace /500 m", "1:55 (−10 s)"],
        ["Split drift (last − first)", "−1 s"],
        ["Stroke rate (mid)", "25 spm"],
      ]);
      expectList(failures, "E5 comparison text", ["vs your last 3 erg sessions"], page.comparison);
      expectList(failures, "E5 labels", ["Pace: good improvement"], page.labels);
      // 1:55 ≤ 1:57.5
      expectHardNote(failures, "E5", page.notes, HARD_NOTE);
      return { summary: oraclePath("E5"), failures };
    },
  ],
  [
    "E1 page: no baseline, no delta, no label, no hard note",
    async () => {
      const page = await sessionPage("E1");
      const failures = [];
      expectLabelled(failures, "E1 analysis", page.analysis, "Pace /500 m", "2:30");
      expectList(failures, "E1 comparison text", ["Comparisons start after your next erg session."], page.comparison);
      expectList(failures, "E1 labels", [], page.labels);
      expectHardNote(failures, "E1", page.notes, NO_HARD_NOTE);
      return { summary: oraclePath("E1"), failures };
    },
  ],
  [
    // Baseline = E1 alone (2:30): the singular boundary of the comparison text.
    "E2 page: −20 s against a single erg session",
    async () => {
      const page = await sessionPage("E2");
      const failures = [];
      expectLabelled(failures, "E2 analysis", page.analysis, "Pace /500 m", "2:10 (−20 s)");
      expectList(failures, "E2 comparison text", ["vs your last 1 erg session"], page.comparison);
      expectList(failures, "E2 labels", ["Pace: good improvement"], page.labels);
      return { summary: oraclePath("E2"), failures };
    },
  ],
  [
    // 2:00 > 1:57.5: the boundary on the non-hard side.
    "E4 page: no hard-session note",
    async () => {
      const failures = [];
      expectHardNote(failures, "E4", (await sessionPage("E4")).notes, NO_HARD_NOTE);
      return { summary: oraclePath("E4"), failures };
    },
  ],
  [
    // The earlier erg sessions are a different type, so they never form a water baseline.
    "W page: water values, no water baseline",
    async () => {
      const page = await sessionPage("W");
      const failures = [];
      expectLabelled(failures, "W values", page.values, "Distance per stroke", "8–8.4 m");
      expectLabelled(failures, "W analysis", page.analysis, "Pace /500 m", "2:30");
      expectList(failures, "W comparison text", ["Comparisons start after your next water session."], page.comparison);
      return { summary: oraclePath("W"), failures };
    },
  ],
  [
    "list shows six rows newest first with their values",
    async () => {
      const rows = await listRows();
      const failures = [];
      expectList(
        failures,
        "list row order",
        ["E5", "E4", "E3", "W", "E2", "E1"],
        rows.map((row) => oracleKey(row.href)),
      );
      const e5Spans = rowCells(failures, rows, "E5", "span");
      if (e5Spans) expectList(failures, "E5 row date, type and pace", ["2026-03-10 · Erg", "1:55 /500 m"], e5Spans);
      const e5Divs = rowCells(failures, rows, "E5", "div");
      if (e5Divs) expectList(failures, "E5 row distance and time", ["2000 m in 7:40"], e5Divs);
      const wSpans = rowCells(failures, rows, "W", "span");
      if (wSpans) expectList(failures, "W row date, type and pace", ["2026-03-05 · Water", "2:30 /500 m"], wSpans);
      return { summary: `${rows.length} rows`, failures };
    },
  ],
  [
    // Change = latest (E5 1:55) − first (E1 2:30).
    "erg pace trend shows five erg rows newest first and −35 s",
    async () => {
      const { rows, change } = await ergPaceTrend();
      const failures = [];
      expectList(
        failures,
        "trend row order",
        ["E5", "E4", "E3", "E2", "E1"],
        rows.map((row) => oracleKey(row.href)),
      );
      expectList(
        failures,
        "trend rows",
        [
          "2026-03-10 · 1:55 /500 m",
          "2026-03-08 · 2:00 /500 m",
          "2026-03-06 · 2:05 /500 m",
          "2026-03-04 · 2:10 /500 m",
          "2026-03-02 · 2:30 /500 m",
        ],
        rows.map((row) => row.text),
      );
      expectValue(failures, "trend first → latest", "−35 s /500 m", change);
      return { summary: `${rows.length} rows, change ${change}`, failures };
    },
  ],
  [
    "dashboard latest session is E5",
    async () => {
      const html = await oraclePage("/dashboard");
      const heading = />\s*Latest session\s*</.exec(html);
      const failures = [];
      const latest = heading ? sessionRows(html.slice(heading.index))[0] : undefined;
      if (!latest) {
        failures.push(`Latest session: expected a link to E5, got ${heading ? "no session link" : "no card"}`);
      } else {
        expectValue(failures, "Latest session link", oraclePath("E5"), latest.href);
        expectValue(failures, "Latest session", "2026-03-10 · Erg · 2000 m", latest.text);
      }
      return { summary: latest ? latest.text : "no latest session", failures };
    },
  ],
  [
    "edit E4 time to 8:30 saves and opens its page",
    async () => {
      const path = oraclePath("E4");
      const actual = await oracleRequest(`/api${path}`, {
        method: "POST",
        form: { ...ORACLE_SESSIONS.E4, time: "8:30" },
      });
      const failures = [];
      if (actual.status !== 302 || actual.location !== path) {
        failures.push(`expected 302 ${path}, got ${actual.status} ${actual.location}`);
      }
      return { summary: `${actual.status} ${actual.location}`, failures };
    },
  ],
  [
    // E4 is now 2000 m in 8:30 → 2:07.5. Its own baseline is E3 2:05, E2 2:10, E1 2:30 = 2:15, so −7.5 s.
    "after the edit, E4 page pace is 2:07.5 (−7.5 s)",
    async () => {
      const failures = [];
      expectLabelled(failures, "E4 analysis", (await sessionPage("E4")).analysis, "Pace /500 m", "2:07.5 (−7.5 s)");
      return { summary: oraclePath("E4"), failures };
    },
  ],
  [
    // Baseline = average of E4 2:07.5, E3 2:05, E2 2:10 = 2:07.5, so 1:55 is now −12.5 s.
    "after the edit, E5 pace delta follows: −12.5 s",
    async () => {
      const failures = [];
      expectLabelled(failures, "E5 analysis", (await sessionPage("E5")).analysis, "Pace /500 m", "1:55 (−12.5 s)");
      return { summary: oraclePath("E5"), failures };
    },
  ],
  [
    // The first (E1) and latest (E5) points did not change, so neither did the trend change.
    "after the edit, list and trend show E4 at 2:07.5, trend change still −35 s",
    async () => {
      const failures = [];
      const listSpans = rowCells(failures, await listRows(), "E4", "span");
      if (listSpans)
        expectList(failures, "E4 list row date, type and pace", ["2026-03-08 · Erg", "2:07.5 /500 m"], listSpans);
      const { rows, change } = await ergPaceTrend();
      const trendRow = rows.find((row) => row.href === oraclePaths.E4);
      expectValue(failures, "E4 trend row", "2026-03-08 · 2:07.5 /500 m", trendRow ? trendRow.text : "(missing)");
      expectValue(failures, "trend first → latest", "−35 s /500 m", change);
      return { summary: `change ${change}`, failures };
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
