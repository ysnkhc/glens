# GLENS - GenLayer Intelligent Contract Analyzer

GLENS is a Next.js app for analyzing GenLayer Intelligent Contracts. The current deployed production contract is the v2 debugger; v3 adds consensus-certified audit reports and is present in source but not deployed yet.

## Current Deployment State

| Contract | File | Status | Address source |
| --- | --- | --- | --- |
| v2 debugger | `contracts/ai_debugger_v2.py` | Deployed on Bradbury and configured in the frontend | `frontend/src/lib/genlayer.ts` `CONTRACT_ADDRESS.bradbury` |
| v3 certified reports | `contracts/ai_debugger_v3.py` | Source only, pending deployment | `frontend/src/lib/genlayer.ts` `CERTIFIED_REPORT_CONTRACT_ADDRESS` is intentionally empty |

Do not send v3 methods to the v2 address. The frontend disables certified-report creation until a real v3 address is deployed and configured.

## Deployed v2 Behavior

| Method | Type | Behavior |
| --- | --- | --- |
| `analyze_contract(source_code)` | write | Audits up to 4000 chars and stores JSON in `last_analysis`. |
| `explain_contract(source_code)` | write | Explains up to 4000 chars and stores plain text in `last_explanation`. |
| `simulate_consensus(prompt_text)` | write | Runs the prompt through validators and stores the first normalized word in `last_simulation`. |
| `fix_contract(source_code, analysis_summary)` | write | Returns JSON with a `fixes` array and stores it in `last_fix`. |
| `get_last_analysis()` / `get_last_explanation()` / `get_last_simulation()` / `get_last_fix()` / `get_total_calls()` | view | Read v2 contract state. |

## v3 Certified Reports

`contracts/ai_debugger_v3.py` adds:

- persistent report IDs and count;
- report JSON storage by ID;
- report title storage by ID;
- report owner storage by ID;
- last report lookup by owner;
- `create_audit_report(project_name, source_code)`;
- views: `get_report`, `get_report_title`, `get_report_owner`, `get_report_count`, `get_last_report_id`.

The v3 report validator independently re-runs the leader audit and compares only decisive fields: `risk_level`, `consensus_risk`, and sorted unique `ERROR` rule IDs. Non-decisive wording differences do not block consensus.

## Repository Architecture

```text
contracts/
  ai_debugger_v2.py          production deployed debugger contract
  ai_debugger_v3.py          pending certified-report contract
  tests/                     local Python unit tests with a fake GenLayer runtime
frontend/
  src/app/page.tsx           main client UI
  src/app/components/        UI panels and controls
  src/lib/genlayer.ts        network config, wallet client, consensus polling
  src/lib/analyzer-service.ts contract write/read orchestration
  src/lib/contract-interface.ts method specs and response validation
  src/lib/*                  parser, rules, scoring, fixer, prediction helpers
```

## Commands

From `frontend/`:

```bash
npm run dev
npm run lint
npm run build
npx tsc --noEmit
```

From the repository root:

```bash
python -m unittest discover contracts/tests
.venv/Scripts/genvm-lint.exe check contracts/ai_debugger_v3.py
.venv/Scripts/genvm-lint.exe typecheck contracts/ai_debugger_v3.py
.venv/Scripts/genvm-lint.exe schema contracts/ai_debugger_v3.py
```

For release verification, create `.venv` and install only the official `genvm-linter` package there. Current verified linter: `genvm-lint` 0.11.0.

## Deployment Notes

Bradbury v2 remains the configured production path:

```text
Bradbury v2: 0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D
Studio v2:   0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C
```

After deploying v3, update only `CERTIFIED_REPORT_CONTRACT_ADDRESS` with the new v3 address and record the proof in `DEPLOYMENT_V3_PENDING.md` or a successor deployment proof file.
