import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Деплой MockUSDT + LoopsTrdEscrow.
 *   npx hardhat run scripts/deploy.ts --network bscTestnet
 *
 * ENV:
 *   ADMIN_ADDRESS        — адмін (DEFAULT_ADMIN_ROLE + ARBITER_ROLE). За замовчуванням — деплоєр.
 *   BACKEND_SIGNER_ADDRESS — серверний ключ антифроду (SIGNER_ROLE + FREEZER_ROLE).
 *   USDT_ADDRESS         — (необов'язково) вже задеплоєний тестовий токен; інакше деплоїться MockUSDT.
 */
async function main() {
  if (network.config.chainId === 56 || network.config.chainId === 1) {
    throw new Error("Mainnet заборонено: проєкт лише для тестової мережі.");
  }

  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  const backend = process.env.BACKEND_SIGNER_ADDRESS;

  console.log(`Мережа: ${network.name} (chainId ${network.config.chainId})`);
  console.log(`Деплоєр: ${deployer.address}`);

  let usdtAddress = process.env.USDT_ADDRESS;
  if (!usdtAddress) {
    const usdt = await ethers.deployContract("MockUSDT", [deployer.address]);
    await usdt.waitForDeployment();
    usdtAddress = await usdt.getAddress();
    console.log(`MockUSDT: ${usdtAddress}`);
  }

  // Деплоєр тимчасово адмін, щоб видати ролі; потім права передаються ADMIN_ADDRESS.
  const escrow = await ethers.deployContract("LoopsTrdEscrow", [usdtAddress, deployer.address]);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`LoopsTrdEscrow: ${escrowAddress}`);

  if (backend) {
    await (await escrow.grantRole(await escrow.SIGNER_ROLE(), backend)).wait();
    await (await escrow.grantRole(await escrow.FREEZER_ROLE(), backend)).wait();
    console.log(`SIGNER_ROLE + FREEZER_ROLE → ${backend}`);
  } else {
    console.warn("⚠ BACKEND_SIGNER_ADDRESS не задано — угоди не можна буде створити, доки не видано SIGNER_ROLE.");
  }

  if (admin.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await escrow.grantRole(await escrow.DEFAULT_ADMIN_ROLE(), admin)).wait();
    await (await escrow.grantRole(await escrow.ARBITER_ROLE(), admin)).wait();
    await (await escrow.renounceRole(await escrow.ARBITER_ROLE(), deployer.address)).wait();
    await (await escrow.renounceRole(await escrow.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();
    console.log(`Права адміна передано → ${admin}`);
  }

  const out = {
    network: network.name,
    chainId: network.config.chainId,
    usdt: usdtAddress,
    escrow: escrowAddress,
    admin,
    backendSigner: backend ?? null,
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(`Збережено deployments/${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
