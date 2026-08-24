# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**La Bolera Universo** — a bowling lane management and scoring system shipped both as a web app (Vercel) and a native desktop app (Electron). It manages game sessions, player scoring, cash box accounting, and daily email reports.

The app is a **single-lane kiosk terminal**: one installation per lane, one active game session at a time, cash box state held locally. `laneId` exists in the models but is always `1`; the lane is identified for reports by a free-text `laneName` the operator types at closing time (persisted in `localStorage` under `bowling_lane_name`).

Code comments, UI strings, log messages, and the `Impls/` docs are in **Spanish**. Match that when editing; identifiers and types are English.

## Common Commands

```bash
# Development
npm start                  # Web dev server at localhost:4200 (uses the development config)
npm run electron:dev       # Production build then launch Electron

# Production builds
npm run build              # → dist/bolera/browser/ (production is the DEFAULT build config)
npm run build:electron     # Adds --base-href ./ — required so Electron can load assets over file://
npm run dist:mac           # macOS .dmg + .zip via electron-builder
npm run dist:win           # Windows nsis + portable (x64 + arm64)
npm run dist:all           # macOS + Windows → release/

# Testing (no `npm test` script — call the CLI directly)
npx ng test --watch=false --browsers=ChromeHeadless                              # one-shot, 24 specs
npx ng test --include='**/auth-guard.spec.ts' --watch=false --browsers=ChromeHeadless   # single spec
npx ng test                # interactive watch mode in a real Chrome window
```

There is no lint script. Prettier config lives in `package.json` (`printWidth: 100`, `singleQuote: true`; HTML uses the Angular parser).

Test runs print loud `GoTrueClient` / `Navigator LockManager` errors from Supabase — those are noise from the real client being constructed in specs, not failures. Check the `TOTAL:` line.

## Architecture

### Technology Stack
Angular 20 (standalone components, zone-based CD) · TypeScript 5.9 · RxJS 7.8 · Tailwind CSS 4 + DaisyUI 4 · Supabase (Postgres + RLS + email/password auth) · Vercel Functions (`api/send-email.ts`) · Resend · SheetJS (`xlsx`) · Electron 40 + electron-builder.

### Application Flow

```
Login → Home (open cash box) → BowlingScorer (/game) → finish/cancel → Home → close cash box → Excel + email
```

Routes (`src/app/app.routes.ts`): `/login`, `/` (Home, `authGuard`), `/game` (`authGuard` + `preventNavigationGuard`), `/admin` (`adminGuard`).

`GlobalErrorHandler` (`src/app/errors/global-error-handler.ts`) is wired in `app.config.ts` and pipes every unhandled error into `LoggingService` as `system/unhandled_error`.

### Core Component: BowlingScorer

`src/app/bowling-scorer/bowling-scorer.ts` (~1150 lines) holds nearly all game logic. Non-obvious behaviors worth knowing before touching it:

- **Timer is wall-clock based.** `targetEndTime = Date.now() + remaining*1000`, polled every 500 ms, so it survives backgrounded tabs. Extensions bump both `timeRemaining` and `targetEndTime`.
- **`stopPending` soft finish.** When the countdown hits 0 the game does *not* stop; `stopPending` is set and `moveToNextTurn()` calls `finishGame()` only once the current player round completes. Any time extension clears `stopPending`.
- **Billing ignores real elapsed time.** `calculateBilledDuration()` returns `this.timeLimit` — the full selected time plus any extensions — whether the game finished naturally or was cancelled early. Cancelling does not refund.
- **Time options.** Initial 30 or 60 min via `changeTimeLimit()` (only before `gameStarted`). Extensions are password-gated: `add5` (compensation), `add30`, `add60`. For `initialTimeLimit <= 30`, `startGame()` pre-sets `alertedAt15` so the 15-minute warning is suppressed.
- **Extending from the finished modal reopens the game.** `validatePassword()` clears `gameFinished`, restarts the timer, and `currentSessionId` is deliberately *not* nulled in `finishGame()` so the second `endGame()` call updates the same accounting record with the corrected `addedTimeLimit`.
- **Strict vs lax scoring.** `calculateFrameScore()` / `calculateTotalScore()` take a `strict` flag. Strict (default, used for the on-screen running total) returns `null` while bonus balls are missing. Lax (`strict = false`, used by `getFinalScore()` for winners and the end screen) counts pins actually knocked down — that's how interrupted games still produce a score.
- **Game chaining.** Completing frame 10 pushes the score into `player.completedGames`, increments `currentGameNumber`, and resets frames; the timer keeps running.
- **Edit mode** is inline (no modal): keys write into whichever `.kb-focused` cell the DOM reports, validated by `isValidEditScore()`, then `saveEditedScore()` applies frame-10/strike cleanup rules and calls `recalculateCurrentRoll()` to resync whose turn it is.

### Keyboard navigation convention

`KeyboardNavService` is a singleton with a document-level `keydown` listener driving arrow/Enter navigation across elements carrying the **`kb-focusable`** class; the active element gets **`kb-focused`**.

