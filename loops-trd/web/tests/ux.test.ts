import { describe, expect, it } from "vitest";
import { escrowAbi, mockUsdtAbi } from "@/lib/abi";
import { contractErrorText } from "@/lib/errors";
import { walletErrorText } from "@/lib/wallet-errors";
import { nextStep } from "@/components/deal/next-step";
import type { DealView } from "@/components/deal/types";

describe("Помилки українською", () => {
  it("кожна custom error контрактів має переклад", () => {
    const names = [...escrowAbi, ...mockUsdtAbi].filter((x) => x.type === "error").map((x) => x.name);
    expect(names.length).toBeGreaterThan(20);
    for (const n of names) expect(contractErrorText(n), n).not.toMatch(/Контракт відхилив транзакцію \(/);
  });
  it.each([
    ["User rejected the request.", /скасували/],
    ["insufficient funds for gas * price + value", /tBNB/],
    ["The current chain of the wallet (id: 1) does not match the target chain for the transaction (id: 97)", /мережі/],
    ["Connector not connected.", /не підключено/],
    ["Request of type 'wallet_requestPermissions' already pending", /вже відкрито запит/],
    ["fetch failed", /з'єднання/],
  ])("%s", (msg, re) => {
    expect(walletErrorText(new Error(msg))).toMatch(re);
  });
});

const base = (o: Partial<DealView["deal"]>, role: DealView["role"] = "buyer"): DealView => ({
  deal: {
    id: "d",
    chain_deal_id: "0x00",
    seller_id: "s",
    buyer_id: "b",
    seller_wallet: "0x1",
    buyer_wallet: "0x2",
    amount_usdt: "50.00",
    price_uah: "41.50",
    total_uah: "2075.00",
    payment_method: "Monobank",
    status: "funded",
    frozen: false,
    release_approved: false,
    risk_level: "low",
    risk_score: null,
    release_check: "none",
    release_check_done: false,
    buyer_sender_name: null,
    sender_name_mismatch: false,
    payment_deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
    created_at: new Date().toISOString(),
    ...o,
  },
  role,
  seller: { id: "s", display_name: "Аліса", telegram: "@a", successful_deals: 3, disputes_lost: 0, card_holder_name: "Аліса Коваль", card_last4: "1234" },
  buyer: { id: "b", display_name: "Боб", telegram: "@b", successful_deals: 0, disputes_lost: 0, card_holder_name: "Богдан Бондар", card_last4: "5678" },
  events: [],
  dispute: null,
  risks: [],
  escrow: null,
  usdt: null,
  graceMinutes: 15,
  firstDeal: true,
});

describe("«Що робити зараз»", () => {
  const now = Date.now();
  it("покупець: не платити до депозиту; платити після; спір після дедлайну", () => {
    expect(nextStep(base({ status: "awaiting_deposit" }), now).title).toMatch(/Ще не платіть/);
    const pay = nextStep(base({}), now);
    expect(pay.tone).toBe("you");
    expect(pay.text).toContain("*1234");
    expect(pay.deadline).toBeDefined();
    const late = nextStep(base({ payment_deadline: new Date(now - 60_000).toISOString() }), now);
    expect(late.tone).toBe("alert");
    expect(late.text).toMatch(/спір/);
  });
  it("продавець: депозит → чекати → перевірити банк → повернути після пільгового періоду", () => {
    expect(nextStep(base({ status: "awaiting_deposit" }, "seller"), now).title).toMatch(/внесіть USDT/);
    expect(nextStep(base({}, "seller"), now).title).toMatch(/Чекаємо оплату/);
    expect(nextStep(base({ status: "paid" }, "seller"), now).text).toMatch(/Богдан Бондар/);
    expect(nextStep(base({ status: "paid", release_check: "staff" }, "seller"), now).title).toMatch(/модератор/);
    expect(nextStep(base({ payment_deadline: new Date(now - 20 * 60_000).toISOString() }, "seller"), now).title).toMatch(/не оплатив/);
  });
  it("заморожено / спір / кінцеві стани", () => {
    expect(nextStep(base({ frozen: true }), now).tone).toBe("alert");
    expect(nextStep(base({ status: "disputed" }), now).title).toMatch(/Спір/);
    expect(nextStep(base({ status: "released" }), now).tone).toBe("done");
  });
});
