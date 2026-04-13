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
npm run build:electron     # Angular build for Electron (no base-href)
npm run dist:mac           # macOS .dmg + .zip via electron-builder
npm run dist:win           # Windows .exe + portable
npm run dist:all           # All platforms

# Testing
ng test                    # Run Karma/Jasmine unit tests
```

There is no lint script configured. Prettier is set up with `printWidth: 100`, `singleQuote: true`.

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
3. **BowlingScorer** (`src/app/bowling-scorer/`) — Core game component (~1700 lines). Handles real-time frame scoring with 10th-frame special rules, multiple players (1–9), countdown timer with extensions, and game chaining.
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

- Route guards: `authGuard` (requires session) and `adminGuard` (requires session + admin role)
- Device token (UUID) in localStorage acts as a second auth factor for client users
- Passwords required for: open/close cash box, cancel game, extend game time
- F5, Ctrl+R, Ctrl+W are blocked during active games to prevent accidental navigation
- RLS policies: authenticated users can insert logs; only admins can read them

### Environment & Secrets

- `src/environments/environment.ts` — Supabase URL, anon key, and `apiSecret` (shared with Vercel)
- `.env` (not versioned, Vercel only) — `RESEND_API_KEY`, `REPORT_EMAIL`, `FROM_EMAIL`, `BCC_EMAIL`

### Deployment

- **Web:** Auto-deploys to Vercel on push to main
- **Electron:** Manual build via `npm run dist:*`; outputs installers to `release/`
- The Vercel serverless function deploys automatically alongside the web app
