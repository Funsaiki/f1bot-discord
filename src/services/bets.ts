import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { bets, races, type BetCategory } from "../db/schema";

export interface PlaceBetInput {
  userId: string;
  username: string;
  raceId: number;
  category: BetCategory;
  predictions: string[];
}

/** Place or update a bet (upsert) */
export function placeBet(input: PlaceBetInput): void {
  const existing = db
    .select()
    .from(bets)
    .where(
      and(
        eq(bets.userId, input.userId),
        eq(bets.raceId, input.raceId),
        eq(bets.category, input.category)
      )
    )
    .get();

  if (existing) {
    db.update(bets)
      .set({
        predictions: JSON.stringify(input.predictions),
        username: input.username,
        createdAt: new Date().toISOString(),
      })
      .where(eq(bets.id, existing.id))
      .run();
  } else {
    db.insert(bets)
      .values({
        userId: input.userId,
        username: input.username,
        raceId: input.raceId,
        category: input.category,
        predictions: JSON.stringify(input.predictions),
      })
      .run();
  }
}

/** Get all bets for a user for a given race */
export function getUserBets(userId: string, raceId: number) {
  return db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, userId), eq(bets.raceId, raceId)))
    .all();
}

/** Get all bets for a specific race and category */
export function getRaceCategoryBets(raceId: number, category: BetCategory) {
  return db
    .select()
    .from(bets)
    .where(and(eq(bets.raceId, raceId), eq(bets.category, category)))
    .all();
}

/** Check if a session is locked for betting */
export function isLocked(raceId: number, category: BetCategory): boolean {
  const race = db.select().from(races).where(eq(races.id, raceId)).get();
  if (!race) return true;

  if (category === "pole" || category === "top3_quali" || category === "last_quali") {
    return race.qualiLocked;
  }
  if (category === "sprint_winner" || category === "sprint_podium" || category === "sprint_last" || category === "sprint_fastest_lap") {
    return race.sprintLocked;
  }
  return race.raceLocked;
}

/** Get the next upcoming race */
export function getNextRace() {
  const now = new Date().toISOString();
  return db
    .select()
    .from(races)
    .where(eq(races.raceLocked, false))
    .orderBy(races.raceDate)
    .limit(1)
    .get();
}

/** Get a race by round and season */
export function getRaceByRound(round: number, season: number) {
  return db
    .select()
    .from(races)
    .where(and(eq(races.round, round), eq(races.season, season)))
    .get();
}
