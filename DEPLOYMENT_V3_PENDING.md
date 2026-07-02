# GLENS v3 Deployment Placeholder

Consensus-Certified Audit Reports are implemented in source but are not deployed yet.

## Source

| Field | Value |
| --- | --- |
| Contract file | `contracts/ai_debugger_v3.py` |
| Frontend config | `frontend/src/lib/genlayer.ts` |
| v3 address map | `CERTIFIED_REPORT_CONTRACT_ADDRESS` |
| Current v3 address state | empty / disabled |
| Installed local linter | `genvm-linter` 0.11.0 in `.venv` |

## Local v3 Verification

These checks have passed for the source contract. They are not deployment proof.

| Command | Result |
| --- | --- |
| `.venv\Scripts\genvm-lint.exe check contracts/ai_debugger_v3.py` | passed: lint and validation, 15 methods |
| `.venv\Scripts\genvm-lint.exe typecheck contracts/ai_debugger_v3.py` | passed: no type errors |
| `.venv\Scripts\genvm-lint.exe schema contracts/ai_debugger_v3.py` | passed: schema printed for 15 methods |
| `python -m unittest discover contracts/tests` | passed: 10 tests |

## Pending Deployment Fields

Fill these only after a real deployment succeeds.

| Field | Value |
| --- | --- |
| Network | pending |
| Chain ID | pending |
| Contract address | pending |
| Deployment tx hash | pending |
| Deployer address | pending |
| Deployment status | pending |
| GenVM lint result | source lint passed locally; deployment verification pending |
| First report tx ID | pending |
| First report ID | pending |
| First report owner | pending |

## Procedure

1. Run contract checks locally:

   ```bash
   python -m unittest discover contracts/tests
   .venv/Scripts/genvm-lint.exe check contracts/ai_debugger_v3.py
   .venv/Scripts/genvm-lint.exe typecheck contracts/ai_debugger_v3.py
   .venv/Scripts/genvm-lint.exe schema contracts/ai_debugger_v3.py
   ```

2. Deploy `contracts/ai_debugger_v3.py` to the target GenLayer network.
3. Record the deployment tx hash, deployed address, deployer, and final status.
4. Update `CERTIFIED_REPORT_CONTRACT_ADDRESS` for that network only.
5. Create one certified report from the frontend and record the GenLayer tx ID, report ID, title, owner, risk, and consensus risk.
6. Re-run frontend checks:

   ```bash
   cd frontend
   npm run lint
   npm run build
   npx tsc --noEmit
   ```

Do not replace the existing v2 address with a v3 address. v2 and v3 must remain separate contract configurations.
