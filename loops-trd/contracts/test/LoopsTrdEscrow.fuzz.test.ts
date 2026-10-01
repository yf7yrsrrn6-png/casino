import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import fc from "fast-check";
import { Status, toId, signCreateDeal } from "./helpers";

/**
 * Fuzz / invariant-тести: випадкові послідовності дій різних учасників.
 * Після КОЖНОГО кроку перевіряємо інваріанти, наприкінці — що всі кошти можна вивести.
 *   I1  баланс контракту = сума угод у станах Funded/Paid/Disputed
 *   I2  загальна кількість токенів у системі незмінна (нічого не зникає й не з'являється)
 *   I3  кінцеві стани (Released/Cancelled/Resolved) ніколи не змінюються
 *   I4  Released можливий лише якщо reviewRequired → reviewApproved
 *   L   з будь-якого стану адмін може повернути всі кошти (жодних застряглих USDT)
 * Кількість прогонів: FUZZ_RUNS (за замовчуванням 40).
 */
const RUNS = Number(process.env.FUZZ_RUNS || 40);
const N_DEALS = 4;
const FINAL = new Set([Status.Released, Status.Cancelled, Status.Resolved]);
const LOCKED = new Set([Status.Funded, Status.Paid, Status.Disputed]);

const action = fc.record({
  kind: fc.constantFrom(
    "create", "deposit", "markPaid", "confirm", "cancel", "dispute", "resolve",
    "freeze", "unfreeze", "approve", "time", "pause", "unpause",
  ),
  deal: fc.nat(N_DEALS - 1),
  actor: fc.nat(6),
  amount: fc.integer({ min: 1, max: 1000 }),
  pct: fc.integer({ min: 0, max: 100 }),
  seconds: fc.integer({ min: 1, max: 3 * 3600 }),
  review: fc.boolean(),
});

