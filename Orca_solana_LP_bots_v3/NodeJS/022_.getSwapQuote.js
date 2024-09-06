// Script to get the Swap quote
const solanaWeb3 = require("@solana/web3.js");
const { AnchorProvider } = require("@coral-xyz/anchor");
const { DecimalUtil, Percentage } = require("@orca-so/common-sdk");
const {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  swapQuoteByInputToken,
  IGNORE_CACHE,
} = require("@orca-so/whirlpools-sdk");
const Decimal = require("decimal.js");

require("dotenv").config();
const connection = new solanaWeb3.Connection(process.env.ANCHOR_PROVIDER_URL);
const wallet = process.env.WALLET_ADDRESS_1;

// Main function here
async function main() {
  const provider = new AnchorProvider(connection, wallet);

  const ctx = WhirlpoolContext.withProvider(
    provider,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );

  const client = buildWhirlpoolClient(ctx);
  //console.log(client);

  //console.log(ctx.provider.connection.rpcEndpoint);

  // WSOL token
  const WSOL = {
    mint: new solanaWeb3.PublicKey(
      "So11111111111111111111111111111111111111112"
    ),
    decimals: 9,
  };

  // USDC token
  const USDC = {
    mint: new solanaWeb3.PublicKey(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    ),
    decimals: 6,
  };

  // WhirlpoolsConfig account
  // devToken ecosystem / Orca Whirlpools
  const MAINNET_WHIRLPOOLS_CONFIG = new solanaWeb3.PublicKey(
    "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ"
  );

  // Get WSOL/USDC whirlpool
  // Whirlpools are identified by 5 elements (Program, Config, mint address of the 1st token,
  // mint address of the 2nd token, tick spacing), similar to the 5 column compound primary key in DB
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
    ORCA_WHIRLPOOL_PROGRAM_ID,
    MAINNET_WHIRLPOOLS_CONFIG,
    WSOL.mint,
    USDC.mint,
    tick_spacing
  ).publicKey;

  //console.log("whirlpool_key:", whirlpool_pubkey.toBase58());

  const whirlpool = await client.getPool(whirlpool_pubkey);

  // Swap 1 devUSDC for devSAMO
  const amount_in = new Decimal("1" /* devUSDC */);

  // Obtain swap estimation (run simulation)
  const quote = await swapQuoteByInputToken(
    whirlpool,
    // Input token and amount
    USDC.mint,
    DecimalUtil.toBN(amount_in, USDC.decimals),
    // Acceptable slippage (10/1000 = 1%)
    Percentage.fromFraction(10, 1000),
    ctx.program.programId,
    ctx.fetcher,
    IGNORE_CACHE
  );

  // Output the estimation
  console.log(
    "estimatedAmountIn:",
    DecimalUtil.fromBN(quote.estimatedAmountIn, USDC.decimals).toString(),
    "USDC"
  );
  console.log(
    "estimatedAmountOut:",
    DecimalUtil.fromBN(quote.estimatedAmountOut, WSOL.decimals).toString(),
    "WSOL"
  );
  console.log(
    "otherAmountThreshold:",
    DecimalUtil.fromBN(quote.otherAmountThreshold, WSOL.decimals).toString(),
    "WSOL"
  );
}

main();
