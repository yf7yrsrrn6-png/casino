# Lucky7 — Demo Casino

A demo casino playground built as a front-end mock-up. No real money, no real payments, no real gambling — everything runs on a virtual demo balance stored in the browser. Built so a real game engine / backend can be wired in later.

## Features

- **Home page** with hero, featured slots, and game showcase
- **6 playable slot machines** (3×3 grid, 5 paylines, weighted symbols, animated reels)
- **Virtual blackjack** table (hit / stand / double, dealer AI, blackjack 3:2 payout)
- **Registration & login** with email + password (demo only — hashed and stored in `localStorage`, no backend)
- **Wallet** with instant free demo top-ups and full transaction history
- **Profile** with stats (wagered, won, games played, favorite game)
- **Settings** — language, sound/animation toggles, change password, delete account
- **3 languages**: Ukrainian, Russian, English (switch anytime, persisted)

## Stack

React + TypeScript + Vite, Tailwind CSS v4, React Router, Zustand (with `localStorage` persistence), i18next.

## Development

```bash
npm install
npm run dev      # start dev server
npm run build    # type-check + production build
npm run lint     # oxlint
```

## Notes

This is a demo mock-up. All balances are virtual play-money with zero real-world value. Passwords are hashed client-side (SHA-256) purely for the demo — there is no server, so this is not a substitute for real authentication.
