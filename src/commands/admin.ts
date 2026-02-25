import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import type { Command } from "./index";
import { config } from "../config";
import { db } from "../db";
import { races, raceResults } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { fetchSeasonCalendar, fetchQualifyingResults, fetchRaceResults, fetchSprintResults } from "../services/f1-api";
import { scoreRaceCategory } from "../services/scoring";
import { resultsAnnouncementEmbed } from "../utils/embeds";
import type { BetCategory } from "../db/schema";

function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.guild) return false;
  const member = interaction.guild.members.cache.get(interaction.user.id);
  if (!member) return false;
  // Server owner always has access
  if (interaction.guild.ownerId === interaction.user.id) return true;
  // Check admin role
  if (config.adminRoleId && member.roles.cache.has(config.adminRoleId)) return true;
  // Check Discord admin permission
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

const data = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("Commandes d'administration")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("sync")
      .setDescription("Synchroniser le calendrier F1 depuis l'API")
  )
  .addSubcommand((sub) =>
    sub
      .setName("resultats")
      .setDescription("Récupérer et calculer les résultats d'un GP")
      .addIntegerOption((opt) =>
        opt.setName("round").setDescription("Numéro du round").setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("lock")
      .setDescription("Verrouiller les pronostics d'une session")
      .addIntegerOption((opt) =>
        opt.setName("round").setDescription("Numéro du round").setRequired(true).setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("session")
          .setDescription("Session à verrouiller")
          .setRequired(true)
          .addChoices(
            { name: "Qualifications", value: "quali" },
            { name: "Course", value: "race" },
            { name: "Sprint", value: "sprint" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("unlock")
      .setDescription("Déverrouiller les pronostics d'une session")
      .addIntegerOption((opt) =>
        opt.setName("round").setDescription("Numéro du round").setRequired(true).setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("session")
          .setDescription("Session à déverrouiller")
          .setRequired(true)
          .addChoices(
            { name: "Qualifications", value: "quali" },
            { name: "Course", value: "race" },
            { name: "Sprint", value: "sprint" }
          )
      )
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: "Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "sync":
      await handleSync(interaction);
      break;
    case "resultats":
      await handleResults(interaction);
      break;
    case "lock":
    case "unlock":
      await handleLockToggle(interaction, sub === "lock");
      break;
  }
}

async function handleSync(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const calendar = await fetchSeasonCalendar(config.f1Season);

    for (const race of calendar) {
      const existing = db
        .select()
        .from(races)
        .where(and(eq(races.season, race.season), eq(races.round, race.round)))
        .get();

      if (existing) {
        db.update(races)
          .set({
            name: race.name,
            circuit: race.circuit,
            country: race.country,
            qualiDate: race.qualiDate,
            raceDate: race.raceDate,
            sprintDate: race.sprintDate,
          })
          .where(eq(races.id, existing.id))
          .run();
      } else {
        db.insert(races)
          .values({
            season: race.season,
            round: race.round,
            name: race.name,
            circuit: race.circuit,
            country: race.country,
            qualiDate: race.qualiDate,
            raceDate: race.raceDate,
            sprintDate: race.sprintDate,
          })
          .run();
      }
    }

    await interaction.editReply(`Calendrier synchronisé : **${calendar.length}** courses chargées pour la saison ${config.f1Season}.`);
  } catch (err) {
    console.error("Sync error:", err);
    await interaction.editReply("Erreur lors de la synchronisation du calendrier.");
  }
}

async function handleResults(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const round = interaction.options.getInteger("round", true);

  const race = db
    .select()
    .from(races)
    .where(and(eq(races.season, config.f1Season), eq(races.round, round)))
    .get();

  if (!race) {
    await interaction.editReply(`Round ${round} introuvable.`);
    return;
  }

  try {
    const embeds = [];

    // Fetch qualifying results
    const qualiData = await fetchQualifyingResults(round, config.f1Season);
    if (qualiData) {
      // Save pole result
      await upsertResult(race.id, "pole", [qualiData.pole]);
      const poleScored = scoreRaceCategory(race.id, "pole");

      // Save top 3 quali result
      await upsertResult(race.id, "top3_quali", qualiData.top3);
      const top3Scored = scoreRaceCategory(race.id, "top3_quali");

      // Save last quali result
      await upsertResult(race.id, "last_quali", [qualiData.last]);
      scoreRaceCategory(race.id, "last_quali");

      // Lock quali
      db.update(races).set({ qualiLocked: true }).where(eq(races.id, race.id)).run();

      const poleScores = getScoresForAnnouncement(race.id, "pole");
      const top3Scores = getScoresForAnnouncement(race.id, "top3_quali");
      const lastQualiScores = getScoresForAnnouncement(race.id, "last_quali");
      embeds.push(resultsAnnouncementEmbed(race, "pole", [qualiData.pole], poleScores));
      embeds.push(resultsAnnouncementEmbed(race, "top3_quali", qualiData.top3, top3Scores));
      embeds.push(resultsAnnouncementEmbed(race, "last_quali", [qualiData.last], lastQualiScores));
    }

    // Fetch sprint results (if sprint race)
    if (race.sprintDate) {
      const sprintData = await fetchSprintResults(round, config.f1Season);
      if (sprintData) {
        await upsertResult(race.id, "sprint_winner", [sprintData.winner]);
        scoreRaceCategory(race.id, "sprint_winner");

        await upsertResult(race.id, "sprint_podium", sprintData.podium);
        scoreRaceCategory(race.id, "sprint_podium");

        await upsertResult(race.id, "sprint_last", [sprintData.last]);
        scoreRaceCategory(race.id, "sprint_last");

        if (sprintData.fastestLap) {
          await upsertResult(race.id, "sprint_fastest_lap", [sprintData.fastestLap]);
          scoreRaceCategory(race.id, "sprint_fastest_lap");
        }

        db.update(races).set({ sprintLocked: true }).where(eq(races.id, race.id)).run();

        const sprintWinnerScores = getScoresForAnnouncement(race.id, "sprint_winner");
        const sprintPodiumScores = getScoresForAnnouncement(race.id, "sprint_podium");
        const sprintLastScores = getScoresForAnnouncement(race.id, "sprint_last");
        embeds.push(resultsAnnouncementEmbed(race, "sprint_winner", [sprintData.winner], sprintWinnerScores));
        embeds.push(resultsAnnouncementEmbed(race, "sprint_podium", sprintData.podium, sprintPodiumScores));
        embeds.push(resultsAnnouncementEmbed(race, "sprint_last", [sprintData.last], sprintLastScores));

        if (sprintData.fastestLap) {
          const sprintFLScores = getScoresForAnnouncement(race.id, "sprint_fastest_lap");
          embeds.push(resultsAnnouncementEmbed(race, "sprint_fastest_lap", [sprintData.fastestLap], sprintFLScores));
        }
      }
    }

    // Fetch race results
    const raceData = await fetchRaceResults(round, config.f1Season);
    if (raceData) {
      await upsertResult(race.id, "winner", [raceData.winner]);
      scoreRaceCategory(race.id, "winner");

      await upsertResult(race.id, "podium", raceData.podium);
      scoreRaceCategory(race.id, "podium");

      await upsertResult(race.id, "last_race", [raceData.last]);
      scoreRaceCategory(race.id, "last_race");

      if (raceData.fastestLap) {
        await upsertResult(race.id, "fastest_lap", [raceData.fastestLap]);
        scoreRaceCategory(race.id, "fastest_lap");
      }

      db.update(races).set({ raceLocked: true }).where(eq(races.id, race.id)).run();

      const winnerScores = getScoresForAnnouncement(race.id, "winner");
      const podiumScores = getScoresForAnnouncement(race.id, "podium");
      const lastRaceScores = getScoresForAnnouncement(race.id, "last_race");
      embeds.push(resultsAnnouncementEmbed(race, "winner", [raceData.winner], winnerScores));
      embeds.push(resultsAnnouncementEmbed(race, "podium", raceData.podium, podiumScores));
      embeds.push(resultsAnnouncementEmbed(race, "last_race", [raceData.last], lastRaceScores));

      if (raceData.fastestLap) {
        const fastestLapScores = getScoresForAnnouncement(race.id, "fastest_lap");
        embeds.push(resultsAnnouncementEmbed(race, "fastest_lap", [raceData.fastestLap], fastestLapScores));
      }
    }

    if (embeds.length === 0) {
      await interaction.editReply("Aucun résultat disponible pour ce round.");
      return;
    }

    await interaction.editReply({ embeds });

    // Also post in announce channels if configured
    for (const channelId of config.announceChannelIds) {
      const channel = interaction.client.channels.cache.get(channelId);
      if (channel && "send" in channel) {
        await (channel as any).send({ embeds });
      }
    }
  } catch (err) {
    console.error("Results error:", err);
    await interaction.editReply("Erreur lors de la récupération des résultats.");
  }
}

async function handleLockToggle(interaction: ChatInputCommandInteraction, lock: boolean): Promise<void> {
  const round = interaction.options.getInteger("round", true);
  const session = interaction.options.getString("session", true);

  const race = db
    .select()
    .from(races)
    .where(and(eq(races.season, config.f1Season), eq(races.round, round)))
    .get();

  if (!race) {
    await interaction.reply({ content: `Round ${round} introuvable.`, ephemeral: true });
    return;
  }

  const fieldMap: Record<string, string> = { quali: "qualiLocked", race: "raceLocked", sprint: "sprintLocked" };
  const labelMap: Record<string, string> = { quali: "qualifications", race: "course", sprint: "sprint" };
  const field = fieldMap[session];
  db.update(races)
    .set({ [field]: lock })
    .where(eq(races.id, race.id))
    .run();

  const sessionLabel = labelMap[session];
  const action = lock ? "verrouillés" : "déverrouillés";
  await interaction.reply(`Pronostics **${sessionLabel}** ${action} pour **${race.name}**.`);
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

import { scores } from "../db/schema";

function getScoresForAnnouncement(raceId: number, category: BetCategory) {
  return db
    .select()
    .from(scores)
    .where(and(eq(scores.raceId, raceId), eq(scores.category, category)))
    .all()
    .map((s) => ({
      username: s.username,
      points: s.points,
      detail: (JSON.parse(s.detail) as { breakdown: string }).breakdown,
    }));
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const allRaces = db
    .select()
    .from(races)
    .where(eq(races.season, config.f1Season))
    .all();

  const filtered = allRaces
    .filter(
      (r) =>
        r.name.toLowerCase().includes(focused.toLowerCase()) ||
        r.round.toString().includes(focused)
    )
    .slice(0, 25);

  await interaction.respond(
    filtered.map((r) => ({ name: `R${r.round} — ${r.name}`, value: r.round }))
  );
}

export const adminCommand: Command = { data, execute, autocomplete };
