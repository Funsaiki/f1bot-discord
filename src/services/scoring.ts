import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { bets, raceResults, scores, type BetCategory } from "../db/schema";
import { getPilotName } from "../utils/pilots";

interface ScoreDetail {
  correctPilots: string[];
  bonusExactOrder: boolean;
  breakdown: string;
}

const POINTS = {
  pole: { correct: 5 },
  top3_quali: { perPilot: 3, exactOrderBonus: 5 },
  winner: { correct: 10 },
  podium: { perPilot: 5, exactOrderBonus: 10 },
  last_quali: { correct: 3 },
  last_race: { correct: 3 },
  fastest_lap: { correct: 3 },
  sprint_winner: { correct: 5 },
  sprint_podium: { perPilot: 3, exactOrderBonus: 5 },
  sprint_last: { correct: 2 },
  sprint_fastest_lap: { correct: 2 },
} as const;

/** Calculate points for a single bet vs actual results */
export function calculatePoints(
  category: BetCategory,
  predictions: string[],
  actual: string[]
): { points: number; detail: ScoreDetail } {
  switch (category) {
    case "pole": {
      const correct = predictions[0] === actual[0];
      return {
        points: correct ? POINTS.pole.correct : 0,
        detail: {
          correctPilots: correct ? [predictions[0]] : [],
          bonusExactOrder: false,
          breakdown: correct
            ? `Pole correcte : ${getPilotName(predictions[0])} → +${POINTS.pole.correct}pts`
            : `Pole incorrecte (prédit: ${getPilotName(predictions[0])}, réel: ${getPilotName(actual[0])})`,
        },
      };
    }

    case "top3_quali":
    case "podium": {
      const cfg = category === "top3_quali" ? POINTS.top3_quali : POINTS.podium;
      const correctPilots = predictions.filter((p) => actual.includes(p));
      const exactOrder =
        predictions.length === actual.length &&
        predictions.every((p, i) => p === actual[i]);

      let pts = correctPilots.length * cfg.perPilot;
      if (exactOrder && correctPilots.length === 3) {
        pts += cfg.exactOrderBonus;
      }

      const parts: string[] = [];
      if (correctPilots.length > 0) {
        parts.push(
          `${correctPilots.length} pilote(s) correct(s) : ${correctPilots.map(getPilotName).join(", ")} → +${correctPilots.length * cfg.perPilot}pts`
        );
      }
      if (exactOrder && correctPilots.length === 3) {
        parts.push(`Bonus ordre exact → +${cfg.exactOrderBonus}pts`);
      }
      if (parts.length === 0) {
        parts.push("Aucun pilote correct");
      }

      return {
        points: pts,
        detail: {
          correctPilots,
          bonusExactOrder: exactOrder && correctPilots.length === 3,
          breakdown: parts.join(" | "),
        },
      };
    }

    case "winner": {
      const correct = predictions[0] === actual[0];
      return {
        points: correct ? POINTS.winner.correct : 0,
        detail: {
          correctPilots: correct ? [predictions[0]] : [],
          bonusExactOrder: false,
          breakdown: correct
            ? `Vainqueur correct : ${getPilotName(predictions[0])} → +${POINTS.winner.correct}pts`
            : `Vainqueur incorrect (prédit: ${getPilotName(predictions[0])}, réel: ${getPilotName(actual[0])})`,
        },
      };
    }

    case "last_quali": {
      const correct = predictions[0] === actual[0];
      return {
        points: correct ? POINTS.last_quali.correct : 0,
        detail: {
          correctPilots: correct ? [predictions[0]] : [],
          bonusExactOrder: false,
          breakdown: correct
            ? `Dernier qualif correct : ${getPilotName(predictions[0])} → +${POINTS.last_quali.correct}pts`
            : `Dernier qualif incorrect (prédit: ${getPilotName(predictions[0])}, réel: ${getPilotName(actual[0])})`,
        },
      };
    }

    case "last_race": {
      const correct = predictions[0] === actual[0];
      return {
        points: correct ? POINTS.last_race.correct : 0,
        detail: {
          correctPilots: correct ? [predictions[0]] : [],
          bonusExactOrder: false,
          breakdown: correct
            ? `Dernier course correct : ${getPilotName(predictions[0])} → +${POINTS.last_race.correct}pts`
            : `Dernier course incorrect (prédit: ${getPilotName(predictions[0])}, réel: ${getPilotName(actual[0])})`,
        },
      };
    }

    case "fastest_lap": {
      const correct = predictions[0] === actual[0];
      return {
        points: correct ? POINTS.fastest_lap.correct : 0,
        detail: {
          correctPilots: correct ? [predictions[0]] : [],
          bonusExactOrder: false,
          breakdown: correct
            ? `Meilleur tour correct : ${getPilotName(predictions[0])} → +${POINTS.fastest_lap.correct}pts`
            : `Meilleur tour incorrect (prédit: ${getPilotName(predictions[0])}, réel: ${getPilotName(actual[0])})`,
        },
      };
    }

    case "sprint_winner": {
      const correct = predictions[0] === actual[0];
      return {
        points: correct ? POINTS.sprint_winner.correct : 0,
        detail: {
          correctPilots: correct ? [predictions[0]] : [],
          bonusExactOrder: false,
          breakdown: correct
            ? `Vainqueur sprint correct : ${getPilotName(predictions[0])} → +${POINTS.sprint_winner.correct}pts`
            : `Vainqueur sprint incorrect (prédit: ${getPilotName(predictions[0])}, réel: ${getPilotName(actual[0])})`,
        },
      };
    }

    case "sprint_podium": {
      const cfg = POINTS.sprint_podium;
      const correctPilots = predictions.filter((p) => actual.includes(p));
      const exactOrder =
        predictions.length === actual.length &&
        predictions.every((p, i) => p === actual[i]);

      let pts = correctPilots.length * cfg.perPilot;
      if (exactOrder && correctPilots.length === 3) {
        pts += cfg.exactOrderBonus;
      }

      const parts: string[] = [];
      if (correctPilots.length > 0) {
        parts.push(
          `${correctPilots.length} pilote(s) correct(s) : ${correctPilots.map(getPilotName).join(", ")} → +${correctPilots.length * cfg.perPilot}pts`
        );
      }
      if (exactOrder && correctPilots.length === 3) {
        parts.push(`Bonus ordre exact → +${cfg.exactOrderBonus}pts`);
      }
      if (parts.length === 0) {
        parts.push("Aucun pilote correct");
      }

      return {
        points: pts,
        detail: {
          correctPilots,
          bonusExactOrder: exactOrder && correctPilots.length === 3,
          breakdown: parts.join(" | "),
        },
      };
    }

    case "sprint_last": {
      const correct = predictions[0] === actual[0];
      return {
        points: correct ? POINTS.sprint_last.correct : 0,
        detail: {
          correctPilots: correct ? [predictions[0]] : [],
          bonusExactOrder: false,
          breakdown: correct
            ? `Dernier sprint correct : ${getPilotName(predictions[0])} → +${POINTS.sprint_last.correct}pts`
            : `Dernier sprint incorrect (prédit: ${getPilotName(predictions[0])}, réel: ${getPilotName(actual[0])})`,
        },
      };
    }

    case "sprint_fastest_lap": {
      const correct = predictions[0] === actual[0];
      return {
        points: correct ? POINTS.sprint_fastest_lap.correct : 0,
        detail: {
          correctPilots: correct ? [predictions[0]] : [],
          bonusExactOrder: false,
          breakdown: correct
            ? `Meilleur tour sprint correct : ${getPilotName(predictions[0])} → +${POINTS.sprint_fastest_lap.correct}pts`
            : `Meilleur tour sprint incorrect (prédit: ${getPilotName(predictions[0])}, réel: ${getPilotName(actual[0])})`,
        },
      };
    }
  }
}

