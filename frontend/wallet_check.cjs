// Get wallet address and check balance
const { createAccount } = require('genlayer-js');
const acct = createAccount('0x9f7f6fe586524622fba9996376aaab6fac5ccf183178b31d4e471664474784a6');
const addr = acct.address;
const fs = require('fs');

async function main() {
  const res = await fetch("https://rpc-bradbury.genlayer.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }),
  });
  const json = await res.json();
  const bal = BigInt(json.result || "0x0");
  
  const out = [
    "WALLET_ADDRESS=" + addr,
    "BALANCE_WEI=" + bal.toString(),
    "BALANCE_GEN=" + (Number(bal) / 1e18).toFixed(6),
  ].join("\n");
  
  fs.writeFileSync("wallet_check.txt", out);
  console.log(out);
}
main().catch(e => { fs.writeFileSync("wallet_check.txt", "ERROR=" + e.message); console.log("ERROR=" + e.message); });
