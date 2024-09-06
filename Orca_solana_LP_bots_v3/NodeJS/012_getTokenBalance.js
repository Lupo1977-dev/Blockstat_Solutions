// Script to read other balances from wallet
const solanaWeb3 = require("@solana/web3.js");
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

async function getBalance() {
  const SOLANA_URL_MAINNET = process.env.HELIUS_PROVIDER_URL;

  const connection = new solanaWeb3.Connection(SOLANA_URL_MAINNET);

  const walletKeyPair = solanaWeb3.Keypair.fromSecretKey(
    new Uint8Array(bs58.decode(process.env.WALLET_SECRET_1))
  );

  console.log("Public key: " + walletKeyPair.publicKey);
  let balanceWei = await connection.getBalance(walletKeyPair.publicKey);
  let balance = balanceWei / 1000000000;
  console.log("Balance: " + balance);

  const token_defs = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { name: "USDC", decimals: 6 },
  };

  const accounts = await connection.getTokenAccountsByOwner(
    walletKeyPair.publicKey,
    {
      programId: TOKEN_PROGRAM_ID,
    }
  );
  console.log("getTokenAccountsByOwner:", accounts);

  // Deserialize token account data
  for (let i = 0; i < accounts.value.length; i++) {
    const value = accounts.value[i];

    // Deserialize
    const parsed_token_account = unpackAccount(value.pubkey, value.account);
    // Use the mint address to determine which token account is for which token
    const mint = parsed_token_account.mint;
    const token_def = token_defs[mint.toBase58()];
    // Ignore non-devToken accounts
    if (token_def === undefined) continue;

    // The balance is "amount"
    const amount = parsed_token_account.amount;
    // The balance is managed as an integer value, so it must be converted for UI display
    const ui_amount = DecimalUtil.fromBN(
      new BN(amount.toString()),
      token_def.decimals
    );

    console.log(
      "TokenAccount:",
      value.pubkey.toBase58(),
      "\n  mint:",
      mint.toBase58(),
      "\n  name:",
      token_def.name,
      "\n  amount:",
      amount.toString(),
      "\n  ui_amount:",
      ui_amount.toString()
    );
  }
}

getBalance();