describe("LoopsTrdEscrow — fuzz та інваріанти", function () {
  this.timeout(600_000);

  async function fixture() {
    const [admin, signer, freezer, s1, s2, b1, b2, stranger] = await ethers.getSigners();
    const usdt = await ethers.deployContract("MockUSDT", [admin.address]);
    const escrow = await ethers.deployContract("LoopsTrdEscrow", [await usdt.getAddress(), admin.address]);
    await escrow.grantRole(await escrow.SIGNER_ROLE(), signer.address);
    await escrow.grantRole(await escrow.FREEZER_ROLE(), freezer.address);
    for (const s of [s1, s2]) {
      await usdt.mint(s.address, ethers.parseEther("1000000"));
      await usdt.connect(s).approve(await escrow.getAddress(), ethers.MaxUint256);
    }
    return { usdt, escrow, admin, signer, freezer, sellers: [s1, s2], buyers: [b1, b2], stranger };
  }

  it(`інваріанти виконуються на ${RUNS} випадкових сценаріях`, async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(action, { minLength: 10, maxLength: 40 }), async (actions) => {
        const f = await loadFixture(fixture);
        const { usdt, escrow, admin, signer, freezer, sellers, buyers, stranger } = f;
        const everyone = [admin, freezer, ...sellers, ...buyers, stranger];
        const holders = [...everyone.map((s) => s.address), await escrow.getAddress()];
        const supply = await usdt.totalSupply();
        const ids = Array.from({ length: N_DEALS }, (_, i) => toId(`fuzz-${i}`));
        const prev = new Map<string, bigint>();

        const checkInvariants = async () => {
          let locked = 0n;
          for (const id of ids) {
            const d = await escrow.getDeal(id);
            if (LOCKED.has(d.status)) locked += d.amount;
            const p = prev.get(id);
            if (p !== undefined && FINAL.has(p)) expect(d.status, "I3 кінцевий стан змінився").to.equal(p);
            if (d.status === Status.Released && d.reviewRequired) expect(d.reviewApproved, "I4").to.equal(true);
            prev.set(id, d.status);
          }
          expect(await usdt.balanceOf(await escrow.getAddress()), "I1 баланс ескроу").to.equal(locked);
          let total = 0n;
          for (const h of holders) total += await usdt.balanceOf(h);
          const burned = await usdt.balanceOf("0x000000000000000000000000000000000000dEaD");
          expect(total + burned, "I2 збереження токенів").to.equal(supply);
        };

        for (const a of actions) {
          const id = ids[a.deal];
          const actor = everyone[a.actor];
          const d = await escrow.getDeal(id);
          try {
            switch (a.kind) {
              case "create": {
                const seller = sellers[a.deal % 2];
                const buyer = buyers[a.actor % 2];
                const amount = ethers.parseEther(String(a.amount));
                const expiry = BigInt(await time.latest()) + 600n;
                const sig = await signCreateDeal(escrow, signer, { dealId: id, seller: seller.address, buyer: buyer.address, amount, reviewRequired: a.review, expiry });
                await escrow.connect(seller).createDeal(id, buyer.address, amount, a.review, expiry, sig);
                break;
              }
              case "deposit":
                await escrow.connect(sellers[a.deal % 2]).deposit(id);
                break;
              case "markPaid":
                await escrow.connect(a.actor % 2 === 0 && d.buyer !== ethers.ZeroAddress ? await ethers.getSigner(d.buyer) : actor).markPaid(id);
                break;
              case "confirm":
                await escrow.connect(d.seller !== ethers.ZeroAddress && a.actor % 3 !== 0 ? await ethers.getSigner(d.seller) : actor).confirmRelease(id);
                break;
              case "cancel":
                await escrow.connect(actor).cancel(id);
                break;
              case "dispute":
                await escrow.connect(d.buyer !== ethers.ZeroAddress && a.actor % 2 === 0 ? await ethers.getSigner(d.buyer) : actor).openDispute(id);
                break;
              case "resolve":
                await escrow.connect(a.actor % 2 === 0 ? admin : actor).resolveDispute(id, (d.amount * BigInt(a.pct)) / 100n);
                break;
              case "freeze":
                await escrow.connect(a.actor % 2 === 0 ? freezer : actor).freezeDeal(id, ethers.ZeroHash);
                break;
              case "unfreeze":
                await escrow.connect(a.actor % 2 === 0 ? admin : actor).unfreezeDeal(id);
                break;
              case "approve":
                await escrow.connect(a.actor % 2 === 0 ? freezer : actor).approveRelease(id);
                break;
              case "time":
                await time.increase(a.seconds);
                break;
              case "pause":
                await escrow.connect(a.actor % 2 === 0 ? admin : actor).pause();
                break;
              case "unpause":
                await escrow.connect(a.actor % 2 === 0 ? admin : actor).unpause();
                break;
            }
          } catch {
            // Відхилені транзакції — нормальна частина фазингу; важливо, що інваріанти тримаються.
          }
          await checkInvariants();
        }

        // L: адмін завжди може повернути всі заблоковані кошти (навіть після паузи і заморозок).
        if (await escrow.paused()) await escrow.connect(admin).unpause();
        for (const id of ids) {
          const d = await escrow.getDeal(id);
          if (!LOCKED.has(d.status)) continue;
          if (d.status !== Status.Disputed && !d.frozen) await escrow.connect(freezer).freezeDeal(id, ethers.ZeroHash);
          await escrow.connect(admin).resolveDispute(id, d.amount / 2n);
        }
        await checkInvariants();
        expect(await usdt.balanceOf(await escrow.getAddress()), "L кошти не застрягли").to.equal(0n);
      }),
      { numRuns: RUNS },
    );
  });

  it("сторонні акаунти ніколи не можуть вивести кошти чужої угоди", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom("confirm", "cancel", "resolve", "approve", "markPaid", "dispute", "freeze"), { minLength: 5, maxLength: 15 }), async (moves) => {
        const { usdt, escrow, signer, sellers, buyers, stranger } = await loadFixture(fixture);
        const id = toId("victim");
        const amount = ethers.parseEther("50");
        const expiry = BigInt(await time.latest()) + 600n;
        const sig = await signCreateDeal(escrow, signer, { dealId: id, seller: sellers[0].address, buyer: buyers[0].address, amount, reviewRequired: true, expiry });
        await escrow.connect(sellers[0]).createDeal(id, buyers[0].address, amount, true, expiry, sig);
        await escrow.connect(sellers[0]).deposit(id);
        for (const m of moves) {
          await time.increase(3600);
          try {
            if (m === "confirm") await escrow.connect(stranger).confirmRelease(id);
            if (m === "cancel") await escrow.connect(stranger).cancel(id);
            if (m === "resolve") await escrow.connect(stranger).resolveDispute(id, amount);
            if (m === "approve") await escrow.connect(stranger).approveRelease(id);
            if (m === "markPaid") await escrow.connect(stranger).markPaid(id);
            if (m === "dispute") await escrow.connect(stranger).openDispute(id);
            if (m === "freeze") await escrow.connect(stranger).freezeDeal(id, ethers.ZeroHash);
          } catch {
            /* очікувано */
          }
          expect(await usdt.balanceOf(stranger.address)).to.equal(0n);
        }
      }),
      { numRuns: Math.max(10, Math.floor(RUNS / 2)) },
    );
  });
});
