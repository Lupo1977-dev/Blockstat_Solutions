// Uniswap bot to initialise concentrated liquidity v3 positions
// Based on available funds, desired price etc
// It uses Arbitrum mainnet and has the following steps
// Step 1: approve tokens for swapping and sending to LP
// Step 2: swap tokens 0 and 1 in order to get correct numbers for the LP
// Step 3: add liquidity to uniswap LP

// Declarations
const { ethers } = require("ethers");
const {
  abi: IUniswapV3PoolABI,
} = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json");
const {
  abi: SwapRouterABI,
} = require("@uniswap/v3-periphery/artifacts/contracts/interfaces/ISwapRouter.sol/ISwapRouter.json");
const { getPoolImmutables, getPoolState } = require("./helpers");
const ERC20ABI = require("./abi.json");
const JSBI = require("jsbi");
const aggregatorV3InterfaceABI = require("./abis/pricefeedABI.json");
const { Token } = require("@uniswap/sdk-core");
const { Pool, Position, nearestUsableTick } = require("@uniswap/v3-sdk");
const { TickMath, FullMath, TickList } = require("@uniswap/v3-sdk");
const {
  abi: INonfungiblePositionManagerABI,
} = require("@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json");
const { MintOptions, NonfungiblePositionManager } = require("@uniswap/v3-sdk");
const { Percent } = require("@uniswap/sdk-core");
const fs = require("node:fs");

// Token addresses Arbitrum Mainnet
const baseTokenCA = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // WETH
const quoteTokenCA = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // USDC
//const quoteToken = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' // USDCe

const decimalsBase = 1000000000000000000; // WETH
const decimalsQuote = 1000000; // USDC

// ARBITRUM MAINNET ZIE https://www.geckoterminal.com/arbitrum/pools/0xc31e54c7a869b9fcbecc14363cf510d1c41fa443
const poolAddress = "0xc6962004f452be9203591991d15f6b388e09e8d0";
const swapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const positionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // NonfungiblePositionManager

// Oracle price feed address voor ETH/USDC price
const addr = "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612";
let priceOracleETHUSDC = 0;
let fee = 3000;

// Be carefull:  UNI=>WETH or WETH=>UNI need to set this right for approval
const name0 = "Wrapped Ether";
const symbol0 = "WETH";
const decimals0 = 18;
const address0 = baseTokenCA;

const name1 = "USDC";
const symbol1 = "USDC";
const decimals1 = 6;
const address1 = quoteTokenCA;

const chainId = 42161; // Arbitrum mainnet
const BaseToken = new Token(chainId, address0, decimals0, symbol0, name0);
const quoteToken = new Token(chainId, address1, decimals1, symbol1, name1);

// Price range: here 90-110% of the current price
const minPriceFactor = 0.9;
const maxPriceFactor = 1.1;
let currentPrice = 0;
let minPrice = 0;
let maxPrice = 0;
let sqrtPriceX96 = 0;

// Share of funds to allocate as liquidity position
// Never use the full 100% (also due to rounding errors)
const factorInLP = 0.82;

// Gas settings
const setGasLimit = 3000000;
const setGasHigher = 1;

// Scenario that indicates which of the tokens is in excess for the LP
let scenario = 0;
let statusPoolContract = 1;

// Tracking noncenumber is important
let nonceNumber = 0;

// Wallet settings
require("dotenv").config();
const INFURA_URL_TESTNET = process.env.ARBITRUM_ALCHEMY_MAINNET2;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS2;
const WALLET_SECRET = process.env.WALLET_SECRET2;

const provider = new ethers.providers.JsonRpcProvider(INFURA_URL_TESTNET); // Goerli testnet

const wallet = new ethers.Wallet(WALLET_SECRET, provider);
const connectedWallet = wallet.connect(provider);

const ABI = ["function balanceOf(address account) view returns (uint256)"];

// Construct ethers contracts
const contractBaseToken = new ethers.Contract(baseTokenCA, ABI, provider);
const contractQuoteToken = new ethers.Contract(quoteTokenCA, ABI, provider);

const swapRouterContract = new ethers.Contract(
  swapRouterAddress,
  SwapRouterABI,
  provider
);

const NonfungiblePositionContract = new ethers.Contract(
  positionManagerAddress,
  IUniswapV3PoolABI,
  provider
);

let baseNonce = provider.getTransactionCount(WALLET_ADDRESS);
let nonceOffset = 0;

