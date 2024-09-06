// Script to open a LP position for my first bot on Orca DEX
import {
  Keypair,
  Connection,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import { unpackAccount } from "@solana/spl-token";
import BN from "bn.js";
import secret from "./wallet.json";
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  swapQuoteByInputToken,
  PriceMath,
  IGNORE_CACHE,
  increaseLiquidityQuoteByInputTokenWithParams,
} from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";

const RPC_ENDPOINT_URL =
  "https://solana-mainnet.g.alchemy.com/v2/28XmI1hi-553lJyyC8Q7Ese54EyEmXyp";
const COMMITMENT = "confirmed";

require("dotenv").config();

const PRIORITY_RATE = 100; // MICRO_LAMPORTS
const SEND_AMT = 0.01 * LAMPORTS_PER_SOL;
const PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: PRIORITY_RATE,
});

// Declare variables
let currentPrice = 0;
let maxPrice = 0;
let minPrice = 0;
let maxPriceFactor = 1.1;
let minPriceFactor = 0.9;
let balanceBaseToken = 0;
let balanceQuoteToken = 0;
let sellSOLAmount = 0;
let sellUSDCAmount = 0;
let scenario = 0;
let factorInLP = 0.9;

// Create WhirlpoolClient
const provider = AnchorProvider.env();
const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
const client = buildWhirlpoolClient(ctx);

const SOL = {
  mint: new PublicKey("So11111111111111111111111111111111111111112"),
  decimals: 9,
};
const USDC = {
  mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  decimals: 6,
};

// WhirlpoolsConfig account
// devToken ecosystem / Orca Whirlpools
const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey(
  "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ"
);

// Get USDC/SOL whirlpool
const tick_spacing = 64;
const whirlpool_pubkey = PDAUtil.getWhirlpool(
  ORCA_WHIRLPOOL_PROGRAM_ID,
  DEVNET_WHIRLPOOLS_CONFIG,
  SOL.mint,
  USDC.mint,
  tick_spacing
).publicKey;

async function getBalance() {
  // Initialize a connection to the RPC and read in private key
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  //console.log("endpoint:", connection.rpcEndpoint);
  //console.log("wallet pubkey:", keypair.publicKey.toBase58());

  //const USDC_ADDY = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  //const SOL_ADDY = "So11111111111111111111111111111111111111112";

  // https://everlastingsong.github.io/nebula/
  // devToken specification
  const token_defs = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { name: "USDC", decimals: 6 },
    So11111111111111111111111111111111111111112: { name: "SOL", decimals: 9 },
  };

  // Obtain the SOL balance
  // Use the getBalance method from the Connection class
  const sol_balance = await connection.getBalance(keypair.publicKey);

  // Obtain the token accounts from the wallet's public key
  //
  // {
  //   context: { apiVersion: '1.10.24', slot: 140791186 },
  //   value: [
  //     { account: [Object], pubkey: [PublicKey] },
  //     { account: [Object], pubkey: [PublicKey] },
  //     { account: [Object], pubkey: [PublicKey] },
  //     { account: [Object], pubkey: [PublicKey] }
  //   ]
  // }
  const accounts = await connection.getTokenAccountsByOwner(keypair.publicKey, {
    programId: TOKEN_PROGRAM_ID,
  });
  //console.log("getTokenAccountsByOwner:", accounts);

  // Deserialize token account data
  for (let i = 0; i < accounts.value.length; i++) {
    const value = accounts.value[i];

    // Deserialize
    const parsed_token_account = unpackAccount(value.pubkey, value.account);
    // Use the mint address to determine which token account is for which token
    const mint = parsed_token_account.mint;
    const token_def = token_defs[mint.toBase58()];
    //console.log(token_def);

    // Ignore non-devToken accounts
    if (token_def === undefined) continue;

    // The balance is "amount"
    const amount = parsed_token_account.amount;
    // The balance is managed as an integer value, so it must be converted for UI display
    const ui_amount = DecimalUtil.fromBN(
      new BN(amount.toString()),
      token_def.decimals
    );

    if (token_def.name == "SOL") {
      balanceBaseToken = sol_balance / 1000000000;
    } else if (token_def.name == "USDC") {
      balanceQuoteToken = Number(ui_amount);
    }
  }
}

// Get price information
async function getPrice() {
  const whirlpool = await client.getPool(whirlpool_pubkey);

  // Get the current price of the pool
  const sqrt_price_x64 = whirlpool.getData().sqrtPrice;
  const price = PriceMath.sqrtPriceX64ToPrice(
    sqrt_price_x64,
    SOL.decimals,
    USDC.decimals
  );

  currentPrice = Number(price);
}

