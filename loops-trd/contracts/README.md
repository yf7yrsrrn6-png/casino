# Loops Trd — смарт-контракти (BSC Testnet)

`LoopsTrdEscrow` + `MockUSDT` для закритої P2P-площадки Loops Trd (USDT ↔ UAH). **Лише тестова мережа.**

## Команди

```bash
npm install
npm test                 # 65 тестів
npm run coverage         # покриття (100% рядків/гілок для LoopsTrdEscrow і MockUSDT)
npm run deploy:testnet   # деплой у BSC Testnet (потрібен .env, див. .env.example)
```

Якщо `binaries.soliditylang.org` недоступний (фаєрвол або проксі), запускайте з `USE_SOLCJS=true`.

## Ролі в контракті

| Роль | Хто | Що може |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | адмін | видавати ролі, `setPaymentWindow`, `pause`/`unpause` |
| `ARBITER_ROLE` | адмін | `resolveDispute`, `unfreezeDeal`, `freezeDeal`, `approveRelease` |
| `SIGNER_ROLE` | серверний ключ антифроду | підписує (EIP-712) дозвіл на `createDeal` |
| `FREEZER_ROLE` | серверний ключ антифроду | `freezeDeal`, `approveRelease` |
| — | модератор | **жодних прав у контракті**, кошти рухати не може |

## Життєвий цикл угоди

```
createDeal (продавець + підпис сервера) → Created
deposit (продавець)                     → Funded, старт вікна оплати (30 хв)
markPaid (покупець, «Я оплатив»)        → Paid
confirmRelease (продавець)              → Released, USDT покупцю
cancel: Created — будь-яка сторона; Funded — покупець будь-коли / будь-хто після дедлайну → USDT продавцю
openDispute (сторона, з Funded/Paid)    → Disputed
resolveDispute(toBuyer) (адмін)         → Resolved, розподіл суми
freezeDeal (антифрод) → кошти заблоковано до resolveDispute/unfreezeDeal адміном
reviewRequired (середній ризик) → confirmRelease лише після approveRelease
```

Чому `createDeal` вимагає підпис сервера: клієнт не може створити угоду в обхід антифроду.
Підпис прив'язаний до `dealId`, продавця, покупця, суми, прапорця перевірки й терміну дії.
