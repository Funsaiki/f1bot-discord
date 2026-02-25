import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import type { Command } from "./index";
import { getSeasonLeaderboard, getRaceLeaderboard } from "../services/scoring";
import { leaderboardEmbed } from "../utils/embeds";
import { config } from "../config";
import { db } from "../db";
import { races } from "../db/schema";
import { eq } from "drizzle-orm";

const data = new SlashCommandBuilder()
  .setName("classement")
  .setDescription("Voir le classement des pronostics")
  .addSubcommand((sub) =>
    sub.setName("saison").setDescription("Classement général de la saison")
  )
  .addSubcommand((sub) =>
    sub
      .setName("gp")
      .setDescription("Classement pour un Grand Prix spécifique")
      .addIntegerOption((opt) =>
        opt
          .setName("round")
          .setDescription("Numéro du round (1-24)")
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === "saison") {
    const rows = getSeasonLeaderboard(config.f1Season);
    await interaction.reply({
      embeds: [leaderboardEmbed(`Classement Saison ${config.f1Season}`, rows)],
    });
  } else {
    const round = interaction.options.getInteger("round", true);
    const race = db
      .select()
      .from(races)
      .where(eq(races.round, round))
      .get();

    if (!race) {
      await interaction.reply({ content: `Round ${round} introuvable.`, ephemeral: true });
      return;
    }

    const rows = getRaceLeaderboard(race.id);
    await interaction.reply({
      embeds: [leaderboardEmbed(`Classement — ${race.name}`, rows)],
    });
  }
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

export const classementCommand: Command = { data, execute, autocomplete };
