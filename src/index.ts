import { Client, GatewayIntentBits, Events, EmbedBuilder } from "discord.js";
import type { TextBasedChannel } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";
import { startScheduler } from "./services/scheduler";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { dirname } from "path";

// Import db to trigger table creation
import "./db";

const RESTART_FILE = `${dirname(config.dbPath)}/restart-messages.json`;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Build a command map for quick lookup
const commandMap = new Map(commands.map((c) => [c.data.name, c]));

/** Delete restart messages from the previous shutdown */
async function cleanupRestartMessages(): Promise<void> {
  let data: { channelId: string; messageId: string }[];
  try {
    data = JSON.parse(readFileSync(RESTART_FILE, "utf-8"));
  } catch {
    return; // No file = nothing to clean
  }

  for (const { channelId, messageId } of data) {
    try {
      const channel = client.channels.cache.get(channelId) as TextBasedChannel | undefined;
      if (channel && "messages" in channel) {
        const msg = await (channel as any).messages.fetch(messageId);
        if (msg) await msg.delete();
      }
    } catch {
      // Message already deleted or channel unavailable
    }
  }

  try { unlinkSync(RESTART_FILE); } catch {}
}

/** Send restart messages and save their IDs */
async function sendRestartMessages(): Promise<void> {
  if (config.announceChannelIds.length === 0) return;

  const embed = new EmbedBuilder()
    .setTitle("\u{1F504} Redémarrage en cours...")
    .setDescription("Le bot redémarre, il sera de retour dans quelques secondes.")
    .setColor(0xff9800);

  const saved: { channelId: string; messageId: string }[] = [];

  for (const channelId of config.announceChannelIds) {
    try {
      const channel = client.channels.cache.get(channelId) as TextBasedChannel | undefined;
      if (channel && "send" in channel) {
        const msg = await channel.send({ embeds: [embed] });
        saved.push({ channelId, messageId: msg.id });
      }
    } catch {
      // Channel unavailable
    }
  }

  if (saved.length > 0) {
    writeFileSync(RESTART_FILE, JSON.stringify(saved));
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Connecté en tant que ${readyClient.user.tag}`);
  console.log(`Serveurs : ${readyClient.guilds.cache.size}`);
  await cleanupRestartMessages();
  startScheduler(client);
});

// Graceful shutdown
let shuttingDown = false;
async function gracefulShutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[Shutdown] Envoi des messages de redémarrage...");
  await sendRestartMessages();
  console.log("[Shutdown] Déconnexion...");
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Erreur commande ${interaction.commandName}:`, error);
      const reply = {
        content: "Une erreur est survenue lors de l'exécution de cette commande.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  } else if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (!command?.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(`Erreur autocomplete ${interaction.commandName}:`, error);
    }
  }
});

client.login(config.discordToken);