- Opening a modal must call `enterScope(selector)` and closing it must call `exitScope()` — otherwise focus leaks to the elements behind the overlay. Scope selectors are `[data-modal="..."]` in BowlingScorer and `#modal-...` ids in Home.
- BowlingScorer stacks scopes (e.g. game-finished → password-prompt), so extending time from the finished modal calls `exitScope()` twice.
- Edit-mode roll cells carry `data-pindex` / `data-findex` / `data-rindex`; the component reads the focused cell back out of the DOM via `getFocusedRollFromDom()`.

### Key Services

| Service | Responsibility |
|---|---|
| `auth.service.ts` | Supabase auth, device token registration/validation, role, `verifyPassword` |
| `accounting.service.ts` | Session persistence (localStorage), day open/close, Excel generation, email dispatch |
| `keyboard-nav.service.ts` | Keyboard navigation with modal scope management |
| `logging.service.ts` | Structured logging to the Supabase `app_logs` table |
| `supabase.ts` | Supabase client singleton |

### Accounting & day close

Sessions live only in `localStorage` (`bowling_daily_sessions`); `bowling_day_open` holds the open/closed flag. There is no server-side record of games — losing localStorage loses the day.

`closeDayAndExport()` is the one flow with real ordering subtleties:
1. Builds the workbook and writes the `.xlsx` locally via `XLSX.writeFile`.
2. POSTs the base64 workbook to `/api/send-email`. **Fire-and-forget for the UI**, but sessions are cleared only inside `.then()`/`.catch()` — so a failed send still clears the day, while an in-flight send keeps the data around.
3. `isClosingDay` guards against double submits.
4. In Electron (`window.location.protocol === 'file:'`) the fetch target is hardcoded to `https://labolerauniverso.nick-bern.com/api/send-email`; on web it is relative. Changing the production domain means changing this constant *and* `ALLOWED_ORIGINS` in `api/send-email.ts`.
5. Home blocks closing when offline (`checkInternetConnection()` pings `1.1.1.1` with `no-cors`).

`day_opened` logs are enriched asynchronously (`logOpenDay()`) with the human device name from `authorized_devices` plus a local `America/Bogota` timestamp, since `created_at` in Supabase is UTC.

### Backend API

`api/send-email.ts` (Vercel Function): validates the `x-api-secret` header against `process.env.API_SECRET`, escapes all interpolated values with `escapeHtml`, and sends the HTML report plus the Excel attachment through Resend. CORS allows the production origin, and also `Origin: null` / missing origin (Electron `file://` and server-to-server).

### Database (Supabase)

| Table | Purpose |
|---|---|
| `authorized_devices` | Device token (unique), name, `is_active`, `last_seen`, linked `user_id` |
| `app_config` | Key/value config — `max_devices` (default 6 if unset) |
| `app_logs` | `level` × `category` × `event` + jsonb `details` + `device_token`; RLS: any authenticated user inserts, only admins read |

Migrations live in `supabase/migrations/` and are applied manually.

### Security Model

- `authGuard` / `adminGuard` (`src/app/guards/`) both call `AuthService.restoreSession()` on **every** activation — a Supabase round trip per navigation, with up to 3 retries at 1.5 s intervals to survive a cold network at kiosk boot. This is the main navigation latency cost; see `Impls/003`.
- Role comes from `user.user_metadata.role` (`'admin' | 'client'`, defaulting to `'client'`); grant admin by setting it on the user in Supabase Auth.
- A UUID device token in localStorage (`bowling_device_token`) is a second factor for `client` users, enforced at login and on `restoreSession()`. **Admins bypass the device check entirely.** `restoreSession()` distinguishes "device genuinely revoked/missing" (sign out + delete the token) from "network/RLS lookup failed" (fail closed but keep the token) — preserve that distinction when editing.
- Password gates (via `AuthService.verifyPassword`, which re-runs `signInWithPassword` for the current session's email): open cash box, close cash box, cancel game, extend game time.
- F5 / Ctrl+R / Ctrl+W are blocked during an active game by a `@HostListener` in BowlingScorer, plus `beforeunload` and `preventNavigationGuard` → `canDeactivate()`. In Electron, `main.js` blocks those keys window-wide regardless of app state.

### Environment & Secrets

`src/environments/environment.ts` (production) and `environment.development.ts` are **both committed with real values** — Supabase URL, anon key, and `apiSecret`. `apiSecret` therefore ships inside the client bundle; it is a low-value shared secret gating the email endpoint, not a real credential. Keep it in sync with `API_SECRET` in Vercel.

Angular swaps in the development file only under `--configuration development` (`fileReplacements` in `angular.json`), which is what `ng serve` uses; every build script uses production.

Server-side `.env` (Vercel only, not versioned): `RESEND_API_KEY`, `REPORT_EMAIL` (comma-separated), `FROM_EMAIL`, `BCC_EMAIL`, `API_SECRET`.

### Deployment

- **Web:** auto-deploys to Vercel on push to `main`; the serverless function goes with it.
- **Electron:** manual `npm run dist:*` → `release/`. `main.js` loads `dist/bolera/browser/index.html` from disk, so the Angular build must exist and must have been built with `--base-href ./`.

## `Impls/` — implementation records

`Impls/NNN-slug.md` are numbered Spanish design/implementation records (context, current behavior, change, testing, status). Recent work — the 30-minute time option (001), `day_opened` log enrichment (002), and a **paused** LCP/TTFB/INP performance audit (003) — is documented there. Read the relevant record before revisiting one of those areas, and add a new numbered file when doing comparable work.
