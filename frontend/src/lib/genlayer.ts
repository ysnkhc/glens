/**
 * GenLayer Client — Dual-Network (Studio + Bradbury)
 *
 * ARCHITECTURE:
 *
 *   studio   → studionet (GenLayer public Studio network, chain ID 61999)
 *              Uses the user's own Rabby/MetaMask wallet, switched to chain 61999.
 *              Standard createClient — no hybrid provider needed.
 *              chain switch handled by ensureWalletNetwork before each write.
 *
 *   bradbury → Bradbury testnet (chain ID 4221)
 *              Hybrid provider: Rabby signs, GenLayer RPC handles receipts.
 */

import { createClient } from "genlayer-js";
import { testnetBradbury, studionet } from "genlayer-js/chains";

// ─── Network Type ─────────────────────────────────────────────
export type NetworkType = "bradbury" | "studio";

/**
 * Contract addresses per network.
 */
export const CONTRACT_ADDRESS: Record<NetworkType, string> = {
  bradbury: "0xE1d4D9DF1AbA3e2E64E13d733700d463732A7cDA",
  studio:   "0xA3DA12a7Bf0f9161c0Bb1E6Ba1FBa4C548178f2C",
};

/**
 * GenLayer RPC endpoints.
 */
const RPC: Record<NetworkType, string> = {
  bradbury: "https://rpc-bradbury.genlayer.com",
  studio:   "https://studio.genlayer.com/api",
};

/**
 * Return the correct genlayer-js chain for the given network.
 */
export function getChain(network: NetworkType) {
  return network === "bradbury" ? testnetBradbury : studionet;
}

/**
 * Chain configs for wallet_addEthereumChain (Rabby/MetaMask) — both networks.
 */
export const CHAIN_CONFIG: Record<NetworkType, {
  chainId: string;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
}> = {
  bradbury: {
    chainId: `0x${testnetBradbury.id.toString(16)}`,
    chainName: "GenLayer Testnet Bradbury",
    rpcUrls: [RPC.bradbury],
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  },
  studio: {
    chainId: `0x${studionet.id.toString(16)}`, // 0xF22F = 61999
    chainName: "GenLayer Studio Network",
    rpcUrls: [RPC.studio],
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  },
};

// ─── EIP-1193 Provider ───────────────────────────────────────────
interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

function getEthereum(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
}

// ─── Last EVM txHash ─────────────────────────────────────────────
let lastEvmTxHash: string | null = null;
export function getLastEvmTxHash(): string | null { return lastEvmTxHash; }

/**
 * Ensure wallet is on the correct chain — prompts add/switch via Rabby.
 */
export async function ensureWalletNetwork(network: NetworkType): Promise<void> {
  const ethereum = getEthereum();
  if (!ethereum) return;

  const cfg = CHAIN_CONFIG[network];
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: cfg.chainId }],
    });
  } catch (switchError: unknown) {
    const err = switchError as { code?: number };
    if (err.code === 4902 || err.code === -32603) {
      await ethereum.request({ method: "wallet_addEthereumChain", params: [cfg] });
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: cfg.chainId }],
      });
    } else if (err.code !== 4001) {
      try { await ethereum.request({ method: "wallet_addEthereumChain", params: [cfg] }); }
      catch { console.warn(`Could not auto-add ${network} network.`); }
    }
  }
}

/**
 * Connect wallet (Rabby/MetaMask) and switch to the correct chain.
 * Same flow for both Studio and Bradbury.
 */
export async function connectWallet(network: NetworkType = "studio"): Promise<string | null> {
  const ethereum = getEthereum();
  if (!ethereum) {
    throw new Error("No wallet found. Please install MetaMask or Rabby.");
  }

  const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
  if (!accounts?.length) throw new Error("No accounts found. Please unlock your wallet.");

  await ensureWalletNetwork(network);
  return accounts[0];
}

/**
 * Get connected address without prompting.
 */
export async function getConnectedAddress(): Promise<string | null> {
  const ethereum = getEthereum();
  if (!ethereum) return null;
  try {
    const accounts = await ethereum.request({ method: "eth_accounts" }) as string[];
    return accounts?.[0] || null;
  } catch { return null; }
}

