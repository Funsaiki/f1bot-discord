import { REST, Routes } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";

const rest = new REST().setToken(config.discordToken);

async function deploy() {
  const commandData = commands.map((c) => c.data.toJSON());

  console.log(`Enregistrement de ${commandData.length} commandes sur ${config.guildIds.length} serveur(s)...`);

  for (const guildId of config.guildIds) {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, guildId),
      { body: commandData }
    );
    console.log(`Commandes enregistrées sur le serveur ${guildId}`);
  }

  console.log("Terminé !");
}

deploy().catch(console.error);
