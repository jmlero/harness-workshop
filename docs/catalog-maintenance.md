# Catalog maintenance

The catalog is curated, not append-only. Use the routing table in
[VISION.md](../VISION.md#guidance-routing) before considering implementation,
then use the paired format in [evaluations](evaluations/README.md).

For every addition or periodic review:

1. Record why the behavior is not already reliable from repository context and
   current models.
2. Select the narrowest truthful form: block, skill, explicit command,
   integration, reference inside a skill, or nothing.
3. Verify source, immutable revision where applicable, license, attribution,
   supported scope, loading behavior, prerequisites, and lifecycle operations.
4. For blocks, derive normalized context cost and require an always-on outcome
   and justification. A repository signal may make a recommendation relevant,
   but representative paired behavior evidence is required before treating it
   as effective.
5. Review overlap, conflicts, ordering assumptions, and operational ownership.
6. Choose and record one deletion-pressure outcome: retain, shorten, demote,
   replace, remove, or reject. Do this even when no catalog file changes.
7. Update lifecycle tests, README user guidance, evaluation records, review
   date, and third-party notices as applicable.

The current component-by-component decision is recorded in
[catalog-review-2026-08-15.md](catalog-review-2026-08-15.md). Rejected candidates
remain documentation, not dormant catalog entries.
