import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import type { ChatInputCommandInteraction, StringSelectMenuInteraction, ButtonInteraction } from "discord.js";
import type { Command } from "./index";
import type { BetCategory } from "../db/schema";
import { PILOTS, getPilotName } from "../utils/pilots";
import { placeBet, isLocked, getNextRace } from "../services/bets";

interface Step {
  category: BetCategory;
  label: string;
  emoji: string;
  /** For multi-pick steps (top3/podium), how many picks total */
  picks: number;
}

const ALL_STEPS: Step[] = [
  { category: "pole", label: "Pole Position", emoji: "\uD83C\uDFC1", picks: 1 },
  { category: "top3_quali", label: "Top 3 Qualifications", emoji: "\u23F1\uFE0F", picks: 3 },
  { category: "last_quali", label: "Dernier Qualifications", emoji: "\uD83D\uDCA8", picks: 1 },
  { category: "winner", label: "Vainqueur Course", emoji: "\uD83C\uDFC6", picks: 1 },
  { category: "podium", label: "Podium Course", emoji: "\uD83C\uDF1F", picks: 3 },
  { category: "last_race", label: "Dernier Course", emoji: "\uD83D\uDCA8", picks: 1 },
  { category: "fastest_lap", label: "Meilleur Tour", emoji: "\u23F1\uFE0F", picks: 1 },
];

const QUALI_CATEGORIES: BetCategory[] = ["pole", "top3_quali", "last_quali"];

