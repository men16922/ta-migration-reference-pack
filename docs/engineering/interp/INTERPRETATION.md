# Engineering Interpretation — TA Migration Lab

This document maps the **general concepts (Bibles)** to the **actual files, commands, and mechanisms of this repository**. The bibles (`*_ENGINEERING.md`) live in the overnight-harness plugin under `templates/docs/engineering/` (`make overnight-where` prints the plugin root); they are not vendored here unless `harness-init.sh --with-bibles` was used.

## HARNESS — Maturity/Verification/Permissions (Bible `HARNESS_ENGINEERING.md`)
- gate (verification): `make check` (`doc-budget` + `lint` + `typecheck` + `test` + `build` in `Makefile`, matching `.claude/harness-config.json`)
- permission boundary: `scripts/overnight/overnight-settings.json`, `.codex/rules/overnight.rules`, `scripts/overnight/opencode.json`, `scripts/overnight/antigravity-settings.snippet.json` (allow=offline gate/test/build targets; deny=network, deploy, dev servers, AWS/Terraform, Docker/Containerlab execution)
- current maturity / next investment: Reference pack + 12 fixture specifications verified offline; next investment is P0 `@containerlab/clab-viewer` read-only embedding spike and deterministic semantic model unit tests (P1).

## LOOP — Unattended Loop (Bible `LOOP_ENGINEERING.md`)
- runner: resolved via `HARNESS_ROOT` from plugin (`make overnight` / `make overnight-once`). env: `ENGINE`/`GATE_CMD`/`MAX_ITER`/`PAUSE`.
- backlog tags: `[auto]`/`[manual]`/`[blocked]` in `docs/NEXT_PLAN.md`
- iteration prompt: plugin default (`scripts/overnight/PROMPT.md` optional override)
- skills: `/sync` `/checkpoint` `/overnight-report` `/overnight-seed` `/diagnose` (provided by plugin)

## VERIFICATION — 3 Layers (Bible `VERIFICATION_ENGINEERING.md`)
- mechanical (gate): `make check` — proves entry-doc line budgets, reference pack & fixture specification integrity (T01–T12), and project lint/typecheck/unit-tests/build when `package.json` is present.
- semantic (critic): `OVERNIGHT_CRITIC=auto` · prompt: `scripts/overnight/CRITIC_PROMPT.md` (optional override from `CRITIC_PROMPT.example.md`)
  - this repo's domain invariants ("green but wrong"):
    1. Semantic topology model must stay decoupled from visual coordinates (moving UI nodes must not change semantic hash or analysis verdict — T08).
    2. Separate `networkOutcome` (`reachable` / `blocked` / `unknown`) from `intentVerdict` (`pass` / `fail` / `unknown`); a required `deny` policy that blocks traffic is `blocked` + `pass` (T05).
    3. Distinguish missing route in a declared-complete table (`NO_ROUTE` -> `blocked`) from uncollected data or unsupported features like NAT/VRF/PBR (`unknown`, never flattened or assumed pass — T06, T07, T12).
    4. AWS migration intent comparison binds to logical workload IDs (`app`, `db`), not raw IP strings (T11).
- creative (human): `[manual]` criteria = interactive topology viewer UX/layout feel, live Linux containerlab runner integration, external Batfish container execution, and AWS migration review prose quality · morning-review focus = verify no unsupported network features were silently coerced to `reachable`/`pass`, and check trace step provenance.

## AGENTIC — Multi-Agent (Bible `AGENTIC_ENGINEERING.md`)
- currently single engine per run (`ENGINE=claude|codex|opencode|agy|kiro`), with optional actor + critic separation via model routing in `Makefile`.

## CONTEXT — Context/Doc Discipline (Bible `CONTEXT_ENGINEERING.md`)
- entry point/Read Path: `docs/AGENT_BRIEF.md` → `docs/STATUS.md` → `docs/NEXT_PLAN.md` → `docs/PROGRESS_LOG.md` → `docs/LESSONS.md`
- line budget: brief ≤60 · status/plan/log ≤120 · lessons ≤40 (`.claude/harness-config.json`, enforced by `make doc-budget`)
- Resume Pointer: `▶ NEXT SESSION` line at the top of `docs/AGENT_BRIEF.md`
- archive: `docs/archive/`

## PROMPT — Prompt Layer (Bible `PROMPT_ENGINEERING.md`)
- harness prompt: plugin default (`scripts/overnight/PROMPT.md` if overridden)
- runtime/domain prompt: N/A (analysis engine is strictly deterministic code; AI in future phases is restricted to drafting explanations/change proposals and never judges reachability)
