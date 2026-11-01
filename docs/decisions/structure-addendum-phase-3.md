# Structure addendum — Phase 3 (Section 12 rule)

New files not explicitly listed in Section 12's `domain/` tree:
`domain/solution.py` (Solution, SolveOutcome, SolveStats). Per the
Section 12 rule, recorded here as a one-line addendum (no full ADR,
structure-only addition). Placement rationale: Solution/SolveOutcome/
SolveStats are core domain types (Section 7.2) and belong in
swarmway.domain; CTNode is a CBS search artifact and lives in
solver/cbs.py instead of domain/.
