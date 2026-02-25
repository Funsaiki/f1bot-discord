import cron from "node-cron";
import { db } from "../db";
import { races } from "../db/schema";
import { eq } from "drizzle-orm";
import { config } from "../config";
import { fetchQualifyingResults, fetchRaceResults } from "./f1-api";
import { scoreRaceCategory } from "./scoring";
import { resultsAnnouncementEmbed } from "../utils/embeds";
import type { Client, TextBasedChannel } from "discord.js";
import type { BetCategory, Race } from "../db/schema";
import { raceResults, scores } from "../db/schema";
import { and } from "drizzle-orm";

/** Start all scheduled jobs */
export function startScheduler(client: Client): void {
  // Check every 5 minutes for sessions that should be locked
  cron.schedule("*/5 * * * *", () => {
    checkAndLockSessions();
  });

  // Check every 30 minutes after typical session end times for new results
  cron.schedule("*/30 * * * *", () => {
    checkForNewResults(client);
  });

  console.log("[Scheduler] Cron jobs démarrés.");
}

/** Lock sessions that have started */
function checkAndLockSessions(): void {
  const now = new Date().toISOString();

  const allRaces = db
    .select()
    .from(races)
    .where(eq(races.season, config.f1Season))
    .all();

  for (const race of allRaces) {
    // Lock qualifying bets when quali starts
    if (!race.qualiLocked && race.qualiDate <= now) {
      db.update(races)
        .set({ qualiLocked: true })
        .where(eq(races.id, race.id))
        .run();
      console.log(`[Scheduler] Qualifs verrouillées pour ${race.name}`);
    }

    // Lock race bets when race starts
    if (!race.raceLocked && race.raceDate <= now) {
      db.update(races)
        .set({ raceLocked: true })
        .where(eq(races.id, race.id))
        .run();
      console.log(`[Scheduler] Course verrouillée pour ${race.name}`);
    }
  }
}

/** Check for new results and score them */
async function checkForNewResults(client: Client): Promise<void> {
  const now = new Date();
  const allRaces = db
    .select()
    .from(races)
    .where(eq(races.season, config.f1Season))
    .all();

  for (const race of allRaces) {
    const qualiEnd = new Date(race.qualiDate);
    qualiEnd.setHours(qualiEnd.getHours() + 2); // Quali usually takes ~1-2h

    const raceEnd = new Date(race.raceDate);
    raceEnd.setHours(raceEnd.getHours() + 3); // Race usually takes ~2-3h

    // Check qualifying results (2-6h after quali start)
    if (race.qualiLocked && qualiEnd <= now) {
      const hasQualiResults = db
        .select()
        .from(raceResults)
        .where(and(eq(raceResults.raceId, race.id), eq(raceResults.category, "pole")))
        .get();

      if (!hasQualiResults) {
        await fetchAndScoreQuali(race, client);
      }
    }

    // Check race results (3-6h after race start)
    if (race.raceLocked && raceEnd <= now) {
      const hasRaceResultData = db
        .select()
        .from(raceResults)
        .where(and(eq(raceResults.raceId, race.id), eq(raceResults.category, "winner")))
        .get();

      if (!hasRaceResultData) {
        await fetchAndScoreRace(race, client);
      }
    }
  }
}

async function fetchAndScoreQuali(race: Race, client: Client): Promise<void> {
  const data = await fetchQualifyingResults(race.round, config.f1Season);
  if (!data) return;

  console.log(`[Scheduler] Résultats qualifs trouvés pour ${race.name}`);

  upsertResult(race.id, "pole", [data.pole]);
  upsertResult(race.id, "top3_quali", data.top3);
  upsertResult(race.id, "last_quali", [data.last]);
  scoreRaceCategory(race.id, "pole");
  scoreRaceCategory(race.id, "top3_quali");
  scoreRaceCategory(race.id, "last_quali");

  await announceResults(client, race, "pole", [data.pole]);
  await announceResults(client, race, "top3_quali", data.top3);
  await announceResults(client, race, "last_quali", [data.last]);
}

async function fetchAndScoreRace(race: Race, client: Client): Promise<void> {
  const data = await fetchRaceResults(race.round, config.f1Season);
  if (!data) return;

  console.log(`[Scheduler] Résultats course trouvés pour ${race.name}`);

  upsertResult(race.id, "winner", [data.winner]);
  upsertResult(race.id, "podium", data.podium);
  upsertResult(race.id, "last_race", [data.last]);
  scoreRaceCategory(race.id, "winner");
  scoreRaceCategory(race.id, "podium");
  scoreRaceCategory(race.id, "last_race");

  await announceResults(client, race, "winner", [data.winner]);
  await announceResults(client, race, "podium", data.podium);
  await announceResults(client, race, "last_race", [data.last]);

  if (data.fastestLap) {
    upsertResult(race.id, "fastest_lap", [data.fastestLap]);
    scoreRaceCategory(race.id, "fastest_lap");
    await announceResults(client, race, "fastest_lap", [data.fastestLap]);
  }
}

function upsertResult(raceId: number, category: BetCategory, results: string[]) {
  const existing = db
    .select()
    .from(raceResults)
    .where(and(eq(raceResults.raceId, raceId), eq(raceResults.category, category)))
    .get();

  if (existing) {
    db.update(raceResults)
      .set({ results: JSON.stringify(results) })
      .where(eq(raceResults.id, existing.id))
      .run();
  } else {
    db.insert(raceResults)
      .values({ raceId, category, results: JSON.stringify(results) })
      .run();
  }
}

async function announceResults(
  client: Client,
  race: Race,
  category: BetCategory,
  actual: string[]
): Promise<void> {
  if (config.announceChannelIds.length === 0) return;

  const scoreRows = db
    .select()
    .from(scores)
    .where(and(eq(scores.raceId, race.id), eq(scores.category, category)))
    .all()
    .map((s) => ({
      username: s.username,
      points: s.points,
      detail: (JSON.parse(s.detail) as { breakdown: string }).breakdown,
    }));

  const embed = resultsAnnouncementEmbed(race, category, actual, scoreRows);

  for (const channelId of config.announceChannelIds) {
    const channel = client.channels.cache.get(channelId) as TextBasedChannel | undefined;
    if (channel && "send" in channel) {
      await channel.send({ embeds: [embed] });
    }
  }
}
