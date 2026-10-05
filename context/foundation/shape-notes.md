---
project: "Rowing Coach AI"
context_type: greenfield
created: 2026-10-03
updated: 2026-10-04
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 11
  gray_areas_resolved:
    - topic: "context type"
      decision: "greenfield (no project markers; confirmed by user)"
    - topic: "cost today"
      decision: "history lost/blurred in one long chat; no numbers over time; data-gathering friction"
    - topic: "insight"
      decision: "rules beat free-form advice; closed plan→done→adjust loop; masters/amateur context"
    - topic: "primary persona"
      decision: "the user (masters 1x rower); wife as secondary user with own data"
    - topic: "manual entry vs data-gathering friction"
      decision: "revisit in Phase 3 (MVP) whether one import belongs in MVP"
    - topic: "access model"
      decision: "login per person; open sign-up; flat roles, own data only"
    - topic: "MVP size"
      decision: "scoped down: no screenshots, one goal w/ optional date, comments as AI context, manual entry, user-edited profile, done-loop kept; 3 weeks"
    - topic: "rule source"
      decision: "REVISED 2026-10-04 to option C: computed metrics + fixed safety limits (+10% volume, 32 spm cap after DPS drop, easy after 2 hard) + coaching judgment chooses next session; retry once then safe default"
    - topic: "planning horizon"
      decision: "next session only in MVP"
    - topic: "rule conflicts"
      decision: "priority: safety/recovery > technique > intensity"
    - topic: "thresholds"
      decision: "DPS +0.5 huge improvement; DPS -0.3 clear drop; pace -5 s/500m good improvement"
    - topic: "product framing"
      decision: "web app; small scale (handful of users); no hard deadline; after-hours"
    - topic: "non-goals"
      decision: "no imports/integrations; no video; no coach view/sharing; no offline"
  quality_check_status: accepted
---

# Shape notes — Rowing Coach AI

## Seed idea (verbatim)

Rowing Coach AI: wioślarz (1x, woda i ergometr) wpisuje wynik treningu (dystans, odcinki 500 m z czasami, SPM, DPS) i ma profil (wiek, waga, łódź, cel tempa, np. 3:50/1000 m). Deterministyczne reguły domenowe analizują trening (np. tempo rośnie + DPS wyraźnie spada + SPM rośnie → technika może ograniczać efektywność). Agent z narzędziami (getAthleteProfile, getTrainingHistory, calculateTrainingMetrics, createTrainingSession, saveRecommendation) sam decyduje, których użyć, i na podstawie wyników reguł proponuje następny trening (np. 6 × 2 min, max 32 spm, priorytet utrzymania DPS). Użytkownik oznacza wykonanie, a rekomendacja aktualizuje się przy kolejnym treningu.

Wartość względem zwykłego czatu z AI: spójne, testowalne reguły (ten sam trening → ten sam wniosek), trwała historia i metryki liczone kodem, trendy w czasie (np. DPS przy danym SPM). AI wyjaśnia i planuje na podstawie policzonych liczb, a nie zgaduje.

Użytkownicy: ja i rodzina, każdy widzi tylko swoje dane.

Ustalone: w MVP ręczne wpisywanie treningu (bez integracji).

Otwarte:
- jakie reguły na start i jakie progi (np. co znaczy „wyraźny spadek DPS”),
- osobne konta dla członków rodziny czy rola trenera widzącego kilku zawodników,
- jak agent ma postąpić przy sprzecznych wnioskach z reguł,
- czy w MVP potrzebny jest prosty widok trendu.

Pomysły na później (poza MVP): import z Concept2 Logbook jako pierwsza integracja, potem Garmin/SpeedCoach; widok trenera dla kilku zawodników; analiza wideo techniki wiosłowania powiązana z wnioskami z metryk (np. potwierdzenie, że technika ogranicza efektywność).

## Vision & Problem Statement

A masters single sculler who trains on water and on the erg gets post-session feedback and next-session plans by returning to one long general-purpose AI chat thread, feeding it by hand: erg screenshots, a rowing speed-coach device file, sports-watch screenshots, typed results. As the thread grows, earlier sessions blur or get lost, there are no reliable numbers over time (e.g. trends in DPS at a given stroke rate), and gathering data from several devices is a chore.

