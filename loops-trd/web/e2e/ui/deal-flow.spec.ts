import { expect, test, type Page } from "@playwright/test";
import { adminApprove, adminCall, connect, expectToast, go, login, openAs, state } from "./helpers";

/**
 * Основні сценарії в браузері (послідовно, спільний стан):
 *  вхід з інвайтом → анкета → схвалення → оголошення → повна угода → скасування → спір і рішення адміна.
 */
test.describe.configure({ mode: "serial" });

let seller: Page;
let buyer: Page;
let sellerAddr: string;
let buyerAddr: string;

test("вхід за інвайтом, анкета, статус «Очікує підтвердження»", async ({ browser }) => {
  const s = state();
  sellerAddr = s.accounts[3];
  buyerAddr = s.accounts[4];
  seller = await openAs(browser, sellerAddr);
  buyer = await openAs(browser, buyerAddr);

  // без інвайту — підказка
  await seller.goto("/login");
  await connect(seller);
  await seller.getByRole("button", { name: "Підписати та увійти" }).click();
  await expect(seller.getByText(/потрібен інвайт-код/i).first()).toBeVisible();

  for (const [page, invite, name, holder, last4] of [
    [seller, s.invites[0], "Аліса", "Аліса Коваль", "1111"],
    [buyer, s.invites[1], "Боб", "Богдан Бондар", "2222"],
  ] as const) {
    await login(page, invite);
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel("Ім'я (як вас знають друзі)").fill(name);
    await page.getByLabel("Telegram").fill(`@${name === "Аліса" ? "alice" : "bob"}_ui_test`);
    await page.getByLabel("Ім'я власника картки").fill(holder);
    await page.getByLabel("Останні 4 цифри картки").fill(last4);
    await page.getByRole("button", { name: "Надіслати на перевірку" }).click();
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByText("Очікує підтвердження").first()).toBeVisible();
  }
  await adminApprove(sellerAddr);
  await adminApprove(buyerAddr);
});

test("продавець отримує тестові mUSDT і створює оголошення", async () => {
  await go(seller, "/account");
  await seller.getByRole("button", { name: "Отримати 1000 mUSDT" }).click();
  await expectToast(seller, "Отримано 1000 mUSDT");

  await go(seller, "/offers");
  await seller.getByRole("button", { name: "+ Створити" }).click();
  await seller.getByLabel("Ціна за 1 USDT, ₴").fill("41.5");
  await seller.getByLabel("Мін. сума, USDT").fill("10");
  await seller.getByLabel("Макс. сума, USDT").fill("90");
  await seller.getByRole("button", { name: "Опублікувати" }).click();
  await expect(seller.getByText("Продаю USDT").first()).toBeVisible();
});

async function buyerOpensDeal(amount: string) {
  await go(buyer, "/market");
  await buyer.getByRole("button", { name: "Купити", exact: true }).first().click();
  await buyer.getByLabel(/Сума, USDT/).fill(amount);
  await buyer.getByRole("button", { name: "Створити угоду" }).click();
  await buyer.waitForURL(/\/deals\/[0-9a-f-]{36}/);
  if (process.env.E2E_DEBUG) {
    const q = await adminCall<{ queue: { score: number; signals: { explanation: string }[] }[] }>("/api/admin/antifraud");
    console.log("risk:", q.queue[0]?.score, q.queue[0]?.signals.map((x) => x.explanation));
  }
  return buyer.url();
}

async function sellerDeposits(url: string) {
  await go(seller, url);
  await seller.getByRole("button", { name: /Внести .* в ескроу/ }).click();
  await expect(seller.getByText("Чекаємо оплату від покупця")).toBeVisible({ timeout: 90_000 });
}

test("повна угода: депозит → «Я оплатив» → підтвердження → USDT у покупця", async () => {
  const url = await buyerOpensDeal("20");
  await expect(buyer.getByText("Ще не платіть")).toBeVisible();
  await sellerDeposits(url);

  await go(buyer, buyer.url());
  await expect(buyer.getByText("Ваш хід: оплатіть гривнею")).toBeVisible();
  await buyer.getByRole("button", { name: "Я оплатив" }).click();
  await expect(buyer.getByText("Чекаємо продавця")).toBeVisible({ timeout: 90_000 });

  await go(seller, seller.url());
  await expect(seller.getByText("Ваш хід: перевірте банк")).toBeVisible();
  await seller.getByLabel(/Я бачу зарахування/).check();
  await seller.getByRole("button", { name: "Так, збігається" }).click();
  await seller.getByRole("button", { name: "Підтвердити отримання та відпустити USDT" }).click();
  await expect(seller.getByText("Угоду завершено").first()).toBeVisible({ timeout: 90_000 });

  await go(buyer, buyer.url());
  await expect(buyer.getByText("Угоду завершено").first()).toBeVisible();
  await expect(buyer.getByText("USDT відправлено покупцю").first()).toBeVisible();
});

test("скасування угоди до депозиту", async () => {
  await buyerOpensDeal("15");
  await buyer.getByRole("button", { name: "Скасувати угоду" }).click();
  await expect(buyer.getByText("Угоду скасовано").first()).toBeVisible({ timeout: 60_000 });
});

test("спір: покупець відкриває, адмін вирішує транзакцією зі свого гаманця", async ({ browser }) => {
  const url = await buyerOpensDeal("25");
  await sellerDeposits(url);
  await go(buyer, buyer.url());
  await buyer.getByRole("button", { name: "Відкрити спір" }).click();
  await buyer.getByLabel("Що сталося?").fill("Переказав 1037,50 грн о 14:05, продавець не відповідає");
  await buyer.getByRole("dialog").getByRole("button", { name: "Відкрити спір" }).click();
  await expect(buyer.getByText("Спір на розгляді")).toBeVisible({ timeout: 90_000 });

  const s = state();
  const admin = await openAs(browser, s.accounts[1]);
  await login(admin);
  await go(admin, url);
  await expect(admin.getByText("Остаточне рішення (адміністратор)")).toBeVisible();
  await admin.getByLabel("Обґрунтування рішення").fill("Покупець надав підтвердження переказу");
  await admin.getByRole("button", { name: "Виконати рішення" }).click();
  await expect(admin.getByText("Рішення ухвалено")).toBeVisible({ timeout: 90_000 });

  await go(buyer, buyer.url());
  await expect(buyer.getByText("Вирішено адміном").first()).toBeVisible();
});
