# TA Migration Lab — Makefile
.DEFAULT_GOAL := check

check: doc-budget lint typecheck test kit build ## offline deterministic verification gate
	@echo "✓ make check: all offline deterministic checks passed"

doc-budget: ## enforce harness entry-doc existence and line budgets
	@python3 -c 'import json, pathlib, sys; \
cfg = json.loads(pathlib.Path(".claude/harness-config.json").read_text()); \
docs, budgets = cfg["docs"], cfg["budgets"]; \
errs = []; \
[errs.append(f"missing {p}") if not pathlib.Path(p).is_file() else None for p in docs.values()]; \
[errs.append(f"{docs[k]} ({len(pathlib.Path(docs[k]).read_text().splitlines())} lines) exceeds budget {limit}") \
 for k, limit in budgets.items() if pathlib.Path(docs[k]).is_file() and len(pathlib.Path(docs[k]).read_text().splitlines()) > limit]; \
print("\n".join(errs), file=sys.stderr) if errs else print("✓ doc-budget OK"); \
sys.exit(1 if errs else 0)'

test: ## validate reference pack fixtures & run project tests if present
	@python3 -c 'import json, pathlib, sys; \
req = ["README.md", "implementation-brief.md", "reference-analysis.md", "source-inspection.md", "references.json", "fixtures/intent-example.json", "fixtures/fixture-specifications.json", "docs/engineering/interp/INTERPRETATION.md"]; \
missing = [p for p in req if not pathlib.Path(p).is_file()]; \
assert not missing, f"missing required files: {missing}"; \
refs = json.loads(pathlib.Path("references.json").read_text()); \
assert isinstance(refs.get("references"), list) and len(refs["references"]) >= 10, "references.json invalid"; \
intent = json.loads(pathlib.Path("fixtures/intent-example.json").read_text()); \
assert {"workloads", "snapshots", "intent"} <= set(intent.keys()), "intent-example.json missing keys"; \
specs = json.loads(pathlib.Path("fixtures/fixture-specifications.json").read_text()); \
tests = specs.get("tests", []); \
ids = [t.get("id") for t in tests]; \
expected_ids = [f"T{i:02d}" for i in range(1, 13)]; \
assert ids == expected_ids, f"fixture test IDs mismatch: {ids} != {expected_ids}"; \
assert all(t.get("expectedNetworkOutcome") in {"reachable", "blocked", "unknown"} for t in tests), "invalid expectedNetworkOutcome"; \
assert all(t.get("expectedIntentVerdict") in {"pass", "fail", "unknown"} for t in tests), "invalid expectedIntentVerdict"; \
print("✓ reference pack & fixture specifications verified (12/12 specs valid)")'
	@if [ -f package.json ] && python3 -c 'import json,sys; sys.exit(0 if "test" in json.load(open("package.json")).get("scripts",{}) else 1)'; then \
		npm test; \
	fi

lint: ## run linter if configured in package.json
	@if [ -f package.json ] && python3 -c 'import json,sys; sys.exit(0 if "lint" in json.load(open("package.json")).get("scripts",{}) else 1)'; then \
		npm run lint; \
	fi

typecheck: ## run typecheck if configured in package.json
	@if [ -f package.json ] && python3 -c 'import json,sys; sys.exit(0 if "typecheck" in json.load(open("package.json")).get("scripts",{}) else 1)'; then \
		npm run typecheck; \
	fi

build: ## run build if configured in package.json
	@if [ -f package.json ] && python3 -c 'import json,sys; sys.exit(0 if "build" in json.load(open("package.json")).get("scripts",{}) else 1)'; then \
		npm run build; \
	fi

# Python 자산 키트(kit/): kit/.venv가 있으면 그 인터프리터, 없으면 python3 (openpyxl·pytest·ruff 필요)
KIT_PY ?= $(if $(wildcard kit/.venv/bin/python),$(abspath kit/.venv/bin/python),python3)

kit: ## onprem-atlas Python kit: ruff + pytest (synthetic data only)
	@cd kit && $(KIT_PY) -m ruff check src tests && $(KIT_PY) -m pytest -q

