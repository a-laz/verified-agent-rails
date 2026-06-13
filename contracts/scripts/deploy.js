// VAR deploy script (SPEC §2.7)
// Deploys AgentBook -> EligibilityResolver(agentBook) -> GatedToken(resolver,"Gated USDC","gUSDC")
// -> YieldVault(token). Mints 1_000_000e6 gUSDC to AGENT (accounts[1]).
// Writes contracts/deployment.json, copies each ABI to backend/src/var/abis/<Name>.json,
// and writes backend/src/var/deployment.json with addresses + accounts.

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers, artifacts, network } = hre;

const SIX = 6n;
const ONE = 10n ** SIX;
const MINT_AMOUNT = 1_000_000n * ONE; // 1,000,000 gUSDC

async function main() {
  const signers = await ethers.getSigners();
  const owner = signers[0]; // OWNER / HUMAN / principal
  const agent = signers[1]; // AGENT
  const service = signers[2]; // SERVICE

  console.log(`Deploying VAR to network "${network.name}" (chainId ${network.config.chainId})`);
  console.log(`  owner  : ${owner.address}`);
  console.log(`  agent  : ${agent.address}`);
  console.log(`  service: ${service.address}`);

  // 1. AgentBook
  const AgentBook = await ethers.getContractFactory("AgentBook");
  const agentBook = await AgentBook.deploy();
  await agentBook.waitForDeployment();
  const agentBookAddr = await agentBook.getAddress();

  // 2. EligibilityResolver(agentBook)
  const EligibilityResolver = await ethers.getContractFactory("EligibilityResolver");
  const resolver = await EligibilityResolver.deploy(agentBookAddr);
  await resolver.waitForDeployment();
  const resolverAddr = await resolver.getAddress();

  // 3. GatedToken(resolver, "Gated USDC", "gUSDC")
  const GatedToken = await ethers.getContractFactory("GatedToken");
  const token = await GatedToken.deploy(resolverAddr, "Gated USDC", "gUSDC");
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();

  // 4. YieldVault(token)
  const YieldVault = await ethers.getContractFactory("YieldVault");
  const vault = await YieldVault.deploy(tokenAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();

  // Mint demo funding to AGENT.
  const mintTx = await token.connect(owner).mint(agent.address, MINT_AMOUNT);
  await mintTx.wait();

  console.log("Deployed:");
  console.log(`  AgentBook          : ${agentBookAddr}`);
  console.log(`  EligibilityResolver: ${resolverAddr}`);
  console.log(`  GatedToken         : ${tokenAddr}`);
  console.log(`  YieldVault         : ${vaultAddr}`);
  console.log(`  Minted ${MINT_AMOUNT} gUSDC to agent ${agent.address}`);

  const addresses = {
    AgentBook: agentBookAddr,
    EligibilityResolver: resolverAddr,
    GatedToken: tokenAddr,
    YieldVault: vaultAddr,
  };
  const accounts = {
    owner: owner.address,
    agent: agent.address,
    service: service.address,
  };

  const deployment = {
    network: network.name === "hardhat" ? "localhost" : network.name,
    chainId: network.config.chainId,
    addresses,
    accounts,
  };

  // Resolve target paths.
  const contractsDir = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(contractsDir, "..");
  const backendVarDir = path.join(repoRoot, "backend", "src", "var");
  const abisDir = path.join(backendVarDir, "abis");

  // contracts/deployment.json
  const contractsDeploymentPath = path.join(contractsDir, "deployment.json");
  fs.writeFileSync(contractsDeploymentPath, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`Wrote ${contractsDeploymentPath}`);

  // backend/src/var/deployment.json (same shape; the backend reads this)
  fs.mkdirSync(backendVarDir, { recursive: true });
  const backendDeploymentPath = path.join(backendVarDir, "deployment.json");
  fs.writeFileSync(backendDeploymentPath, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`Wrote ${backendDeploymentPath}`);

  // Copy each ABI to backend/src/var/abis/<Name>.json
  fs.mkdirSync(abisDir, { recursive: true });
  const contractNames = ["AgentBook", "EligibilityResolver", "GatedToken", "YieldVault"];
  for (const name of contractNames) {
    const artifact = await artifacts.readArtifact(name);
    const abiPath = path.join(abisDir, `${name}.json`);
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2) + "\n");
    console.log(`Wrote ABI ${abiPath}`);
  }

  console.log("Deploy complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