// Function to track nonce
function getNonce() {
  return baseNonce.then((nonce) => nonce + nonceOffset++);
}

/********* STEP 1: APPROVE TOKENS  **********/
// Function to approve the tokens for swapping and for depositing as LP
// You only need to approve once
async function approveContract(tokenContract) {
  let feeData = await provider.getFeeData();

  // provider.getGasPrice( ) ⇒ Promise< BigNumber > - Returns a best guess of the Gas Price to use in a transaction.
  const gasPrice = await provider.getGasPrice();
  //console.log(ethers.utils.formatUnits(gasPrice, "gwei"));

  let amountIn = 1e36;
  const approvalAmount = JSBI.BigInt(amountIn).toString();

  const approvalResponseSwap = await tokenContract
    .connect(connectedWallet)
    .approve(swapRouterAddress, approvalAmount, {
      maxFeePerGas: feeData.maxFeePerGas * setGasHigher,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * setGasHigher,
      gasLimit: setGasLimit,
      nonce: getNonce(),
    });

  const approvalResponseLP = await tokenContract
    .connect(connectedWallet)
    .approve(positionManagerAddress, approvalAmount, {
      maxFeePerGas: feeData.maxFeePerGas * setGasHigher,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * setGasHigher,
      gasLimit: setGasLimit,
      nonce: getNonce(),
    });
}

let tokenContract0 = new ethers.Contract(address0, ERC20ABI, provider);
let tokenContract1 = new ethers.Contract(address1, ERC20ABI, provider);

