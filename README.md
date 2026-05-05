# GLENS — GenLayer Intelligent Contract Analyzer

> A fully on-chain DApp that analyzes, fixes, and consensus-tests GenLayer Intelligent Contracts. Paste your contract, connect your wallet — 5 real validators execute your AI prompts and vote on-chain.

**Live:** [glens.vercel.app](https://glens.vercel.app)

---

## What It Does

| Action | What happens |
|--------|-------------|
| **Analyze Contract** | 5 validators AI-audit your contract for prompt quality, determinism risks, and consensus safety. Result stored on-chain. |
| **Fix & Re-analyze** | AI generates a corrected version with proper `gl.eq_principle` wrapping, type annotations, and decorator fixes. |
| **Explain** | Validators produce a plain-English breakdown of what your contract does and how it handles AI calls. |
| **Run Consensus Test** | A deterministic prompt is sent to 5 validators. If they agree → AGREED. If not → DISAGREED. A direct test of your contract's consensus-safety. |

Every action requires one wallet signature. Results are verified on-chain by GenLayer's Optimistic Democracy consensus.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  Browser (Next.js + TypeScript)                        │
│                                                        │
│  Monaco Editor ──► Parser ──► Rules Engine ──► Risk   │
│                     (instant, client-side, no wallet)  │
│                                                        │
│  For AI actions: Rabby/MetaMask signs the transaction  │
│  pollConsensusStatus() polls until FINALIZED/ACCEPTED  │
└────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴────────────┐
              │                        │
   ┌──────────┴──────────┐  ┌─────────┴──────────┐
   │  Studio Network     │  │  Bradbury Testnet   │
   │  Chain ID: 61999    │  │  Chain ID: 4221     │
   │  Fast & stable      │  │  Real validators    │
   │  (dev environment)  │  │  (production-like)  │
   │                     │  │                     │
   │  AIContractDebugger │  │  AIContractDebugger │
   │  (on-chain Python)  │  │  (on-chain Python)  │
   │  5 validators       │  │  5 validators       │
   └─────────────────────┘  └─────────────────────┘
```

### Key Design Decisions

- **No private keys** — The app uses the user's own Rabby/MetaMask wallet. Zero hardcoded secrets.
- **Bradbury verified** — Deployed and consensus-tested on Bradbury testnet with real LLM validators.
- **SDK bypass** — The GenLayer SDK's `waitForTransactionReceipt` is unreliable (enum mismatch). We use a custom `pollConsensusStatus()` that handles `FINALIZED`, `ACCEPTED`, and `UNDETERMINED` by name.
- **Client-side first** — Structural analysis (parser, rules, risk) runs instantly in the browser. Only AI and consensus hit the chain.
- **?debug=1** — Append `?debug=1` to the URL to reveal the full GenLayer Flow Inspector.

---

## Networks & Contracts

### Bradbury Testnet (primary — verified)

| Field | Value |
|-------|-------|
| Chain ID | `4221` |
| RPC | `https://rpc-bradbury.genlayer.com` |
| Contract | `0x8f1E92cb540746F66F7650d88f7Cd9CF9F6D9f1D` |
| Explorer | [explorer-bradbury.genlayer.com](https://explorer-bradbury.genlayer.com) |

**Live proof transactions:**

| Tx Hash | Status |
|---------|--------|
| `0xee830fece2206f508f5b19ba7f836944dc55685ce4c3a60ab6460362a78f7fcb` | ACCEPTED |
| `0x2542ca8589c51e6222e228d0fabc3771829a07cabbdccfb08a0d7528ad5c4d1e` | ACCEPTED / AGREED (6 validators, 76s) |

### Studio (hidden — not part of current resubmission)

Studio (`0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C`, chain 61999) is kept in the codebase for future development but is hidden from the public UI. It was not redeployed or tested with the current contract fixes.

The app defaults to Bradbury and automatically switches your wallet to chain 4221.

---

## Contract Methods

| Method | Type | Description |
|--------|------|-------------|
| `analyze_contract(summary)` | write | AI audits for risks, returns JSON with scores |
| `explain_contract(summary)` | write | AI explains contract logic in plain English |
| `simulate_consensus(prompt)` | write | Tests if 5 validators agree on a deterministic output |
| `fix_contract(summary)` | write | AI generates corrected contract version |
| `get_last_analysis()` / `get_last_explanation()` / etc. | read | Reads the stored result after consensus |

Each write triggers GenLayer consensus — validators independently execute the AI prompt and must agree via `gl.eq_principle`.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Rabby or MetaMask browser wallet
- GEN tokens on Bradbury testnet (for gas)

### Run Locally

```bash
git clone https://github.com/ysnkhc/glens.git
cd glens/frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Connect & Use

1. Click **Connect Wallet** — the app prompts your wallet to switch to the selected network
2. Paste a GenLayer contract in the editor (or pick an example)
3. Click **Analyze Contract** — or press **Ctrl+Enter**
4. After analysis results appear, use **Fix & Re-analyze**, **Explain**, or **Run Consensus Test**

---

## Project Structure

```
├── contracts/
│   └── ai_debugger.py           # On-chain GenLayer Intelligent Contract (Python)
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx                 # Main UI — editor, results, network state
        │   └── components/
        │       ├── Header.tsx           # Wallet + network selector
        │       ├── ResultsPanel.tsx     # Results display (risk, issues, consensus)
        │       ├── SimulationPanel.tsx  # Consensus test card
        │       ├── ConsensusStatusBar.tsx # Live spinner with elapsed time
        │       ├── CodeEditor.tsx       # Monaco Editor wrapper
        │       └── ...
        └── lib/
            ├── analyzer-service.ts  # Core: analyze, explain, simulate, fix
            ├── genlayer.ts          # Wallet, chain switching, pollConsensusStatus
            ├── parser.ts            # AST-style contract parser
            ├── rules-engine.ts      # Structural validation rules
            ├── risk-scorer.ts       # LOW / MEDIUM / HIGH scoring
            └── fixer-engine.ts      # Deterministic contract fixer
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript |
| **Styling** | Vanilla CSS (glassmorphism design system) |
| **Editor** | Monaco Editor (VS Code engine) |
| **Blockchain** | GenLayer Bradbury Testnet |
| **SDK** | `genlayer-js` |
| **Wallet** | Rabby / MetaMask (EIP-1193) |
| **Consensus** | 5 validators · `gl.eq_principle` · up to 3 rotation rounds |
| **Hosting** | Vercel |

---

## How Consensus Works

```
User clicks action
      │
      ▼
Rabby popup (sign tx)
      │
      ▼
GenLayer Router ──► 5 Validators (each runs LLM independently)
      │
      ▼
Validators commit/reveal outputs via gl.eq_principle
      │
   ┌──┴──┐
   │     │
AGREED  DISAGREED
(FINALIZED/  (UNDETERMINED)
 ACCEPTED)
      │
      ▼
App reads result from contract state
```

Bradbury typically reaches consensus in **60–200 seconds**.

---

## Security

- **No private keys** are stored anywhere in this codebase
- The app uses the browser wallet (EIP-1193) for all signing — the private key never leaves the user's wallet
- All AI results are verified by 5 independent validators before being stored on-chain
- Client-side analysis is clearly labeled and distinguished from on-chain results

---

## License

MIT
