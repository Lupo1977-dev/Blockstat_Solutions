//App.js file

import "./App.css";
import { useState } from "react";
import { ethers } from "ethers";
import { Notifications } from "react-push-notification";
import addNotification from "react-push-notification";
import ABIWDRIP from "./WDRIPONLYUP_ABI.json";

function App() {
  // State variables for wallet connection status and address
  // We transfer values from the client side to the server side
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  const [balanceInfo, setBalanceInfo] = useState("");
  const [balanceInfo2, setBalanceInfo2] = useState("");
  const [numberUsers, setnumberUsers] = useState("");
  const [numberTxs, setnumberTxs] = useState("");
  const [underlyingSupply, setUnderlyingSupply] = useState("");
  const [totalSupply, setTotalSupply] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [inputValue, setInputValue] = useState("");

  const [naam, setName] = useState("");

  // Initialise global variables needed in multiple functions
  const wdripOnlyUPAddress = "0xcC95f46652597e57a3F8A8836aE092d339264fD0";
  const wdripAddress = "0xF30224eB7104aca47235beb3362E331Ece70616A";
  let valueMintRedeem = 0;
  const decimals = 1000000000000000000;

  // Function to connect/disconnect the wallet
  async function connectWallet() {
    if (!connected) {
      // Connect the wallet using ethers.js
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const _walletAddress = await signer.getAddress();
      setConnected(true);
      setWalletAddress(_walletAddress);
    } else {
      // Disconnect the wallet
      window.ethereum.selectedAddress = null;
      setConnected(false);
      setWalletAddress("");
    }
  }

  // Process the user input value for approve/mint/redeem
  // Here we assign the user input to inputValue State variable
  const handleInputChange = (event) => {
    setInputValue(event.target.value);
  };

  // Here we are going to check whether the user input is viable
  function warningNotification() {
    addNotification({
      message: "Please submit a positive number!",
      theme: "red",
      closeButton: "X",
    });
  }

  function successNotification() {
    addNotification({
      message: "You have successfully submitted",
      theme: "light",
      closeButton: "X",
      backgroundTop: "green",
      backgroundBottom: "yellowgreen",
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (inputValue <= 0 || inputValue === "") {
      warningNotification();
    } else successNotification();
    getUserInfo(inputValue);
  }

  async function getUserInfo(inputValue) {
    // Call the function with the input value
    valueMintRedeem = (inputValue * decimals).toString();
    console.log("Input Value:", valueMintRedeem);
    //const weiValue = 100000;
    //const ethValue = ethers.utils.formatEther(weiValue);
    // Reset the input field
    //setInputValue("");
  }

  async function approveWdrip() {
    if (connected & (valueMintRedeem > 0)) {
      // Connect the wallet using ethers.js
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const _walletAddress = await signer.getAddress();
        setConnected(true);
        setWalletAddress(_walletAddress);

        const wdripOnlyUPContract = new ethers.Contract(
          wdripOnlyUPAddress,
          ABIWDRIP,
          signer
        );

        const wdripContract = new ethers.Contract(
          wdripAddress,
          ABIWDRIP,
          signer
        );

        let approveTx = await wdripContract.approve(
          wdripOnlyUPAddress,
          valueMintRedeem,
          {
            from: _walletAddress,
          }
        );
        let result = await approveTx.wait();
        //console.log(result);
      } catch (err) {
        //  {code: 4100, message: 'The requested method and/or account has not been authorized by the user.'}
      }
    }
  }

  async function approveWdripMax() {
    if (connected & (valueMintRedeem > 0)) {
      // Connect the wallet using ethers.js
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const _walletAddress = await signer.getAddress();
        setConnected(true);
        setWalletAddress(_walletAddress);

        const wdripOnlyUPContract = new ethers.Contract(
          wdripOnlyUPAddress,
          ABIWDRIP,
          signer
        );

        const wdripContract = new ethers.Contract(
          wdripAddress,
          ABIWDRIP,
          signer
        );

        let approveTx = await wdripOnlyUPContract.approve(
          wdripOnlyUPAddress,
          valueMintRedeem,
          {
            from: _walletAddress,
          }
        );
        let result = await approveTx.wait();
        //console.log(result);
      } catch (err) {
        //  {code: 4100, message: 'The requested method and/or account has not been authorized by the user.'}
      }
    }
  }

  // Function mint new tokens
  async function mint() {
    if (connected & (valueMintRedeem > 0)) {
      try {
        // Connect the wallet using ethers.js
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const _walletAddress = await signer.getAddress();
        setConnected(true);
        setWalletAddress(_walletAddress);

        const wdripOnlyUPContract = new ethers.Contract(
          wdripOnlyUPAddress,
          ABIWDRIP,
          signer
        );

        let mintAmountTx = await wdripOnlyUPContract.mintWithBacking(
          valueMintRedeem,
          _walletAddress,
          {
            from: _walletAddress,
          }
        );
        let result = await mintAmountTx.wait();
      } catch (err) {
        //  {code: 4100, message: 'The requested method and/or account has not been authorized by the user.'}
      }
    }
  }

  // Function to redeem tokens
  async function redeem() {
    //if (connected & (valueMintRedeem > 0)) {
    try {
      // Connect the wallet using ethers.js
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const _walletAddress = await signer.getAddress();
      //setConnected(true);
      //setWalletAddress(_walletAddress);

      const wdripOnlyUPContract = new ethers.Contract(
        wdripOnlyUPAddress,
        ABIWDRIP,
        signer
      );

      let redeemAmountTx = await wdripOnlyUPContract.sell(valueMintRedeem, {
        from: _walletAddress,
      });

      let result = await redeemAmountTx.wait();
    } catch (err) {
      //  {code: 4100, message: 'The requested method and/or account has not been authorized by the user.'}
    }
    //}
  }

  // Function to read the user's balance
  async function getMyBalance() {
    //if (!connected) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const _walletAddress = await signer.getAddress();

    const wdripOnlyUPContract = new ethers.Contract(
      wdripOnlyUPAddress,
      ABIWDRIP,
      provider
    );

    const wdripContract = new ethers.Contract(wdripAddress, ABIWDRIP, provider);

    // Balance of the user wDripMax
    const _balanceInfo_tmp = await wdripOnlyUPContract.balanceOf(
      _walletAddress
    );
    const _balanceInfo = (_balanceInfo_tmp.toString() / decimals).toFixed(2);

    // Balance of the user wDrip
    const _balanceInfo2_tmp = await wdripContract.balanceOf(_walletAddress);
    const _balanceInfo2 = (_balanceInfo2_tmp.toString() / decimals).toFixed(2);

    // Number of participants
    const statsCA = await wdripOnlyUPContract.getInfo();
    const _numberUsers = statsCA.users.toString();

    // Current price
    const _currentPrice = (statsCA.price.toString() / decimals).toFixed(2);

    // Number of transactions
    const _numberTxs = statsCA.txs.toString();

    // Number of backing supply
    const _underlyingSupply = (
      statsCA.underlyingSupply.toString() / decimals
    ).toFixed(2);

    const _totalSupply = (statsCA.supply.toString() / decimals).toFixed(2);

    //const _balanceInfo = 10;
    setBalanceInfo(_balanceInfo);
    setBalanceInfo2(_balanceInfo2);
    setnumberUsers(_numberUsers);
    setnumberTxs(_numberTxs);
    setUnderlyingSupply(_underlyingSupply);
    setTotalSupply(_totalSupply);
    setCurrentPrice(_currentPrice);
  }
  //}

  // Link to buy the token
  function buy() {
    /*
    window.location.href =
      "https://pancakeswap.finance/swap?outputCurrency=0xF30224eB7104aca47235beb3362E331Ece70616A";
    return null;
    */
    window.open(
      "https://pancakeswap.finance/swap?outputCurrency=0xF30224eB7104aca47235beb3362E331Ece70616A",
      "_blank",
      "noopener"
    );
  }

  return (
    <div className="app">
      <div className="main">
        <div className="content1">
          <h3>Why Choose wDripMax?</h3>
          <h4>Secure, decentralized, no dev fees</h4>
          <h4>Contract is verified: PM</h4>
          <h4>It only goes up in terms of wDrip!</h4>
          <h4>
            You can buy wDrip here to start:{" "}
            <button className="btn" onClick={buy}></button>
          </h4>
          <h3>But how?</h3>
          <h4>The minting and redeeming fee (5%) ensure that:</h4>
          <h4>supply wDrip in contract > total supply of wDripMax</h4>
          <h4>Price = backed wDrip balance in the contract divided by</h4>
          <h4>the total supply of wDripMax.</h4>
        </div>
        <div className="content1">
          <Notifications />
          <button className="btn" onClick={connectWallet}>
            {connected ? "Disconnect Wallet" : "Connect Wallet"}
          </button>
          <h4>Your Address:</h4>
          <h4 className="wal-add">{walletAddress}</h4>
          <button className="btn" onClick={approveWdrip}>
            {connected ? "Approve for mint" : "Approve for mint"}
          </button>
          <button className="btn" onClick={mint}>
            {connected ? "Mint wDripMax" : "Mint wDripMax"}
          </button>
          <button className="btn" onClick={redeem}>
            {connected ? "Redeem wDripMax" : "Redeem wDripMax"}
          </button>
        </div>
        <div className="content1">
          <button onClick={getMyBalance} type="submit" className="btn">
            Read all relevant info from the blockchain
          </button>
          <h4>Your balance wDripMax: {balanceInfo}</h4>
          <h4>Your balance wDrip: {balanceInfo2}</h4>
          <h4>Current price: {currentPrice}</h4>
          <h4># of users: {numberUsers}</h4>
          <h4># of txs: {numberTxs}</h4>
          <h4>Backed supply wDrip: {underlyingSupply}</h4>
          <h4>Current supply wDripMax: {totalSupply}</h4>
        </div>
      </div>
    </div>
  );
}

export default App;
