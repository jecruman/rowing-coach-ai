# Archive SHA repoint

- **Date**: 2026-11-04
- **Target**: `origin/main` on `https://github.com/jecruman/rowing-coach-ai`, snapshot `786a971` (fetched fresh; repository not shallow)
- **Why**: each PR was squash-merged, so the branch commits recorded in Progress are not ancestors of `main`.
- **Evidence**: for each mapping, the PR's commit list contains the old commit, the merge commit is an ancestor of the snapshot, and the merge commit's tree is identical to the PR's final commit (`git diff --quiet` with no output).
- **Decision**: the owner chose "Update and archive" in `/10x-archive`.

| PR                                                       | Merge commit                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| [#5](https://github.com/jecruman/rowing-coach-ai/pull/5) | `5053afc` feat(ui-landing-page): entry points and display font (#5) |
| [#6](https://github.com/jecruman/rowing-coach-ai/pull/6) | `718bd5e` feat(ui-landing-page): landing view (#6)                  |
| [#7](https://github.com/jecruman/rowing-coach-ai/pull/7) | `3c805d6` docs(ui-landing-page): states and visual check (#7)       |
| [#8](https://github.com/jecruman/rowing-coach-ai/pull/8) | `fd70b54` feat(ui-landing-page): guard and close (#8)               |

| Row IDs | Old suffix                                                    | New SHA   |
| ------- | ------------------------------------------------------------- | --------- |
| 1.1–1.8 | `6d1fcca` feat(ui-landing-page): Entry points (p1)            | `5053afc` |
| 2.1–2.4 | `6c9c47a` feat(ui-landing-page): Display font and tokens (p2) | `5053afc` |
| 3.1–3.8 | `0707969` feat(ui-landing-page): Landing view (p3)            | `718bd5e` |
| 4.1–4.6 | `e2ae69b` docs(ui-landing-page): States and visual check (p4) | `3c805d6` |
| 5.1–5.4 | `f3d220d` feat(ui-landing-page): Guard and close (p5)         | `fd70b54` |

Total: 30 rows repointed. Rows 2.5 and 5.5 were still pending and have no suffix, so they were left unchanged. The review-fix commits from PR #9 (`2af78f9`, `f1b1b70`, merged as `786a971`) were never recorded in Progress, so nothing was repointed for them.