Insight: computed metrics over pace, stroke rate and distance per stroke, plus fixed safety limits, make the advice trustworthy (same session → same numbers and limit checks); the coaching judgment plans on top of those computed numbers instead of guessing them. Existing logs record the past and a chat advises once — nothing closes the loop of recommended session → marked as done → adjusted recommendation. Advice must fit an adult amateur with a specific goal pace and limited time, not an elite program.

Scale note (Phase 6): at 100× users, the same rules would apply with thresholds relative to each rower's own baseline.

## User & Persona

**Primary persona:** the author — masters rower (age 42, 70 kg), single scull (1x), trains on water and on the erg, goal pace 3:50/1000 m. Reaches for the product right after a session, when new data, thoughts or questions appear.

### Secondary persona
The author's wife — also rows; uses the same flow with her own data to get specific sessions and tips.

## Success Criteria

MVP flow (scoped down, confirmed by user):

1. Log in.
2. Set up profile (age, weight, boat) and one goal (erg or water, distance, target time/pace, optional event date).
3. After rowing: choose erg or water, type the session (distance, time, splits, SPM, DPS — whatever is known) plus an optional free-text comment.
4. The app computes the session's metrics against the recent baseline and suggests the next session (a coaching judgment checked against fixed safety limits), with a written explanation (comments used as context).
5. Next time: mark the suggested session done or skipped, log the new session; the next suggestion takes it into account.

### Primary
- The rower logs a real session and receives an analysis of computed metrics plus a next-session suggestion; after marking that suggestion done/skipped and logging the next session, the new suggestion reflects it.

### Secondary
- After several sessions, the rower can see how a metric (e.g. DPS at a given SPM) changed over time.

### Guardrails
- Same input → same computed metrics and limit checks; the suggestion may vary between runs but never breaks a safety limit. (Revised 2026-10-04: coaching judgment replaces fixed verdict rules.)
- Privacy between users: no user ever sees another user's sessions, comments or profile.
- No unsafe advice: suggestions stay within sensible load for a masters amateur; no wild jumps in volume or intensity.

### Scope-down decisions (Phase 3)
- Screenshots from rowing apps: dropped from v1 (post-MVP import).
- Goal: one goal with optional event date that recommendations take into account; no plan built backwards from a race date. (Refined in Phase 4: one goal per session type — erg and water.)
- Session comments: stored and used as context for the suggestion and explanation; computed metrics and limit checks use numbers only.
- Data entry: manual typing only; data-gathering friction accepted for v1, first import planned right after MVP.
- Rower profile: edited by the user; the app does not change it.
- Closed loop (done/skipped → adapted suggestion): kept in MVP.

## User Stories

### US-01: Rower logs a session and gets the next one suggested

- **Given** a signed-in rower with a profile and a goal (e.g. 1x, 3:50/1000 m)
- **When** they log an erg or water session (e.g. 5000 m, 500 m splits 1:52, 1:54, 1:55…, SPM 28–30, DPS 8.1–8.5) with an optional comment
- **Then** they see the analysis of that session's computed metrics and one suggested next session with an explanation

#### Acceptance Criteria
- Logging the same session data twice gives the same computed metrics.
- After a clear DPS drop (−0.3 m vs. baseline), the suggested session caps the rate at 32 spm.
- A suggestion that breaks a safety limit is never shown; after one retry, the safe default session is shown and labelled as a default.
- The suggestion can be marked done or skipped; after the next logged session, the new suggestion reflects that.
- A session with only distance + time (no splits/SPM/DPS) still gets an analysis and a suggestion, limited to what the data allows.

## Functional Requirements

### Account & profile
- FR-001: Rower can sign up, sign in and sign out. Priority: must-have
  > Socrates: Counter-arguments offered: "two users don't need open sign-up"; "login slows the post-row moment". Resolution: none accepted; stands as written.
- FR-002: Rower can create and edit their profile (age, weight, boat). Priority: must-have
  > Socrates: Counter-arguments offered: "rules may not use age/weight"; "boat varies per session". Resolution: none accepted; stands as written.
