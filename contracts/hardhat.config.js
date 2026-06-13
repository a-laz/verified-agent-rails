require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: __dirname + "/../backend/.env" });

const ARC_RPC = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const ARC_DEPLOYER_KEY = process.env.ARC_DEPLOYER_KEY; // optional; only needed to deploy to Arc

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    arcTestnet: {
      url: ARC_RPC,
      chainId: 5042002,
      accounts: ARC_DEPLOYER_KEY ? [ARC_DEPLOYER_KEY] : [],
    },
  },
};
