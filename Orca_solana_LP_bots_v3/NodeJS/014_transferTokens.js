// Script to send other tokens (other than SOL)
const solanaWeb3 = require("@solana/web3.js");
const {
  Keypair,
  Connection,
  SystemProgram,
  PublicKey,
  Transaction,
} = require("@solana/web3.js");
const bs58 = require("bs58");
const { AnchorProvider } = require("@coral-xyz/anchor");
const {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  PriceMath,
} = require("@orca-so/whirlpools-sdk");

const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { DecimalUtil } = require("@orca-so/common-sdk");
const { unpackAccount } = require("@solana/spl-token");
const { resolveOrCreateATA, ZERO } = require("@orca-so/common-sdk");
const BN = require("bn.js");
const {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
} = require("@solana/spl-token");

const whirlpoolsABI = require("@orca-so/whirlpools-sdk");

require("dotenv").config();

// Function to transfer tokens
async function transferSol() {
  const SOLANA_URL_MAINNET = process.env.SOLANA_URL;

  const connection = new solanaWeb3.Connection(SOLANA_URL_MAINNET);

  const walletKeyPair = solanaWeb3.Keypair.fromSecretKey(
    new Uint8Array(bs58.decode(process.env.WALLET_SECRET_1))
  );

  console.log("Public key: " + walletKeyPair.publicKey);
  let balanceWei = await connection.getBalance(walletKeyPair.publicKey);
  let balance = balanceWei / 1000000000;
  console.log("Balance: " + balance);

  // USDC
  const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const USDC_DECIMALS = 6;

  // SOL destination addresss
  const dest_pubkey = new PublicKey(
    "Gkn9sNiDPyJM7ZB27WQS1R6vkH8nhRFUtNoTaDqbemvy"
  );

  // Amount to send
  const amount = 10000; // equals = 0.1 USDC

  // Obtain the associated token account from the source wallet
  const src_token_account = getAssociatedTokenAddressSync(
    USDC,
    walletKeyPair.publicKey
  );

  // Obtain the associated token account for the destination wallet.
  const { address: dest_token_account, ...create_ata_ix } =
    await resolveOrCreateATA(
      connection,
      dest_pubkey,
      USDC,
      () => connection.getMinimumBalanceForRentExemption(AccountLayout.span),
      ZERO,
      walletKeyPair.publicKey
    );

  // Create the instruction to send USDC
  const transfer_ix = createTransferCheckedInstruction(
    src_token_account,
    USDC,
    dest_token_account,
    walletKeyPair.publicKey,
    amount,
    USDC_DECIMALS,
    [],
    TOKEN_PROGRAM_ID
  );

  // Create the transaction and add the instruction
  const tx = new Transaction();

  // Create the destination associated token account (if needed)
  create_ata_ix.instructions.map((ix) => tx.add(ix));
  // Send USDC
  tx.add(transfer_ix);

  // Send the transaction
  const signers = [walletKeyPair];
  const signature = await connection.sendTransaction(tx, signers);
  console.log("signature:", signature);

  // Wait for the transaction to be confirmed
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest_blockhash });
}

transferSol();
