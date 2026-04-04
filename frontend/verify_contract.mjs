/**
 * GenLayer Contract Verification Script
 * 
 * Run AFTER deployment to verify the contract is properly registered
 * and callable via the GenLayer consensus router.
 * 
 * Usage: node verify_contract.mjs <CONTRACT_ADDRESS>
 * Example: node verify_contract.mjs 0xf4C72e520903416334115D130c3813Cb6da7bF29
 */
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const contractAddress = process.argv[2];

if (!contractAddress || !contractAddress.startsWith("0x")) {
  console.error("❌ Usage: node verify_contract.mjs <CONTRACT_ADDRESS>");
  console.error("   Example: node verify_contract.mjs 0xf4C72e520903416334115D130c3813Cb6da7bF29");
  process.exit(1);
}

console.log("═".repeat(60));
console.log("🔍 GenLayer Contract Verification");
console.log("═".repeat(60));
console.log(`📋 Contract: ${contractAddress}`);
console.log(`🌐 Network: Bradbury Testnet`);
console.log(`🔗 Router:   ${testnetBradbury.consensusMainContract?.address || "unknown"}`);
console.log("");

const client = createClient({ chain: testnetBradbury });

// ─── Test 1: Read call (no tx needed) ──────────────────────────
async function testReadCall() {
  console.log("─── Test 1: readContract (get_total_calls) ───");
  try {
    const result = await client.readContract({
      address: contractAddress,
      functionName: "get_total_calls",
      args: [],
    });
    console.log(`✅ PASS — get_total_calls returned: ${result}`);
    return true;
  } catch (err) {
    const msg = err.message || String(err);
    console.log(`❌ FAIL — ${msg.slice(0, 200)}`);
    
    // Check if this is the NonGenVMContract error
    if (msg.includes("c1ba7c94") || msg.includes("NonGenVMContract")) {
      console.log("");
      console.log("🚨 ERROR: NonGenVMContract()");
      console.log("   The router does not recognize this address as a valid GenVM contract.");
      console.log("   The contract needs to be (re)deployed using deployContract().");
    }
    return false;
  }
}

// ─── Test 2: Read last analysis (should be empty/default) ──────
async function testReadAnalysis() {
  console.log("─── Test 2: readContract (get_last_analysis) ───");
  try {
    const result = await client.readContract({
      address: contractAddress,
      functionName: "get_last_analysis",
      args: [],
    });
    console.log(`✅ PASS — get_last_analysis returned: ${String(result).slice(0, 100)}`);
    return true;
  } catch (err) {
    const msg = err.message || String(err);
    console.log(`⚠️  FAIL — ${msg.slice(0, 200)}`);
    return false;
  }
}

// ─── Test 3: Check contract via RPC eth_getCode ────────────────
async function testCodeExists() {
  console.log("─── Test 3: eth_getCode check ───");
  try {
    const code = await client.request({
      method: "eth_getCode",
      params: [contractAddress, "latest"],
    });
    const hasCode = code && code !== "0x" && code !== "0x0";
    if (hasCode) {
      console.log(`✅ PASS — Contract has code (${String(code).length} hex chars)`);
    } else {
      console.log(`❌ FAIL — No code at this address (returns "${code}")`);
      console.log("   This address has no deployed contract.");
    }
    return hasCode;
  } catch (err) {
    console.log(`⚠️  FAIL — ${err.message?.slice(0, 200) || err}`);
    return false;
  }
}

// ─── Run all tests ─────────────────────────────────────────────
async function verify() {
  const results = {};

  results.codeExists = await testCodeExists();
  console.log("");
  results.readTotal = await testReadCall();
  console.log("");
  results.readAnalysis = await testReadAnalysis();
  console.log("");

  // ─── Summary ─────────────────────────────────────────────────
  console.log("═".repeat(60));
  console.log("📊 Verification Summary");
  console.log("═".repeat(60));
  console.log(`  eth_getCode:        ${results.codeExists ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  get_total_calls:    ${results.readTotal ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  get_last_analysis:  ${results.readAnalysis ? "✅ PASS" : "❌ FAIL"}`);
  console.log("");

  const allPass = Object.values(results).every(Boolean);
  if (allPass) {
    console.log("🎉 ALL TESTS PASSED — Contract is live and callable!");
    console.log("");
    console.log("Next step: Update CONTRACT_ADDRESS in src/lib/genlayer.ts:");
    console.log(`  export const CONTRACT_ADDRESS: string = "${contractAddress}";`);
  } else {
    console.log("⚠️  Some tests failed. See details above.");
    if (!results.codeExists) {
      console.log("→ No code at address — contract was never deployed or address is wrong.");
    } else if (!results.readTotal) {
      console.log("→ Code exists but read fails — likely NonGenVMContract (not deployed via GenLayer SDK).");
    }
  }
  console.log("");
}

verify().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
