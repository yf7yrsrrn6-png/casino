# Loops Trd — смарт-контракти (BSC Testnet)

`LoopsTrdEscrow` + `MockUSDT` для закритої P2P-площадки Loops Trd (USDT ↔ UAH). **Лише тестова мережа.**
Повна документація функцій і станів — NatSpec у `contracts/LoopsTrdEscrow.sol`.

## Команди

```bash
npm install
npm test                 # 76 тестів: юніт + fuzz/інваріанти (FUZZ_RUNS=300 для глибшого прогону)
npm run coverage         # 100% рядків/гілок/функцій
npm run deploy:testnet   # деплой у BSC Testnet (.env, див. .env.example)
npm run export-abi       # ABI → ../web/src/lib/abi.ts (після кожної зміни контракту!)
```

Якщо `binaries.soliditylang.org` недоступний — `USE_SOLCJS=true`. Статичний аналіз:
`slither . --hardhat-ignore-compile --filter-paths "node_modules|contracts/test" --exclude-dependencies --fail-medium`.

## Ролі

| Роль | Хто | Що може |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | адмін (краще Safe) | ролі, `setPaymentWindow`, `setCancelGracePeriod`, `pause`/`unpause` |
| `ARBITER_ROLE` | адмін | `resolveDispute`, `unfreezeDeal`, `freezeDeal`, `approveRelease` |
| `SIGNER_ROLE` | серверний ключ | EIP-712 підпис дозволу на `createDeal` (після антифроду) |
| `FREEZER_ROLE` | серверний ключ | `freezeDeal`, `approveRelease` |
| — | модератор | **жодних прав**, кошти рухати не може |

## Стани

```
None ─createDeal→ Created ─deposit→ Funded ─markPaid→ Paid ─confirmRelease→ Released
                    │ cancel          │ │ openDispute    │ openDispute
                    ▼                 │ ▼                ▼
                Cancelled ◀─cancel────┘ Disputed ─resolveDispute→ Resolved
frozen — прапорець для Funded/Paid/Disputed: вихід лише через resolveDispute / unfreezeDeal (адмін)
```

- **Вікно оплати** 30 хв після `deposit` (`effectiveDeadline` — без урахування часу пауз).
- **Пільговий період** 15 хв після дедлайну: скасувати угоду може лише покупець; сторонні (продавець, кіпер) — після `cancelAvailableAt`. Покупець, що вже заплатив, встигає відкрити спір.
- **Екстрена пауза** зупиняє `createDeal`, `deposit`, `markPaid`, `confirmRelease`, `approveRelease`; завжди доступні `cancel` покупцем, `openDispute`, `freezeDeal`/`unfreezeDeal`, `resolveDispute`.
- **Кошти не застрягають:** з кожного стану з коштами є вихід (покупець/таймаут/спір/адмін) — перевіряється fuzz-тестом на інваріант «адмін завжди може вивести все».
- Токени з комісією за переказ відхиляються (`UnsupportedToken`).
- Жодної функції виведення довільних коштів адміном немає.

`createDeal` вимагає підпис сервера (прив'язаний до `dealId`, продавця, покупця, суми, `reviewRequired`, терміну дії), тож клієнт не може створити угоду в обхід антифроду; з `reviewRequired = true` відпуск коштів можливий лише після `approveRelease`.