/** Score all bets for a given race + category */
export function scoreRaceCategory(raceId: number, category: BetCategory): number {
  const result = db
    .select()
    .from(raceResults)
    .where(and(eq(raceResults.raceId, raceId), eq(raceResults.category, category)))
    .get();

  if (!result) return 0;

  const actual: string[] = JSON.parse(result.results);
  const raceBets = db
    .select()
    .from(bets)
    .where(and(eq(bets.raceId, raceId), eq(bets.category, category)))
    .all();

  let scored = 0;
  for (const bet of raceBets) {
    const predictions: string[] = JSON.parse(bet.predictions);
    const { points, detail } = calculatePoints(category, predictions, actual);

    // Upsert score
    const existing = db
      .select()
      .from(scores)
      .where(
        and(
          eq(scores.userId, bet.userId),
          eq(scores.raceId, raceId),
          eq(scores.category, category)
        )
      )
      .get();

    if (existing) {
      db.update(scores)
        .set({ points, detail: JSON.stringify(detail), username: bet.username })
        .where(eq(scores.id, existing.id))
        .run();
    } else {
      db.insert(scores)
        .values({
          userId: bet.userId,
          username: bet.username,
          raceId,
          category,
          points,
          detail: JSON.stringify(detail),
        })
        .run();
    }
    scored++;
  }
  return scored;
}

/** Get season leaderboard */
export function getSeasonLeaderboard(season: number) {
  const rows = db.all<{ user_id: string; username: string; total_points: number }>(
    sql`SELECT s.user_id, s.username, SUM(s.points) as total_points
        FROM scores s
        JOIN races r ON s.race_id = r.id
        WHERE r.season = ${season}
        GROUP BY s.user_id
        ORDER BY total_points DESC`
  );
  return rows;
}

/** Get leaderboard for a specific race */
export function getRaceLeaderboard(raceId: number) {
  const rows = db.all<{ user_id: string; username: string; total_points: number }>(
    sql`SELECT user_id, username, SUM(points) as total_points
        FROM scores
        WHERE race_id = ${raceId}
        GROUP BY user_id
        ORDER BY total_points DESC`
  );
  return rows;
}
