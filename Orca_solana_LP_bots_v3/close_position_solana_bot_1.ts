// Script to close my LP position in bot 1
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  swapQuoteByInputToken,
  PriceMath,
  IGNORE_CACHE,
  PoolUtil,
  WhirlpoolIx,
  increaseLiquidityQuoteByInputTokenWithParams,
  decreaseLiquidityQuoteByLiquidityWithParams,
} from "@orca-so/whirlpools-sdk";
import {
  Instruction,
  EMPTY_INSTRUCTION,
  resolveOrCreateATA,
  TransactionBuilder,
  Percentage,
  DecimalUtil,
} from "@orca-so/common-sdk";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from "@solana/spl-token";
import BN from "bn.js";

require("dotenv").config();

let positionAddressLP: string = "";

// Get position info from LP
async function getPositionInfo() {
  // Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(
    provider,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // Get all token accounts
  const token_accounts = (
    await ctx.connection.getTokenAccountsByOwner(ctx.wallet.publicKey, {
      programId: TOKEN_PROGRAM_ID,
    })
  ).value;

  // Get candidate addresses for the position
  const whirlpool_position_candidate_pubkeys = token_accounts
    .map((ta) => {
      const parsed = unpackAccount(ta.pubkey, ta.account);

      // Derive the address of Whirlpool's position from the mint address (whether or not it exists)
      const pda = PDAUtil.getPosition(ctx.program.programId, parsed.mint);

      // Returns the address of the Whirlpool position only if the number of tokens is 1 (ignores empty token accounts and non-NFTs)
      return new BN(parsed.amount.toString()).eq(new BN(1))
        ? pda.publicKey
        : undefined;
    })
    .filter((pubkey) => pubkey !== undefined);

  // Get data from Whirlpool position addresses
  const whirlpool_position_candidate_datas = await ctx.fetcher.getPositions(
    whirlpool_position_candidate_pubkeys,
    IGNORE_CACHE
  );
  // Leave only addresses with correct data acquisition as position addresses
  const whirlpool_positions = whirlpool_position_candidate_pubkeys.filter(
    (pubkey, i) => whirlpool_position_candidate_datas[i] !== null
  );

  // Output the status of the positions
  for (let i = 0; i < whirlpool_positions.length; i++) {
    const p = whirlpool_positions[i];

    // Get the status of the position
    const position = await client.getPosition(p);
    const data = position.getData();

    // Get the pool to which the position belongs
    const pool = await client.getPool(data.whirlpool);
    const token_a = pool.getTokenAInfo();
    const token_b = pool.getTokenBInfo();
    const price = PriceMath.sqrtPriceX64ToPrice(
      pool.getData().sqrtPrice,
      token_a.decimals,
      token_b.decimals
    );

    // Get the price range of the position
    const lower_price = PriceMath.tickIndexToPrice(
      data.tickLowerIndex,
      token_a.decimals,
      token_b.decimals
    );
    const upper_price = PriceMath.tickIndexToPrice(
      data.tickUpperIndex,
      token_a.decimals,
      token_b.decimals
    );

    // Calculate the amount of tokens that can be withdrawn from the position
    const amounts = PoolUtil.getTokenAmountsFromLiquidity(
      data.liquidity,
      pool.getData().sqrtPrice,
      PriceMath.tickIndexToSqrtPriceX64(data.tickLowerIndex),
      PriceMath.tickIndexToSqrtPriceX64(data.tickUpperIndex),
      true
    );

    // Output the status of the position
    positionAddressLP = p.toBase58();
    console.log("positionAddressLP:", positionAddressLP);

    console.log("position:", i, p.toBase58());
    console.log("\twhirlpool address:", data.whirlpool.toBase58());
    console.log("\twhirlpool price:", price.toFixed(token_b.decimals));
    console.log("\ttokenA:", token_a.mint.toBase58());
    console.log("\ttokenB:", token_b.mint.toBase58());
    console.log("\tliquidity:", data.liquidity.toString());
    console.log(
      "\tlower:",
      data.tickLowerIndex,
      lower_price.toFixed(token_b.decimals)
    );
    console.log(
      "\tupper:",
      data.tickUpperIndex,
      upper_price.toFixed(token_b.decimals)
    );
    console.log(
      "\tamountA:",
      DecimalUtil.fromBN(amounts.tokenA, token_a.decimals).toString()
    );
    console.log(
      "\tamountB:",
      DecimalUtil.fromBN(amounts.tokenB, token_b.decimals).toString()
    );
  }
}

