import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const races = sqliteTable("races", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  season: integer("season").notNull(),
  round: integer("round").notNull(),
  name: text("name").notNull(),
  circuit: text("circuit").notNull(),
  country: text("country").notNull(),
  qualiDate: text("quali_date").notNull(),
  raceDate: text("race_date").notNull(),
  qualiLocked: integer("quali_locked", { mode: "boolean" }).notNull().default(false),
  raceLocked: integer("race_locked", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  uniqueIndex("races_season_round_idx").on(table.season, table.round),
]);

export const bets = sqliteTable("bets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  raceId: integer("race_id").notNull().references(() => races.id),
  category: text("category", { enum: ["pole", "top3_quali", "winner", "podium", "last_quali", "last_race", "fastest_lap"] }).notNull(),
  predictions: text("predictions").notNull(), // JSON string[]
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("bets_user_race_cat_idx").on(table.userId, table.raceId, table.category),
]);

export const raceResults = sqliteTable("race_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  raceId: integer("race_id").notNull().references(() => races.id),
  category: text("category", { enum: ["pole", "top3_quali", "winner", "podium", "last_quali", "last_race", "fastest_lap"] }).notNull(),
  results: text("results").notNull(), // JSON string[]
}, (table) => [
  uniqueIndex("results_race_cat_idx").on(table.raceId, table.category),
]);

export const scores = sqliteTable("scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  raceId: integer("race_id").notNull().references(() => races.id),
  category: text("category", { enum: ["pole", "top3_quali", "winner", "podium", "last_quali", "last_race", "fastest_lap"] }).notNull(),
  points: integer("points").notNull(),
  detail: text("detail").notNull(), // JSON explanation
}, (table) => [
  uniqueIndex("scores_user_race_cat_idx").on(table.userId, table.raceId, table.category),
]);

export type Race = typeof races.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type RaceResult = typeof raceResults.$inferSelect;
export type Score = typeof scores.$inferSelect;
export type BetCategory = "pole" | "top3_quali" | "winner" | "podium" | "last_quali" | "last_race" | "fastest_lap";