// Use formula uniswap V3 (see documentation) to get amounts tokens 0 and 1 for LPs
async function calculateAmount() {
  let amountUSDC = 1;
  let y = 0;
  console.log("Current price: " + currentPrice);

  maxPrice = maxPriceFactor * currentPrice;
  minPrice = minPriceFactor * currentPrice;
  const Lx =
    (amountUSDC * Math.sqrt(currentPrice) * Math.sqrt(maxPrice)) /
    (Math.sqrt(maxPrice) - Math.sqrt(currentPrice));
  y = Lx * (Math.sqrt(currentPrice) - Math.sqrt(minPrice));
  console.log("Sol needed to match 1 USDC in liquidity: " + y);

  console.log("balanceBaseToken: " + balanceBaseToken);
  console.log("balanceQuoteToken: " + balanceQuoteToken);

  // Derive the current factor
  let currentFactor = balanceQuoteToken / balanceBaseToken;
  console.log("Current factor for liquidity: " + currentFactor);

  // if current factor > y ==> te weinig USDT dus sell WBNB voor USDT
  if (currentFactor > y) {
    sellUSDCAmount = ((1 - y / currentFactor) / 2) * balanceQuoteToken;
    scenario = 1;
  }
  // if current factor <y ==> te veel USDT dus sell USDT voor WBNB
  else if (currentFactor < y) {
    sellSOLAmount = ((1 - currentFactor / y) / 2) * balanceBaseToken;
    scenario = 2;
  }

  console.log("sellSOLAmount: " + sellSOLAmount);
  console.log("sellUSDCAmount: " + sellUSDCAmount);
}

// Exectute SWAP to get right amounts to create LP
async function executeSwap() {
  const whirlpool = await client.getPool(whirlpool_pubkey);

  let amount_in = new Decimal("0");
  let coinMint;
  let decimalMint;

  if (scenario == 1) {
    // Swap USDC for SOL
    //amount_in = new Decimal("400" /* USDC */);
    amount_in = new Decimal(sellUSDCAmount);
    coinMint = USDC.mint;
    decimalMint = DecimalUtil.toBN(amount_in, USDC.decimals);
  } else if (scenario == 2) {
    // Swap SOL for USDC
    //const amount_in = new Decimal("400" /* USDC */);
    amount_in = new Decimal(sellSOLAmount);
    coinMint = SOL.mint;
    decimalMint = DecimalUtil.toBN(amount_in, SOL.decimals);
  }

  // Obtain swap estimation (run simulation)
  const quote = await swapQuoteByInputToken(
    whirlpool,
    // Input token and amount
    coinMint,
    decimalMint,
    // Acceptable slippage (10/1000 = 1%)
    Percentage.fromFraction(10, 1000),
    ctx.program.programId,
    ctx.fetcher,
    IGNORE_CACHE
  );

  /*
  // Output the estimation
  console.log(
    "estimatedAmountIn:",
    DecimalUtil.fromBN(quote.estimatedAmountIn, USDC.decimals).toString(),
    "USDC"
  );
  console.log(
    "estimatedAmountOut:",
    DecimalUtil.fromBN(quote.estimatedAmountOut, SOL.decimals).toString(),
    "SOL"
  );
  console.log(
    "otherAmountThreshold:",
    DecimalUtil.fromBN(quote.otherAmountThreshold, SOL.decimals).toString(),
    "SOL"
  );
  */

  // Create instructions to add priority fee
  const estimated_compute_units = 600_000; // ~ 1_400_000 CU
  const additional_fee_in_lamports = 10_000; // 0.00001 SOL

  // 1 microLamport = 0.000001 lamports
  // 1 Lamport = 1 000 000 microlamports

  const extra_factor = 10000;

  const set_compute_unit_price_ix = ComputeBudgetProgram.setComputeUnitPrice({
    // Specify how many micro lamports to pay in addition for 1 CU
    microLamports: Math.floor(
      (additional_fee_in_lamports * 10_000 * extra_factor) /
        estimated_compute_units
    ),
  });
  const set_compute_unit_limit_ix = ComputeBudgetProgram.setComputeUnitLimit({
    // To determine the Solana network fee at the start of the transaction, explicitly specify CU
    // If not specified, it will be calculated automatically. But it is almost always specified
    // because even if it is estimated to be large, it will not be refunded
    units: estimated_compute_units,
  });

  // Add instructions to the beginning of the transaction
  const tx = await whirlpool.swap(quote);
  tx.prependInstruction({
    instructions: [set_compute_unit_limit_ix, set_compute_unit_price_ix],
    cleanupInstructions: [],
    signers: [],
  });

  // Send the transaction
  const signature = await tx.buildAndExecute();
  console.log("signature:", signature);

  // Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction(
    { signature, ...latest_blockhash },
    "confirmed"
  );
}

