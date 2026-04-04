/**
 * GenLayer Client — Hybrid Wallet + Direct Consensus Polling
 *
 * ARCHITECTURE:
 * The GenLayer SDK's writeContract has a broken receipt parsing layer:
 * it calls parseEventLogs to find NewTransaction events, but the
 * GenLayer RPC receipt format doesn't match what viem expects.
 * Result: "Transaction not processed by consensus" even when the
 * EVM tx succeeded and the receipt contains valid logs.
 *
 * SOLUTION: Three-layer bypass:
 *   1. Hybrid provider: Rabby signs, GenLayer RPC handles receipts
 *   2. Store the EVM txHash from eth_sendTransaction
 *   3. Extract GenLayer txId from receipt logs ourselves
 *   4. Poll consensus status directly via gen_getTransactionByHash
 */

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

/**
 * Contract address — freshly deployed on Bradbury testnet.
 * Deploy TX: 0x5e02a5a128faec3b6db050e30bbc814d1fb986cad225de77d2a6de3826b56019
 * Status: ACCEPTED, Result: AGREE (3/5 validators)
 */
export const CONTRACT_ADDRESS: string = "0x4aa1046C8751e043bAEe76b4FD0F1D4188aD8C2e";

/**
 * GenLayer Bradbury RPC endpoint.
 */
const GENLAYER_RPC = "https://rpc-bradbury.genlayer.com";

/**
 * GenLayer chain config for MetaMask/Rabby.
 */
export const CHAIN_CONFIG = {
  chainId: `0x${testnetBradbury.id.toString(16)}`,
  chainName: "GenLayer Testnet Bradbury",
  rpcUrls: [GENLAYER_RPC],
  nativeCurrency: {
    name: "GEN",
    symbol: "GEN",
    decimals: 18,
  },
};

// ─── EIP-1193 Provider Type ───────────────────────────────────────
interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

function getEthereum(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
}

// ─── Stored EVM txHash from last eth_sendTransaction ─────────────
// The hybrid provider stores this so we can recover the txId
// even when the SDK's parseEventLogs fails.
let lastEvmTxHash: string | null = null;

/** Get the last EVM txHash sent through the hybrid provider */
export function getLastEvmTxHash(): string | null {
  return lastEvmTxHash;
}

/**
 * Request wallet connection via MetaMask/Rabby (EIP-1193).
 */
export async function connectWallet(): Promise<string | null> {
  const ethereum = getEthereum();
  if (!ethereum) {
    throw new Error("No wallet found. Please install MetaMask or Rabby to use this dApp.");
  }

  try {
    const accounts = await ethereum.request({
      method: "eth_requestAccounts",
    }) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found. Please unlock your wallet.");
    }

    // Switch to GenLayer Bradbury network — add it if not present
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_CONFIG.chainId }],
      });
    } catch (switchError: unknown) {
      const err = switchError as { code?: number };
      if (err.code === 4902 || err.code === -32603) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [CHAIN_CONFIG],
        });
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_CONFIG.chainId }],
        });
      } else if (err.code !== 4001) {
        try {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [CHAIN_CONFIG],
          });
        } catch {
          console.warn("Could not auto-add GenLayer network.");
        }
      }
    }

    return accounts[0];
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (error.code === 4001) {
      throw new Error("Connection rejected. Please approve the connection in your wallet.");
    }
    throw err;
  }
}

/**
 * Get the currently connected address (without prompting).
 */
export async function getConnectedAddress(): Promise<string | null> {
  const ethereum = getEthereum();
  if (!ethereum) return null;

  try {
    const accounts = await ethereum.request({
      method: "eth_accounts",
    }) as string[];
    return accounts?.[0] || null;
  } catch {
    return null;
  }
}

