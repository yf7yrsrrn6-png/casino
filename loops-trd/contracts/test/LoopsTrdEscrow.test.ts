import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { Status, toId, signCreateDeal } from "./helpers";

const AMOUNT = ethers.parseEther("100");
const WINDOW = 30 * 60;
const GRACE = 15 * 60;

describe("LoopsTrdEscrow", () => {
  async function deployFixture() {
    const [admin, signer, freezer, seller, buyer, stranger, moderator] = await ethers.getSigners();
    const usdt = await ethers.deployContract("MockUSDT", [admin.address]);
    const escrow = await ethers.deployContract("LoopsTrdEscrow", [await usdt.getAddress(), admin.address]);

    await escrow.grantRole(await escrow.SIGNER_ROLE(), signer.address);
    await escrow.grantRole(await escrow.FREEZER_ROLE(), freezer.address);

    await usdt.mint(seller.address, ethers.parseEther("10000"));
    await usdt.connect(seller).approve(await escrow.getAddress(), ethers.MaxUint256);

    let counter = 0;
    async function create(opts: { reviewRequired?: boolean; amount?: bigint; id?: string } = {}) {
      const dealId = toId(opts.id ?? `deal-${counter++}`);
      const amount = opts.amount ?? AMOUNT;
      const reviewRequired = opts.reviewRequired ?? false;
      const expiry = BigInt(await time.latest()) + 600n;
      const sig = await signCreateDeal(escrow, signer, {
        dealId,
        seller: seller.address,
        buyer: buyer.address,
        amount,
        reviewRequired,
        expiry,
      });
      await escrow.connect(seller).createDeal(dealId, buyer.address, amount, reviewRequired, expiry, sig);
      return dealId;
    }
    async function funded(opts: { reviewRequired?: boolean } = {}) {
      const id = await create(opts);
      await escrow.connect(seller).deposit(id);
      return id;
    }
    async function paid(opts: { reviewRequired?: boolean } = {}) {
      const id = await funded(opts);
      await escrow.connect(buyer).markPaid(id);
      return id;
    }
    async function disputed() {
      const id = await paid();
      await escrow.connect(buyer).openDispute(id);
      return id;
    }

    return { usdt, escrow, admin, signer, freezer, seller, buyer, stranger, moderator, create, funded, paid, disputed };
  }

  describe("розгортання", () => {
    it("налаштовує токен, ролі та вікно оплати", async () => {
      const { escrow, usdt, admin } = await loadFixture(deployFixture);
      expect(await escrow.token()).to.equal(await usdt.getAddress());
      expect(await escrow.hasRole(await escrow.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await escrow.hasRole(await escrow.ARBITER_ROLE(), admin.address)).to.equal(true);
      expect(await escrow.paymentWindow()).to.equal(BigInt(WINDOW));
    });

    it("відхиляє нульові адреси", async () => {
      const { usdt, admin } = await loadFixture(deployFixture);
      const F = await ethers.getContractFactory("LoopsTrdEscrow");
      await expect(F.deploy(ethers.ZeroAddress, admin.address)).to.be.revertedWithCustomError(F, "ZeroAddress");
      await expect(F.deploy(await usdt.getAddress(), ethers.ZeroAddress)).to.be.revertedWithCustomError(
        F,
        "ZeroAddress",
      );
    });
  });

  describe("createDeal", () => {
    it("створює угоду з дійсним підписом сервера", async () => {
      const { escrow, signer, seller, buyer } = await loadFixture(deployFixture);
      const dealId = toId("x");
      const expiry = BigInt(await time.latest()) + 600n;
      const sig = await signCreateDeal(escrow, signer, {
        dealId,
        seller: seller.address,
        buyer: buyer.address,
        amount: AMOUNT,
        reviewRequired: true,
        expiry,
      });
      await expect(escrow.connect(seller).createDeal(dealId, buyer.address, AMOUNT, true, expiry, sig))
        .to.emit(escrow, "DealCreated")
        .withArgs(dealId, seller.address, buyer.address, AMOUNT, true);

      const d = await escrow.getDeal(dealId);
      expect(d.seller).to.equal(seller.address);
      expect(d.buyer).to.equal(buyer.address);
      expect(d.amount).to.equal(AMOUNT);
      expect(d.status).to.equal(Status.Created);
      expect(d.reviewRequired).to.equal(true);
      expect(d.reviewApproved).to.equal(false);
    });

    it("hashCreateDeal збігається з EIP-712 дайджестом ethers", async () => {
      const { escrow, seller, buyer } = await loadFixture(deployFixture);
      const { chainId } = await ethers.provider.getNetwork();
      const value = { dealId: toId("h"), seller: seller.address, buyer: buyer.address, amount: 1n, reviewRequired: false, expiry: 9n };
      const expected = ethers.TypedDataEncoder.hash(
        { name: "LoopsTrdEscrow", version: "1", chainId, verifyingContract: await escrow.getAddress() },
        {
          CreateDeal: [
            { name: "dealId", type: "bytes32" },
            { name: "seller", type: "address" },
            { name: "buyer", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "reviewRequired", type: "bool" },
            { name: "expiry", type: "uint256" },
          ],
        },
        value,
      );
      expect(
        await escrow.hashCreateDeal(value.dealId, value.seller, value.buyer, value.amount, value.reviewRequired, value.expiry),
      ).to.equal(expected);
    });

    it("клієнт не може обійти антифрод: підпис не від SIGNER_ROLE відхиляється", async () => {
      const { escrow, seller, buyer, stranger } = await loadFixture(deployFixture);
      const dealId = toId("x");
      const expiry = BigInt(await time.latest()) + 600n;
      const sig = await signCreateDeal(escrow, stranger, {
        dealId, seller: seller.address, buyer: buyer.address, amount: AMOUNT, reviewRequired: false, expiry,
      });
      await expect(
        escrow.connect(seller).createDeal(dealId, buyer.address, AMOUNT, false, expiry, sig),
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
    });

    it("продавець сам собі підписати не може", async () => {
      const { escrow, seller, buyer } = await loadFixture(deployFixture);
      const dealId = toId("x");
      const expiry = BigInt(await time.latest()) + 600n;
      const sig = await signCreateDeal(escrow, seller, {
        dealId, seller: seller.address, buyer: buyer.address, amount: AMOUNT, reviewRequired: false, expiry,
      });
      await expect(
        escrow.connect(seller).createDeal(dealId, buyer.address, AMOUNT, false, expiry, sig),
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
    });

    it("не можна змінити параметри підписаної угоди (сума, покупець, reviewRequired, продавець)", async () => {
      const { escrow, signer, seller, buyer, stranger } = await loadFixture(deployFixture);
      const dealId = toId("x");
      const expiry = BigInt(await time.latest()) + 600n;
      const sig = await signCreateDeal(escrow, signer, {
        dealId, seller: seller.address, buyer: buyer.address, amount: AMOUNT, reviewRequired: true, expiry,
      });
      await expect(
        escrow.connect(seller).createDeal(dealId, buyer.address, AMOUNT * 2n, true, expiry, sig),
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
      await expect(
        escrow.connect(seller).createDeal(dealId, stranger.address, AMOUNT, true, expiry, sig),
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
      await expect(
        escrow.connect(seller).createDeal(dealId, buyer.address, AMOUNT, false, expiry, sig),
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
      await expect(
        escrow.connect(stranger).createDeal(dealId, buyer.address, AMOUNT, true, expiry, sig),
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
    });

    it("відхиляє зіпсований підпис (неправильна довжина і «нульовий» 65-байтовий підпис)", async () => {
      const { escrow, seller, buyer } = await loadFixture(deployFixture);
      const expiry = BigInt(await time.latest()) + 600n;
      await expect(
        escrow.connect(seller).createDeal(toId("x"), buyer.address, AMOUNT, false, expiry, "0x1234"),
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
      await expect(
        escrow.connect(seller).createDeal(toId("x"), buyer.address, AMOUNT, false, expiry, "0x" + "00".repeat(65)),
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
    });

    it("відхиляє прострочений підпис", async () => {
      const { escrow, signer, seller, buyer } = await loadFixture(deployFixture);
      const dealId = toId("x");
      const expiry = BigInt(await time.latest()) + 10n;
      const sig = await signCreateDeal(escrow, signer, {
        dealId, seller: seller.address, buyer: buyer.address, amount: AMOUNT, reviewRequired: false, expiry,
      });
      await time.increase(60);
      await expect(
        escrow.connect(seller).createDeal(dealId, buyer.address, AMOUNT, false, expiry, sig),
      ).to.be.revertedWithCustomError(escrow, "SignatureExpired");
    });

    it("забороняє повторне використання dealId", async () => {
      const { escrow, create, seller, buyer, signer } = await loadFixture(deployFixture);
      const dealId = await create({ id: "dup" });
      const expiry = BigInt(await time.latest()) + 600n;
      const sig = await signCreateDeal(escrow, signer, {
        dealId, seller: seller.address, buyer: buyer.address, amount: AMOUNT, reviewRequired: false, expiry,
      });
      await expect(escrow.connect(seller).createDeal(dealId, buyer.address, AMOUNT, false, expiry, sig))
        .to.be.revertedWithCustomError(escrow, "DealExists")
        .withArgs(dealId);
    });

    it("валідує покупця і суму", async () => {
      const { escrow, seller, buyer } = await loadFixture(deployFixture);
      const expiry = BigInt(await time.latest()) + 600n;
      await expect(
        escrow.connect(seller).createDeal(toId("a"), ethers.ZeroAddress, AMOUNT, false, expiry, "0x"),
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
      await expect(
        escrow.connect(seller).createDeal(toId("a"), seller.address, AMOUNT, false, expiry, "0x"),
      ).to.be.revertedWithCustomError(escrow, "InvalidParties");
      await expect(
        escrow.connect(seller).createDeal(toId("a"), buyer.address, 0n, false, expiry, "0x"),
      ).to.be.revertedWithCustomError(escrow, "ZeroAmount");
    });

    it("не працює на паузі", async () => {
      const { escrow, create } = await loadFixture(deployFixture);
      await escrow.pause();
      await expect(create()).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });
  });

  describe("deposit", () => {
    it("переводить USDT в ескроу і встановлює 30-хвилинний дедлайн", async () => {
      const { escrow, usdt, seller, create } = await loadFixture(deployFixture);
      const id = await create();
      const before = await usdt.balanceOf(seller.address);
      const tx = escrow.connect(seller).deposit(id);
      await expect(tx).to.emit(escrow, "DealFunded").withArgs(id, AMOUNT, anyValue);
      await expect(tx).to.changeTokenBalances(usdt, [seller, escrow], [-AMOUNT, AMOUNT]);
      const d = await escrow.getDeal(id);
      expect(d.status).to.equal(Status.Funded);
      expect(d.paymentDeadline - d.fundedAt).to.equal(BigInt(WINDOW));
      expect(await usdt.balanceOf(seller.address)).to.equal(before - AMOUNT);
    });

    it("лише продавець, лише зі статусу Created", async () => {
      const { escrow, seller, buyer, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(escrow.connect(buyer).deposit(id)).to.be.revertedWithCustomError(escrow, "NotSeller");
      await escrow.connect(seller).deposit(id);
      await expect(escrow.connect(seller).deposit(id))
        .to.be.revertedWithCustomError(escrow, "InvalidStatus")
        .withArgs(id, Status.Funded);
    });

    it("неіснуюча угода", async () => {
      const { escrow, seller } = await loadFixture(deployFixture);
      await expect(escrow.connect(seller).deposit(toId("nope")))
        .to.be.revertedWithCustomError(escrow, "DealNotFound")
        .withArgs(toId("nope"));
    });

    it("падає без allowance (SafeERC20)", async () => {
      const { escrow, usdt, seller, create } = await loadFixture(deployFixture);
      const id = await create();
      await usdt.connect(seller).approve(await escrow.getAddress(), 0);
      await expect(escrow.connect(seller).deposit(id)).to.be.revertedWithCustomError(usdt, "ERC20InsufficientAllowance");
    });

    it("не працює на паузі", async () => {
      const { escrow, seller, create } = await loadFixture(deployFixture);
      const id = await create();
      await escrow.pause();
      await expect(escrow.connect(seller).deposit(id)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });
  });

  describe("markPaid", () => {
    it("покупець позначає оплату", async () => {
      const { escrow, buyer, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await expect(escrow.connect(buyer).markPaid(id)).to.emit(escrow, "DealPaid").withArgs(id, buyer.address, anyValue);
      expect((await escrow.getDeal(id)).status).to.equal(Status.Paid);
    });

    it("лише покупець", async () => {
      const { escrow, seller, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await expect(escrow.connect(seller).markPaid(id)).to.be.revertedWithCustomError(escrow, "NotBuyer");
    });

    it("лише для профінансованої угоди", async () => {
      const { escrow, buyer, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(escrow.connect(buyer).markPaid(id))
        .to.be.revertedWithCustomError(escrow, "InvalidStatus")
        .withArgs(id, Status.Created);
    });

    it("не можна після дедлайну", async () => {
      const { escrow, buyer, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await time.increase(WINDOW + 1);
      await expect(escrow.connect(buyer).markPaid(id)).to.be.revertedWithCustomError(escrow, "PaymentWindowExpired");
    });

    it("не можна для замороженої угоди", async () => {
      const { escrow, buyer, freezer, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await escrow.connect(freezer).freezeDeal(id, ethers.ZeroHash);
      await expect(escrow.connect(buyer).markPaid(id)).to.be.revertedWithCustomError(escrow, "DealIsFrozen");
    });
  });

  describe("confirmRelease", () => {
    it("продавець відпускає USDT покупцю після оплати", async () => {
      const { escrow, usdt, seller, buyer, paid } = await loadFixture(deployFixture);
      const id = await paid();
      const tx = escrow.connect(seller).confirmRelease(id);
      await expect(tx).to.emit(escrow, "DealReleased").withArgs(id, buyer.address, AMOUNT);
      await expect(tx).to.changeTokenBalances(usdt, [escrow, buyer], [-AMOUNT, AMOUNT]);
      expect((await escrow.getDeal(id)).status).to.equal(Status.Released);
    });

    it("продавець може підтвердити і без markPaid (статус Funded)", async () => {
      const { escrow, seller, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await expect(escrow.connect(seller).confirmRelease(id)).to.emit(escrow, "DealReleased");
    });

    it("покупець, сторонній, модератор і навіть адмін не можуть відпустити кошти", async () => {
      const { escrow, buyer, stranger, moderator, admin, freezer, paid } = await loadFixture(deployFixture);
      const id = await paid();
      for (const s of [buyer, stranger, moderator, admin, freezer]) {
        await expect(escrow.connect(s).confirmRelease(id)).to.be.revertedWithCustomError(escrow, "NotSeller");
      }
    });

    it("не можна двічі", async () => {
      const { escrow, seller, paid } = await loadFixture(deployFixture);
      const id = await paid();
      await escrow.connect(seller).confirmRelease(id);
      await expect(escrow.connect(seller).confirmRelease(id))
        .to.be.revertedWithCustomError(escrow, "InvalidStatus")
        .withArgs(id, Status.Released);
    });

    it("не можна з Created", async () => {
      const { escrow, seller, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(escrow.connect(seller).confirmRelease(id)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });

    it("заморожена угода не відпускає кошти", async () => {
      const { escrow, seller, freezer, paid } = await loadFixture(deployFixture);
      const id = await paid();
      await escrow.connect(freezer).freezeDeal(id, ethers.id("high-risk"));
      await expect(escrow.connect(seller).confirmRelease(id))
        .to.be.revertedWithCustomError(escrow, "DealIsFrozen")
        .withArgs(id);
    });

    it("угода в спорі не відпускає кошти", async () => {
      const { escrow, seller, disputed } = await loadFixture(deployFixture);
      const id = await disputed();
      await expect(escrow.connect(seller).confirmRelease(id))
        .to.be.revertedWithCustomError(escrow, "InvalidStatus")
        .withArgs(id, Status.Disputed);
    });

    it("середній ризик: потрібне додаткове схвалення", async () => {
      const { escrow, seller, freezer, paid } = await loadFixture(deployFixture);
      const id = await paid({ reviewRequired: true });
      await expect(escrow.connect(seller).confirmRelease(id))
        .to.be.revertedWithCustomError(escrow, "ReviewPending")
        .withArgs(id);
      await expect(escrow.connect(freezer).approveRelease(id)).to.emit(escrow, "ReleaseApproved").withArgs(id, freezer.address);
      await expect(escrow.connect(seller).confirmRelease(id)).to.emit(escrow, "DealReleased");
    });
  });

  describe("cancel", () => {
    it("Created: продавець або покупець може скасувати, сторонній — ні", async () => {
      const { escrow, seller, buyer, stranger, create } = await loadFixture(deployFixture);
      const a = await create();
      await expect(escrow.connect(stranger).cancel(a)).to.be.revertedWithCustomError(escrow, "NotParty");
      await expect(escrow.connect(seller).cancel(a)).to.emit(escrow, "DealCancelled").withArgs(a, seller.address, 0);
      const b = await create();
      await expect(escrow.connect(buyer).cancel(b)).to.emit(escrow, "DealCancelled").withArgs(b, buyer.address, 0);
      expect((await escrow.getDeal(b)).status).to.equal(Status.Cancelled);
    });

    it("Funded: покупець може скасувати будь-коли, кошти повертаються продавцю", async () => {
      const { escrow, usdt, seller, buyer, funded } = await loadFixture(deployFixture);
      const id = await funded();
      const tx = escrow.connect(buyer).cancel(id);
      await expect(tx).to.emit(escrow, "DealCancelled").withArgs(id, buyer.address, AMOUNT);
      await expect(tx).to.changeTokenBalances(usdt, [escrow, seller], [-AMOUNT, AMOUNT]);
    });

    it("Funded: продавець не може скасувати до дедлайну (покупець може саме платити)", async () => {
      const { escrow, seller, stranger, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await expect(escrow.connect(seller).cancel(id)).to.be.revertedWithCustomError(escrow, "PaymentWindowActive");
      await expect(escrow.connect(stranger).cancel(id)).to.be.revertedWithCustomError(escrow, "PaymentWindowActive");
    });

    it("автоскасування: після 30 хв + пільгового періоду будь-хто (кіпер сервера) повертає кошти продавцю", async () => {
      const { escrow, usdt, seller, stranger, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await time.increase(WINDOW + 1);
      // одразу після дедлайну — ще пільговий період: покупець, що вже заплатив, встигає відкрити спір
      await expect(escrow.connect(stranger).cancel(id)).to.be.revertedWithCustomError(escrow, "PaymentWindowActive");
      await expect(escrow.connect(seller).cancel(id)).to.be.revertedWithCustomError(escrow, "PaymentWindowActive");
      await time.increase(GRACE);
      const tx = escrow.connect(stranger).cancel(id);
      await expect(tx).to.emit(escrow, "DealCancelled").withArgs(id, stranger.address, AMOUNT);
      await expect(tx).to.changeTokenBalances(usdt, [escrow, seller], [-AMOUNT, AMOUNT]);
    });

    it("Paid: скасування неможливе навіть після дедлайну", async () => {
      const { escrow, seller, buyer, paid } = await loadFixture(deployFixture);
      const id = await paid();
      await time.increase(WINDOW + 1);
      for (const s of [seller, buyer]) {
        await expect(escrow.connect(s).cancel(id))
          .to.be.revertedWithCustomError(escrow, "InvalidStatus")
          .withArgs(id, Status.Paid);
      }
    });

    it("Disputed і заморожені угоди не скасовуються", async () => {
      const { escrow, buyer, freezer, disputed, funded } = await loadFixture(deployFixture);
      const a = await disputed();
      await expect(escrow.connect(buyer).cancel(a)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      const b = await funded();
      await escrow.connect(freezer).freezeDeal(b, ethers.ZeroHash);
      await time.increase(WINDOW + 1);
      await expect(escrow.connect(buyer).cancel(b)).to.be.revertedWithCustomError(escrow, "DealIsFrozen");
    });

    it("скасування працює навіть на паузі (повернення коштів не блокується)", async () => {
      const { escrow, buyer, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await escrow.pause();
      await expect(escrow.connect(buyer).cancel(id)).to.emit(escrow, "DealCancelled");
    });
  });

  describe("openDispute", () => {
    it("покупець або продавець відкриває спір з Funded/Paid", async () => {
      const { escrow, seller, buyer, funded, paid } = await loadFixture(deployFixture);
      const a = await paid();
      await expect(escrow.connect(buyer).openDispute(a)).to.emit(escrow, "DisputeOpened").withArgs(a, buyer.address);
      expect((await escrow.getDeal(a)).status).to.equal(Status.Disputed);
      const b = await funded();
      await expect(escrow.connect(seller).openDispute(b)).to.emit(escrow, "DisputeOpened").withArgs(b, seller.address);
    });

    it("сторонні та модератор не можуть відкрити спір у контракті", async () => {
      const { escrow, stranger, moderator, paid } = await loadFixture(deployFixture);
      const id = await paid();
      await expect(escrow.connect(stranger).openDispute(id)).to.be.revertedWithCustomError(escrow, "NotParty");
      await expect(escrow.connect(moderator).openDispute(id)).to.be.revertedWithCustomError(escrow, "NotParty");
    });

    it("не можна з Created / Released / Disputed", async () => {
      const { escrow, seller, buyer, create, paid, disputed } = await loadFixture(deployFixture);
      const a = await create();
      await expect(escrow.connect(buyer).openDispute(a)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      const b = await paid();
      await escrow.connect(seller).confirmRelease(b);
      await expect(escrow.connect(buyer).openDispute(b)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      const c = await disputed();
      await expect(escrow.connect(seller).openDispute(c)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });
  });

  describe("resolveDispute", () => {
    it("адмін віддає все покупцю", async () => {
      const { escrow, usdt, admin, buyer, disputed } = await loadFixture(deployFixture);
      const id = await disputed();
      const tx = escrow.connect(admin).resolveDispute(id, AMOUNT);
      await expect(tx).to.emit(escrow, "DisputeResolved").withArgs(id, admin.address, AMOUNT, 0);
      await expect(tx).to.changeTokenBalances(usdt, [escrow, buyer], [-AMOUNT, AMOUNT]);
      expect((await escrow.getDeal(id)).status).to.equal(Status.Resolved);
    });

    it("адмін повертає все продавцю", async () => {
      const { escrow, usdt, admin, seller, disputed } = await loadFixture(deployFixture);
      const id = await disputed();
      const tx = escrow.connect(admin).resolveDispute(id, 0);
      await expect(tx).to.emit(escrow, "DisputeResolved").withArgs(id, admin.address, 0, AMOUNT);
      await expect(tx).to.changeTokenBalances(usdt, [escrow, seller], [-AMOUNT, AMOUNT]);
    });

    it("адмін ділить суму", async () => {
      const { escrow, usdt, admin, seller, buyer, disputed } = await loadFixture(deployFixture);
      const id = await disputed();
      const toBuyer = ethers.parseEther("40");
      await expect(escrow.connect(admin).resolveDispute(id, toBuyer)).to.changeTokenBalances(
        usdt,
        [escrow, buyer, seller],
        [-AMOUNT, toBuyer, AMOUNT - toBuyer],
      );
    });

    it("не можна віддати більше, ніж у ескроу", async () => {
      const { escrow, admin, disputed } = await loadFixture(deployFixture);
      const id = await disputed();
      await expect(escrow.connect(admin).resolveDispute(id, AMOUNT + 1n)).to.be.revertedWithCustomError(
        escrow,
        "InvalidSplit",
      );
    });

    it("лише ARBITER_ROLE: модератор, антифрод, сторони — ні", async () => {
      const { escrow, seller, buyer, moderator, freezer, signer, disputed } = await loadFixture(deployFixture);
      const id = await disputed();
      const role = await escrow.ARBITER_ROLE();
      for (const s of [seller, buyer, moderator, freezer, signer]) {
        await expect(escrow.connect(s).resolveDispute(id, AMOUNT))
          .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount")
          .withArgs(s.address, role);
      }
    });

    it("вирішує заморожену угоду без спору (Funded або Paid)", async () => {
      const { escrow, usdt, admin, freezer, seller, funded, paid } = await loadFixture(deployFixture);
      const a = await funded();
      await escrow.connect(freezer).freezeDeal(a, ethers.ZeroHash);
      await expect(escrow.connect(admin).resolveDispute(a, 0)).to.changeTokenBalances(usdt, [seller], [AMOUNT]);
      const d = await escrow.getDeal(a);
      expect(d.status).to.equal(Status.Resolved);
      expect(d.frozen).to.equal(false);

      const b = await paid();
      await escrow.connect(freezer).freezeDeal(b, ethers.ZeroHash);
      await expect(escrow.connect(admin).resolveDispute(b, AMOUNT)).to.emit(escrow, "DisputeResolved");
    });

    it("вирішує заморожений спір", async () => {
      const { escrow, admin, freezer, disputed } = await loadFixture(deployFixture);
      const id = await disputed();
      await escrow.connect(freezer).freezeDeal(id, ethers.ZeroHash);
      await expect(escrow.connect(admin).resolveDispute(id, 0)).to.emit(escrow, "DisputeResolved");
    });

    it("не можна для незамороженої угоди без спору або вже завершеної", async () => {
      const { escrow, admin, paid, disputed } = await loadFixture(deployFixture);
      const a = await paid();
      await expect(escrow.connect(admin).resolveDispute(a, 0))
        .to.be.revertedWithCustomError(escrow, "InvalidStatus")
        .withArgs(a, Status.Paid);
      const b = await disputed();
      await escrow.connect(admin).resolveDispute(b, 0);
      await expect(escrow.connect(admin).resolveDispute(b, 0))
        .to.be.revertedWithCustomError(escrow, "InvalidStatus")
        .withArgs(b, Status.Resolved);
    });
  });

  describe("freezeDeal / unfreezeDeal", () => {
    it("антифрод заморожує Funded/Paid/Disputed з причиною", async () => {
      const { escrow, freezer, admin, funded, paid, disputed } = await loadFixture(deployFixture);
      const reason = ethers.id("new_account+new_device+big_amount");
      for (const id of [await funded(), await paid(), await disputed()]) {
        await expect(escrow.connect(freezer).freezeDeal(id, reason))
          .to.emit(escrow, "DealFrozen")
          .withArgs(id, freezer.address, reason);
        expect((await escrow.getDeal(id)).frozen).to.equal(true);
      }
      // адмін теж може заморожувати
      const id = await funded();
      await expect(escrow.connect(admin).freezeDeal(id, reason)).to.emit(escrow, "DealFrozen");
    });

    it("не можна заморозити двічі або завершену/нефінансовану угоду", async () => {
      const { escrow, freezer, seller, create, funded, paid } = await loadFixture(deployFixture);
      const a = await funded();
      await escrow.connect(freezer).freezeDeal(a, ethers.ZeroHash);
      await expect(escrow.connect(freezer).freezeDeal(a, ethers.ZeroHash)).to.be.revertedWithCustomError(
        escrow,
        "DealIsFrozen",
      );
      const b = await create();
      await expect(escrow.connect(freezer).freezeDeal(b, ethers.ZeroHash)).to.be.revertedWithCustomError(
        escrow,
        "InvalidStatus",
      );
      const c = await paid();
      await escrow.connect(seller).confirmRelease(c);
      await expect(escrow.connect(freezer).freezeDeal(c, ethers.ZeroHash)).to.be.revertedWithCustomError(
        escrow,
        "InvalidStatus",
      );
    });

    it("сторони та модератор не можуть заморожувати", async () => {
      const { escrow, seller, buyer, moderator, funded } = await loadFixture(deployFixture);
      const id = await funded();
      for (const s of [seller, buyer, moderator]) {
        await expect(escrow.connect(s).freezeDeal(id, ethers.ZeroHash)).to.be.revertedWithCustomError(
          escrow,
          "AccessControlUnauthorizedAccount",
        );
      }
    });

    it("розморожує лише адмін; вікно оплати подовжується", async () => {
      const { escrow, admin, freezer, buyer, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await escrow.connect(freezer).freezeDeal(id, ethers.ZeroHash);
      await time.increase(WINDOW * 2);
      await expect(escrow.connect(freezer).unfreezeDeal(id)).to.be.revertedWithCustomError(
        escrow,
        "AccessControlUnauthorizedAccount",
      );
      await expect(escrow.connect(admin).unfreezeDeal(id)).to.emit(escrow, "DealUnfrozen").withArgs(id, admin.address);
      const d = await escrow.getDeal(id);
      expect(d.frozen).to.equal(false);
      expect(d.paymentDeadline).to.be.greaterThan(BigInt(await time.latest()));
      await expect(escrow.connect(buyer).markPaid(id)).to.emit(escrow, "DealPaid");
    });

    it("розморожування Paid-угоди не змінює дедлайн; відпуск знову можливий", async () => {
      const { escrow, admin, freezer, seller, paid } = await loadFixture(deployFixture);
      const id = await paid();
      const before = (await escrow.getDeal(id)).paymentDeadline;
      await escrow.connect(freezer).freezeDeal(id, ethers.ZeroHash);
      await escrow.connect(admin).unfreezeDeal(id);
      expect((await escrow.getDeal(id)).paymentDeadline).to.equal(before);
      await expect(escrow.connect(seller).confirmRelease(id)).to.emit(escrow, "DealReleased");
    });

    it("розморожування Funded-угоди з запасом часу не скорочує дедлайн", async () => {
      const { escrow, admin, freezer, funded } = await loadFixture(deployFixture);
      // депозит з вікном 24 год, потім вікно скорочено до 5 хв: розморожування не має скорочувати дедлайн
      await escrow.connect(admin).setPaymentWindow(24 * 60 * 60);
      const id = await funded();
      await escrow.connect(admin).setPaymentWindow(5 * 60);
      const before = (await escrow.getDeal(id)).paymentDeadline;
      await escrow.connect(freezer).freezeDeal(id, ethers.ZeroHash);
      await escrow.connect(admin).unfreezeDeal(id);
      expect((await escrow.getDeal(id)).paymentDeadline).to.equal(before);
    });

    it("не можна розморозити незаморожену угоду", async () => {
      const { escrow, admin, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await expect(escrow.connect(admin).unfreezeDeal(id)).to.be.revertedWithCustomError(escrow, "DealNotFrozen");
    });
  });

  describe("approveRelease", () => {
    it("лише FREEZER або ARBITER; модератор/сторони — ні", async () => {
      const { escrow, admin, seller, buyer, moderator, paid } = await loadFixture(deployFixture);
      const id = await paid({ reviewRequired: true });
      for (const s of [seller, buyer, moderator]) {
        await expect(escrow.connect(s).approveRelease(id)).to.be.revertedWithCustomError(
          escrow,
          "AccessControlUnauthorizedAccount",
        );
      }
      await expect(escrow.connect(admin).approveRelease(id)).to.emit(escrow, "ReleaseApproved");
    });

    it("відхиляє, якщо перевірка не потрібна або угода не активна", async () => {
      const { escrow, freezer, buyer, create, paid } = await loadFixture(deployFixture);
      const a = await paid();
      await expect(escrow.connect(freezer).approveRelease(a)).to.be.revertedWithCustomError(escrow, "ReviewNotRequired");
      const b = await create({ reviewRequired: true });
      await expect(escrow.connect(freezer).approveRelease(b)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      await escrow.connect(buyer).cancel(b);
      await expect(escrow.connect(freezer).approveRelease(b)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });
  });

  describe("налаштування адміна", () => {
    it("змінює вікно оплати в межах 5 хв … 24 год", async () => {
      const { escrow, admin } = await loadFixture(deployFixture);
      await expect(escrow.connect(admin).setPaymentWindow(15 * 60))
        .to.emit(escrow, "PaymentWindowUpdated")
        .withArgs(WINDOW, 15 * 60);
      await expect(escrow.connect(admin).setPaymentWindow(60)).to.be.revertedWithCustomError(
        escrow,
        "InvalidPaymentWindow",
      );
      await expect(escrow.connect(admin).setPaymentWindow(25 * 3600)).to.be.revertedWithCustomError(
        escrow,
        "InvalidPaymentWindow",
      );
    });

    it("налаштування та пауза — лише DEFAULT_ADMIN_ROLE", async () => {
      const { escrow, stranger, freezer } = await loadFixture(deployFixture);
      for (const s of [stranger, freezer]) {
        await expect(escrow.connect(s).setPaymentWindow(600)).to.be.revertedWithCustomError(
          escrow,
          "AccessControlUnauthorizedAccount",
        );
        await expect(escrow.connect(s).pause()).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
        await expect(escrow.connect(s).unpause()).to.be.revertedWithCustomError(
          escrow,
          "AccessControlUnauthorizedAccount",
        );
      }
    });

    it("пауза/відновлення", async () => {
      const { escrow, admin, create } = await loadFixture(deployFixture);
      await escrow.connect(admin).pause();
      expect(await escrow.paused()).to.equal(true);
      await escrow.connect(admin).unpause();
      const id = await create();
      expect((await escrow.getDeal(id)).status).to.equal(Status.Created);
    });
  });

  describe("захист від повторного входу (reentrancy)", () => {
    it("зловмисний токен не може повторно викликати deposit/confirmRelease/cancel/resolveDispute", async () => {
      const [admin, signer, seller, buyer] = await ethers.getSigners();
      const evil = await ethers.deployContract("ReentrantToken");
      const escrow = await ethers.deployContract("LoopsTrdEscrow", [await evil.getAddress(), admin.address]);
      await escrow.grantRole(await escrow.SIGNER_ROLE(), signer.address);
      await evil.mint(seller.address, AMOUNT * 10n);
      await evil.connect(seller).approve(await escrow.getAddress(), ethers.MaxUint256);

      async function mk(id: string) {
        await evil.arm(ethers.ZeroAddress, "0x");
        const dealId = toId(id);
        const expiry = BigInt(await time.latest()) + 600n;
        const sig = await signCreateDeal(escrow, signer, {
          dealId, seller: seller.address, buyer: buyer.address, amount: AMOUNT, reviewRequired: false, expiry,
        });
        await escrow.connect(seller).createDeal(dealId, buyer.address, AMOUNT, false, expiry, sig);
        await escrow.connect(seller).deposit(dealId);
        return dealId;
      }

      // deposit: повторний вхід під час transferFrom продавця → ескроу
      const d0 = toId("r0");
      const exp0 = BigInt(await time.latest()) + 600n;
      const sig0 = await signCreateDeal(escrow, signer, {
        dealId: d0, seller: seller.address, buyer: buyer.address, amount: AMOUNT, reviewRequired: false, expiry: exp0,
      });
      await escrow.connect(seller).createDeal(d0, buyer.address, AMOUNT, false, exp0, sig0);
      await evil.arm(await escrow.getAddress(), escrow.interface.encodeFunctionData("deposit", [d0]));
      await expect(escrow.connect(seller).deposit(d0)).to.be.revertedWithCustomError(
        escrow,
        "ReentrancyGuardReentrantCall",
      );
      await evil.arm(ethers.ZeroAddress, "0x");

      const a = await mk("r1");
      await evil.arm(await escrow.getAddress(), escrow.interface.encodeFunctionData("confirmRelease", [a]));
      await expect(escrow.connect(seller).confirmRelease(a)).to.be.revertedWithCustomError(
        escrow,
        "ReentrancyGuardReentrantCall",
      );

      const b = await mk("r2");
      await evil.arm(await escrow.getAddress(), escrow.interface.encodeFunctionData("cancel", [b]));
      await expect(escrow.connect(buyer).cancel(b)).to.be.revertedWithCustomError(escrow, "ReentrancyGuardReentrantCall");

      const c = await mk("r3");
      await escrow.connect(buyer).openDispute(c);
      await evil.arm(await escrow.getAddress(), escrow.interface.encodeFunctionData("resolveDispute", [c, 0]));
      await expect(escrow.connect(admin).resolveDispute(c, AMOUNT)).to.be.revertedWithCustomError(
        escrow,
        "ReentrancyGuardReentrantCall",
      );
    });
  });

  describe("пільговий період і дедлайни", () => {
    it("покупець, що не встиг натиснути «Я оплатив», відкриває спір у пільговий період — скасування вже неможливе", async () => {
      const { escrow, seller, buyer, stranger, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await time.increase(WINDOW + 60);
      await expect(escrow.connect(buyer).markPaid(id)).to.be.revertedWithCustomError(escrow, "PaymentWindowExpired");
      await expect(escrow.connect(buyer).openDispute(id)).to.emit(escrow, "DisputeOpened");
      await time.increase(GRACE * 4);
      for (const s of [seller, stranger]) {
        await expect(escrow.connect(s).cancel(id)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      }
    });

    it("effectiveDeadline і cancelAvailableAt", async () => {
      const { escrow, create, funded } = await loadFixture(deployFixture);
      const a = await create();
      expect(await escrow.effectiveDeadline(a)).to.equal(0n);
      expect(await escrow.cancelAvailableAt(a)).to.equal(0n);
      const b = await funded();
      const d = await escrow.getDeal(b);
      expect(await escrow.effectiveDeadline(b)).to.equal(d.paymentDeadline);
      expect(await escrow.cancelAvailableAt(b)).to.equal(d.paymentDeadline + BigInt(GRACE));
    });

    it("адмін змінює пільговий період у межах 5 хв … 24 год", async () => {
      const { escrow, admin, stranger } = await loadFixture(deployFixture);
      await expect(escrow.connect(admin).setCancelGracePeriod(600)).to.emit(escrow, "CancelGracePeriodUpdated").withArgs(GRACE, 600);
      await expect(escrow.connect(admin).setCancelGracePeriod(60)).to.be.revertedWithCustomError(escrow, "InvalidGracePeriod");
      await expect(escrow.connect(admin).setCancelGracePeriod(25 * 3600)).to.be.revertedWithCustomError(escrow, "InvalidGracePeriod");
      await expect(escrow.connect(stranger).setCancelGracePeriod(600)).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });
  });

  describe("екстрена пауза", () => {
    it("зупиняє markPaid, confirmRelease, approveRelease (як і createDeal/deposit)", async () => {
      const { escrow, admin, seller, buyer, freezer, funded, paid } = await loadFixture(deployFixture);
      const f = await funded();
      const p = await paid({ reviewRequired: true });
      await escrow.connect(admin).pause();
      await expect(escrow.connect(buyer).markPaid(f)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
      await expect(escrow.connect(freezer).approveRelease(p)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
      await expect(escrow.connect(seller).confirmRelease(f)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });

    it("на паузі завжди доступні виходи: cancel покупцем, спір, заморозка, рішення адміна, розморожування", async () => {
      const { escrow, usdt, admin, seller, buyer, freezer, funded, paid } = await loadFixture(deployFixture);
      const a = await funded();
      const b = await paid();
      const c = await paid();
      await escrow.connect(admin).pause();
      await expect(escrow.connect(buyer).cancel(a)).to.changeTokenBalances(usdt, [seller], [AMOUNT]);
      await expect(escrow.connect(buyer).openDispute(b)).to.emit(escrow, "DisputeOpened");
      await expect(escrow.connect(admin).resolveDispute(b, AMOUNT)).to.changeTokenBalances(usdt, [buyer], [AMOUNT]);
      await escrow.connect(freezer).freezeDeal(c, ethers.ZeroHash);
      await escrow.connect(admin).unfreezeDeal(c);
      await escrow.connect(freezer).freezeDeal(c, ethers.ZeroHash);
      await expect(escrow.connect(admin).resolveDispute(c, 0)).to.changeTokenBalances(usdt, [seller], [AMOUNT]);
    });

    it("час паузи не зараховується у вікно оплати — сторонній не скасує угоду через паузу", async () => {
      const { escrow, admin, buyer, stranger, funded } = await loadFixture(deployFixture);
      const id = await funded();
      const before = await escrow.effectiveDeadline(id);
      await time.increase(10 * 60);
      await escrow.connect(admin).pause();
      await time.increase(WINDOW * 3);
      // на паузі дедлайн «рухається» разом із часом
      expect(await escrow.effectiveDeadline(id)).to.be.greaterThan(before + BigInt(WINDOW * 3) - 2n);
      await expect(escrow.connect(stranger).cancel(id)).to.be.revertedWithCustomError(escrow, "PaymentWindowActive");
      await escrow.connect(admin).unpause();
      expect(await escrow.totalPausedTime()).to.be.greaterThanOrEqual(BigInt(WINDOW * 3));
      // у покупця лишилось ~20 хв
      await time.increase(15 * 60);
      await expect(escrow.connect(buyer).markPaid(id)).to.emit(escrow, "DealPaid");
    });

    it("угода, профінансована після паузи, не отримує зайвого часу", async () => {
      const { escrow, admin, funded } = await loadFixture(deployFixture);
      await escrow.connect(admin).pause();
      await time.increase(3600);
      await escrow.connect(admin).unpause();
      const id = await funded();
      const d = await escrow.getDeal(id);
      expect(await escrow.effectiveDeadline(id)).to.equal(d.paymentDeadline);
    });

    it("розморожування Funded-угоди після паузи дає повне вікно оплати", async () => {
      const { escrow, admin, freezer, funded } = await loadFixture(deployFixture);
      const id = await funded();
      await escrow.connect(freezer).freezeDeal(id, ethers.ZeroHash);
      await escrow.connect(admin).pause();
      await time.increase(600);
      await escrow.connect(admin).unpause();
      await time.increase(WINDOW * 2);
      await escrow.connect(admin).unfreezeDeal(id);
      const now = BigInt(await time.latest());
      expect(await escrow.effectiveDeadline(id)).to.equal(now + BigInt(WINDOW));
    });
  });

  describe("токени з комісією за переказ", () => {
    it("deposit відхиляє токен, що списує комісію (сума в контракті ≠ сумі угоди)", async () => {
      const [admin, signer, seller, buyer] = await ethers.getSigners();
      const fee = await ethers.deployContract("FeeToken");
      const escrow = await ethers.deployContract("LoopsTrdEscrow", [await fee.getAddress(), admin.address]);
      await escrow.grantRole(await escrow.SIGNER_ROLE(), signer.address);
      await fee.mint(seller.address, AMOUNT * 2n);
      await fee.connect(seller).approve(await escrow.getAddress(), ethers.MaxUint256);
      const dealId = toId("fee");
      const expiry = BigInt(await time.latest()) + 600n;
      const sig = await signCreateDeal(escrow, signer, { dealId, seller: seller.address, buyer: buyer.address, amount: AMOUNT, reviewRequired: false, expiry });
      await escrow.connect(seller).createDeal(dealId, buyer.address, AMOUNT, false, expiry, sig);
      await expect(escrow.connect(seller).deposit(dealId))
        .to.be.revertedWithCustomError(escrow, "UnsupportedToken")
        .withArgs(AMOUNT, (AMOUNT * 99n) / 100n);
    });
  });

  describe("повний сценарій", () => {
    it("кілька паралельних угод не змішують кошти", async () => {
      const { escrow, usdt, admin, seller, buyer, funded, paid, disputed } = await loadFixture(deployFixture);
      const a = await paid();
      const b = await funded();
      const c = await disputed();
      expect(await usdt.balanceOf(await escrow.getAddress())).to.equal(AMOUNT * 3n);

      await escrow.connect(seller).confirmRelease(a);
      await escrow.connect(buyer).cancel(b);
      await escrow.connect(admin).resolveDispute(c, AMOUNT / 2n);
      expect(await usdt.balanceOf(await escrow.getAddress())).to.equal(0n);
    });
  });
});
