import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./index";
import { getUserBets, getNextRace } from "../services/bets";
import { userBetsEmbed } from "../utils/embeds";

const data = new SlashCommandBuilder()
  .setName("mespronostics")
  .setDescription("Voir tes pronostics pour le prochain GP");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const race = getNextRace();
  if (!race) {
    await interaction.reply({ content: "Aucune course à venir trouvée.", ephemeral: true });
    return;
  }

  const userBets = getUserBets(interaction.user.id, race.id);
  await interaction.reply({
    embeds: [userBetsEmbed(race, userBets)],
    ephemeral: true,
  });
}

export const mespronosticsCommand: Command = { data, execute };