// ─── Direct GenLayer RPC helper ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function genLayerRPC(method: string, params: unknown[] = []): Promise<any> {
  const response = await fetch(GENLAYER_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`GenLayer RPC error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data.result;
}

/**
 * Poll for an EVM receipt from GenLayer RPC.
 * Retries until the receipt is available (tx mined).
 */
export async function pollForReceipt(evmTxHash: string, timeoutMs = 30000): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await genLayerRPC("eth_getTransactionReceipt", [evmTxHash]);
    if (receipt) {
      console.log("🧾 EVM RECEIPT:", JSON.stringify(receipt, null, 2));
      return receipt;
    }
    // Not mined yet — wait 2s
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`EVM receipt polling timeout after ${timeoutMs}ms`);
}

/**
 * Extract GenLayer txId from EVM receipt logs.
 *
 * The TransactionCreated event is emitted by the consensus router at
 * 0x1d301acef55eaf7df5d3741659d426f51061ec8d on Bradbury.
 *
 * Log layout:
 *   topics[0] = event signature (0x8da32500...)
 *   topics[1] = GenLayer txId  ← THIS IS WHAT WE NEED
 *   topics[2] = sender address
 *   topics[3] = contract address
 */
export function extractGenLayerTxId(receipt: Record<string, unknown>): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = (receipt as any).logs;
  if (!logs || !Array.isArray(logs)) return null;

  // Find the TransactionCreated event from the consensus router
  const CONSENSUS_ROUTER = "0x1d301acef55eaf7df5d3741659d426f51061ec8d";

  const log = logs.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.address && l.address.toLowerCase() === CONSENSUS_ROUTER.toLowerCase()
  );

  if (log && log.topics && log.topics[1]) {
    console.log("🎯 EXTRACTED GenLayer txId:", log.topics[1], "from log address:", log.address);
    return log.topics[1];
  }

  // Fallback: log everything for debugging
  console.warn("⚠️ TransactionCreated event not found from", CONSENSUS_ROUTER);
  for (let i = 0; i < logs.length; i++) {
    console.warn(`  LOG[${i}] address=${logs[i].address} topics=${JSON.stringify(logs[i].topics)}`);
  }
  return null;
}

/**
 * Poll GenLayer consensus status directly via RPC.
 * Bypasses the SDK's broken waitForTransactionReceipt.
 *
 * Real consensus takes 30-120 seconds (5 validators + up to 3 rotation rounds).
 */
export interface ConsensusResult {
  consensus: "AGREED" | "DISAGREED" | "TIMEOUT" | "ERROR" | "CANCELLED";
  txId: string;
  status: string;
  statusName?: string;
  resultName?: string;
  executionResult?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

const TERMINAL_AGREED = ["FINALIZED", "ACCEPTED"];
const TERMINAL_FAILED = ["UNDETERMINED", "LEADER_TIMEOUT", "CANCELED"];

export async function pollConsensusStatus(
  txId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  onProgress?: (status: string, elapsed: number) => void,
  signal?: AbortSignal,
): Promise<ConsensusResult> {
  const start = Date.now();
  let lastStatus = "";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Check if cancelled
    if (signal?.aborted) {
      return {
        consensus: "CANCELLED",
        txId,
        status: "CANCELLED",
        statusName: "Polling cancelled by user",
      };
    }

    const elapsed = Date.now() - start;
    try {
      const tx = await client.getTransaction({ hash: txId });

      if (!tx) {
        if (onProgress) onProgress("WAITING", elapsed);
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }

      const statusName = tx.statusName || "";
      const resultName = tx.resultName || "";

      if (statusName !== lastStatus) {
        lastStatus = statusName;
        if (onProgress) onProgress(statusName, elapsed);
      }

      if (TERMINAL_AGREED.includes(statusName)) {
        return {
          consensus: resultName === "AGREE" ? "AGREED" : "DISAGREED",
          txId,
          status: statusName,
          statusName,
          resultName,
          executionResult: tx.txExecutionResultName,
          data: tx,
        };
      }

      if (TERMINAL_FAILED.includes(statusName)) {
        return {
          consensus: "DISAGREED",
          txId,
          status: statusName,
          statusName,
          resultName,
          data: tx,
        };
      }

    } catch (err) {
      if (signal?.aborted) {
        return { consensus: "CANCELLED", txId, status: "CANCELLED", statusName: "Cancelled" };
      }
      console.warn(`Consensus poll error (${(elapsed / 1000).toFixed(0)}s):`, err);
    }

    await new Promise(r => setTimeout(r, 30000));
  }
}




/**
 * Hybrid EIP-1193 provider:
 *   eth_sendTransaction → Rabby wallet (popup + signing)
 *   Everything else     → GenLayer RPC directly
 *
 * Also stores the last EVM txHash for recovery when SDK throws.
 */
function createHybridProvider(): EIP1193Provider {
  let jsonRpcId = 1;

  return {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      // ─── SIGNING: Route to Rabby wallet ────────────────────
      if (method === "eth_sendTransaction") {
        const ethereum = getEthereum();
        if (!ethereum) throw new Error("Wallet not available for signing");

        const txHash = await ethereum.request({ method, params });
        lastEvmTxHash = txHash as string;
        return txHash;
      }

      // ─── EVERYTHING ELSE: Route to GenLayer RPC directly ───

      const response = await fetch(GENLAYER_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: jsonRpcId++,
          method,
          params: params || [],
        }),
      });

      if (!response.ok) {
        throw new Error(`GenLayer RPC error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }



      return data.result;
    },
  };
}

/**
 * Create a GenLayer client for on-chain transactions.
 *
 * Uses a HYBRID provider:
 *   - Rabby signs transactions (popup + approval)
 *   - GenLayer RPC handles receipts, events, nonce queries
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createWalletClient(address: string): any {
  const hybridProvider = createHybridProvider();



  return createClient({
    chain: testnetBradbury,
    account: address as `0x${string}`,
    provider: hybridProvider,
  });
}
