const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Full VAR demo arc:
// reject (code1) -> grant + seed -> clear -> pay -> over-cap (code4)
// -> asset (code5) -> park via vault.deposit -> revoke (code2) -> expiry (code3)
describe("Verified Agent Rails — full arc", function () {
  const SIX = 6n;
  const ONE = 10n ** SIX; // 1 gUSDC in 6-dec units
  const CAP = 100n * ONE; // per-tx spend cap: 100 gUSDC
  const NULLIFIER = 123456789n;

  let owner, agent, service; // accounts[0], [1], [2]
  let agentBook, resolver, token, vault, otherToken;

  async function deployAll() {
    [owner, agent, service] = await ethers.getSigners();

    const AgentBook = await ethers.getContractFactory("AgentBook");
    agentBook = await AgentBook.deploy();

    const EligibilityResolver = await ethers.getContractFactory("EligibilityResolver");
    resolver = await EligibilityResolver.deploy(await agentBook.getAddress());

    const GatedToken = await ethers.getContractFactory("GatedToken");
    token = await GatedToken.deploy(await resolver.getAddress(), "Gated USDC", "gUSDC");

    const YieldVault = await ethers.getContractFactory("YieldVault");
    vault = await YieldVault.deploy(await token.getAddress());

    // A throwaway 6-dec resolver-less ERC20 used purely as a "different asset" arg.
    const Other = await ethers.getContractFactory("GatedToken");
    otherToken = await Other.deploy(await resolver.getAddress(), "Other", "OTH");

    // Fund the agent with 1,000,000 gUSDC (mint is exempt from the gate).
    await token.mint(agent.address, 1_000_000n * ONE);
  }

  beforeEach(deployAll);

  it("1. transfer before grant reverts TransferRestricted(1, ...) — no passport", async function () {
    // No mandate yet -> code 1.
    expect(await token.detectTransferRestriction(agent.address, service.address, ONE)).to.equal(1);
    expect(await token.canTransfer(agent.address, service.address, ONE)).to.equal(false);

    await expect(token.connect(agent).transfer(service.address, ONE))
      .to.be.revertedWithCustomError(token, "TransferRestricted")
      .withArgs(1, "Sender carries no Agent Passport");
  });

  it("2. grant + seed clears the gate; pay succeeds; over-cap -> 4; wrong asset -> 5", async function () {
    const expiry = (await time.latest()) + 3600;
    await agentBook.seed(agent.address, owner.address, NULLIFIER);
    await resolver.grantMandate(
      agent.address,
      owner.address,
      CAP,
      await token.getAddress(),
      expiry
    );

    // Gate is open for a within-cap transfer.
    expect(await token.canTransfer(agent.address, service.address, CAP)).to.equal(true);
    expect(await token.detectTransferRestriction(agent.address, service.address, CAP)).to.equal(0);

    // Pay the service within cap -> succeeds.
    const pay = 10n * ONE;
    await expect(token.connect(agent).transfer(service.address, pay)).to.not.be.reverted;
    expect(await token.balanceOf(service.address)).to.equal(pay);

    // Over-cap transfer -> code 4.
    const overCap = CAP + ONE;
    expect(await token.detectTransferRestriction(agent.address, service.address, overCap)).to.equal(4);
    await expect(token.connect(agent).transfer(service.address, overCap))
      .to.be.revertedWithCustomError(token, "TransferRestricted")
      .withArgs(4, "Amount exceeds per-transaction spend cap");

    // Wrong asset (asset arg != mandate asset) -> code 5 via the pure view.
    const otherAddr = await otherToken.getAddress();
    expect(await resolver.restrictionCode(agent.address, otherAddr, ONE)).to.equal(5);
    expect(await resolver.messageForRestriction(5)).to.equal("Asset not permitted by mandate");
  });

  it("3. park: agent approves vault, vault.deposit succeeds, shares == assets", async function () {
    const expiry = (await time.latest()) + 3600;
    await agentBook.seed(agent.address, owner.address, NULLIFIER);
    await resolver.grantMandate(
      agent.address,
      owner.address,
      CAP,
      await token.getAddress(),
      expiry
    );

    const park = 50n * ONE;
    const vaultAddr = await vault.getAddress();

    // approve is NOT gated.
    await token.connect(agent).approve(vaultAddr, park);

    // deposit pulls via transferFrom (gated on the agent) -> within cap, clears.
    const shares = await vault.connect(agent).deposit.staticCall(park, agent.address);
    expect(shares).to.equal(park); // 1:1 stub

    await expect(vault.connect(agent).deposit(park, agent.address)).to.not.be.reverted;
    expect(await vault.balanceOf(agent.address)).to.equal(park);
    expect(await vault.totalAssets()).to.equal(park);
    expect(await token.balanceOf(vaultAddr)).to.equal(park);
  });

  it("4. revokeMandate -> next transfer reverts code 2 (the kill shot)", async function () {
    const expiry = (await time.latest()) + 3600;
    await agentBook.seed(agent.address, owner.address, NULLIFIER);
    await resolver.grantMandate(
      agent.address,
      owner.address,
      CAP,
      await token.getAddress(),
      expiry
    );

    // Was clear...
    expect(await token.canTransfer(agent.address, service.address, ONE)).to.equal(true);

    await resolver.revokeMandate(agent.address);

    expect(await token.detectTransferRestriction(agent.address, service.address, ONE)).to.equal(2);
    await expect(token.connect(agent).transfer(service.address, ONE))
      .to.be.revertedWithCustomError(token, "TransferRestricted")
      .withArgs(2, "Mandate revoked by principal");
  });

  it("5. expiry path -> code 3", async function () {
    const expiry = (await time.latest()) + 3600;
    await agentBook.seed(agent.address, owner.address, NULLIFIER);
    await resolver.grantMandate(
      agent.address,
      owner.address,
      CAP,
      await token.getAddress(),
      expiry
    );

    // Fast-forward past expiry deterministically.
    await time.increaseTo(expiry + 1);

    expect(await token.detectTransferRestriction(agent.address, service.address, ONE)).to.equal(3);
    await expect(token.connect(agent).transfer(service.address, ONE))
      .to.be.revertedWithCustomError(token, "TransferRestricted")
      .withArgs(3, "Mandate expired");

    // extendMandate re-opens the gate.
    const newExpiry = (await time.latest()) + 3600;
    await resolver.extendMandate(agent.address, newExpiry);
    expect(await token.detectTransferRestriction(agent.address, service.address, ONE)).to.equal(0);
  });

  it("clearAnchor breaks the human anchor -> code 6", async function () {
    const expiry = (await time.latest()) + 3600;
    await agentBook.seed(agent.address, owner.address, NULLIFIER);
    await resolver.grantMandate(
      agent.address,
      owner.address,
      CAP,
      await token.getAddress(),
      expiry
    );
    expect(await token.detectTransferRestriction(agent.address, service.address, ONE)).to.equal(0);

    await agentBook.clearAnchor(agent.address);
    expect(await token.detectTransferRestriction(agent.address, service.address, ONE)).to.equal(6);
    expect(await resolver.messageForRestriction(6)).to.equal(
      "Agent not anchored to a verified human"
    );
  });

  it("nullifier replay guard: same agent re-seed ok, different agent rejected", async function () {
    await agentBook.seed(agent.address, owner.address, NULLIFIER);
    // idempotent re-seed of the same agent is allowed
    await expect(agentBook.seed(agent.address, owner.address, NULLIFIER)).to.not.be.reverted;
    // a different agent claiming the same nullifier is rejected
    await expect(
      agentBook.seed(service.address, owner.address, NULLIFIER)
    ).to.be.revertedWith("AgentBook: nullifier already used");
  });

  it("isActiveForAmount ERC-8226-shaped wrapper reflects the gate", async function () {
    const expiry = (await time.latest()) + 3600;
    await agentBook.seed(agent.address, owner.address, NULLIFIER);
    await resolver.grantMandate(
      agent.address,
      owner.address,
      CAP,
      await token.getAddress(),
      expiry
    );
    const agentId = BigInt(agent.address); // uint160(agent)
    expect(await resolver.isActiveForAmount(agentId, owner.address, ONE)).to.equal(true);
    expect(await resolver.isActiveForAmount(agentId, owner.address, CAP + ONE)).to.equal(false);
  });
});
