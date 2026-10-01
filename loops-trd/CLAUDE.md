# Loops Trd — інструкції для Claude

Закрита P2P-площадка обміну **USDT ⇄ UAH** між друзями. Інтерфейс, коментарі в коді й повідомлення — **українською**.
Лише **BNB Smart Chain Testnet (chainId 97)** і тестовий токен **mUSDT**. Mainnet заборонено.

## Структура

```
loops-trd/
├── contracts/            Hardhat + OpenZeppelin 5, Solidity 0.8.28
│   ├── contracts/LoopsTrdEscrow.sol   ескроу (стани, ролі, пауза, пільговий період)
│   ├── contracts/MockUSDT.sol         тестовий USDT (18 decimals, кран)
│   ├── contracts/test/*.sol           лише для тестів (ReentrantToken, FeeToken, Multicall3)
│   ├── test/*.test.ts                 юніт + fuzz/інваріанти (fast-check)
│   └── scripts/deploy.ts, export-abi.ts
├── web/                  Next.js 16 (App Router, збірка webpack) + React 19 + Tailwind 4
│   ├── supabase/migrations/           схема + RLS (порядок файлів важливий); cron.sql — шаблон pg_cron
│   ├── src/server/                    ЛИШЕ сервер
│   │   ├── services/deals/            угоди: create, sync (з контрактом), release, lifecycle, view
│   │   ├── services/keeper.ts         кіпер: автоскасування, індексатор подій, звірка, газ
│   │   ├── services/identity.ts       SIWE, інвайти, профіль, підписи критичних дій
│   │   ├── services/staff.ts          модератор/адмін
│   │   ├── antifraud/                 engine (чиста функція), config, repository, providers
│   │   ├── chain.ts                   viem-шлюз до контракту (черга транзакцій через pg advisory lock)
│   │   ├── http.ts                    обгортка маршрутів: Origin, rate limit, uuid, помилки, Telegram
│   │   └── db.ts, auth.ts, session.ts, rate-limit.ts, telegram.ts, audit.ts, monitoring.ts
│   ├── src/app/                       сторінки й /api/** (тонкі обгортки над services)
│   ├── src/components/deal/           сторінка угоди по компонентах
│   ├── tests/*.test.ts                vitest на справжньому Postgres (PGlite) з міграціями й RLS
│   ├── e2e/run.ts                     API-сценарій на локальному вузлі (chainId 97)
│   └── e2e/ui/*.spec.ts               Playwright (тестовий гаманець через розблоковані акаунти Hardhat)
└── docs/                 інструкції для учасників, бекапи
```

## Команди

```bash
# контракти (USE_SOLCJS=true, якщо binaries.soliditylang.org недоступний)
cd loops-trd/contracts && npm test && npm run coverage
npm run export-abi            # після БУДЬ-ЯКОЇ зміни контракту → web/src/lib/abi.ts

# сайт
cd loops-trd/web
npm run lint && npm run typecheck && npm test
npm run build                 # next build --webpack
npm run e2e                   # API e2e (потрібна збірка)
npm run e2e:ui                # Playwright (сам збирає з NEXT_PUBLIC_E2E=1); PW_CHROMIUM_PATH=… якщо браузер уже є
npm run worker                # кіпер у циклі (VPS/Docker)
```

## Архітектурні правила

- **Джерело правди про кошти — контракт.** Статус угоди в БД змінюється лише в `services/deals/sync.ts` відповідно до стану в контракті. Не додавайте шляхів, що міняють `deals.status` для профінансованих угод в обхід sync.
- **Антифрод не обходиться:** підпис EIP-712 для `createDeal` видається лише після `assessDeal`; усі угоди створюються з `reviewRequired = true`, тож `confirmRelease` можливий лише після серверного `approveRelease`.
- **RLS усюди.** Запити від імені користувача — через `asUser(db, userId, fn)` (роль `authenticated` + `request.jwt.claims`). Системні запити (`ctx.db`) — лише після явної перевірки прав у сервісі. Усередині колбеку `asUser` використовуйте ЛИШЕ `tx`, не `ctx.db` (дедлок на одному з'єднанні).
- **Учасник не бачить пояснень антифроду:** колонка `deal_events.details`, `risk_assessments`, `risk_score` — лише персоналу.
- **Критичні дії адміна** (схвалення/блокування, ролі, ліміти, чорний список, налаштування антифроду, рішення щодо заморожених угод) — лише з підписом гаманця: `verifyActionSignature` (nonce одноразовий, дані дії фіксуються).
- **Модератор не має ролі в контракті** і ніколи не відпускає кошти; рішення спорів — адмін зі свого гаманця (`resolveDispute`), сервер звіряє подію в блокчейні.
- **Транзакції серверного гаманця** — лише через `EscrowGateway` (черга + зрозумілі помилки `chainError`).
- **IP клієнта** — лише через `clientIp()` (TRUSTED_IP_HEADER / TRUST_PROXY_HOPS), ніколи перший запис X-Forwarded-For.
- Тексти помилок контракту — `src/lib/errors.ts` (тест перевіряє, що кожна custom error має переклад).

## ЗАБОРОНИ

- **Ніколи не змінювати логіку ескроу-контракту без тестів.** Будь-яка зміна `LoopsTrdEscrow.sol` → нові/оновлені тести, `npm run coverage` = 100%, fuzz (`FUZZ_RUNS=300 npx hardhat test test/LoopsTrdEscrow.fuzz.test.ts`), Slither без Medium/High, `npm run export-abi`, оновити FakeEscrow у `web/tests/harness.ts`.
- Не додавати в контракт функцій, що дозволяють адміну/серверу вивести довільні кошти чи змінити отримувача.
- Не вмикати mainnet (chainId 56/1) ні в Hardhat, ні в env — сервер і деплой-скрипт навмисно відмовляються.
- Не зберігати повні номери карток, документи, фото, приватні ключі чи seed-фрази. Лише 4 останні цифри.
- Не послаблювати RLS-політики й не видавати `authenticated` права на запис у `deals`, `disputes`, `profiles` (зміни — лише сервером).
- Не повертати учасникам `details` подій, сигнали ризику чи бали.
- Не логувати секрети (SESSION_SECRET, BACKEND_SIGNER_PRIVATE_KEY, CRON_SECRET, токен Telegram) і не передавати їх у клієнтський код (`NEXT_PUBLIC_*` — лише публічне).
- Не надсилати HTTP-запити (Telegram, RPC) всередині транзакцій БД — для Telegram є outbox.
- Не використовувати `any` і `as never` (ESLint `no-explicit-any: error`).
- Не прибирати `--webpack` зі скриптів: Turbopack не вміє вимикати необов'язкові модулі конекторів гаманців.

## Перед комітом

`npm run lint && npm run typecheck && npm test` у `web/`, `npm test` у `contracts/`. Для змін угод/контракту — також `npm run build && npm run e2e` (і за можливості `npm run e2e:ui`).
