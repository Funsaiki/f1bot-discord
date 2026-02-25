import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { config } from "../config";
import { mkdirSync } from "fs";
import { dirname } from "path";

// Ensure data directory exists
mkdirSync(dirname(config.dbPath), { recursive: true });

const sqlite = new Database(config.dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

const ALL_CATEGORIES = "'pole', 'top3_quali', 'winner', 'podium', 'last_quali', 'last_race', 'fastest_lap', 'sprint_winner', 'sprint_podium', 'sprint_last', 'sprint_fastest_lap'";

// Create tables if they don't exist (inline migration)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS races (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season INTEGER NOT NULL,
    round INTEGER NOT NULL,
    name TEXT NOT NULL,
    circuit TEXT NOT NULL,
    country TEXT NOT NULL,
    quali_date TEXT NOT NULL,
    race_date TEXT NOT NULL,
    sprint_date TEXT,
    quali_locked INTEGER NOT NULL DEFAULT 0,
    race_locked INTEGER NOT NULL DEFAULT 0,
    sprint_locked INTEGER NOT NULL DEFAULT 0,
    UNIQUE(season, round)
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    race_id INTEGER NOT NULL REFERENCES races(id),
    category TEXT NOT NULL CHECK(category IN (${ALL_CATEGORIES})),
    predictions TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, race_id, category)
  );

  CREATE TABLE IF NOT EXISTS race_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL REFERENCES races(id),
    category TEXT NOT NULL CHECK(category IN (${ALL_CATEGORIES})),
    results TEXT NOT NULL,
    UNIQUE(race_id, category)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    race_id INTEGER NOT NULL REFERENCES races(id),
    category TEXT NOT NULL CHECK(category IN (${ALL_CATEGORIES})),
    points INTEGER NOT NULL,
    detail TEXT NOT NULL,
    UNIQUE(user_id, race_id, category)
  );
`);

// Migration: add sprint columns if upgrading from older DB
function migrateDb() {
  const columns = sqlite.pragma("table_info(races)") as { name: string }[];
  const colNames = columns.map((c) => c.name);

  if (!colNames.includes("sprint_date")) {
    sqlite.exec("ALTER TABLE races ADD COLUMN sprint_date TEXT");
    console.log("[Migration] Colonne sprint_date ajoutée à races");
  }
  if (!colNames.includes("sprint_locked")) {
    sqlite.exec("ALTER TABLE races ADD COLUMN sprint_locked INTEGER NOT NULL DEFAULT 0");
    console.log("[Migration] Colonne sprint_locked ajoutée à races");
  }
}
migrateDb();