- FR-003: Rower can set and change at most one erg goal and one water goal, each with distance, target time/pace and optional event date. Priority: must-have
  > Socrates: Counter-argument accepted: "erg and water need separate goals — one goal can't cover both". Resolution: revised from "one goal" to one goal per session type.

### Sessions
- FR-004: Rower can log a session with type-specific fields — erg: distance, time, splits, SPM (optional watts); water: distance, time, splits, SPM, DPS (optional boat). Priority: must-have
  > Socrates: Counter-argument accepted: "erg has no DPS — one form for both confuses". Resolution: revised to type-specific fields per session type.
- FR-005: Rower can add a free-text comment to a session. Priority: must-have
  > Socrates: Counter-arguments offered: "comments read by AI may drift from the rule verdict"; "nobody types after rowing". Resolution: none accepted; stands as written.
- FR-006: Rower can view, edit and delete their logged sessions. Priority: must-have
  > Socrates: Counter-arguments offered: "editing a session that already produced a suggestion breaks history"; "delete rarely needed". Resolution: none accepted; stands as written.

### Analysis & suggestion
- FR-007: Rower can see an analysis showing the session's computed metrics against their recent baseline. Priority: must-have
  > Socrates: Counter-arguments offered: "one session is too little for meaningful conclusions"; "thresholds are guesses". Resolution: none accepted; stands as written.
- FR-008: Rower can see a suggested next session, with an explanation that refers to the analysis (and their comment, if any). Priority: must-have
  > Socrates: Counter-arguments offered: "AI may invent a workout that ignores the rule verdict"; "one suggestion is too rigid". Resolution: none accepted; stands as written.

### Loop
- FR-009: Rower can mark a suggested session as done or skipped (no editing of suggestions; anything else is logged as a session). Priority: must-have
  > Socrates: Counter-arguments offered: "logging a matching session already implies done"; "done/skipped is too coarse". Resolution: none accepted; stands as written.
- FR-010: Rower gets a next suggestion that takes previous done/skipped suggestions and newer sessions into account. Priority: must-have
  > Socrates: Counter-arguments offered: "'takes into account' is hard to verify without a concrete rule"; "repeats FR-008". Resolution: none accepted; stands as written.

### Trend
- FR-011: Rower can see how one metric (e.g. DPS at a given SPM, pace /500 m) changed over their sessions. Priority: nice-to-have
  > Socrates: Counter-arguments offered: "water data too noisy for trends"; "too few sessions early on". Resolution: none accepted; stands as written.

## Non-Functional Requirements

- After saving a session, the rower sees the analysis and next-session suggestion within a few seconds, with visible progress while waiting. (Exact target in seconds: open.)
- Logging a session and reading the analysis and suggestion work comfortably on a phone screen, right after rowing.

## Business Logic

After each logged session, the app computes the session's metrics against the rower's recent baseline, then a coaching judgment chooses the single next session from those metrics, the history and the goal, and every suggestion must pass fixed safety limits before the rower sees it.

**Computed metrics (repeatable):** compared with the average of the last 3 sessions of the same type (erg vs. erg, water vs. water): pace /500 m, split drift, SPM range, and DPS on water. Thresholds: DPS +0.5 m = huge improvement; DPS −0.3 m = clear drop; pace −5 s/500 m = good improvement.

**Fixed safety limits (every suggestion):** (1) volume (distance/time) at most +10% over the 3-session average of that type; (2) after a clear DPS drop, the next session caps the rate at 32 spm; (3) after 2 hard sessions in a row, the next must be easy — "hard" = pace at or faster than goal pace +5 s/500 m (goal 3:50/1000 m = 1:55/500 m → hard ≤ 2:00/500 m). If a suggestion breaks a limit or none is available, the app tries once more; then it shows a safe default — steady technique row, 30–40 min, max 22 spm, focus on long strokes — labelled as a default.

