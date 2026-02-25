import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

export const config = {
  discordToken: requireEnv("DISCORD_TOKEN"),
  clientId: requireEnv("DISCORD_CLIENT_ID"),
  guildId: requireEnv("DISCORD_GUILD_ID"),
  adminRoleId: process.env.ADMIN_ROLE_ID || null,
  announceChannelId: process.env.ANNOUNCE_CHANNEL_ID || null,
  f1Season: parseInt(process.env.F1_SEASON || "2026", 10),
  dbPath: process.env.DB_PATH || "./data/f1bot.db",
} as const;
