// Script to initialise concentrated liquidity V3 position
// This script is for BOT_4 which is on Pancakeswap and the BASE chain
const { Web3 } = require("web3");
const { ethers } = require("ethers");
const {
  ChainId,
  Token,
  TokenAmount,
  Fetcher,
  Pair,
  Route,
  Trade,
  TradeType,
  Percent,
} = require("@pancakeswap-libs/sdk");
const { JsonRpcProvider } = require("@ethersproject/providers");
const { getPoolImmutables, getPoolState } = require("./helpers");
const ERC20ABI = require("./abis/erc20.json");
const ERC721ABI = require("./abis/erc721.json");
const JSBI = require("jsbi");
const aggregatorV3InterfaceABI = require("./abis/pricefeedABI.json");
const {
  NonfungiblePositionManager,
  quoterABI,
} = require("@pancakeswap/v3-sdk");
const {
  INonfungiblePositionManagerABI,
} = require("./abis/NonfungiblePositionManager.json");
const { TickMath, FullMath, TickList } = require("@pancakeswap/v3-sdk");
const { Pool, Position, nearestUsableTick } = require("@pancakeswap/v3-sdk");
const fs = require("node:fs");

const artifacts = {
  INonfungiblePositionManager: require("./abis/NonfungiblePositionManager.json"),
};

const smartRouterAbi = require("./abis/pancakeSmartRouter.json");
const factoryAbi = require("./abis/pancakeSwapFactory.json");
const pancakeV3PoolABI = require("./abis/IPancakeV3Pool.json");

require("dotenv").config();
const WALLET_ADDRESS = process.env.WALLET_ADDRESS_PCS_1;
const WALLET_SECRET = process.env.WALLET_SECRET_PCS_1;

// Token addresses BSC Mainnet
const baseTokenCA = "0x55d398326f99059ff775485246999027b3197955"; // USDT
const quoteTokenCA = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"; // WBNB
const cakeToken = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"; // CAKE

const decimalsBase = 1000000000000000000; // USDT
const decimalsQuote = 1000000000000000000; // WBNB

// Oracle price feed address voor BTC/BNB price
const addr = "0xD5c40f5144848Bd4EF08a9605d860e727b991513";
let priceOracleBNBUSDT = 0;

let poolAddress = 0;
let poolContract;
let fee = 100;
let feeSwap = 100;
let feeCake = 500;

// Pancakeswap addresses:
const poolAddress1 = "0x36696169c63e42cd08ce11f5deebbcebae652050"; // fee 500
const poolAddress2 = "0x172fcd41e0913e95784454622d1c3724f546f849"; // fee 100
const positionManagerAddress = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364"; // NonfungiblePositionManager
const PancakeV3Factory = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const swapRouterAddress = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
const masterChefV3 = "0x556B9306565093C855AEA9AE92A594704c2Cd59e";
const poolAddressCake = "0x7f51c8aaa6b0599abd16674e2b17fec7a9f674a1";

// Define token 0 and token 1 (check with poolcontract)
const name0 = "USDT";
const symbol0 = "USDT";
const decimals0 = 18;
const address0 = baseTokenCA;

const name1 = "Wrapped BNB";
const symbol1 = "WBNB";
const decimals1 = 18;
const address1 = quoteTokenCA;

const chainId = 56; // Binance Smart Chain mainnet
const BaseToken = new Token(chainId, address0, decimals0, symbol0, name0);
const quoteToken = new Token(chainId, address1, decimals1, symbol1, name1);

// Initialise variables
const minPriceFactor = 0.9;
const maxPriceFactor = 1.1;
let currentPrice = 0;
let currentPriceCake = 0;
let minPrice = 0;
let maxPrice = 0;
let sqrtPriceX96 = 0;

// Constant which show how much of the funds you want to put in LP

// Gas settings
const setGasLimit = 3000000;
const setGasHigher = 2;

// Scenario dummy
let scenario = 0;
let statusPoolContract = 1;
let nonceNumber = 0;

const provider = new ethers.providers.JsonRpcProvider(
  "https://bsc-dataseed1.binance.org:443"
);

const wallet = new ethers.Wallet(WALLET_SECRET, provider);
const connectedWallet = wallet.connect(provider);

const ABI = ["function balanceOf(address account) view returns (uint256)"];

// Create contract instances with ethers.js
const contractBaseToken = new ethers.Contract(baseTokenCA, ABI, provider);
const contractQuoteToken = new ethers.Contract(quoteTokenCA, ABI, provider);
const contractCakeToken = new ethers.Contract(cakeToken, ABI, provider);

