# GenLayer AI Smart Contract Debugger

A fully on-chain DApp that analyzes, debugs, and fixes GenLayer Intelligent Contracts using real validator consensus. Paste your contract, click Analyze — 5 validators vote on-chain through GenLayer's consensus protocol.

## 🧠 What It Does

- **Analyze** — On-chain AI audits your contract for prompt quality, determinism risks, and consensus safety
- **Explain** — Generates a plain-English breakdown of what your contract does and how it handles AI calls
- **Simulate Consensus** — Submits your contract to 5 real GenLayer validators to test if they agree on the output
- **Auto-Fix** — AI-generates a corrected version of your contract with proper `gl.eq_principle` wrapping, type annotations, and decorator fixes
- **Risk Scoring** — Client-side rule engine flags missing decorators, unsafe external calls, and non-deterministic patterns

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js + TypeScript)                        │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │ Monaco Editor │  │ Rules Engine  │  │ Risk Scorer  │ │
│  │ (code input)  │  │ (client-side) │  │ (client-side)│ │
│  └──────┬───────┘  └───────┬───────┘  └──────┬───────┘ │
│         └──────────────────┼──────────────────┘         │
│                    ┌───────┴───────┐                    │
│                    │ Hybrid Wallet │                    │
│                    │  Provider     │                    │
│                    └───────┬───────┘                    │
│         Rabby signs ───────┤──────── GenLayer RPC reads │
└─────────────────────────────┼───────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  GenLayer Bradbury │
                    │    Testnet         │
                    │  ┌──────────────┐  │
                    │  │ AIContract   │  │
                    │  │ Debugger.py  │  │
                    │  │ (on-chain)   │  │
                    │  └──────────────┘  │
                    │  5 Validators      │
                    │  Consensus Protocol│
                    └───────────────────┘
```

### Key Design Decisions

- **Hybrid Wallet Provider** — Rabby/MetaMask signs transactions (wallet popup), but all receipt/event queries go directly to GenLayer RPC for reliability
- **SDK Bypass** — The GenLayer SDK's `writeContract` throws on receipt parsing, so we extract the GenLayer txId from `TransactionCreated` event logs ourselves, then poll consensus status via `client.getTransaction()`
- **Client-Side Analysis** — Structural validation (parser, rules engine, risk scorer) runs entirely in the browser. Only AI analysis and consensus simulation hit the chain.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- A browser wallet (Rabby or MetaMask)
- GEN tokens on Bradbury testnet (for gas)

### Install & Run

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Connect Wallet

1. Click **Connect Wallet** — the app auto-adds GenLayer Bradbury network
2. Approve the network switch in your wallet
3. Paste a GenLayer contract in the editor
4. Click **Analyze**, **Explain**, **Simulate**, or **Fix**

## 📡 On-Chain Contract

| Field | Value |
|-------|-------|
| **Contract** | `AIContractDebugger` |
| **Address** | `0x4aa1046C8751e043bAEe76b4FD0F1D4188aD8C2e` |
| **Network** | GenLayer Testnet Bradbury (Chain ID: 4221) |
| **RPC** | `https://rpc-bradbury.genlayer.com` |
| **Explorer** | [explorer-bradbury.genlayer.com](https://explorer-bradbury.genlayer.com) |

### Contract Methods

| Method | Type | Description |
|--------|------|-------------|
| `analyze_contract(summary)` | write | AI audits contract for risks, returns JSON with scores |
| `explain_contract(summary)` | write | AI explains contract logic in plain English |
| `simulate_consensus(prompt)` | write | Tests if 5 validators agree on AI output |
| `fix_contract(summary)` | write | AI generates a corrected contract version |

Each write method triggers GenLayer consensus — 5 validators independently execute the AI prompt and must agree on the output via `gl.eq_principle`.

## 🔧 Project Structure

```
├── contracts/
│   ├── ai_debugger.py        # On-chain GenLayer Intelligent Contract
│   └── hello_world.py        # Example contract for testing
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Main UI — editor, results, actions
│   │   │   └── components/
│   │   │       └── Header.tsx        # Wallet connection & network info
│   │   └── lib/
│   │       ├── analyzer-service.ts   # Core logic — analyze, explain, simulate, fix
│   │       ├── genlayer.ts           # Wallet integration, hybrid provider, consensus polling
│   │       ├── parser.ts             # AST-style contract parser
│   │       ├── rules-engine.ts       # Structural validation rules
│   │       └── risk-scorer.ts        # Risk scoring (LOW/MEDIUM/HIGH)
│   └── package.json
└── README.md
```

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript |
| **Editor** | Monaco Editor (VS Code engine) |
| **Styling** | Tailwind CSS 4 |
| **Blockchain** | GenLayer Bradbury Testnet |
| **SDK** | `genlayer-js` v0.28.4 |
| **Wallet** | Rabby / MetaMask (EIP-1193) |
| **Consensus** | 5 validators, `gl.eq_principle`, up to 3 rotation rounds |

## 🔐 How Consensus Works

1. User clicks **Simulate** → Rabby popup appears
2. User approves → EVM transaction is sent to GenLayer
3. Consensus router emits `TransactionCreated` event with a GenLayer txId
4. 5 validators independently execute the AI prompt off-chain
5. Validators commit/reveal their outputs using `gl.eq_principle`
6. If outputs match → **AGREED** (FINALIZED). If not → rotation or **UNDETERMINED**
7. App polls `client.getTransaction()` every 30s until terminal status

Typical consensus time: **60–180 seconds**.

## 📄 License

MIT
