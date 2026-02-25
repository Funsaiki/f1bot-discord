import { Client, GatewayIntentBits, Events } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";
import { startScheduler } from "./services/scheduler";

// Import db to trigger table creation
import "./db";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Build a command map for quick lookup
const commandMap = new Map(commands.map((c) => [c.data.name, c]));

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Connecté en tant que ${readyClient.user.tag}`);
  console.log(`Serveurs : ${readyClient.guilds.cache.size}`);
  startScheduler(client);
});

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