const swapRouterContract = new ethers.Contract(
  swapRouterAddress,
  smartRouterAbi,
  provider
);

const NonfungiblePositionContract = new ethers.Contract(
  positionManagerAddress,
  artifacts.INonfungiblePositionManager,
  provider
);

const poolContractCake = new ethers.Contract(
  poolAddressCake,
  pancakeV3PoolABI,
  provider
);

// Nonce
let baseNonce = provider.getTransactionCount(WALLET_ADDRESS);
let nonceOffset = 0;
function getNonce() {
  return baseNonce.then((nonce) => nonce + nonceOffset++);
}

// Function to approve the tokens for swapping and depositing in LP
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

// Get poolcontract data
async function getPoolData(poolContract) {
  let [tickSpacing, fee, liquidity, slot0] = await Promise.all([
    poolContract.tickSpacing(),
    poolContract.fee(),
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  // Get the relevant Tick from etherscan
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

const poolContract1 = new ethers.Contract(
  poolAddress1,
  pancakeV3PoolABI,
  provider
);
const poolContract2 = new ethers.Contract(
  poolAddress2,
  pancakeV3PoolABI,
  provider
);

let ratioPoolOracleInRange = false;
let ratioPoolOracle = 0;

// Timer function
const timeOutFunction = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Read current prices from Oracle price feed
// In order to check if pool in the DEX is in line with the Oracle's price
async function checkCondition() {
  // Read current price
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
    priceOracleETHBTC = roundData.answer.toString() / decimalsBase;
  });

  //await setTimeout(5000);
  ratioPoolOracle = currentPrice / priceOracleETHBTC;
  //ratioPoolOracle = 0.95
  console.log("Current price pools:" + currentPrice);
  console.log("Current price Oracle:" + priceOracleETHBTC);
  console.log("Ratio price pool to oracle:" + ratioPoolOracle);
}
// Compare price from Oracle with price at Pancakeswap
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

// Function to read balances

async function determinePoolLiq() {
  // Check liquidity of both pools
  const poolData1 = await getPoolData(poolContract1);
  const poolData2 = await getPoolData(poolContract2);

  const amountUSDT_1 = await contractBaseToken.balanceOf(poolAddress1);
  const USDTinUSD_1 = Number(amountUSDT_1 / decimalsBase) * 1;
  console.log("USDTinUSD pool 1: " + Number(USDTinUSD_1));

  const amountWBNB_1 = await contractQuoteToken.balanceOf(poolAddress1);
  const WBNBinUSD_1 = Number(amountWBNB_1 / decimalsBase) * (1 / currentPrice);
  console.log("WBNBinUSD pool 1: " + Number(WBNBinUSD_1));

  const totalValueUSD_1 = USDTinUSD_1 + WBNBinUSD_1;
  console.log("Total liquidity pool 1: " + totalValueUSD_1);

  const amountUSDT_2 = await contractBaseToken.balanceOf(poolAddress2);
  const USDTinUSD_2 = Number(amountUSDT_2 / decimalsBase) * 1;
  console.log("USDTinUSD pool 2: " + Number(USDTinUSD_2));

  const amountWBNB_2 = await contractQuoteToken.balanceOf(poolAddress2);
  const WBNBinUSD_2 = Number(amountWBNB_2 / decimalsBase) * (1 / currentPrice);
  console.log("WBNBinUSD pool 2: " + Number(WBNBinUSD_2));

  const totalValueUSD_2 = USDTinUSD_2 + WBNBinUSD_2;
  console.log("Total liquidity pool 2: " + totalValueUSD_2);

  // Determine the pool with highest liquidity
  // Higher liquidity means less slippage
  if (totalValueUSD_1 > totalValueUSD_2) {
    poolAddress = poolAddress1;
  } else {
    poolAddress = poolAddress2;
  }
  console.log("Pooladdress met hoogste liquidity: " + poolAddress);

  poolContract = new ethers.Contract(poolAddress, pancakeV3PoolABI, provider);

  return poolContract;
}

// Functon to read balances
async function readBalance() {
  const balanceBNB = await provider.getBalance(WALLET_ADDRESS);
  console.log("Balance BNB: " + balanceBNB / decimalsBase);

  const balanceInWei2 = await contractQuoteToken.balanceOf(WALLET_ADDRESS);
  const balanceQuoteToken =
    ethers.utils.formatEther(balanceInWei2) * (decimalsBase / decimalsQuote);

  console.log(`Balance ${name1}: ` + balanceQuoteToken);

  const balanceInWei3 = await contractBaseToken.balanceOf(WALLET_ADDRESS);
  const balanceBaseToken = ethers.utils.formatEther(balanceInWei3);
  console.log(`Balance ${name0}: ` + balanceBaseToken);

  const balanceInWei4 = await contractCakeToken.balanceOf(WALLET_ADDRESS);
  const balanceCakeToken = ethers.utils.formatEther(balanceInWei4);
  console.log(`Balance Cake: ` + balanceCakeToken);

  await getPoolData(poolContract);
  let currentPriceBNB = currentPrice;

  await getPoolData(poolContractCake);
  let currentPriceCake = currentPrice;

  // USD values of all the tokens in wallet
  //let currentValueUSD_tmp1 = parseInt((balanceBNB / decimalsBase) * (1/currentPrice))
  let currentValueUSD_tmp1 = Number(
    (balanceBNB / decimalsBase) * (1 / currentPriceBNB)
  );
  let currentValueUSD_tmp2 = Number(Number(balanceBaseToken * 1));
  let currentValueUSD_tmp3 = Number(balanceQuoteToken * (1 / currentPriceBNB));
  let currentValueUSD_tmp4 = Number(balanceCakeToken * (1 / currentPriceCake));

  let currentValueUSD = (
    currentValueUSD_tmp1 +
    currentValueUSD_tmp2 +
    currentValueUSD_tmp3 +
    currentValueUSD_tmp4
  ).toFixed(2);

  const writeBalances = `Amount BNB:  ${
    balanceBNB / decimalsBase
  }, Amount USDT:  ${balanceBaseToken}, 
  Amount WBNB:  ${balanceQuoteToken}, Amount Cake: ${balanceCakeToken}  and total USD value: ${currentValueUSD}`;

  // Write belances to txt file
  fs.writeFile("LOG_PCS_BSC_BOT_1.txt", writeBalances, "utf8", (err) => {
    if (err) {
      console.error(err);
    } else {
      // file written successfully
    }
  });

  // USD values
  currentPrice = currentPriceBNB;
  console.log("current price: " + currentPrice);
  const usdValueWBNB = balanceQuoteToken * (1 / currentPrice);
  console.log(`USD value ${name0}: ` + balanceBaseToken);
  console.log(`USD value ${name1}: ` + usdValueWBNB);

  // Use formula uniswap to get amounts tokens 0 and 1 for LPs
  // Check uniswap v3 documentation for the details!
  let amountUSDT = 1;
  maxPrice = maxPriceFactor * currentPrice;
  minPrice = minPriceFactor * currentPrice;
  const Lx =
    (amountUSDT * Math.sqrt(currentPrice) * Math.sqrt(maxPrice)) /
    (Math.sqrt(maxPrice) - Math.sqrt(currentPrice));
  y = Lx * (Math.sqrt(currentPrice) - Math.sqrt(minPrice));
  console.log("Quote needed to match 1 USDT in liquidity: " + y);

  // Derive the current factor
  let currentFactor = balanceQuoteToken / balanceBaseToken;
  console.log("Current factor for liquidity: " + currentFactor);

  let sellWBNBAmount = 0;
  let sellUSDTAmount = 0;
  // if current factor > y ==> te weinig USDT dus sell WBNB voor USDT
  if (currentFactor > y) {
    scenario = 1;
    sellWBNBAmount = ((1 - y / currentFactor) / 2) * balanceQuoteToken;
  }
  // if current factor <y ==> te veel USDT dus sell USDT voor WBNB
  else if (currentFactor < y) {
    scenario = 2;
    sellUSDTAmount = ((1 - currentFactor / y) / 2) * balanceBaseToken;
  }

  console.log("sellWBNBAmount: " + sellWBNBAmount);
  console.log("sellUSDTAmount: " + sellUSDTAmount);

  // Het poolcontract bepaalt welke token 0 of 1 is!!
  const immutables = await getPoolImmutables(poolContract);
  console.log("immutables token0: " + immutables.token0);
  console.log("immutables token1: " + immutables.token1);

  console.log("statusPoolContract: " + statusPoolContract);

  let inputAmount = 0;
  let decimals = 0;
  //const state = await getPoolState(poolContract)
  if (statusPoolContract == 1) {
    if (scenario == 1) {
      tokenInput = immutables.token1;
      tokenOutput = immutables.token0;
      inputAmount = sellWBNBAmount;
      decimals = decimals0;
    } else if (scenario == 2) {
      tokenInput = immutables.token0;
      tokenOutput = immutables.token1;
      inputAmount = sellUSDTAmount;
      decimals = decimals1;
    }
  } else if (statusPoolContract == 2) {
    if (scenario == 1) {
      tokenInput = immutables.token0;
      tokenOutput = immutables.token1;
      inputAmount = sellWBNBAmount;
      decimals = decimals0;
    } else if (scenario == 2) {
      tokenInput = immutables.token1;
      tokenOutput = immutables.token0;
      inputAmount = sellUSDTAmount;
      decimals = decimals1;
    }
  }

  const inputAmountDec = parseFloat(inputAmount).toFixed(decimals);

  // .001 => 1 000 000 000 000 000
  const amountIn = ethers.utils.parseUnits(inputAmountDec, decimals);

  console.log("inputAmount: " + inputAmount);
  console.log("inputAmountDec: " + inputAmountDec);
  console.log("amountIn: " + amountIn);

  nonceNumber = await provider.getTransactionCount(WALLET_ADDRESS);

  // Take into account slippage: very important!!
  const check = await checkResultCondition();
  let slippagePercentage = 1;
  let slippageFactor = 1 - slippagePercentage / 100;
  console.log("slippageFactor: " + slippageFactor);
  let setAmountOutMinimum = 0;
  if (scenario == 1) {
    setAmountOutMinimum = BigInt(
      parseInt((amountIn / priceOracleETHBTC) * slippageFactor)
    );
  } else if (scenario == 2) {
    setAmountOutMinimum = BigInt(
      parseInt(amountIn * priceOracleETHBTC * slippageFactor)
    );
  }
  console.log("setAmountOutMinimum: " + setAmountOutMinimum);

  nonceNumber = await provider.getTransactionCount(WALLET_ADDRESS);

  // Set the parameters for the transaction
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

  let feeData = await provider.getFeeData();

  nonceNumber = await provider.getTransactionCount(WALLET_ADDRESS);

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

// Function to add liquidity
async function addLiquidity() {
  // Read all balances again
  const balanceBNB = await provider.getBalance(WALLET_ADDRESS);
  console.log("Balance BNB: " + balanceBNB / decimalsBase);

  const balanceInWei2 = await contractQuoteToken.balanceOf(WALLET_ADDRESS);
  const balanceQuoteToken =
    ethers.utils.formatEther(balanceInWei2) * (decimalsBase / decimalsQuote);
  console.log(`Balance ${name1}: ` + balanceQuoteToken);

  const balanceInWei3 = await contractBaseToken.balanceOf(WALLET_ADDRESS);
  const balanceBaseToken = ethers.utils.formatEther(balanceInWei3);
  console.log(`Balance ${name0}: ` + balanceBaseToken);

  const poolData = await getPoolData(poolContract);
  console.log("tickprice: " + tickPrice);
  console.log("sqrtPriceX96: " + sqrtPriceX96);

  let deadline = Math.floor(Date.now() / 1000 + 1800);
  console.log("currentPrice: " + currentPrice);

  // Lower tick determines lower bound price and higher tick determines higher bound price
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

  minPrice = minPriceFactor * currentPrice;
  maxPrice = maxPriceFactor * currentPrice;

  // Apply formula from uniswap v3 documentation
  let amountUSDT = 1;
  const Lx =
    (amountUSDT * Math.sqrt(currentPrice) * Math.sqrt(maxPrice)) /
    (Math.sqrt(maxPrice) - Math.sqrt(currentPrice));
  y = Lx * (Math.sqrt(currentPrice) - Math.sqrt(minPrice));

  console.log(Lx);
  console.log(y);
  console.log(balanceBaseToken);

  let amount0Desired = BigInt(balanceBaseToken * factorInLP * decimalsBase);
  let amount1Desired = BigInt(
    y * balanceBaseToken * factorInLP * decimalsQuote
  );
  console.log("amount0Desired: " + amount0Desired);
  console.log("amount1Desired: " + amount1Desired);

  let amount0Min = 0;
  //console.log(amount0Min.toString())

  let amount1Min = 0;
  //console.log(amount1Min.toString())

  //let fee = "500";

  let token0 = baseTokenCA;
  let token1 = quoteTokenCA;

  let feeData = await provider.getFeeData();

  // provider.getGasPrice( ) ⇒ Promise< BigNumber > - Returns a best guess of the Gas Price to use in a transaction.
  const gasPrice = await provider.getGasPrice();
  console.log(ethers.utils.formatUnits(gasPrice, "gwei"));

  const mintParam = {
    token0: token0,
    token1: token1,
    fee: fee,
    tickLower: tickLower,
    tickUpper: tickUpper,
    //tickLower: -58450,
    //tickUpper: -56350,
    amount0Desired: amount0Desired,
    amount1Desired: amount1Desired,
    amount0Min: amount0Min,
    amount1Min: amount1Min,
    recipient: WALLET_ADDRESS,
    deadline: deadline,
  };

  // Save the NFT ID when opening new LP position (and save in txt file)
  const writePrice = `${currentPrice}`;
  fs.writeFile("PRICE_PCS_BSC_BOT1.txt", writePrice, (err) => {
    if (err) {
      console.error(err);
    } else {
      // file written successfully
    }
  });

  const wallet = new ethers.Wallet(WALLET_SECRET);
  const connectedWallet = wallet.connect(provider);

  let calldata = await NonfungiblePositionContract.connect(
    connectedWallet
  ).mint(mintParam, {
    //gas: 1000000,
    //gasPrice: 3000000000,
    maxFeePerGas: feeData.maxFeePerGas * setGasHigher,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * setGasHigher,
    gasLimit: setGasLimit,
    nonce: getNonce(),
  });

  const receiptLP = await calldata.wait();
  console.log(receiptLP);
}

// Pancakeswap offers possibility to stake your LP for additional CAKE rewards
//safeTransferFrom(address from,address to,uint256 tokenId)
async function stakeLatestNFT() {
  // Total number of positions (open and closed)
  const numPositions = await NonfungiblePositionContract.balanceOf(
    WALLET_ADDRESS
  );

  // Alle IDs in vector stoppen: laatste ID is dan actief nog
  const calls = [];

  for (let i = 0; i < numPositions; i++) {
    calls.push(
      NonfungiblePositionContract.tokenOfOwnerByIndex(WALLET_ADDRESS, i)
    );
  }

  const positionIds = await Promise.all(calls);
  console.log(positionIds.toString());

  const positionId = calls[numPositions - 1];
  //console.log(positionId.toString());

  // We moeten NFT wel opslaan want als je staked ben je positionID kwijt

  const nftContract = new ethers.Contract(
    positionManagerAddress,
    ERC721ABI,
    provider
  );

  const nftContract2 = new ethers.Contract(masterChefV3, ERC721ABI, provider);

  console.log(positionIds.toString());

  let feeData = await provider.getFeeData();

  // Approve NFT
  const transaction = await nftContract
    .connect(connectedWallet)
    .approve(masterChefV3, positionId, {
      maxFeePerGas: feeData.maxFeePerGas * setGasHigher,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * setGasHigher,
      gasLimit: setGasLimit,
      nonce: getNonce(),
    });

  let lastNFT = positionIds[numPositions - 1].toString();
  console.log("Last NFT: " + lastNFT);
  const content = `${lastNFT}`;

  // Deposit NFT in smart contract for additional CAKE
  await nftContract
    .connect(connectedWallet)
    ["safeTransferFrom(address,address,uint256)"](
      WALLET_ADDRESS,
      masterChefV3,
      positionId,
      {
        maxFeePerGas: feeData.maxFeePerGas * setGasHigher,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * setGasHigher,
        gasLimit: setGasLimit,
        nonce: getNonce(),
      }
    );

  // Bij Initialisatie willen we sws LP staken en laatste NFT wegschrijven
  fs.writeFile("NFT_PCS_BSC_BOT_1.txt", content, (err) => {
    if (err) {
      console.error(err);
    } else {
      // file written successfully
    }
  });
}

async function initialiseLP() {
  // Step 0: Approve tokens (only first time)
  approveContract(tokenContract0);
  approveContract(tokenContract1);

  // Step 1: Determine the pool with highest liquidity
  await determinePoolLiq();

  // Step 2: read balances from wallet and buy the necessary tokens to create LP
  await readBalance();

  // Step 3: add liquidity
  setTimeout(addLiquidity, 30000);

  // Step 4: stake the NFT LP in Cake Farm
  setTimeout(stakeLatestNFT, 30000);
}

initialiseLP();
