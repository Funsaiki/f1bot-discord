import {
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type SlashCommandBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

import { pronosCommand } from "./pronos";
import { mespronosticsCommand } from "./mespronostics";
import { classementCommand } from "./classement";
import { calendrierCommand } from "./calendrier";
import { adminCommand } from "./admin";

export const commands: Command[] = [
  pronosCommand,
  mespronosticsCommand,
  classementCommand,
  calendrierCommand,
  adminCommand,
];
