import { EmbedBuilder } from "discord.js";
import type { Race, Bet, BetCategory } from "../db/schema";
import { getPilotName } from "./pilots";

const CATEGORY_LABELS: Record<BetCategory, string> = {
  pole: "Pole Position",
  top3_quali: "Top 3 Qualifications",
  winner: "Vainqueur Course",
  podium: "Podium Course",
  last_quali: "Dernier Qualifications",
  last_race: "Dernier Course",
  fastest_lap: "Meilleur Tour",
  sprint_winner: "Vainqueur Sprint",
  sprint_podium: "Podium Sprint",
  sprint_last: "Dernier Sprint",
  sprint_fastest_lap: "Meilleur Tour Sprint",
};

const CATEGORY_EMOJI: Record<BetCategory, string> = {
  pole: "\uD83C\uDFC1",
  top3_quali: "\u23F1\uFE0F",
  winner: "\uD83C\uDFC6",
  podium: "\uD83C\uDF1F",
  last_quali: "\uD83D\uDCA8",
  last_race: "\uD83D\uDCA8",
  fastest_lap: "\u23F1\uFE0F",
  sprint_winner: "\uD83C\uDFC6",
  sprint_podium: "\uD83C\uDF1F",
  sprint_last: "\uD83D\uDCA8",
  sprint_fastest_lap: "\u23F1\uFE0F",
};

export function calendarEmbed(races: Race[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Calendrier F1")
    .setColor(0xe10600);

  const lines = races.map((r) => {
    const qualiDate = new Date(r.qualiDate).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
    const raceDate = new Date(r.raceDate).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
    const qualiLock = r.qualiLocked ? " (verrouillé)" : "";
    const raceLock = r.raceLocked ? " (verrouillé)" : "";
    let line = `**R${r.round}** ${r.name} — ${r.country}\nQualifs: ${qualiDate}${qualiLock} | Course: ${raceDate}${raceLock}`;
    if (r.sprintDate) {
      const sprintDateStr = new Date(r.sprintDate).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
      });
      const sprintLock = r.sprintLocked ? " (verrouillé)" : "";
      line += ` | Sprint: ${sprintDateStr}${sprintLock}`;
    }
    return line;
  });

  embed.setDescription(lines.join("\n\n") || "Aucune course trouvée.");
  return embed;
}

export function betConfirmEmbed(race: Race, category: BetCategory, predictions: string[]): EmbedBuilder {
  const pilotNames = predictions.map((code, i) => `${i + 1}. ${getPilotName(code)}`);
  return new EmbedBuilder()
    .setTitle(`${CATEGORY_EMOJI[category]} Pronostic enregistré !`)
    .setColor(0x00cc00)
    .addFields(
      { name: "Grand Prix", value: race.name, inline: true },
      { name: "Catégorie", value: CATEGORY_LABELS[category], inline: true },
      { name: "Ton pronostic", value: pilotNames.join("\n") }
    );
}

export function userBetsEmbed(race: Race, userBets: Bet[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Tes pronostics — ${race.name}`)
    .setColor(0x3498db);

  if (userBets.length === 0) {
    embed.setDescription("Tu n'as pas encore fait de pronostic pour ce GP.");
    return embed;
  }

  for (const bet of userBets) {
    const cat = bet.category as BetCategory;
    const predictions: string[] = JSON.parse(bet.predictions);
    const pilotNames = predictions.map((code, i) => `${i + 1}. ${getPilotName(code)}`);
    embed.addFields({
      name: `${CATEGORY_EMOJI[cat]} ${CATEGORY_LABELS[cat]}`,
      value: pilotNames.join("\n"),
      inline: true,
    });
  }

  return embed;
}

export function leaderboardEmbed(
  title: string,
  rows: { user_id: string; username: string; total_points: number }[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0xffd700);

  if (rows.length === 0) {
    embed.setDescription("Aucun score pour le moment.");
    return embed;
  }

  const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
  const lines = rows.map((r, i) => {
    const prefix = i < 3 ? medals[i] : `**${i + 1}.**`;
    return `${prefix} ${r.username} — **${r.total_points} pts**`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}

export function resultsAnnouncementEmbed(
  race: Race,
  category: BetCategory,
  actual: string[],
  scoredResults: { username: string; points: number; detail: string }[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${CATEGORY_EMOJI[category]} Résultats — ${CATEGORY_LABELS[category]}`)
    .setDescription(`**${race.name}**`)
    .setColor(0xe10600);

  const actualNames = actual.map((code, i) => `${i + 1}. ${getPilotName(code)}`);
  embed.addFields({ name: "Résultat officiel", value: actualNames.join("\n") });

  if (scoredResults.length > 0) {
    const scoreLines = scoredResults
      .sort((a, b) => b.points - a.points)
      .map((s) => `**${s.username}** — ${s.points} pts (${s.detail})`);
    embed.addFields({ name: "Points attribués", value: scoreLines.join("\n") });
  }

  return embed;
}
