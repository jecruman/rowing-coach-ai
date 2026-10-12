# Archive SHA repoint — session-history

- **Date**: 2026-10-12
- **Target**: origin/main, snapshot `9d687357b1f786c272279beb9e23d4a2953ce389`
- **Integration commit**: `ddcb5a52dfd69999bada9763a98406ae9034d96b` — feat(session-history): list, edit and delete sessions (S-03) (#1)
- **Association**: https://github.com/jecruman/rowing-coach-ai/pull/1 (merged, base `main`, squash). The PR commit list contains 5e0fe45, 2909271, 0e155b8 and f6c1050; `git diff e52e7e9 ddcb5a5 -- src scripts supabase` is empty, so the squash commit integrates exactly the branch code.
- **Evidence**: `git merge-base --is-ancestor` against the snapshot — old SHAs exit 1, ddcb5a5 exit 0. The old commits stay reachable on branch `s03-session-history`.
- **Decision**: user chose "Update and archive".
- **Rows repointed**: 21

| Row | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1 | `5e0fe45` (`5e0fe450a7c9e1deb5b6630f0fedec049fc8b23a`) | `ddcb5a5` |
| 1.2 | `5e0fe45` (`5e0fe450a7c9e1deb5b6630f0fedec049fc8b23a`) | `ddcb5a5` |
| 1.3 | `5e0fe45` (`5e0fe450a7c9e1deb5b6630f0fedec049fc8b23a`) | `ddcb5a5` |
| 1.4 | `5e0fe45` (`5e0fe450a7c9e1deb5b6630f0fedec049fc8b23a`) | `ddcb5a5` |
| 1.5 | `5e0fe45` (`5e0fe450a7c9e1deb5b6630f0fedec049fc8b23a`) | `ddcb5a5` |
| 1.6 | `5e0fe45` (`5e0fe450a7c9e1deb5b6630f0fedec049fc8b23a`) | `ddcb5a5` |
| 1.7 | `5e0fe45` (`5e0fe450a7c9e1deb5b6630f0fedec049fc8b23a`) | `ddcb5a5` |
| 2.1 | `2909271` (`2909271dd597a9db188f572fdae248c47c2416c3`) | `ddcb5a5` |
| 2.2 | `2909271` (`2909271dd597a9db188f572fdae248c47c2416c3`) | `ddcb5a5` |
| 2.3 | `2909271` (`2909271dd597a9db188f572fdae248c47c2416c3`) | `ddcb5a5` |
| 2.5 | `2909271` (`2909271dd597a9db188f572fdae248c47c2416c3`) | `ddcb5a5` |
| 2.6 | `2909271` (`2909271dd597a9db188f572fdae248c47c2416c3`) | `ddcb5a5` |
| 2.7 | `2909271` (`2909271dd597a9db188f572fdae248c47c2416c3`) | `ddcb5a5` |
| 2.4 | `f6c1050` (`f6c1050c8771c82e6f0d0d5dd30afc33337d4bd7`) | `ddcb5a5` |
| 3.5 | `f6c1050` (`f6c1050c8771c82e6f0d0d5dd30afc33337d4bd7`) | `ddcb5a5` |
| 3.1 | `0e155b8` (`0e155b8de966149ff7ae3a60dba4320fd41ccd09`) | `ddcb5a5` |
| 3.2 | `0e155b8` (`0e155b8de966149ff7ae3a60dba4320fd41ccd09`) | `ddcb5a5` |
| 3.3 | `0e155b8` (`0e155b8de966149ff7ae3a60dba4320fd41ccd09`) | `ddcb5a5` |
| 3.4 | `0e155b8` (`0e155b8de966149ff7ae3a60dba4320fd41ccd09`) | `ddcb5a5` |
| 3.6 | `0e155b8` (`0e155b8de966149ff7ae3a60dba4320fd41ccd09`) | `ddcb5a5` |
| 3.7 | `0e155b8` (`0e155b8de966149ff7ae3a60dba4320fd41ccd09`) | `ddcb5a5` |
