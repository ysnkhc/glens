# GLENS - GenLayer Intelligent Contract Analyzer

GLENS is a Next.js app for analyzing GenLayer Intelligent Contracts. The production debugger path remains the deployed v2 contract. v3 adds consensus-certified audit reports and is deployed separately on Bradbury.

## Current Deployment State

| Contract | File | Status | Address source |
| --- | --- | --- | --- |
| v2 debugger | `contracts/ai_debugger_v2.py` | Deployed on Bradbury and Studio-style development network | `frontend/src/lib/genlayer.ts` `CONTRACT_ADDRESS` |
| v3 certified reports | `contracts/ai_debugger_v3.py` | Deployed on Bradbury; Studio v3 remains disabled | `frontend/src/lib/genlayer.ts` `CERTIFIED_REPORT_CONTRACT_ADDRESS` |

Do not send v3 certified-report methods to the v2 address. Bradbury certified-report creation uses the v3 address only; Studio certified reports remain disabled until a Studio v3 deployment is proven and configured.

## Deployed Addresses

| Network | v2 debugger address | v3 certified-report address |
| --- | --- | --- |
| Bradbury | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` | `0xCE3d730138d66c1f87bcCa8095F6e96373cc0233` |
| Studio | `0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C` | Disabled / empty |

## v2 Debugger Methods

| Method | Type | Behavior |
| --- | --- | --- |
| `analyze_contract(source_code)` | write | Audits up to 4000 chars and stores JSON in `last_analysis`. |
| `explain_contract(source_code)` | write | Explains up to 4000 chars and stores plain text in `last_explanation`. |
| `simulate_consensus(prompt_text)` | write | Runs the prompt through validators and stores the first normalized word in `last_simulation`. |
| `fix_contract(source_code, analysis_summary)` | write | Returns JSON with a `fixes` array and stores it in `last_fix`. |
| `get_last_analysis()` / `get_last_explanation()` / `get_last_simulation()` / `get_last_fix()` / `get_total_calls()` | view | Read v2 contract state. |

## v3 Certified-Report Methods

`contracts/ai_debugger_v3.py` preserves the debugger methods and adds persistent certified-report storage:

| Method | Type | Behavior |
| --- | --- | --- |
| `create_audit_report(project_name, source_code, owner)` | write | Creates a normalized JSON report, stores title and owner, and increments `report_count`. Frontend/CLI passes owner as text such as `owner#0x...`. |
| `get_report_count()` | view | Reads the number of stored reports. |
| `get_last_report_id(owner)` | view | Reads the latest report ID for an owner address. |
| `get_report(report_id)` | view | Reads the stored report JSON string. |
| `get_report_title(report_id)` | view | Reads the stored project title. |
| `get_report_owner(report_id)` | view | Reads the normalized report owner address. |

The v3 report path uses `gl.vm.run_nondet_unsafe`; validators deterministically accept only leader output that normalizes to the strict report JSON schema.

## Repository Architecture

```text
contracts/
  ai_debugger_v2.py          deployed v2 debugger contract
  ai_debugger_v3.py          deployed Bradbury v3 certified-report contract
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

## Deployment Proofs

| Proof | File |
| --- | --- |
| v2 deployment history | `DEPLOYMENT_PROOF.md` |
| v3 Bradbury deployment and first certified-report proof | `DEPLOYMENT_V3_BRADBURY_PROOF.md` |

The v3 proof records the deployment transaction, first report transaction, report ID, owner, title, risk level, consensus risk, and independent readback results.
