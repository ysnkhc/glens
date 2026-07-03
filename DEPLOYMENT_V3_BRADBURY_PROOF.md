# GLENS v3 Bradbury Deployment Proof

Generated: 2026-07-03

This file records the completed Bradbury deployment and first on-chain report proof for `contracts/ai_debugger_v3.py`. It is separate from the v2 deployment history in `DEPLOYMENT_PROOF.md`.

## Deployment Summary

| Field | Value |
| --- | --- |
| Network | GenLayer Bradbury Testnet |
| Chain ID | `4221` |
| Contract file | `contracts/ai_debugger_v3.py` |
| Contract address | `0xCE3d730138d66c1f87bcCa8095F6e96373cc0233` |
| Deployment transaction | `0x1fd77bacbe74e187d011e6c1121f706ea290c2f2cb62e5c9991d3ce9e6acc7bc` |
| Deployer | `0x784ab8624e47c45577c62a15f3041eb43997f0ec` |
| Deployment status | `ACCEPTED` |
| Consensus result | `AGREE` |
| CLI version | `genlayer` 0.38.9 |
| Local linter | `genvm-linter` 0.11.0 |
| Implementation baseline commit | `f88d4c8279f5260b17bba830ea32d4ab4b40b169` |
| Frontend address source | `frontend/src/lib/genlayer.ts` `CERTIFIED_REPORT_CONTRACT_ADDRESS.bradbury` |

The previously supplied address `0x35201Ec037526EBB8D0fC212921df520a0Ab8BB5` is not configured as v3 proof in this branch because live read/write verification did not produce a stored report. The configured address above is the deployment that passed the first-report proof cycle.

## Exact Passing Contract Verification Commands

Run from `C:\Dev\ASC-Debugger` in PowerShell:

```powershell
python -m unittest discover contracts/tests
$env:PATH = "C:\Dev\ASC-Debugger\.venv\Scripts;$env:PATH"; $env:PYTHONUTF8 = "1"; $env:PYTHONIOENCODING = "utf-8"; genvm-lint.exe check contracts\ai_debugger_v3.py
$env:PATH = "C:\Dev\ASC-Debugger\.venv\Scripts;$env:PATH"; $env:PYTHONUTF8 = "1"; $env:PYTHONIOENCODING = "utf-8"; genvm-lint.exe typecheck contracts\ai_debugger_v3.py
$env:PATH = "C:\Dev\ASC-Debugger\.venv\Scripts;$env:PATH"; $env:PYTHONUTF8 = "1"; $env:PYTHONIOENCODING = "utf-8"; genvm-lint.exe schema contracts\ai_debugger_v3.py
```

Observed results:

| Command | Result |
| --- | --- |
| `python -m unittest discover contracts/tests` | Passed, 10 tests |
| `genvm-lint.exe check contracts\ai_debugger_v3.py` | Passed, lint and validation, 15 methods |
| `genvm-lint.exe typecheck contracts\ai_debugger_v3.py` | Passed, no type errors |
| `genvm-lint.exe schema contracts\ai_debugger_v3.py` | Passed, schema printed 15 methods |

## GenLayer CLI Syntax Verified

GenLayer CLI 0.38.9 help shows:

```powershell
npx --no-install genlayer call <contractAddress> <method> --rpc <rpcUrl> --args <args...>
npx --no-install genlayer write <contractAddress> <method> --rpc <rpcUrl> --args <args...>
npx --no-install genlayer receipt <txId> --status ACCEPTED --retries <n> --interval <ms> --rpc <rpcUrl>
```

The proof cycle used these method forms:

```powershell
npx --no-install genlayer call 0xCE3d730138d66c1f87bcCa8095F6e96373cc0233 get_report_count --rpc https://rpc-bradbury.genlayer.com
$title = 'GLENS V3 Deployment Verification'
$source = 'from genlayer import *; TinyCounter = type("TinyCounter", (gl.Contract,), {})'
$owner = 'owner#0x784ab8624e47c45577c62a15f3041eb43997f0ec'
npx --no-install genlayer write 0xCE3d730138d66c1f87bcCa8095F6e96373cc0233 create_audit_report --rpc https://rpc-bradbury.genlayer.com --args $title $source $owner
npx --no-install genlayer call 0xCE3d730138d66c1f87bcCa8095F6e96373cc0233 get_last_report_id --rpc https://rpc-bradbury.genlayer.com --args 0x784ab8624e47c45577c62a15f3041eb43997f0ec
npx --no-install genlayer call 0xCE3d730138d66c1f87bcCa8095F6e96373cc0233 get_report --rpc https://rpc-bradbury.genlayer.com --args 1
npx --no-install genlayer call 0xCE3d730138d66c1f87bcCa8095F6e96373cc0233 get_report_title --rpc https://rpc-bradbury.genlayer.com --args 1
npx --no-install genlayer call 0xCE3d730138d66c1f87bcCa8095F6e96373cc0233 get_report_owner --rpc https://rpc-bradbury.genlayer.com --args 1
```

## First Report Proof

| Field | Value |
| --- | --- |
| Starting `get_report_count` | `0` |
| Report transaction ID | `0xfc1fe96b493fac4b12f7151f8d89f3b8471984fc0ff3ca993451a81392533119` |
| Final transaction status | `ACCEPTED` |
| Final consensus result | `AGREE` |
| Validator votes | `AGREE`, `AGREE`, `AGREE`, `AGREE`, `AGREE` |
| Report ID | `1` |
| Report owner | `0x784ab8624e47c45577c62a15f3041eb43997f0ec` |
| Report title | `GLENS V3 Deployment Verification` |
| Risk level | `MEDIUM` |
| Consensus risk | `MEDIUM` |
| Ending `get_report_count` | `1` |
| `get_last_report_id(deployer)` | `1` |

Stored report JSON was read back from `get_report(1)`, parsed as valid non-empty JSON, and included the required `risk_level` and `consensus_risk` enum values.

A prior transaction on the same deployment, `0x4f1cb84745bba9534ccc145429d5109041b73d3c84afd4e42c00981edbaeb47b`, is not proof. Trace showed `create_audit_report()` was missing the owner argument because a multiline CLI source argument was truncated; storage remained at count `0`.

## Method Boundary

The deployed v3 certified-report contract exposes the v2 debugger methods plus these report methods:

| Method | Type | Notes |
| --- | --- | --- |
| `create_audit_report(project_name, source_code, owner)` | write | Creates a normalized JSON report, stores title and owner, and increments `report_count`. CLI/frontend owner is passed as text, e.g. `owner#0x...`, and stored as normalized `0x...`. |
| `get_report_count()` | view | Returns the number of stored reports. |
| `get_last_report_id(owner)` | view | Returns the latest report ID for an owner address. |
| `get_report(report_id)` | view | Returns the stored report JSON string. |
| `get_report_title(report_id)` | view | Returns the stored project title. |
| `get_report_owner(report_id)` | view | Returns the normalized owner address. |

Do not replace the v2 address with this v3 address. v2 and v3 remain separate contract configurations.
