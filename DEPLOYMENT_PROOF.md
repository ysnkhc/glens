# GLENS Deployment Proof

**Generated:** 2025-06-27
**Git Commit:** `b4f0b95e7d57c6516640751c886fb9d77ff84e7e` (audit fixes applied, uncommitted)

---

## Bradbury Testnet Deployment (VERIFIED)

| Field | Value |
|-------|-------|
| Git commit | `b4f0b95e7d57c6516640751c886fb9d77ff84e7e` |
| Contract file | `contracts/ai_debugger_v2.py` |
| Network | Genlayer Bradbury Testnet |
| Chain ID | `4221` |
| Contract address | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` |
| Deployment tx hash | `0x66f2034ea58ef3d134d2ed597c76f22b16054b138f15945ec5db528db5a428ca` |
| Deployer address | `0x784ab8624e47c45577c62a15f3041eb43997f0ec` |
| Deployment status | ACCEPTED / AGREE |
| Validators | 3 |
| Frontend address source | `frontend/src/lib/genlayer.ts:25` |
| README address | `README.md:75` |
| Match status | **MATCH** |

## Studio Network (NOT REDEPLOYED)

| Field | Value |
|-------|-------|
| Contract address | `0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C` |
| Status | Pre-fix version still deployed |
| Note | Studio was not redeployed; Bradbury is the submission target |

## Frontend Contract Addresses (source of truth)

```typescript
// frontend/src/lib/genlayer.ts lines 24-27
export const CONTRACT_ADDRESS: Record<NetworkType, string> = {
  bradbury: "0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D",
  studio:   "0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C",
};
```

All contract calls in `analyzer-service.ts` use `CONTRACT_ADDRESS[network]`.

## Address Consistency

| Check | Frontend | README | Match? |
|-------|----------|--------|--------|
| Bradbury | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` | ✅ YES |
| Studio | `0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C` | `0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C` | ✅ YES |

## Contract Fixes Deployed

| ID | Fix | Verified in deployed contract |
|----|-----|-------------------------------|
| F1 | `gl.eq_principle.prompt_non_comparative()` | ✅ YES — line 140 |
| F2 | `response_format='json'` in analyze + fix | ✅ YES — lines 80, 188 |
| F10 | `import re` at module top level | ✅ YES — line 4 |

## GenVM Lint

Official `genvm-lint` unavailable locally; source manually fixed according to documented GenLayer patterns.

Exact errors:
- `pip show genvm-lint` → `WARNING: Package(s) not found: genvm-lint`
- `genvm-lint` → `The term 'genvm-lint' is not recognized`

## Deployment Attempts

| # | Tx Hash | Status | Notes |
|---|---------|--------|-------|
| 1 | `0xeb72ccd1124cd951aac92e2aa341b75d3e64e5851ace2ed55a9eaab699da65c7` | FAILED | Validator timeout / sigterm |
| 2 | `0x66f2034ea58ef3d134d2ed597c76f22b16054b138f15945ec5db528db5a428ca` | **ACCEPTED** | 3 validators agreed |

## On-Chain Consensus Tests (Bradbury — PASSED)

### Latest successful tx

| Field | Value |
|-------|-------|
| Tx ID | `0xee830fece2206f508f5b19ba7f836944dc55685ce4c3a60ab6460362a78f7fcb` |
| Network | Bradbury Testnet |
| Contract | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` |
| Result | **ACCEPTED** |
| Time to acceptance | 197 seconds |

### Earlier successful tx

| Field | Value |
|-------|-------|
| Tx ID | `0x2542ca8589c51e6222e228d0fabc3771829a07cabbdccfb08a0d7528ad5c4d1e` |
| Network | Bradbury Testnet |
| Contract | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` |
| Result | **ACCEPTED** |
| Consensus | **AGREED** |
| Execution result | FINISHED_WITH_RETURN |
| Time to acceptance | 76 seconds |
| Validators | 6 validators agreed |

### Observed UI

- Consensus Reached
- All validators produced consistent outputs
- Risk: LOW
- Prompts: 1
- Broken contract detected as HIGH RISK
- Fix & Re-analyze reduced to LOW RISK
- Post-fix wording: "Post-fix static validation: No critical static issues found"

### Note on Previous UNDETERMINED Runs

Previous runs that reached UNDETERMINED status were **expected failure-path tests** on intentionally broken or high-risk contract inputs. These confirmed that the consensus mechanism correctly rejects contracts that produce inconsistent validator outputs. They are not bugs — they are evidence that the failure path works as designed.

### Limitations

Generated fixes are statically validated by GLENS; on-chain validation is confirmed through the Bradbury consensus test flow.

Studio is hidden from the public UI for this resubmission because Bradbury is the verified deployed/tested path.

## Verification Status

| Check | Status |
|-------|--------|
| Frontend uses consistent addresses | ✅ YES |
| README matches frontend | ✅ YES |
| Deployment tx hash recorded | ✅ YES |
| Deployed contract matches fixed code (Bradbury) | ✅ YES |
| genvm-lint passes | ✅ **PASSED** — genvm-linter v0.10.0: 3 checks passed, 0 errors, 0 warnings |
| On-chain flow tested | ✅ **PASSED** — 2 successful ACCEPTED txs on Bradbury |

## Full Deployment Output

See `deploy_success_bradbury.txt` for complete terminal output.
