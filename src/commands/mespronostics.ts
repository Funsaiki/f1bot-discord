import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./index";
import type { BetCategory } from "../db/schema";
import { getUserBets, getNextRace, isLocked, placeBet } from "../services/bets";
import { userBetsEmbed } from "../utils/embeds";
import { PILOTS, getPilotName } from "../utils/pilots";

interface CategoryInfo {
  category: BetCategory;
  label: string;
  emoji: string;
  picks: number;
}

const CATEGORIES: CategoryInfo[] = [
  { category: "pole", label: "Pole Position", emoji: "\uD83C\uDFC1", picks: 1 },
  { category: "top3_quali", label: "Top 3 Qualifications", emoji: "\u23F1\uFE0F", picks: 3 },
  { category: "last_quali", label: "Dernier Qualifications", emoji: "\uD83D\uDCA8", picks: 1 },
  { category: "winner", label: "Vainqueur Course", emoji: "\uD83C\uDFC6", picks: 1 },
  { category: "podium", label: "Podium Course", emoji: "\uD83C\uDF1F", picks: 3 },
  { category: "last_race", label: "Dernier Course", emoji: "\uD83D\uDCA8", picks: 1 },
  { category: "fastest_lap", label: "Meilleur Tour", emoji: "\u23F1\uFE0F", picks: 1 },
];

const data = new SlashCommandBuilder()
  .setName("mespronostics")
  .setDescription("Voir et modifier tes pronostics pour le prochain GP");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const raceOrNull = getNextRace();
  if (!raceOrNull) {
    await interaction.reply({ content: "Aucune course à venir trouvée.", ephemeral: true });
    return;
  }
  const race = raceOrNull;

  const userBets = getUserBets(interaction.user.id, race.id);

  // Build modify buttons — only for unlocked categories that have a bet
  const editableCategories = CATEGORIES.filter((c) => {
    const hasBet = userBets.some((b) => b.category === c.category);
    return hasBet && !isLocked(race.id, c.category);
  });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  // Discord allows max 5 buttons per row, max 5 rows
  for (let i = 0; i < editableCategories.length; i += 5) {
    const chunk = editableCategories.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        chunk.map((c) =>
          new ButtonBuilder()
            .setCustomId(`edit_${c.category}`)
            .setLabel(`${c.emoji} ${c.label}`)
            .setStyle(ButtonStyle.Secondary)
        )
      )
    );
  }

  const reply = await interaction.reply({
    embeds: [userBetsEmbed(race, userBets)],
    components: rows.length > 0 ? rows : [],
    ephemeral: true,
    fetchReply: true,
  });

  if (rows.length === 0) return;

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 5 * 60 * 1000,
  });

  collector.on("collect", async (i) => {
    // Handle edit button click
    if (i.customId.startsWith("edit_") && i.isButton()) {
      const category = i.customId.replace("edit_", "") as BetCategory;
      const catInfo = CATEGORIES.find((c) => c.category === category);
      if (!catInfo) return;

      // Start edit flow for this category
      let picks: string[] = [];
      let pickIndex = 0;

      function buildEditEmbed(): EmbedBuilder {
        const embed = new EmbedBuilder()
          .setTitle(`Modifier — ${catInfo!.label}`)
          .setDescription(race.name)
          .setColor(0xf1c40f);

        if (catInfo!.picks > 1) {
          const posLabels = ["1er", "2ème", "3ème"];
          let desc = `Choisis le **${posLabels[pickIndex]}**`;
          if (picks.length > 0) {
            desc += `\n\nDéjà choisi : ${picks.map((c, idx) => `${posLabels[idx]}: **${getPilotName(c)}**`).join(", ")}`;
          }
          embed.setDescription(desc);
        } else {
          embed.setDescription(`${race.name}\n\nChoisis un pilote`);
        }

        return embed;
      }

      function buildEditMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
        const excluded = catInfo!.picks > 1 ? picks : [];
        const pilots = PILOTS.filter((p) => !excluded.includes(p.code));
        const menu = new StringSelectMenuBuilder()
          .setCustomId("edit_select")
          .setPlaceholder("Choisis un pilote...")
          .addOptions(
            pilots.map((p) => ({
              label: p.name,
              description: p.team,
              value: p.code,
            }))
          );
        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
      }

      function buildCancelRow(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("edit_cancel")
            .setLabel("Annuler")
            .setStyle(ButtonStyle.Danger)
        );
      }

      await i.update({
        embeds: [buildEditEmbed()],
        components: [buildEditMenu(), buildCancelRow()],
      });

      // Sub-collector for the edit flow
      const editCollector = reply.createMessageComponentCollector({
        filter: (ei) => ei.user.id === interaction.user.id && (ei.customId === "edit_select" || ei.customId === "edit_cancel"),
        time: 3 * 60 * 1000,
      });

      // Stop the main collector while editing
      collector.stop("editing");

      editCollector.on("collect", async (ei) => {
        if (ei.customId === "edit_cancel") {
          editCollector.stop("cancelled");
          // Go back to mespronostics view
          const refreshedBets = getUserBets(interaction.user.id, race.id);
          await ei.update({
            embeds: [userBetsEmbed(race, refreshedBets)],
            components: rows,
          });
          return;
        }

        if (ei.customId === "edit_select" && ei.isStringSelectMenu()) {
          picks.push(ei.values[0]);
          pickIndex++;

          if (pickIndex < catInfo!.picks) {
            await ei.update({
              embeds: [buildEditEmbed()],
              components: [buildEditMenu(), buildCancelRow()],
            });
            return;
          }

          // All picks done — save
          placeBet({
            userId: interaction.user.id,
            username: interaction.user.displayName,
            raceId: race.id,
            category,
            predictions: picks,
          });

          editCollector.stop("saved");

          const refreshedBets = getUserBets(interaction.user.id, race.id);

          // Rebuild edit buttons with refreshed data
          const newEditable = CATEGORIES.filter((c) => {
            const hasBet = refreshedBets.some((b) => b.category === c.category);
            return hasBet && !isLocked(race.id, c.category);
          });
          const newRows: ActionRowBuilder<ButtonBuilder>[] = [];
          for (let j = 0; j < newEditable.length; j += 5) {
            const chunk = newEditable.slice(j, j + 5);
            newRows.push(
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                chunk.map((c) =>
                  new ButtonBuilder()
                    .setCustomId(`edit_${c.category}`)
                    .setLabel(`${c.emoji} ${c.label}`)
                    .setStyle(ButtonStyle.Secondary)
                )
              )
            );
          }

          const confirmEmbed = new EmbedBuilder()
            .setTitle("Pronostic modifié !")
            .setDescription(
              `${catInfo!.emoji} **${catInfo!.label}** : ${picks.map((c) => getPilotName(c)).join(", ")}`
            )
            .setColor(0x00cc00);

          await ei.update({
            embeds: [userBetsEmbed(race, refreshedBets), confirmEmbed],
            components: newRows,
          });
        }
      });

      return;
    }
  });
}

export const mespronosticsCommand: Command = { data, execute };