kit-setup: ## create kit/.venv with test extras (needs network once)
	@cd kit && uv venv .venv && uv pip install --python .venv/bin/python -e '.[test]'

ATLAS_DEMO ?= kit/demo

atlas-demo: ## synthetic 5,000-asset demo: two ESM syncs → SQLite → API :8770 (run `npm run dev` for the console)
	@mkdir -p $(ATLAS_DEMO) && rm -f $(ATLAS_DEMO)/atlas.db $(ATLAS_DEMO)/atlas.db-wal $(ATLAS_DEMO)/atlas.db-shm
	@cd kit && PYTHONPATH=src $(KIT_PY) -m onprem_atlas.cli synth --out demo/esm-2026-10-01.xlsx --drift-out demo/esm-2026-10-21.xlsx
	@cd kit && PYTHONPATH=src $(KIT_PY) -m onprem_atlas.cli import demo/esm-2026-10-01.xlsx --db demo/atlas.db
	@cd kit && PYTHONPATH=src $(KIT_PY) -m onprem_atlas.cli import demo/esm-2026-10-21.xlsx --db demo/atlas.db
	@cd kit && PYTHONPATH=src $(KIT_PY) -m onprem_atlas.cli classify --db demo/atlas.db
	@cd kit && PYTHONPATH=src $(KIT_PY) -m onprem_atlas.cli serve --db demo/atlas.db --port 8770

smoke-local: check ## local smoke test alias

.PHONY: check doc-budget test lint typecheck build kit kit-setup atlas-demo smoke-local

# ===== overnight harness targets (append to your Makefile) =====
# The overnight runner + helpers are the Single Source of Truth in the overnight-harness
# PLUGIN; this repo does NOT vendor them. These targets resolve the installed plugin at
# runtime and invoke its runner against THIS repo. Per-repo STATE stays here:
#   scripts/overnight/overnight-settings.json  — Claude permission boundary
#   scripts/overnight/opencode.json            — opencode permission boundary
#   .codex/rules/overnight.rules               — Codex command rules
#   scripts/overnight/PROMPT.md                — optional per-repo prompt override (else plugin default)
#   scripts/overnight/{logs,STOP,DONE}         — runtime state
#   docs/LESSONS.md                            — the actor's memory surface (committed)
#
# The loop's commit gate is $GATE_CMD (default `make check`). Define a `check` target that proves
# correctness OFFLINE + DETERMINISTICALLY and allow-list it in scripts/overnight/overnight-settings.json.
#
# Select the engine with ENGINE=claude|codex|opencode|agy|kiro. Default stays Claude.
ENGINE ?= claude

# Model routing (Claude engine; defaults refreshed in 1.7.0). Actor and critic both run on
# Opus 5.5. Its effort default is medium (one level below Opus 5), so both are pinned to high.
# Blank = the CLI's own default. These are per-repo policy, so edit them here rather than in
# the plugin.
CLAUDE_MODEL ?= claude-opus-5-5
CLAUDE_EFFORT ?= high
CLAUDE_CRITIC_MODEL ?= claude-opus-5-5
OVERNIGHT_CRITIC_MODEL ?=
CLAUDE_CRITIC_EFFORT ?= high
CLAUDE_FALLBACK_MODEL ?=
export CLAUDE_MODEL CLAUDE_EFFORT CLAUDE_CRITIC_MODEL OVERNIGHT_CRITIC_MODEL CLAUDE_CRITIC_EFFORT CLAUDE_FALLBACK_MODEL

# Codex routing is opt-in; preserve installed model/effort settings when blank.
# Astra preset: make overnight-codex-once CODEX_MODEL=gpt-6-astra
CODEX_MODEL ?=
CODEX_EFFORT ?=
CODEX_CRITIC_EFFORT ?=
export CODEX_MODEL CODEX_EFFORT CODEX_CRITIC_EFFORT