// Function to get the pool data
async function getPoolData(poolContract) {
  let [tickSpacing, fee, liquidity, slot0] = await Promise.all([
    poolContract.tickSpacing(),
    poolContract.fee(),
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  // Get the relevant Tick from etherscan: determines the price in V3
  tickPrice = slot0[1];
  sqrtPriceX96 = slot0[0];
  currentPrice = (Math.pow(1.0001, tickPrice) * decimalsBase) / decimalsQuote;

  console.log(tickPrice);

  return {
    tickSpacing: tickSpacing,
    fee: fee,
    liquidity: liquidity,
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
    tickPrice,
    sqrtPriceX96,
    currentPrice,
  };
}

const poolContract = new ethers.Contract(
  poolAddress,
  IUniswapV3PoolABI,
  provider
);

// Initialise price to read from Oracle
let ratioPoolOracleInRange = false;
let ratioPoolOracle = 0;

// Timer function
const timeOutFunction = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Get the prices from the pool contract and from an Oracle price feed
async function checkCondition() {
  // Prijzen wel steeds opnieuw inlezen
  await getPoolData(poolContract);

  // Price feed oracle
  const priceFeed = new ethers.Contract(
    addr,
    aggregatorV3InterfaceABI,
    provider
  );

  await priceFeed.latestRoundData().then((roundData) => {
    // Do something with roundData
    console.log("Latest Round Data", roundData);
    priceOracleETHUSDC = roundData.answer.toString() / 100000000;
  });

  //await setTimeout(5000);
  ratioPoolOracle = currentPrice / priceOracleETHUSDC;
  //ratioPoolOracle = 0.95
  console.log("Current price pools:" + currentPrice);
  console.log("Current price Oracle:" + priceOracleETHUSDC);
  console.log("Ratio price pool to oracle:" + ratioPoolOracle);
}

// Check whether the pool price is in line with the oracle price feed
async function checkResultCondition() {
  do {
    await checkCondition();
    if ((ratioPoolOracle > 0.97) & (ratioPoolOracle < 1.03)) {
      ratioPoolOracleInRange = true;
      console.log("Ratio price pool and oracle in line == SWAP TOKENS!");
    } else {
      await timeOutFunction(10000); // Even wachten
    }
  } while (ratioPoolOracleInRange == false);
}

/********* STEP 2: SWAP TOKENS  **********/
// Function to read the balance from the wallet
async function readBalance() {
  // Balance of ETH (used for gas fees)
  const balanceETH = await provider.getBalance(WALLET_ADDRESS);
  console.log("Balance ETH: " + balanceETH / decimalsBase);

  // Balance of Quote token
  const balanceInWei2 = await contractQuoteToken.balanceOf(WALLET_ADDRESS);
  const balanceQuoteToken =
    ethers.utils.formatEther(balanceInWei2) * (decimalsBase / decimalsQuote);

  console.log(`Balance ${name1}: ` + balanceQuoteToken);

  // Balance of Base token
  const balanceInWei3 = await contractBaseToken.balanceOf(WALLET_ADDRESS);
  const balanceBaseToken = ethers.utils.formatEther(balanceInWei3);
  console.log(`Balance ${name0}: ` + balanceBaseToken);

  await getPoolData(poolContract);
  let currentPriceETH = currentPrice;

  // Calculate the USD values of all the balances
  let currentValueUSD_tmp1 = Number(
    (balanceETH / decimalsBase) * currentPriceETH
  );
  let currentValueUSD_tmp2 = Number(Number(balanceQuoteToken * 1));
  let currentValueUSD_tmp3 = Number(balanceBaseToken * currentPriceETH);

  let currentValueUSD = (
    currentValueUSD_tmp1 +
    currentValueUSD_tmp2 +
    currentValueUSD_tmp3
  ).toFixed(2);

  const writeBalances = `Amount ETH:  ${
    balanceETH / decimalsBase
  }, Amount USDC:  ${balanceQuoteToken}, 
  Amount WETH:  ${balanceBaseToken},  and total USD value: ${currentValueUSD}`;

  // Write balances to txt file
  fs.writeFile("LOG_Uniswap_ARB_BOT_2.txt", writeBalances, "utf8", (err) => {
    if (err) {
      console.error(err);
    } else {
      // file written successfully
    }
  });

  // USD values
  currentPrice = currentPriceETH;
  console.log("current price: " + currentPrice);
  const usdValueWETH = balanceBaseToken * currentPrice;
  console.log(`USD value ${name0}: ` + usdValueWETH);
  console.log(`USD value ${name1}: ` + balanceQuoteToken);

  // Use formula uniswap to get amounts tokens 0 and 1 for LPs
  // These formulas can be found in de Uniswap V3 documentation!
  let amountUSDC = 1;
  let currentPriceInv = 1 / currentPrice;
  maxPrice = maxPriceFactor * currentPriceInv;
  minPrice = minPriceFactor * currentPriceInv;
  const Lx =
    (amountUSDC * Math.sqrt(currentPriceInv) * Math.sqrt(maxPrice)) /
    (Math.sqrt(maxPrice) - Math.sqrt(currentPriceInv));
  y = Lx * (Math.sqrt(currentPriceInv) - Math.sqrt(minPrice));
  console.log("Base needed to match 1 USDC in liquidity: " + y);

  // Derive the current factor
  let currentFactor = balanceBaseToken / balanceQuoteToken;
  console.log("Current factor for liquidity: " + currentFactor);

  let sellWETHAmount = 0;
  let sellUSDCAmount = 0;
  // if current factor > y ==> too less USDC so sell ETH for USDC
  if (currentFactor > y) {
    scenario = 1;
    sellWETHAmount = ((1 - y / currentFactor) / 2) * balanceBaseToken;
  }
  // if current factor <y ==> too much USDC so sell USDC for WETH
  else if (currentFactor < y) {
    scenario = 2;
    sellUSDCAmount = ((1 - currentFactor / y) / 2) * balanceQuoteToken;
  }

  console.log("sellWETHAmount: " + sellWETHAmount);
  console.log("sellUSDCAmount: " + sellUSDCAmount);

  // Het poolcontract bepaalt welke token 0 of 1 is!!
  const immutables = await getPoolImmutables(poolContract);
  console.log("immutables token0: " + immutables.token0);
  console.log("immutables token1: " + immutables.token1);

  //LET OP: poolcontract wordt niet goed bepaald: USDT = token 0 hier
  console.log("statusPoolContract: " + statusPoolContract);

  // Scenario determines which token is token0 and token1 in contract
  // Also depends on the defined poolcontract (statusPoolContract)
  let inputAmount = 0;
  let decimals = 0;
  if (statusPoolContract == 1) {
    if (scenario == 1) {
      tokenInput = immutables.token0;
      tokenOutput = immutables.token1;
      inputAmount = sellWETHAmount;
      decimals = decimals0;
    } else if (scenario == 2) {
      tokenInput = immutables.token1;
      tokenOutput = immutables.token0;
      inputAmount = sellUSDCAmount;
      decimals = decimals1;
    }
  } else if (statusPoolContract == 2) {
    if (scenario == 1) {
      tokenInput = immutables.token1;
      tokenOutput = immutables.token0;
      inputAmount = sellWETHAmount;
      decimals = decimals0;
    } else if (scenario == 2) {
      tokenInput = immutables.token0;
      tokenOutput = immutables.token1;
      inputAmount = sellUSDCAmount;
      decimals = decimals1;
    }
  }

  // Amount of token to put in LP
  const inputAmountDec = parseFloat(inputAmount).toFixed(decimals);

  // .001 => 1 000 000 000 000 000
  const amountIn = ethers.utils.parseUnits(inputAmountDec, decimals);

  console.log("inputAmount: " + inputAmount);
  console.log("inputAmountDec: " + inputAmountDec);
  console.log("amountIn: " + amountIn);

  nonceNumber = await provider.getTransactionCount(WALLET_ADDRESS);

  // Tracking potential high slippage is very important!
  // Watch out for pools with low liquidity ==> high slippage!
  const check = await checkResultCondition();
  let slippagePercentage = 1;
  let slippageFactor = 1 - slippagePercentage / 100;
  console.log("slippageFactor: " + slippageFactor);
  console.log("scenario: " + scenario);
  let setAmountOutMinimum = 0;
  if (scenario == 1) {
    setAmountOutMinimum = BigInt(
      parseInt(
        (amountIn * priceOracleETHUSDC * slippageFactor * decimalsQuote) /
          decimalsBase
      )
    );
  } else if (scenario == 2) {
    setAmountOutMinimum = BigInt(
      parseInt(
        ((amountIn / priceOracleETHUSDC) * slippageFactor * decimalsBase) /
          decimalsQuote
      )
    );
  }
  console.log("setAmountOutMinimum: " + setAmountOutMinimum);

  nonceNumber = await provider.getTransactionCount(WALLET_ADDRESS);

  // Define the params to send to smart contract
  const params = {
    tokenIn: tokenInput,
    tokenOut: tokenOutput,
    fee: immutables.fee,
    recipient: WALLET_ADDRESS,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10,
    amountIn: amountIn,
    amountOutMinimum: setAmountOutMinimum,
    sqrtPriceLimitX96: 0,
    nonce: getNonce(),
  };

  // Monitor fees and nonces
  let feeData = await provider.getFeeData();
  nonceNumber = await provider.getTransactionCount(WALLET_ADDRESS);

  // Send the transaction to swap tokens
  if (ratioPoolOracleInRange) {
    const transaction = await swapRouterContract
      .connect(connectedWallet)
      .exactInputSingle(params, {
        maxFeePerGas: feeData.maxFeePerGas * setGasHigher,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * setGasHigher,
        gasLimit: setGasLimit,
      })
      .then((transaction) => {
        console.log(transaction);
      });
  }

  // Creating and sending the transaction object
  nonceNumber = await provider.getTransactionCount(WALLET_ADDRESS);
}

/********* STEP 3: ADD LIQUIDITY  **********/
async function addLiquidity() {
  // Read balances
  const balanceETH = await provider.getBalance(WALLET_ADDRESS);
  console.log("Balance ETH: " + balanceETH / decimalsBase);

  const balanceInWei2 = await contractQuoteToken.balanceOf(WALLET_ADDRESS);
  const balanceQuoteToken =
    ethers.utils.formatEther(balanceInWei2) * (decimalsBase / decimalsQuote);

  console.log(`Balance ${name1}: ` + balanceQuoteToken);

  const balanceInWei3 = await contractBaseToken.balanceOf(WALLET_ADDRESS);
  const balanceBaseToken = ethers.utils.formatEther(balanceInWei3);
  console.log(`Balance ${name0}: ` + balanceBaseToken);

  // Get current pooldata
  const poolData = await getPoolData(poolContract);
  console.log("tickprice: " + tickPrice);
  console.log("sqrtPriceX96: " + sqrtPriceX96);

  let deadline = Math.floor(Date.now() / 1000 + 1800);
  console.log("currentPrice: " + currentPrice);

  let currentPriceInv = 1 / currentPrice;

  // Lower and higher tick determines the lower and higher prices in the price range
  // Here we follow the uniswap v3 documentation
  tickForLowerPrice = parseInt(
    Math.log((currentPrice * minPriceFactor * decimalsQuote) / decimalsBase) /
      Math.log(1.0001)
  );
  tickForHigherPrice = parseInt(
    Math.log((currentPrice * maxPriceFactor * decimalsQuote) / decimalsBase) /
      Math.log(1.0001)
  );
  let tickLower =
    nearestUsableTick(tickForLowerPrice, poolData.tickSpacing) -
    poolData.tickSpacing * 2;
  let tickUpper =
    nearestUsableTick(tickForHigherPrice, poolData.tickSpacing) +
    poolData.tickSpacing * 2;

  console.log("ticklower: " + tickLower);
  console.log("tickUpper: " + tickUpper);

  minPrice = minPriceFactor * currentPriceInv;
  maxPrice = maxPriceFactor * currentPriceInv;

  // What is the ratio of token 1 and 0 if we would supply 1 USDC
  let amountUSDC = 1;
  const Lx =
    (amountUSDC * Math.sqrt(currentPriceInv) * Math.sqrt(maxPrice)) /
    (Math.sqrt(maxPrice) - Math.sqrt(currentPriceInv));
  y = Lx * (Math.sqrt(currentPriceInv) - Math.sqrt(minPrice));

  let amount0DesiredTmp = parseInt(
    balanceBaseToken * factorInLP * decimalsBase
  );
  let amount1DesiredTmp = parseInt(
    (1 / y) * balanceBaseToken * factorInLP * decimalsQuote
  );

  let amount0Desired = BigInt(amount0DesiredTmp);
  let amount1Desired = BigInt(amount1DesiredTmp);

  console.log("amount0Desired: " + amount0Desired);
  console.log("amount1Desired: " + amount1Desired);

  let amount0Min = 0;
  let amount1Min = 0;

  // LP V3 position is a ERC-721 token: write this token to a txt file
  // If we save the ID we can always track the status
  const writePrice = `${currentPrice}`;
  fs.writeFile("PRICE_Uniswap_ARB_BOT2.txt", writePrice, (err) => {
    if (err) {
      console.error(err);
    } else {
      // file written successfully
    }
  });

  // Construct data to send to contract for LP
  const WETH_UNI_POOL = new Pool(
    quoteToken,
    BaseToken,
    poolData.fee,
    poolData.sqrtPriceX96.toString(),
    poolData.liquidity.toString(),
    poolData.tick
  );

  const amountWETH = balanceBaseToken * factorInLP;
  const amountWei = Math.trunc(amountWETH * decimalsBase);
  console.log("amount WETH in WEI: " + amountWei);

  const position = new Position.fromAmount0({
    pool: WETH_UNI_POOL,
    tickLower: tickLower,
    tickUpper: tickUpper,
    amount0: amountWei.toString(),
    useFullPrecision: true,
  });

  nonceNumber = await provider.getTransactionCount(WALLET_ADDRESS);
  console.log("Nonce: " + nonceNumber);

  const params2 = {
    recipient: WALLET_ADDRESS,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10,
    slippageTolerance: new Percent(50, 10_000),
  };

  // get calldata for minting a position
  const { calldata, value } = NonfungiblePositionManager.addCallParameters(
    position,
    params2
  );

  let feeData = await provider.getFeeData();
  console.log(feeData);

  // provider.getGasPrice( ) ⇒ Promise< BigNumber > - Returns a best guess of the Gas Price to use in a transaction.
  const gasPrice = await provider.getGasPrice();
  console.log(ethers.utils.formatUnits(gasPrice, "gwei"));

  // Execute transaction
  const transaction = {
    data: calldata,
    to: positionManagerAddress,
    value: value,
    from: WALLET_ADDRESS,
    maxFeePerGas: feeData.maxFeePerGas * setGasHigher,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * setGasHigher,
    gasLimit: setGasLimit,
    nonce: getNonce(),
  };

  nonceNumber = await provider.getTransactionCount(WALLET_ADDRESS);
  console.log("Nonce: " + nonceNumber);

  const wallet2 = new ethers.Wallet(WALLET_SECRET, provider);
  const txRes = await wallet2.sendTransaction(transaction);
}

// This function calls all the necessary functions to create LP
// All three steps (approve, swap and addliquidity) are called below
async function initialiseLP() {
  // Step 1: Approve tokens (only first time)
  approveContract(tokenContract0);
  approveContract(tokenContract1);

  // Step 2: read balances from wallet and buy the necessary tokens to create LP
  await readBalance();

  // Step 3: add liquidity
  setTimeout(addLiquidity, 10000);
  await addLiquidity();
}

initialiseLP();
