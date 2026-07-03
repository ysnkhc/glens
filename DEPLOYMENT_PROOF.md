# GLENS Deployment Proof

Generated originally: 2025-06-27
Updated: 2026-07-03

This file preserves the existing v2 deployment proof and points to the completed v3 Bradbury certified-report proof. v2 and v3 addresses are intentionally separate.

## Bradbury v2 Debugger Deployment

| Field | Value |
| --- | --- |
| Historical commit recorded in prior proof | `b4f0b95e7d57c6516640751c886fb9d77ff84e7e` |
| Contract file | `contracts/ai_debugger_v2.py` |
| Network | GenLayer Bradbury Testnet |
| Chain ID | `4221` |
| Contract address | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` |
| Deployment tx hash | `0x66f2034ea58ef3d134d2ed597c76f22b16054b138f15945ec5db528db5a428ca` |
| Deployer address | `0x784ab8624e47c45577c62a15f3041eb43997f0ec` |
| Deployment status | ACCEPTED / AGREE |
| Validator details | recorded in the deployment transaction |
| Frontend address source | `frontend/src/lib/genlayer.ts` `CONTRACT_ADDRESS.bradbury` |

## Studio v2 Deployment

| Field | Value |
| --- | --- |
| Contract address | `0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C` |
| Status | Existing v2-style deployment retained for development |
| Frontend address source | `frontend/src/lib/genlayer.ts` `CONTRACT_ADDRESS.studio` |

## Bradbury v3 Certified-Report Deployment

The v3 deployment proof is recorded in `DEPLOYMENT_V3_BRADBURY_PROOF.md`.

| Field | Value |
| --- | --- |
| Contract file | `contracts/ai_debugger_v3.py` |
| Network | GenLayer Bradbury Testnet |
| Chain ID | `4221` |
| Contract address | `0xCE3d730138d66c1f87bcCa8095F6e96373cc0233` |
| Deployment tx hash | `0x1fd77bacbe74e187d011e6c1121f706ea290c2f2cb62e5c9991d3ce9e6acc7bc` |
| Deployer address | `0x784ab8624e47c45577c62a15f3041eb43997f0ec` |
| Deployment status | ACCEPTED / AGREE |
| First report tx ID | `0xfc1fe96b493fac4b12f7151f8d89f3b8471984fc0ff3ca993451a81392533119` |
| First report ID | `1` |
| First report owner | `0x784ab8624e47c45577c62a15f3041eb43997f0ec` |
| First report title | `GLENS V3 Deployment Verification` |
| Risk level | `MEDIUM` |
| Consensus risk | `MEDIUM` |
| Frontend address source | `frontend/src/lib/genlayer.ts` `CERTIFIED_REPORT_CONTRACT_ADDRESS.bradbury` |

Studio v3 certified reports remain disabled: `CERTIFIED_REPORT_CONTRACT_ADDRESS.studio` is intentionally empty.

## Frontend Address Sources

```typescript
export const CONTRACT_ADDRESS: Record<NetworkType, string> = {
  bradbury: "0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D",
  studio: "0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C",
};

export const CERTIFIED_REPORT_CONTRACT_ADDRESS: Record<NetworkType, string> = {
  bradbury: "0xCE3d730138d66c1f87bcCa8095F6e96373cc0233",
  studio: "",
};
```

All v2 debugger calls use `CONTRACT_ADDRESS[network]`. v3 certified-report calls use `CERTIFIED_REPORT_CONTRACT_ADDRESS[network]`. Do not reuse or replace the v2 address for v3 methods.

## v2 Method Boundary

| Method | Type | State |
| --- | --- | --- |
| `analyze_contract(source_code)` | write | `last_analysis` |
| `explain_contract(source_code)` | write | `last_explanation` |
| `simulate_consensus(prompt_text)` | write | `last_simulation` |
| `fix_contract(source_code, analysis_summary)` | write | `last_fix` |
| `get_last_analysis()` / `get_last_explanation()` / `get_last_simulation()` / `get_last_fix()` / `get_total_calls()` | view | v2 state reads |

## v3 Certified-Report Method Boundary

| Method | Type | State |
| --- | --- | --- |
| `create_audit_report(project_name, source_code, owner)` | write | Stores report JSON, title, owner, and increments `report_count` |
| `get_report_count()` | view | Reads report count |
| `get_last_report_id(owner)` | view | Reads latest report ID for owner |
| `get_report(report_id)` | view | Reads report JSON |
| `get_report_title(report_id)` | view | Reads report title |
| `get_report_owner(report_id)` | view | Reads report owner |

## Current v2 Source Characteristics

| Area | Current source behavior |
| --- | --- |
| Nondeterminism wrapper | `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` |
| JSON AI methods | `response_format='json'` in analyze and fix flows |
| Simulation parsing | top-level `import re` |
| Persistent state | `last_analysis`, `last_explanation`, `last_simulation`, `last_fix`, `total_calls` |

## GenVM Lint History

Historical v2 lint history is preserved in Git commit `653686a`, which records `genvm-lint` 0.10.0 passing for v2.

Current v3 lint and schema results are recorded in `DEPLOYMENT_V3_BRADBURY_PROOF.md` using `genvm-linter` 0.11.0.

## v2 Deployment Attempts

| # | Tx Hash | Status | Notes |
| --- | --- | --- | --- |
| 1 | `0xeb72ccd1124cd951aac92e2aa341b75d3e64e5851ace2ed55a9eaab699da65c7` | FAILED | Validator timeout / sigterm |
| 2 | `0x66f2034ea58ef3d134d2ed597c76f22b16054b138f15945ec5db528db5a428ca` | ACCEPTED | Deployment accepted |

## On-Chain v2 Consensus Tests

| Tx ID | Network | Contract | Result | Notes |
| --- | --- | --- | --- | --- |
| `0xee830fece2206f508f5b19ba7f836944dc55685ce4c3a60ab6460362a78f7fcb` | Bradbury | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` | ACCEPTED | acceptance recorded after polling |
| `0x2542ca8589c51e6222e228d0fabc3771829a07cabbdccfb08a0d7528ad5c4d1e` | Bradbury | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` | ACCEPTED / AGREED | finished with return |

Previous UNDETERMINED runs were expected failure-path tests on intentionally broken or high-risk inputs.

## Full v2 Deployment Output

See `deploy_success_bradbury.txt` for the original v2 terminal output.
