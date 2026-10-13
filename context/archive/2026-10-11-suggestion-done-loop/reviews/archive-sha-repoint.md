# Archive SHA repoint

- **Date**: 2026-10-13
- **Target**: origin/main, snapshot `842e38c67d101318ba7abb86ba512d49457edafa`
- **Integration commit**: `842e38c` feat(suggestion-done-loop): mark a suggestion done or skipped and reflect it in the next one (S-04) (#2)
- **Association**: https://github.com/jecruman/rowing-coach-ai/pull/2 (squash-merged; its commit list contains a19a4b8, 4eaec1e, d60e645, cb448c4)
- **Evidence / scope**: `git diff 8f10267 842e38c` is empty (squash tree identical to the PR head); the squash adds the migration, loaders, form, endpoints, limits, tools and rls-check steps covered by all Progress rows. None of the old SHAs is an ancestor of the target (non-shallow repo, exit 1); 842e38c is (exit 0).
- **User decision**: Update and archive (explicitly approved in /10x-archive)
- **Rows repointed**: 19

| Row ID | Old suffix (resolved OID) | New SHA |
|---|---|---|
| 1.1 | a19a4b8 (a19a4b814147b51ae162f7eda59f39b90f3a62fe) | 842e38c |
| 1.2 | a19a4b8 (a19a4b814147b51ae162f7eda59f39b90f3a62fe) | 842e38c |
| 1.3 | a19a4b8 (a19a4b814147b51ae162f7eda59f39b90f3a62fe) | 842e38c |
| 1.4 | a19a4b8 (a19a4b814147b51ae162f7eda59f39b90f3a62fe) | 842e38c |
| 1.5 | d60e645 (d60e645c824f8df61c0d3bcc0e3f4bfd3ae9a82b) | 842e38c |
| 1.6 | d60e645 (d60e645c824f8df61c0d3bcc0e3f4bfd3ae9a82b) | 842e38c |
| 1.7 | cb448c4 (cb448c4324d28de84fb8cde6659f0672bc8489a4) | 842e38c |
| 1.8 | cb448c4 (cb448c4324d28de84fb8cde6659f0672bc8489a4) | 842e38c |
| 1.9 | cb448c4 (cb448c4324d28de84fb8cde6659f0672bc8489a4) | 842e38c |
| 1.10 | cb448c4 (cb448c4324d28de84fb8cde6659f0672bc8489a4) | 842e38c |
| 1.11 | cb448c4 (cb448c4324d28de84fb8cde6659f0672bc8489a4) | 842e38c |
| 2.1 | 4eaec1e (4eaec1e22bc76734950163cdd9b51a7f1394f4c9) | 842e38c |
| 2.2 | 4eaec1e (4eaec1e22bc76734950163cdd9b51a7f1394f4c9) | 842e38c |
| 2.3 | 4eaec1e (4eaec1e22bc76734950163cdd9b51a7f1394f4c9) | 842e38c |
| 2.4 | d60e645 (d60e645c824f8df61c0d3bcc0e3f4bfd3ae9a82b) | 842e38c |
| 2.5 | d60e645 (d60e645c824f8df61c0d3bcc0e3f4bfd3ae9a82b) | 842e38c |
| 2.6 | cb448c4 (cb448c4324d28de84fb8cde6659f0672bc8489a4) | 842e38c |
| 2.7 | cb448c4 (cb448c4324d28de84fb8cde6659f0672bc8489a4) | 842e38c |
| 2.8 | cb448c4 (cb448c4324d28de84fb8cde6659f0672bc8489a4) | 842e38c |