# Antigravity (AGY) routing (1.9.0). Actor and critic default to Gemini 4 Argon at high effort
# (bare `gemini-4-argon` defaults to medium in agy). Explicit Argon routing also enables the
# lean contract prompt and risk-gated critic. Blank = the CLI's own default.
AGY_MODEL ?= gemini-4-argon
AGY_EFFORT ?= high
AGY_CRITIC_MODEL ?= gemini-4-argon
AGY_CRITIC_EFFORT ?= high
export AGY_MODEL AGY_EFFORT AGY_CRITIC_MODEL AGY_CRITIC_EFFORT

# HARNESS_ROOT resolution (env override → per-repo pin → highest installed version). This mirrors
# the plugin's bin/harness-locate.sh; override ad hoc with `make overnight HARNESS_ROOT=/path`.
HARNESS_ROOT ?= $(shell \
  if [ -n "$$OVERNIGHT_HARNESS_ROOT" ] && [ -d "$$OVERNIGHT_HARNESS_ROOT/templates/scripts/overnight" ]; then \
    echo "$$OVERNIGHT_HARNESS_ROOT"; \
  elif [ -n "$$OVERNIGHT_HARNESS_ROOT" ] && [ -d "$$OVERNIGHT_HARNESS_ROOT/plugins/overnight-harness/templates/scripts/overnight" ]; then \
    echo "$$OVERNIGHT_HARNESS_ROOT/plugins/overnight-harness"; \
  elif [ -f .claude/harness-config.json ] && grep -q '"harness_root"' .claude/harness-config.json; then \
    pin="$$(sed -n 's/.*"harness_root"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' .claude/harness-config.json | head -1)"; \
    if [ -d "$$pin/templates/scripts/overnight" ]; then echo "$$pin"; \
    elif [ -d "$$pin/plugins/overnight-harness/templates/scripts/overnight" ]; then echo "$$pin/plugins/overnight-harness"; fi; \
  else \
    { \
      ls -d $$HOME/.claude/plugins/cache/overnight-harness/overnight-harness/*/ 2>/dev/null; \
      find $$HOME/.codex/plugins/cache -path '*/overnight-harness/*' -type d 2>/dev/null; \
      [ -d $$HOME/.gemini/config/plugins/overnight-harness ] && echo $$HOME/.gemini/config/plugins/overnight-harness; \
      [ -d $$HOME/.gemini/antigravity-cli/plugins/overnight-harness ] && echo $$HOME/.gemini/antigravity-cli/plugins/overnight-harness; \
      [ -d $$HOME/.cache/opencode/node_modules/opencode-overnight-harness ] && echo $$HOME/.cache/opencode/node_modules/opencode-overnight-harness; \
    } | while read d; do \
      if [ -d "$$d/templates/scripts/overnight" ]; then echo "$$d"; \
      elif [ -d "$$d/plugins/overnight-harness/templates/scripts/overnight" ]; then echo "$$d/plugins/overnight-harness"; fi; \
    done | sort -V | tail -1; \
  fi)

# OVN_SRC = runner + helpers (in the plugin); OVN = per-repo state (in this repo).
# NB: no inline comments on these := lines — make would fold the gap into the value.
OVN_SRC := $(HARNESS_ROOT:%/=%)/templates/scripts/overnight
OVN := scripts/overnight

_harness-guard:
	@test -x "$(OVN_SRC)/run.sh" || { \
	  echo "overnight-harness not found (resolved HARNESS_ROOT='$(HARNESS_ROOT)')."; \
	  echo "Install the plugin, or pass HARNESS_ROOT=/path/to/plugin, or re-run /harness-init."; \
	  exit 1; }

overnight: _harness-guard           ## run the unattended loop (caffeinate keeps macOS awake)
	OVERNIGHT_ENGINE=$(ENGINE) caffeinate -dimsu $(OVN_SRC)/run.sh &
overnight-watch: overnight          ## start the loop and tail its log
	@sleep 1; tail -f $(OVN)/logs/runner.log
overnight-once: _harness-guard      ## single iteration (smoke test the loop)
	OVERNIGHT_ENGINE=$(ENGINE) $(OVN_SRC)/run.sh --once
overnight-claude-once: _harness-guard
	OVERNIGHT_ENGINE=claude $(OVN_SRC)/run.sh --once
overnight-codex-once: _harness-guard
	OVERNIGHT_ENGINE=codex $(OVN_SRC)/run.sh --once
overnight-opencode-once: _harness-guard
	OVERNIGHT_ENGINE=opencode $(OVN_SRC)/run.sh --once
overnight-agy-once: _harness-guard
	OVERNIGHT_ENGINE=agy $(OVN_SRC)/run.sh --once
overnight-kiro-once: _harness-guard
	OVERNIGHT_ENGINE=kiro $(OVN_SRC)/run.sh --once
overnight-stop:                     ## graceful stop after the current iteration
	@touch $(OVN)/STOP && echo "STOP created — loop will exit after current iteration"
overnight-clean:                    ## clear STOP/DONE sentinels before the next run
	@rm -f $(OVN)/STOP $(OVN)/DONE && echo "cleared STOP/DONE"
overnight-status: _harness-guard    ## aggregate iteration status across lanes
	@bash $(OVN_SRC)/status.sh
overnight-logs:                     ## tail the runner log
	@mkdir -p $(OVN)/logs; touch $(OVN)/logs/runner.log; tail -f $(OVN)/logs/runner.log
overnight-dashboard: _harness-guard ## tmux dashboard (falls back to status.sh)
	@bash $(OVN_SRC)/dashboard.sh
overnight-ledger-check: _harness-guard ## validate event history before trusting status/report
	@python3 $(OVN_SRC)/lib/ledger.py check $(OVN)/logs/events.jsonl
overnight-ledger-state: _harness-guard ## project deterministic per-mission state as JSON
	@python3 $(OVN_SRC)/lib/ledger.py project $(OVN)/logs/events.jsonl
overnight-trajectory: _harness-guard ## render causal node/edge trajectory; optional MISSION and FORMAT=json
	@python3 $(OVN_SRC)/lib/trajectory.py $(OVN)/logs/events.jsonl \
	  $(if $(MISSION),--mission "$(MISSION)",) --format "$(or $(FORMAT),text)"
overnight-resume: _harness-guard       ## resume MISSION with DECISION=approve|reject
	@test -x "$(OVN_SRC)/resume.sh" || { echo "installed overnight-harness does not provide resume.sh"; exit 1; }
	@test -n "$(MISSION)" || { echo "MISSION=<mission-id> is required"; exit 2; }
	@test "$(DECISION)" = "approve" -o "$(DECISION)" = "reject" || { echo "DECISION=approve|reject is required"; exit 2; }
	@HARNESS_REPO_ROOT="$(CURDIR)" bash $(OVN_SRC)/resume.sh "$(MISSION)" --"$(DECISION)"
overnight-provenance-compare: _harness-guard ## compare two manifests; optional LEFT_RESULT/RIGHT_RESULT
	@test -n "$(LEFT)" -a -n "$(RIGHT)" || { echo "LEFT=<manifest> and RIGHT=<manifest> are required"; exit 2; }
	@python3 $(OVN_SRC)/lib/provenance.py compare --left "$(LEFT)" --right "$(RIGHT)" \
	  --left-result "$(LEFT_RESULT)" --right-result "$(RIGHT_RESULT)"
overnight-where:                    ## print the resolved plugin location (debug)
	@echo "HARNESS_ROOT = $(HARNESS_ROOT)"; echo "runner       = $(OVN_SRC)/run.sh"

.PHONY: overnight overnight-watch overnight-once overnight-claude-once overnight-codex-once overnight-opencode-once overnight-agy-once overnight-kiro-once overnight-stop overnight-clean overnight-status overnight-logs overnight-dashboard overnight-ledger-check overnight-ledger-state overnight-trajectory overnight-resume overnight-provenance-compare overnight-where _harness-guard
# ===== end overnight harness targets =====