const data = new SlashCommandBuilder()
  .setName("pronos")
  .setDescription("Faire tous tes pronostics pour le prochain GP en une seule commande");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const raceOrNull = getNextRace();
  if (!raceOrNull) {
    await interaction.reply({ content: "Aucune course à venir trouvée. Utilisez `/admin sync` pour synchroniser le calendrier.", ephemeral: true });
    return;
  }
  const race = raceOrNull;

  // Filter steps based on what's locked
  const qualiOpen = !isLocked(race.id, "pole");
  const raceOpen = !isLocked(race.id, "winner");

  const steps = ALL_STEPS.filter((s) => {
    if (QUALI_CATEGORIES.includes(s.category)) return qualiOpen;
    return raceOpen;
  });

  if (steps.length === 0) {
    await interaction.reply({ content: `Tous les pronostics sont verrouillés pour le **${race.name}**.`, ephemeral: true });
    return;
  }

  // State: collected predictions per category
  const collected = new Map<BetCategory, string[]>();

  let stepIndex = 0;
  let pickIndex = 0; // For multi-pick steps (0, 1, 2)
  let currentPicks: string[] = []; // Accumulator for multi-pick

  function buildEmbed(): EmbedBuilder {
    const step = steps[stepIndex];
    const stepNum = stepIndex + 1;
    const embed = new EmbedBuilder()
      .setTitle(`Pronostics — ${race.name}`)
      .setColor(0xe10600);

    let description = `${step.emoji} **${step.label}** (${stepNum}/${steps.length})\n\n`;

    if (step.picks > 1) {
      const posLabels = ["1er", "2ème", "3ème"];
      description += `Choisis le **${posLabels[pickIndex]}**`;
      if (currentPicks.length > 0) {
        description += `\n\nDéjà choisi : ${currentPicks.map((c, i) => `${posLabels[i]}: **${getPilotName(c)}**`).join(", ")}`;
      }
    } else {
      description += "Choisis un pilote";
    }

    embed.setDescription(description);

    // Show already completed categories
    if (collected.size > 0) {
      const lines = Array.from(collected.entries()).map(([cat, preds]) => {
        const stepDef = ALL_STEPS.find((s) => s.category === cat)!;
        const names = preds.map((c) => getPilotName(c)).join(", ");
        return `${stepDef.emoji} ${stepDef.label}: **${names}**`;
      });
      embed.addFields({ name: "Pronostics validés", value: lines.join("\n") });
    }

    return embed;
  }

  function buildComponents(): ActionRowBuilder<any>[] {
    const step = steps[stepIndex];
    const excluded = step.picks > 1 ? currentPicks : [];

    const pilots = PILOTS.filter((p) => !excluded.includes(p.code));
    const menu = new StringSelectMenuBuilder()
      .setCustomId("pronos_select")
      .setPlaceholder("Choisis un pilote...")
      .addOptions(
        pilots.map((p) => ({
          label: `${p.name}`,
          description: p.team,
          value: p.code,
        }))
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("pronos_skip")
        .setLabel("Passer")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("pronos_cancel")
        .setLabel("Annuler")
        .setStyle(ButtonStyle.Danger),
    );

    return [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      buttons,
    ];
  }

  function buildSummaryEmbed(): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`Récapitulatif — ${race.name}`)
      .setColor(0x00cc00);

    if (collected.size === 0) {
      embed.setDescription("Tu n'as fait aucun pronostic.");
      return embed;
    }

    const lines = Array.from(collected.entries()).map(([cat, preds]) => {
      const stepDef = ALL_STEPS.find((s) => s.category === cat)!;
      const names = preds.map((c, i) => {
        if (stepDef.picks > 1) return `${i + 1}. ${getPilotName(c)}`;
        return getPilotName(c);
      });
      return `${stepDef.emoji} **${stepDef.label}** : ${names.join(", ")}`;
    });

    embed.setDescription(lines.join("\n"));
    return embed;
  }

  function buildSummaryButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("pronos_confirm")
        .setLabel("Confirmer")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("pronos_cancel")
        .setLabel("Annuler")
        .setStyle(ButtonStyle.Danger),
    );
  }

  // Send initial message
  const reply = await interaction.reply({
    embeds: [buildEmbed()],
    components: buildComponents(),
    ephemeral: true,
    fetchReply: true,
  });

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 5 * 60 * 1000, // 5 minutes
  });

  collector.on("collect", async (i) => {
    // Handle cancel at any point
    if (i.customId === "pronos_cancel") {
      collector.stop("cancelled");
      await i.update({
        embeds: [new EmbedBuilder().setTitle("Pronostics annulés").setColor(0xff0000)],
        components: [],
      });
      return;
    }

    // Handle confirm on summary screen
    if (i.customId === "pronos_confirm") {
      // Save all bets
      for (const [category, predictions] of collected.entries()) {
        placeBet({
          userId: interaction.user.id,
          username: interaction.user.displayName,
          raceId: race.id,
          category,
          predictions,
        });
      }

      collector.stop("confirmed");
      await i.update({
        embeds: [
          buildSummaryEmbed().setTitle(`Pronostics enregistrés ! — ${race.name}`).setColor(0x00cc00),
        ],
        components: [],
      });

      // Post public message so everyone can see
      const publicEmbed = buildSummaryEmbed()
        .setTitle(`${interaction.user.displayName} a fait ses pronostics — ${race.name}`)
        .setColor(0x3498db)
        .setThumbnail(interaction.user.displayAvatarURL());
      const channel = interaction.channel;
      if (channel && "send" in channel) {
        await (channel as any).send({ embeds: [publicEmbed] });
      }
      return;
    }

    // Handle skip
    if (i.customId === "pronos_skip") {
      currentPicks = [];
      pickIndex = 0;
      stepIndex++;

      if (stepIndex >= steps.length) {
        // Show summary
        await i.update({
          embeds: [buildSummaryEmbed()],
          components: collected.size > 0 ? [buildSummaryButtons()] : [],
        });
        if (collected.size === 0) collector.stop("empty");
        return;
      }

      await i.update({ embeds: [buildEmbed()], components: buildComponents() });
      return;
    }

    // Handle pilot selection
    if (i.customId === "pronos_select" && i.isStringSelectMenu()) {
      const selected = i.values[0];
      const step = steps[stepIndex];

      if (step.picks > 1) {
        currentPicks.push(selected);
        pickIndex++;

        if (pickIndex < step.picks) {
          // Need more picks for this step
          await i.update({ embeds: [buildEmbed()], components: buildComponents() });
          return;
        }

        // All picks done for this step
        collected.set(step.category, [...currentPicks]);
        currentPicks = [];
        pickIndex = 0;
      } else {
        collected.set(step.category, [selected]);
      }

      stepIndex++;

      if (stepIndex >= steps.length) {
        // Show summary
        await i.update({
          embeds: [buildSummaryEmbed()],
          components: [buildSummaryButtons()],
        });
        return;
      }

      await i.update({ embeds: [buildEmbed()], components: buildComponents() });
    }
  });

  collector.on("end", (_, reason) => {
    if (reason === "time") {
      interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("Pronostics expirés (5 min)").setColor(0xff0000)],
        components: [],
      }).catch(() => {});
    }
  });
}

export const pronosCommand: Command = { data, execute };
