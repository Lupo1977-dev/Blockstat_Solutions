// Script to build whirlpool clients
const { AnchorProvider } = require("@coral-xyz/anchor");
const solanaWeb3 = require("@solana/web3.js");
const {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
} = require("@orca-so/whirlpools-sdk");

require("dotenv").config();

const SOLANA_URL_MAINNET = process.env.SOLANA_URL;

const connection = new solanaWeb3.Connection(SOLANA_URL_MAINNET);

async function main() {
  const provider = SOLANA_URL_MAINNET;

  const ctx = WhirlpoolContext.withProvider(
    provider,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );

  const client = buildWhirlpoolClient(ctx);

  console.log("client:", client);
}

main();
