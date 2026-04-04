/**
 * Deploy ai_debugger.py to GenLayer Bradbury testnet
 * 
 * Usage: 
 *   node deploy_contract.mjs                           (generates new wallet)
 *   PRIVATE_KEY=0x... node deploy_contract.mjs         (uses existing wallet)
 * 
 * IMPORTANT: The deploying wallet needs GEN tokens for gas.
 * Get testnet GEN from the Bradbury faucet.
 */
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the contract file
const contractPath = resolve(__dirname, "..", "contracts", "ai_debugger.py");
const contractCode = readFileSync(contractPath, "utf-8");

console.log("=".repeat(60));
console.log("GenLayer Contract Deployment");
console.log("=".repeat(60));
console.log("Contract:", contractPath);
console.log("Size:    ", contractCode.length, "bytes");
console.log("Network: Bradbury Testnet");
console.log("RPC:    ", testnetBradbury.rpcUrls.default.http[0]);
console.log("Router: ", testnetBradbury.consensusMainContract?.address);
console.log("");

async function deploy() {
  try {
    // Create or load account
    const privateKey = process.env.PRIVATE_KEY;
    let account;
    
    if (privateKey) {
      account = createAccount(privateKey);
      console.log("Using existing wallet:", account.address);
    } else {
      account = createAccount();
      console.log("Generated new wallet:", account.address);
      console.log("");
      console.log("WARNING: This is a NEW wallet. You need to:");
      console.log("  1. Fund it with GEN from the Bradbury faucet");
      console.log("  2. Save the private key for future use");
      console.log("  3. Re-run this script with: PRIVATE_KEY=0x... node deploy_contract.mjs");
      console.log("");
      console.log("Attempting deployment anyway (will fail if unfunded)...");
    }
    console.log("");

    // Create client with account
    const client = createClient({
      chain: testnetBradbury,
      account: account,
    });

    // Check balance
    try {
      const nonce = await client.getCurrentNonce({ address: account.address });
      console.log("Nonce:  ", nonce);
    } catch (e) {
      console.warn("Could not fetch nonce:", e.message?.slice(0, 100));
    }

    console.log("Deploying contract...");
    console.log("");

    const txHash = await client.deployContract({
      code: contractCode,
      args: [],
    });

    console.log("TX Hash:", txHash);
    console.log("Waiting for receipt...");

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
    });

    console.log("Deployment complete!");
    console.log("Receipt:", JSON.stringify(receipt, null, 2));
    console.log("");
    console.log("=".repeat(60));
    const newAddress = receipt.contract_address || receipt.contractAddress || "check receipt above";
    console.log("NEW CONTRACT ADDRESS:", newAddress);
    console.log("=".repeat(60));
    console.log("");
    console.log("Next steps:");
    console.log("  1. Update src/lib/genlayer.ts:");
    console.log(`     export const CONTRACT_ADDRESS: string = "${newAddress}";`);
    console.log("  2. Verify with: node verify_raw.cjs", newAddress);
    console.log("  3. Restart the dev server: npm run dev");
  } catch (err) {
    console.error("Deployment failed:", err.message || err);
    if (err.message?.includes("insufficient") || err.message?.includes("balance")) {
      console.error("");
      console.error("The wallet has insufficient GEN. Fund it from the Bradbury faucet.");
    }
    console.error(err);
  }
}

deploy();
