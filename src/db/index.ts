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
    quali_locked INTEGER NOT NULL DEFAULT 0,
    race_locked INTEGER NOT NULL DEFAULT 0,
    UNIQUE(season, round)
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    race_id INTEGER NOT NULL REFERENCES races(id),
    category TEXT NOT NULL CHECK(category IN ('pole', 'top3_quali', 'winner', 'podium', 'last_quali', 'last_race', 'fastest_lap')),
    predictions TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, race_id, category)
  );

  CREATE TABLE IF NOT EXISTS race_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL REFERENCES races(id),
    category TEXT NOT NULL CHECK(category IN ('pole', 'top3_quali', 'winner', 'podium', 'last_quali', 'last_race', 'fastest_lap')),
    results TEXT NOT NULL,
    UNIQUE(race_id, category)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    race_id INTEGER NOT NULL REFERENCES races(id),
    category TEXT NOT NULL CHECK(category IN ('pole', 'top3_quali', 'winner', 'podium', 'last_quali', 'last_race', 'fastest_lap')),
    points INTEGER NOT NULL,
    detail TEXT NOT NULL,
    UNIQUE(user_id, race_id, category)
  );
`);
