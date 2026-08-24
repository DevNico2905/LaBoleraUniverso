# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**La Bolera Universo** — a bowling lane management and scoring system built as both a web app (deployed on Vercel) and a native desktop app via Electron. It manages game sessions, player scoring, cash box accounting, and daily email reports.

## Common Commands

```bash
# Development
npm start                  # Web dev server at localhost:4200
npm run electron:dev       # Build then launch Electron desktop app

# Production builds
npm run build              # Web production build → dist/bolera/browser/
npm run build:electron     # Angular prod build with --base-href ./ (required so Electron can load assets via file://)
npm run dist:mac           # macOS .dmg + .zip via electron-builder
npm run dist:win           # Windows .exe + portable
npm run dist:all           # All platforms → release/

# Testing
ng test                    # Run Karma/Jasmine unit tests (all specs)
ng test --include='**/auth-guard.spec.ts'   # Run a single spec file
```

There is no lint script and no `test` npm script — use `ng test` directly. Prettier config lives in `package.json` (`printWidth: 100`, `singleQuote: true`; HTML uses the Angular parser).

## Architecture

### Technology Stack
- **Frontend:** Angular 20, TypeScript 5.9, RxJS 7.8
- **Styling:** Tailwind CSS 4 + DaisyUI 4
- **Auth/DB:** Supabase (PostgreSQL with RLS, email/password auth)
- **Serverless API:** Vercel Functions (`api/send-email.ts`)
- **Email:** Resend
- **Excel:** SheetJS (xlsx)
- **Desktop:** Electron 40 + electron-builder

### Application Flow

```
Login → Home (cash box) → BowlingScorer → Accounting → Email Report
```

1. **Login** (`src/app/login/`) — Authenticates via Supabase; registers/validates a device UUID token stored in localStorage as a second factor for non-admin users.
2. **Home** (`src/app/home/`) — Password-protected cash box open/close; launches new game sessions with player and time configuration.
3. **BowlingScorer** (`src/app/bowling-scorer/bowling-scorer.ts`) — Core game component (large, ~1100+ lines). Handles real-time frame scoring with 10th-frame special rules, multiple players (1–9), countdown timer with extensions, and game chaining. Route is `/game`, protected by `preventNavigationGuard` (`src/app/prevent-navigation.guard.ts`) which delegates to the component's `canDeactivate()` to block leaving mid-game.
4. **Accounting** (`src/app/services/accounting.service.ts`) — Tracks sessions in localStorage, generates Excel reports via SheetJS, and triggers email delivery.
5. **Admin** (`src/app/admin/`) — Device approval management and device limit configuration.

### Key Services

| Service | Responsibility |
|---|---|
| `auth.service.ts` | Supabase auth, device token management, role checks (admin vs client) |
| `accounting.service.ts` | Session persistence (localStorage), Excel generation, email dispatch |
| `keyboard-nav.service.ts` | Keyboard navigation with modal scope management |
| `logging.service.ts` | Structured logging to Supabase `app_logs` table |
| `supabase.ts` | Supabase client singleton |

### Backend API

`api/send-email.ts` is a Vercel serverless function that:
- Validates a shared secret header (`x-api-secret`)
- Sanitizes HTML input to prevent XSS
- Sends email + Excel attachment via Resend
- Supports CORS for both web origin and Electron (`file://`)

### Database (Supabase)

| Table | Purpose |
|---|---|
| `authorized_devices` | Device tokens, activation status, linked user |
| `app_config` | Key-value config (e.g., `max_devices`) |
| `app_logs` | Structured logs with level/category/event; RLS restricts reads to admins |

### Security Model

- Route guards: `authGuard` (requires session) and `adminGuard` (requires session + admin role); both in `src/app/guards/`
- User role is read from Supabase `user.user_metadata.role` (`'admin' | 'client'`, defaults to `'client'`); set it on the user in Supabase Auth to grant admin
- Device token (UUID) in localStorage acts as a second auth factor for client users; enforced on both login and `restoreSession()` — admins bypass the device check
- Passwords required for: open/close cash box, cancel game, extend game time (verified via `AuthService.verifyPassword`, which re-attempts `signInWithPassword`)
- F5, Ctrl+R, Ctrl+W are blocked during active games to prevent accidental navigation. In Electron this is enforced in `main.js` via `before-input-event` on the whole window (regardless of app state)
- RLS policies: authenticated users can insert logs; only admins can read them

### Environment & Secrets

- `src/environments/environment.ts` (production) and `environment.development.ts` (development). Angular's build swaps the dev file in under `--configuration development` via `fileReplacements` in `angular.json`. Both hold Supabase URL, anon key, and `apiSecret`.
- The client sends `apiSecret` in the `x-api-secret` header; the Vercel function reads it as `process.env.API_SECRET`. Keep those two values in sync.
- `.env` (not versioned, Vercel only) — `RESEND_API_KEY`, `REPORT_EMAIL` (comma-separated for multiple recipients), `FROM_EMAIL`, `BCC_EMAIL`, `API_SECRET`.

### Deployment

- **Web:** Auto-deploys to Vercel on push to main
- **Electron:** Manual build via `npm run dist:*`; outputs installers to `release/`
- The Vercel serverless function deploys automatically alongside the web app