// Close my LP position
async function closePostion() {
  // Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(
    provider,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // Retrieve the position address from the WHIRLPOOL_POSITION environment variable
  const position_address = positionAddressLP;

  const position_pubkey = new PublicKey(position_address);

  console.log("position address:", position_pubkey.toBase58());

  // Set acceptable slippage
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  // Get the position and the pool to which the position belongs
  const position = await client.getPosition(position_pubkey);

  const position_owner = ctx.wallet.publicKey;
  const position_token_account = getAssociatedTokenAddressSync(
    position.getData().positionMint,
    position_owner
  );
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const whirlpool_data = whirlpool.getData();

  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();

  // Get TickArray and Tick
  const tick_spacing = whirlpool.getData().tickSpacing;
  const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(
    position.getData().tickLowerIndex,
    tick_spacing,
    whirlpool_pubkey,
    ctx.program.programId
  ).publicKey;
  const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(
    position.getData().tickUpperIndex,
    tick_spacing,
    whirlpool_pubkey,
    ctx.program.programId
  ).publicKey;

  // Create token accounts to receive fees and rewards
  // Collect mint addresses of tokens to receive
  const tokens_to_be_collected = new Set<string>();
  tokens_to_be_collected.add(token_a.mint.toBase58());
  tokens_to_be_collected.add(token_b.mint.toBase58());
  whirlpool.getData().rewardInfos.map((reward_info) => {
    if (PoolUtil.isRewardInitialized(reward_info)) {
      tokens_to_be_collected.add(reward_info.mint.toBase58());
    }
  });
  // Get addresses of token accounts and get instructions to create if it does not exist
  const required_ta_ix: Instruction[] = [];
  const token_account_map = new Map<string, PublicKey>();
  for (let mint_b58 of tokens_to_be_collected) {
    const mint = new PublicKey(mint_b58);
    // If present, ix is EMPTY_INSTRUCTION
    const { address, ...ix } = await resolveOrCreateATA(
      ctx.connection,
      position_owner,
      mint,
      () => ctx.fetcher.getAccountRentExempt()
    );
    required_ta_ix.push(ix);
    token_account_map.set(mint_b58, address);
  }

  // Build the instruction to update fees and rewards
  let update_fee_and_rewards_ix = WhirlpoolIx.updateFeesAndRewardsIx(
    ctx.program,
    {
      whirlpool: position.getData().whirlpool,
      position: position_pubkey,
      tickArrayLower: tick_array_lower_pubkey,
      tickArrayUpper: tick_array_upper_pubkey,
    }
  );

  // Build the instruction to collect fees
  let collect_fees_ix = WhirlpoolIx.collectFeesIx(ctx.program, {
    whirlpool: whirlpool_pubkey,
    position: position_pubkey,
    positionAuthority: position_owner,
    positionTokenAccount: position_token_account,
    tokenOwnerAccountA: token_account_map.get(token_a.mint.toBase58()),
    tokenOwnerAccountB: token_account_map.get(token_b.mint.toBase58()),
    tokenVaultA: whirlpool.getData().tokenVaultA,
    tokenVaultB: whirlpool.getData().tokenVaultB,
  });

  // Build the instructions to collect rewards
  const collect_reward_ix = [
    EMPTY_INSTRUCTION,
    EMPTY_INSTRUCTION,
    EMPTY_INSTRUCTION,
  ];
  for (let i = 0; i < whirlpool.getData().rewardInfos.length; i++) {
    const reward_info = whirlpool.getData().rewardInfos[i];
    if (!PoolUtil.isRewardInitialized(reward_info)) continue;

    collect_reward_ix[i] = WhirlpoolIx.collectRewardIx(ctx.program, {
      whirlpool: whirlpool_pubkey,
      position: position_pubkey,
      positionAuthority: position_owner,
      positionTokenAccount: position_token_account,
      rewardIndex: i,
      rewardOwnerAccount: token_account_map.get(reward_info.mint.toBase58()),
      rewardVault: reward_info.vault,
    });
  }

  // Estimate the amount of tokens that can be withdrawn from the position
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    // Pass the pool state as is
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,
    // Pass the price range of the position as is
    tickLowerIndex: position.getData().tickLowerIndex,
    tickUpperIndex: position.getData().tickUpperIndex,
    // Liquidity to be withdrawn (All liquidity)
    liquidity: position.getData().liquidity,
    // Acceptable slippage
    slippageTolerance: slippage,
  });

  // Output the estimation
  console.log(
    "WSOL min output:",
    DecimalUtil.fromBN(quote.tokenMinA, token_a.decimals).toFixed(
      token_a.decimals
    )
  );
  console.log(
    "USDC min output:",
    DecimalUtil.fromBN(quote.tokenMinB, token_b.decimals).toFixed(
      token_b.decimals
    )
  );

  // Create instructions to add priority fee
  const estimated_compute_units = 600_000; // ~ 1_400_000 CU
  const additional_fee_in_lamports = 10_000; // 0.00001 SOL

  // 1 microLamport = 0.000001 lamports
  // 1 Lamport = 1 000 000 microlamports

  const extra_factor = 100000;
  // 10 000 * 10 000 = 100 miljoen
  // Dat x10  =  1 miljard microlamports = 1000 lamport = 0.000001 SOL
  // Dat x1000 0.0001 SOL
  // Dat x100000 0.01 SOL

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

  // Build the instruction to decrease liquidity
  const decrease_liquidity_ix = WhirlpoolIx.decreaseLiquidityIx(ctx.program, {
    ...quote,
    whirlpool: whirlpool_pubkey,
    position: position_pubkey,
    positionAuthority: position_owner,
    positionTokenAccount: position_token_account,
    tokenOwnerAccountA: token_account_map.get(token_a.mint.toBase58()),
    tokenOwnerAccountB: token_account_map.get(token_b.mint.toBase58()),
    tokenVaultA: whirlpool.getData().tokenVaultA,
    tokenVaultB: whirlpool.getData().tokenVaultB,
    tickArrayLower: tick_array_lower_pubkey,
    tickArrayUpper: tick_array_upper_pubkey,
  });

  // Build the instruction to close the position
  const close_position_ix = WhirlpoolIx.closePositionIx(ctx.program, {
    position: position_pubkey,
    positionAuthority: position_owner,
    positionTokenAccount: position_token_account,
    positionMint: position.getData().positionMint,
    receiver: position_owner,
  });

  // Create a transaction and add the instruction
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  // Create token accounts
  required_ta_ix.map((ix) => tx_builder.addInstruction(ix));
  tx_builder
    // Update fees and rewards, collect fees, and collect rewards
    .addInstruction(update_fee_and_rewards_ix)
    .addInstruction(collect_fees_ix)
    .addInstruction(collect_reward_ix[0])
    .addInstruction(collect_reward_ix[1])
    .addInstruction(collect_reward_ix[2])
    // Decrease liquidity
    .addInstruction(decrease_liquidity_ix)
    // Close the position
    .addInstruction(close_position_ix);

  tx_builder.prependInstruction({
    instructions: [set_compute_unit_limit_ix, set_compute_unit_price_ix],
    cleanupInstructions: [],
    signers: [],
  });

  // Send the transaction
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction(
    { signature, ...latest_blockhash },
    "confirmed"
  );
}

// Main function to get position info and close its position
async function main() {
  await getPositionInfo();
  await closePostion();
}
main();
