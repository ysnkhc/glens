# GLENS v2 Deployment Proof

Generated originally: 2025-06-27

This file records the existing v2 deployment proof. It is not v3 deployment proof. The v3 Consensus-Certified Audit Reports contract is implemented in `contracts/ai_debugger_v3.py` and remains pending deployment; track v3 deployment fields in `DEPLOYMENT_V3_PENDING.md`.

## Bradbury Testnet Deployment

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

## Studio Network

| Field | Value |
| --- | --- |
| Contract address | `0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C` |
| Status | Existing v2-style deployment retained for development |

## Frontend Address Source

```typescript
export const CONTRACT_ADDRESS: Record<NetworkType, string> = {
  bradbury: "0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D",
  studio: "0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C",
};
```

All v2 debugger calls use `CONTRACT_ADDRESS[network]`. v3 report calls must use `CERTIFIED_REPORT_CONTRACT_ADDRESS[network]` and must not reuse the v2 address.

## Current v2 Source Characteristics

| Area | Current source behavior |
| --- | --- |
| Nondeterminism wrapper | `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` |
| JSON AI methods | `response_format='json'` in analyze and fix flows |
| Simulation parsing | top-level `import re` |
| Persistent state | `last_analysis`, `last_explanation`, `last_simulation`, `last_fix`, `total_calls` |

## GenVM Lint History

Historical v2 lint history is preserved in Git commit `653686a`, which records `genvm-lint` 0.10.0 passing for v2.

Current v3 lint results are separate and recorded in `DEPLOYMENT_V3_PENDING.md` using `genvm-linter` 0.11.0.

## Deployment Attempts

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

## Full Deployment Output

See `deploy_success_bradbury.txt` for the original v2 terminal output.
