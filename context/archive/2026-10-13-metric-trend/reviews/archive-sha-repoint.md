# Archive SHA repoint

## 2026-10-13

- **Target**: `origin/main` (remote default branch, PR #3 base), snapshot `e5107ec12854e6babed8b32043c5954f5ce064e7`
- **Integration commit**: `e5107ec` — feat(metric-trend): see how one metric changed over sessions (S-05) (#3)
- **PR**: https://github.com/jecruman/rowing-coach-ai/pull/3 (squash-merged)
- **Evidence**: the PR commit list contains `fb733fd` and `4635361`; neither is an ancestor of `origin/main` (`merge-base --is-ancestor` exit 1, full clone); `git diff fe15ad0 e5107ec` is empty, so the squash commit carries exactly the reviewed branch tip, including the phase 1 and phase 2 code in `src/` and `scripts/`.
- **Decision**: user approved "Update and archive" during `/10x-archive metric-trend`.

| Row ID | Old suffix (resolved OID) | New SHA |
|--------|---------------------------|---------|
| 1.1 | fb733fd (fb733fd8718e01f3a66e57b07229b1de25e8b7f5) | e5107ec |
| 1.2 | fb733fd (fb733fd8718e01f3a66e57b07229b1de25e8b7f5) | e5107ec |
| 1.3 | fb733fd (fb733fd8718e01f3a66e57b07229b1de25e8b7f5) | e5107ec |
| 2.1 | 4635361 (463536101dae3e9a20396be9352f0a6bc9b69c1c) | e5107ec |
| 2.2 | 4635361 (463536101dae3e9a20396be9352f0a6bc9b69c1c) | e5107ec |
| 2.3 | 4635361 (463536101dae3e9a20396be9352f0a6bc9b69c1c) | e5107ec |
| 2.4 | 4635361 (463536101dae3e9a20396be9352f0a6bc9b69c1c) | e5107ec |
| 2.5 | 4635361 (463536101dae3e9a20396be9352f0a6bc9b69c1c) | e5107ec |
| 2.6 | 4635361 (463536101dae3e9a20396be9352f0a6bc9b69c1c) | e5107ec |
| 2.7 | 4635361 (463536101dae3e9a20396be9352f0a6bc9b69c1c) | e5107ec |
| 2.8 | 4635361 (463536101dae3e9a20396be9352f0a6bc9b69c1c) | e5107ec |

Rows repointed: 11.
