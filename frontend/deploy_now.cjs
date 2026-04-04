// Deploy with extended retry - no strict ACCEPTED check
const { createClient, createAccount } = require('genlayer-js');
const { testnetBradbury } = require('genlayer-js/chains');
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.resolve(__dirname, '..', 'contracts', 'ai_debugger.py'), 'utf-8');
const account = createAccount(process.env.PRIVATE_KEY);

const client = createClient({ chain: testnetBradbury, account });

async function deploy() {
  console.log("Wallet:", account.address);
  console.log("Deploying contract (" + code.length + " bytes)...");
  
  try {
    const txHash = await client.deployContract({ code, args: [] });
    console.log("TX Hash:", txHash);
    console.log("Waiting for receipt (up to 120s)...");
    
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      retries: 60,
    });
    
    console.log("Receipt:", JSON.stringify(receipt, null, 2));
    const addr = receipt.contract_address || receipt.contractAddress || "CHECK_RECEIPT";
    console.log("\n========================================");
    console.log("CONTRACT ADDRESS:", addr);
    console.log("========================================\n");
    
    fs.writeFileSync('deploy_status.json', JSON.stringify({
      wallet: account.address,
      status: 'deployed',
      txHash,
      contractAddress: addr,
      receipt,
    }, null, 2));
  } catch (e) {
    console.error("Deploy error:", e.message);
    fs.writeFileSync('deploy_status.json', JSON.stringify({
      wallet: account.address,
      status: 'error',
      error: e.message,
    }, null, 2));
  }
}

deploy();