// ─── RPC Helper ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function genLayerRPC(method: string, params: unknown[] = [], rpcUrl: string = RPC.bradbury): Promise<any> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!res.ok) throw new Error(`GenLayer RPC error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

export async function pollForReceipt(
  evmTxHash: string, timeoutMs = 30000, network: NetworkType = "bradbury",
): Promise<Record<string, unknown>> {
  const rpcUrl = RPC[network];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await genLayerRPC("eth_getTransactionReceipt", [evmTxHash], rpcUrl);
    if (receipt) { console.log("🧾 EVM RECEIPT:", JSON.stringify(receipt)); return receipt; }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`EVM receipt polling timeout after ${timeoutMs}ms`);
}

export function extractGenLayerTxId(receipt: Record<string, unknown>): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = (receipt as any).logs;
  if (!logs || !Array.isArray(logs)) return null;
  const ROUTER = "0x1d301acef55eaf7df5d3741659d426f51061ec8d";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = logs.find((l: any) => l.address?.toLowerCase() === ROUTER.toLowerCase());
  if (log?.topics?.[1]) { console.log("🎯 EXTRACTED txId:", log.topics[1]); return log.topics[1]; }
  console.warn("⚠️ TransactionCreated not found");
  return null;
}

// ─── Consensus Polling ────────────────────────────────────────────
export interface ConsensusResult {
  consensus: "AGREED" | "DISAGREED" | "TIMEOUT" | "ERROR" | "CANCELLED";
  txId: string; status: string; statusName?: string; resultName?: string;
  executionResult?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

const TERMINAL_AGREED = ["FINALIZED", "ACCEPTED", "EXECUTED"];
const TERMINAL_FAILED = ["UNDETERMINED", "LEADER_TIMEOUT", "CANCELED"];

export async function pollConsensusStatus(
  txId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  onProgress?: (status: string, elapsed: number) => void,
  signal?: AbortSignal,
  network: NetworkType = "studio",
): Promise<ConsensusResult> {
  const pollInterval = network === "bradbury" ? 10000 : 30000;
  const maxTimeout = 20 * 60 * 1000; // 20 minutes — gives validators much more time for AI consensus
  const start = Date.now();
  let lastStatus = "";
  let pollCount = 0;

  console.log(`🔄 POLL START — txId: ${txId}, network: ${network}, interval: ${pollInterval}ms, timeout: ${maxTimeout / 1000}s`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) return { consensus: "CANCELLED", txId, status: "CANCELLED" };
    const elapsed = Date.now() - start;

    // ─── Timeout guard: don't poll forever ───
    if (elapsed > maxTimeout) {
      console.log(`⏱️ POLL TIMEOUT after ${(elapsed / 1000).toFixed(0)}s — lastStatus: "${lastStatus}"`);
      if (onProgress) onProgress("TIMEOUT", elapsed);
      return {
        consensus: "TIMEOUT",
        txId,
        status: lastStatus || "TIMEOUT",
        statusName: lastStatus || "TIMEOUT",
        resultName: "TIMEOUT",
      };
    }

    pollCount++;
    try {
      const tx = await client.getTransaction({ hash: txId });
      if (!tx) {
        console.log(`🔄 POLL #${pollCount} (${(elapsed / 1000).toFixed(0)}s) — tx NOT FOUND (null), waiting...`);
        if (onProgress) onProgress("WAITING", elapsed);
        await new Promise(r => setTimeout(r, pollInterval));
        continue;
      }
      const statusName = tx.statusName || "";
      const resultName = tx.resultName || "";
      console.log(`🔄 POLL #${pollCount} (${(elapsed / 1000).toFixed(0)}s) — statusName: "${statusName}", resultName: "${resultName}"`);
      if (!lastStatus) {
        console.log("📍 TX AUDIT — statusName:", statusName, "resultName:", resultName, "keys:", Object.keys(tx));
      }
      if (statusName !== lastStatus) { lastStatus = statusName; if (onProgress) onProgress(statusName, elapsed); }
      if (TERMINAL_AGREED.includes(statusName)) {
        console.log(`✅ POLL TERMINAL AGREED — statusName: "${statusName}", resultName: "${resultName}"`);
        // ACCEPTED  = validators agreed after appeal rounds (resultName is often empty)
        // FINALIZED = validators agreed in first round (resultName = "AGREE")
        // EXECUTED  = Bradbury terminal success status
        // All are genuine consensus agreement — never map to DISAGREED
        const isAgreed = statusName === "ACCEPTED" || statusName === "EXECUTED" || resultName === "AGREE" || resultName === "";
        return {
          consensus: isAgreed ? "AGREED" : "DISAGREED",
          txId, status: statusName, statusName, resultName,
          executionResult: tx.txExecutionResultName, data: tx,
        };
      }
      if (TERMINAL_FAILED.includes(statusName)) {
        console.log(`❌ POLL TERMINAL FAILED — statusName: "${statusName}", resultName: "${resultName}"`);
        return { consensus: "DISAGREED", txId, status: statusName, statusName, resultName, data: tx };
      }
    } catch (err) {
      if (signal?.aborted) return { consensus: "CANCELLED", txId, status: "CANCELLED" };
      console.warn(`🔄 POLL #${pollCount} ERROR (${(elapsed / 1000).toFixed(0)}s):`, err);
    }
    await new Promise(r => setTimeout(r, pollInterval));
  }
}

