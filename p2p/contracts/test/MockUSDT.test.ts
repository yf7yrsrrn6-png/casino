import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("MockUSDT", () => {
  async function fixture() {
    const [owner, alice] = await ethers.getSigners();
    const usdt = await ethers.deployContract("MockUSDT", [owner.address]);
    return { usdt, owner, alice };
  }

  it("має правильні метадані", async () => {
    const { usdt } = await loadFixture(fixture);
    expect(await usdt.name()).to.equal("Mock Tether USD");
    expect(await usdt.symbol()).to.equal("mUSDT");
    expect(await usdt.decimals()).to.equal(18n);
  });

  it("власник може карбувати, інші — ні", async () => {
    const { usdt, alice } = await loadFixture(fixture);
    await usdt.mint(alice.address, 5n);
    expect(await usdt.balanceOf(alice.address)).to.equal(5n);
    await expect(usdt.connect(alice).mint(alice.address, 1n))
      .to.be.revertedWithCustomError(usdt, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);
  });

  it("кран видає 1000 mUSDT з годинною паузою", async () => {
    const { usdt, alice } = await loadFixture(fixture);
    await usdt.connect(alice).faucet();
    expect(await usdt.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
    await expect(usdt.connect(alice).faucet()).to.be.revertedWithCustomError(usdt, "FaucetCooldown");
    await time.increase(3600);
    await usdt.connect(alice).faucet();
    expect(await usdt.balanceOf(alice.address)).to.equal(ethers.parseEther("2000"));
  });
});
