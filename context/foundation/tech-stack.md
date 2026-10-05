---
starter_id: 10x-astro-starter
package_manager: npm
project_name: rowing-coach-ai
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo developer building a 3-week, after-hours web app for a handful of rowers needs login with strictly per-user data, a relational store for sessions, goals and suggestions, and one short coaching call to an external model per logged session. Astro + React + TypeScript + Supabase + Cloudflare is the recommended default for a TypeScript web app and clears all four agent-friendly gates; Supabase covers auth and the per-user isolation guardrail (row-level security must be set up early), and TypeScript with explicit schemas at boundaries suits validating the model's structured suggestion against the fixed safety limits. The edge runtime's limit on long-running work is acceptable because each coaching call is a few seconds with one retry. Payments, realtime and background jobs are out of scope per the PRD. CI runs on GitHub Actions with auto-deploy on merge to Cloudflare Pages, the starter's default; scaffolding confidence is first-class, so expect occasional hiccups.