// ─── Hybrid Provider (Bradbury only) ─────────────────────────────

function createHybridProvider(rpcUrl: string): EIP1193Provider {
  let jsonRpcId = 1;
  return {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "eth_sendTransaction") {
        const ethereum = getEthereum();
        if (!ethereum) throw new Error("Wallet not available for signing");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txData = (params as any)?.[0]?.data as string | undefined;
        if (txData && txData.length > 10) {
          try {
            const abiData = txData.slice(10);
            const wordCount = Math.floor(abiData.length / 64);
            console.group("📍 CALLDATA AUDIT");
            for (let i = Math.max(0, wordCount - 4); i < wordCount; i++) {
              const word = abiData.slice(i * 64, (i + 1) * 64);
              const asNum = BigInt("0x" + word);
              const label = i === wordCount - 1 ? "➡️ LAST WORD" : `word[${i}]`;
              console.log(label, word, "=", asNum.toString(),
                asNum > 1000000000n && asNum < 9999999999n ? ("→ " + new Date(Number(asNum) * 1000).toISOString()) : "");
            }
            console.groupEnd();
          } catch(e) { console.warn("Calldata audit failed:", e); }
        }
        const txHash = await ethereum.request({ method, params });
        lastEvmTxHash = txHash as string;
        return txHash;
      }

      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: jsonRpcId++, method, params: params || [] }),
      });
      if (!res.ok) throw new Error(`GenLayer RPC error: ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data.result;
    },
  };
}

// ─── Client Factory ───────────────────────────────────────────────

/**
 * Create a GenLayer write client for on-chain transactions.
 *
 * Studio:   standard createClient with studionet chain.
 *           Ensures Rabby is switched to chain 61999 before returning.
 *           No hybrid provider — studionet RPC handles everything.
 *
 * Bradbury: createClient with hybrid Rabby provider (unchanged).
 *           Rabby signs, GenLayer Bradbury RPC handles receipts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createWriteClient(walletAddress: string, network: NetworkType = "studio"): Promise<any> {
  if (network === "studio") {
    // Ensure wallet is on studionet (chain 61999) — prompts Rabby if needed
    await ensureWalletNetwork("studio");

    return createClient({
      chain: studionet,
      account: walletAddress as `0x${string}`,
    });
  }

  // Bradbury: hybrid provider (Rabby signs, GenLayer RPC for receipts)
  // Ensure wallet is on Bradbury chain (4221) — prevents chainId mismatch after long polls
  await ensureWalletNetwork("bradbury");
  const hybridProvider = createHybridProvider(RPC.bradbury);
  return createClient({
    chain: testnetBradbury,
    account: walletAddress as `0x${string}`,
    provider: hybridProvider,
  });
}

/**
 * Synchronous legacy alias — use createWriteClient for new code.
 * Kept for any non-async call sites that haven't been migrated yet.
 * @deprecated Use createWriteClient instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createWalletClient(address: string, network: NetworkType = "studio"): any {
  if (network === "studio") {
    return createClient({ chain: studionet, account: address as `0x${string}` });
  }
  const hybridProvider = createHybridProvider(RPC.bradbury);
  return createClient({ chain: testnetBradbury, account: address as `0x${string}`, provider: hybridProvider });
}