**Output, as the rower sees it:** the computed metrics vs. baseline, and one suggested next session containing: type and structure (e.g. 6 × 2 min / 2 min rest), targets (rate cap/range, pace per piece), one focus with a short reason referring to the computed metrics, and one technique tip. The coaching judgment may differ between runs; inputs are the computed metrics, recent sessions, done/skipped history, the goal for that type, and the free-text comment. The rower later marks the suggestion done or skipped. Planning horizon in MVP: next session only; multi-week plan to the goal date is post-MVP.

## Access Control

- **Login required.** Each person has their own account; data is reachable from any of their devices.
- **Sign-up:** open — anyone with the URL can register.
- **Roles:** flat. Every user is a rower; a rower sees and changes only their own profile, sessions and recommendations. No one can see another user's data.
- **Unauthenticated access:** any gated page sends the visitor to sign-in.
- Coach / multi-athlete view is out of MVP (post-MVP idea).

## Non-Goals

- **No imports or integrations** — no imports from rowing apps, devices or screenshots in MVP; manual typing only (friction accepted; first import planned right after MVP).
- **No video analysis** — technique tips come from session numbers only; video is long-term vision.
- **No coach view or sharing** — each rower sees strictly their own data; multi-athlete/coach view is post-MVP.
- **No offline use** — the app needs a connection; no offline logging guarantee.

## Post-MVP ideas (user-stated, Phase 4)
- Screenshots read by AI as session/performance input, used to update the training plan.
- Trend graphics with motivating messages ("your DPS is growing", "your /500 m pace is dropping").
- Export sessions to a calendar.
- Video analysis for technique analysis and tips.

## Forward: tech-stack

Informational; not part of the PRD schema. For the tech-stack selection step.

- Current data sources the user feeds by hand today: Concept2 erg (ErgData/Logbook), NK SpeedCoach files, Garmin screenshots.
- Post-MVP import targets, in order: Concept2 Logbook first, then Garmin / SpeedCoach.
- The user has shipped web apps to Vercel before (familiar deployment path; not a decision).

## Forward: technical-roadmap

Informational; not part of the PRD schema. For implementation planning.

- (Revised 2026-10-04, option C — hybrid) The coaching judgment is made by an AI model reached through an API (senior-rowing-coach role). Code computes the metrics deterministically and validates the model's structured output against the fixed safety limits; invalid → one retry → safe default.
- Session comments, computed metrics, history and goal are passed to the model as context.
- Learning goal: an agent with tools runs the flow and decides which tools to call — getAthleteProfile(), getTrainingHistory(), calculateTrainingMetrics(), createTrainingSession(), saveRecommendation() — with limit checks enforced in code, outside the model.
- Superseded: earlier plan of AI-drafted, user-frozen deterministic verdict rules (option B).

## Open Questions

1. ~~Manual entry vs. data-gathering friction~~ — resolved in Phase 3: manual typing only in v1; friction accepted; first import right after MVP.
2. **Open sign-up vs. AI usage cost** — open registration lets strangers trigger AI-generated recommendations; is any limit needed? Owner: user.
3. ~~Full rule set~~ — resolved 2026-10-04: replaced by computed metrics (baseline = avg of last 3 same-type sessions), fixed safety limits and a coaching judgment (option C).
4. **Remaining thresholds** — SPM rise threshold, pace decline threshold. Owner: user.
8. **Baseline with fewer than 3 sessions** — what the metrics compare against before the rower has 3 sessions of a type. Owner: user.
9. **Named technique verdict** — when pace improves while DPS clearly drops and SPM rises, must the analysis always state "technique may be limiting efficiency", or is the 32 spm rate cap enough? Owner: user.
5. **Analysis response target** — exact seconds for "within a few seconds". Owner: user.
6. **Absolute vs. per-rower thresholds** — user expects that at larger scale the same rules apply with thresholds relative to each rower's own baseline; MVP thresholds (DPS +0.5 / −0.3 m, pace −5 s) are absolute. Decide which applies in MVP. Owner: user.
7. **Non-goals not selected** — multi-week/race-date plans, calendar export & motivational charts, and medical/HR-based advice were offered as non-goals but not selected ("AI-decided verdicts" was also offered; superseded by option C on 2026-10-04). Business Logic already limits MVP to next-session planning; confirm whether these should be listed as explicit non-goals. Owner: user.
