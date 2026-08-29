# 2026-08-29: Local-first re-platform breakdown (epic + 13 plans)

## Outcome

Broke the local-first spec (#44, `.agents/docs/local-first-replatform-spec.md` §12.1) into refined issues + implementation plans:

- **Epic:** [#45](https://github.com/espetro/stash/issues/45) in Project #19 (`PVT_kwHOAZgqI84BakVx`). All 13 F-issues linked as sub-issues via the REST sub_issues API (gh CLI has no `--add-parent` flag in 2.98).
- **F → issue map:** F1=#46, F2=#47, F3=#48, F4=#49, F5=#50, F6=#51, F7=#52, F9=#53, F10=#54, F11=#55, F12=#56, F8=#57, F13=#58.
- **Plans:** `.agents/plans/2026-08-29-local-first-f00-index.md` + `f01`…`f13` (slugs per the spec plan). Drafted via 4 batches of parallel subagents, then reconciled.
- **Project fields set:** Status=Scheduled, Effort (S/M/L), Start date, Target date (wave-staggered from 2026-09-08). No iteration field exists on Project #19; "Quarter 2" lives in issue bodies.
- #44 has a comment backlinking the epic.

## Cross-issue contracts (the reconciliation layer)

1. NM frame schema — F1.W4 owns; F2/F4/F5/F6 consume.
2. `protocolVersion` range — F1 owns; F5 enforces, F10 doctor surfaces.
3. 8 tool names frozen from `apps/extension/lib/mcp/server.ts`.
4. Conformance fixture set — F3.W3 owns; F11.W1 + TS codec tests consume.
5. `StashRecord.shares[]` + export version 2 — F8 owns; F6 wrap must wrap post-F8 shape or sequence after F8.
6. Daemon TOML config — F2 owns file/parse (`<config>/stash.toml`), F7 owns the 4 keys, F13/F12 read.
7. `activeOrigin` flag — F13.W3 owns.

## Gotchas hit

- `/bin/bash` is 3.2 (no `declare -A`); multiline heredoc rows with embedded newlines broke naive IFS parsing. Python + `gh api` is the reliable path for batch issue creation.
- `gh issue edit --add-parent` does not exist (2.98); use `POST /repos/{owner}/{repo}/issues/{n}/sub_issues` with `{"sub_issue_id": <id>}`.
- ProjectV2 date fields need `value: {date: $v}` with a `Date!` GraphQL type, not `text`.
- `feature` label did not exist on espetro/stash (created, color 0e8a16).
- F13's draft misattributed local decode to F7; corrected to F12 during reconciliation. Same class of fix: F1 draft said "installer work (F3)" — corrected to F10.
