import { REST, Routes } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";

const rest = new REST().setToken(config.discordToken);

async function deploy() {
  const commandData = commands.map((c) => c.data.toJSON());

  console.log(`Enregistrement de ${commandData.length} commandes...`);

  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commandData }
  );

  console.log("Commandes enregistrées avec succès !");
}

deploy().catch(console.error);
