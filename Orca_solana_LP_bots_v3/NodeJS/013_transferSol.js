// Script to transfer SOL to other wallet
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
const BN = require("bn.js");

require("dotenv").config();

// Function to transfer SOL
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

  // SOL destination addresss
  const dest_pubkey = "Gkn9sNiDPyJM7ZB27WQS1R6vkH8nhRFUtNoTaDqbemvy";

  // Amount to send
  const amount = 10_000_00; // lamports = 0.001 SOL

  // Build the instruction to send SOL
  const transfer_ix = SystemProgram.transfer({
    fromPubkey: walletKeyPair.publicKey,
    toPubkey: dest_pubkey,
    lamports: amount,
  });

  // Create a transaction and add the instruction
  const tx = new Transaction();
  tx.add(transfer_ix);

  // Send the transaction
  const signers = [walletKeyPair];
  //console.log(solanaWeb3);
  const signature = await connection.sendTransaction(tx, signers);
  console.log("signature:", signature);

  // Wait for the transaction to complete
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest_blockhash });
}

transferSol();
