import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./index";
import { db } from "../db";
import { races } from "../db/schema";
import { eq } from "drizzle-orm";
import { config } from "../config";
import { calendarEmbed } from "../utils/embeds";

const data = new SlashCommandBuilder()
  .setName("calendrier")
  .setDescription("Afficher le calendrier F1 et les prochaines courses");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const now = new Date().toISOString();

  const allRaces = db
    .select()
    .from(races)
    .where(eq(races.season, config.f1Season))
    .orderBy(races.round)
    .all();

  if (allRaces.length === 0) {
    await interaction.reply({
      content: "Aucune course dans le calendrier. Utilisez `/admin sync` pour synchroniser.",
      ephemeral: true,
    });
    return;
  }

  // Show next 5 upcoming races + last 2 completed
  const upcoming = allRaces.filter((r) => r.raceDate >= now);
  const past = allRaces.filter((r) => r.raceDate < now);
  const display = [...past.slice(-2), ...upcoming.slice(0, 5)];

  await interaction.reply({ embeds: [calendarEmbed(display)] });
}

export const calendrierCommand: Command = { data, execute };
