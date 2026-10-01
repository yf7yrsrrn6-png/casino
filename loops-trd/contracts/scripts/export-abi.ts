import fs from "fs";
import path from "path";

/** Копіює ABI контрактів у веб-застосунок: npx hardhat run scripts/export-abi.ts */
async function main() {
  const root = path.join(__dirname, "..");
  const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts", p), "utf8")).abi;
  const escrow = read("LoopsTrdEscrow.sol/LoopsTrdEscrow.json");
  const usdt = read("MockUSDT.sol/MockUSDT.json");
  const out = path.join(root, "..", "web", "src", "lib", "abi.ts");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `// Згенеровано contracts/scripts/export-abi.ts — не редагувати вручну.\n` +
      `export const escrowAbi = ${JSON.stringify(escrow, null, 2)} as const;\n\n` +
      `export const mockUsdtAbi = ${JSON.stringify(usdt, null, 2)} as const;\n`,
  );
  console.log(`ABI → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
