# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run dev              # Start bot in dev mode (tsx watch, hot reload)
npm run build            # Build for production (tsup → dist/)
npm run start            # Run production build
npm run deploy-commands  # Register slash commands with Discord
npx tsc --noEmit         # Type-check without emitting
```

## Environment Setup

Copy `.env.example` to `.env` and fill in:
- `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` / `DISCORD_GUILD_ID` — required
- `ADMIN_ROLE_ID` — optional, users with this role can run `/admin` commands
- `ANNOUNCE_CHANNEL_ID` — optional, channel for automatic result announcements
- `F1_SEASON` — defaults to 2026

First run: `npm run deploy-commands` then `npm run dev`. Use `/admin sync` to populate the race calendar from the F1 API.

## Architecture

This is a Discord bot for F1 prediction betting (no real money) built with discord.js v14, SQLite (better-sqlite3 + Drizzle ORM), and the Jolpica F1 API.

### Key Layers

- **`src/index.ts`** — Bot entry point. Creates Discord client, routes slash commands and autocomplete interactions to the command registry.
- **`src/commands/`** — Each file exports a `Command` object (`{data, execute, autocomplete?}`). Commands are aggregated in `commands/index.ts`. All commands use Discord slash command builders with subcommands.
- **`src/services/`** — Business logic layer:
  - `bets.ts` — CRUD for predictions (upsert pattern), deadline checks
  - `scoring.ts` — Point calculation per category, leaderboard queries via raw SQL aggregation
  - `f1-api.ts` — Jolpica API client (`api.jolpica.com/f1/`) for calendar and results
  - `scheduler.ts` — node-cron jobs: auto-lock sessions at start time, auto-fetch results after sessions
- **`src/db/`** — `schema.ts` defines Drizzle ORM schema (races, bets, race_results, scores). `index.ts` initializes SQLite with inline table creation (no migration step needed).
- **`src/utils/`** — `pilots.ts` has the 2026 driver list for autocomplete. `embeds.ts` builds Discord embed messages.

### Scoring System

| Category | Points |
|---|---|
| Pole position | 5 pts if correct |
| Top 3 qualifying | 3 pts/correct driver + 5 pts exact order bonus |
| Race winner | 10 pts if correct |
| Race podium | 5 pts/correct driver + 10 pts exact order bonus |

Scoring logic lives in `services/scoring.ts:calculatePoints()`.

### Data Flow

1. `/admin sync` fetches season calendar → inserts/updates `races` table
2. Users place bets via `/pronostic` → stored in `bets` table (upsert on user+race+category)
3. Scheduler auto-locks bets when sessions start (checks every 5 min)
4. After sessions, scheduler auto-fetches results from Jolpica API (checks every 30 min)
5. Results trigger scoring: each bet is compared to actual results, points saved in `scores` table
6. Announcements posted to the configured channel

### Conventions

- Pilot codes are uppercase 3-letter strings (e.g., "VER", "NOR") matching Jolpica API codes
- Predictions and results are stored as JSON-stringified `string[]` in SQLite TEXT columns
- All dates stored as ISO 8601 strings
- Admin access: server owner, users with `ADMIN_ROLE_ID`, or Discord Administrator permission
- French language for all user-facing messages and command names