// Add liquidity
async function addLiquidity() {
  const lower_price = new Decimal(Number(minPrice));
  const upper_price = new Decimal(Number(maxPrice));

  console.log("Lower price: " + lower_price);
  console.log("Upper price: " + upper_price);

  console.log("balanceBaseToken:" + balanceBaseToken);
  console.log("balanceQuoteToken:" + balanceQuoteToken);

  const amountToLp = balanceQuoteToken * factorInLP;

  const usdc_amount = DecimalUtil.toBN(new Decimal(amountToLp), USDC.decimals);
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  // Adjust price range (not all prices can be set, only a limited number of prices are available for range specification)
  // (prices corresponding to InitializableTickIndex are available)
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const whirlpool_data = whirlpool.getData();
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();
  const lower_tick_index = PriceMath.priceToInitializableTickIndex(
    lower_price,
    token_a.decimals,
    token_b.decimals,
    whirlpool_data.tickSpacing
  );
  const upper_tick_index = PriceMath.priceToInitializableTickIndex(
    upper_price,
    token_a.decimals,
    token_b.decimals,
    whirlpool_data.tickSpacing
  );
  console.log("lower & upper tick_index:", lower_tick_index, upper_tick_index);
  console.log(
    "lower & upper price:",
    PriceMath.tickIndexToPrice(
      lower_tick_index,
      token_a.decimals,
      token_b.decimals
    ).toFixed(token_b.decimals),
    PriceMath.tickIndexToPrice(
      upper_tick_index,
      token_a.decimals,
      token_b.decimals
    ).toFixed(token_b.decimals)
  );

  // Obtain deposit estimation
  const quote = increaseLiquidityQuoteByInputTokenWithParams({
    // Pass the pool definition and state
    tokenMintA: token_a.mint,
    tokenMintB: token_b.mint,
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,
    // Price range
    tickLowerIndex: lower_tick_index,
    tickUpperIndex: upper_tick_index,
    // Input token and amount
    inputTokenMint: USDC.mint,
    inputTokenAmount: usdc_amount,
    // Acceptable slippage
    slippageTolerance: slippage,
  });

  // Output the estimation
  console.log(
    "WSOL max input:",
    DecimalUtil.fromBN(quote.tokenMaxA, token_a.decimals).toFixed(
      token_a.decimals
    )
  );
  console.log(
    "USDC max input:",
    DecimalUtil.fromBN(quote.tokenMaxB, token_b.decimals).toFixed(
      token_b.decimals
    )
  );

  // Create instructions to add priority fee
  const estimated_compute_units = 300_000; // ~ 1_400_000 CU
  const additional_fee_in_lamports = 10_000; // 0.001 SOL

  const set_compute_unit_price_ix = ComputeBudgetProgram.setComputeUnitPrice({
    // Specify how many micro lamports to pay in addition for 1 CU
    microLamports: Math.floor(
      (additional_fee_in_lamports * 1_000_000_000) / estimated_compute_units
    ),
  });
  const set_compute_unit_limit_ix = ComputeBudgetProgram.setComputeUnitLimit({
    // To determine the Solana network fee at the start of the transaction, explicitly specify CU
    // If not specified, it will be calculated automatically. But it is almost always specified
    // because even if it is estimated to be large, it will not be refunded
    units: estimated_compute_units,
  });

  // Create a transaction
  // Use openPosition method instead of openPositionWithMetadata method
  const open_position_tx = await whirlpool.openPosition(
    lower_tick_index,
    upper_tick_index,
    quote
  );

  open_position_tx.tx.prependInstruction({
    instructions: [set_compute_unit_limit_ix, set_compute_unit_price_ix],
    cleanupInstructions: [],
    signers: [],
  });

  // Send the transaction
  const signature = await open_position_tx.tx.buildAndExecute();
  console.log("signature:", signature);
  console.log("position NFT:", open_position_tx.positionMint.toBase58());

  // Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction(
    { signature, ...latest_blockhash },
    "confirmed"
  );
}

// Main function to open a LP position
// 1: get balance
// 2: get price info
// 3: calculate amount token 0 and 1 needed for LP
// 4: add liquidity
async function main() {
  await getBalance();
  await getPrice();
  await calculateAmount();
  //await executeSwap();
  await addLiquidity();
}
main();
