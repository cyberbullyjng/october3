import type { Message } from "discord.js";
import { handleModBansCommand } from "./mod-bans.js";
import { handleModMutesCommand } from "./mod-mutes.js";
import { handleModJailCommand } from "./mod-jail.js";
import { handleModChannelsCommand } from "./mod-channels.js";
import { handleModMembersCommand } from "./mod-members.js";

export async function handleModerationCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;

  if (await handleModBansCommand(cmd, args, message)) return true;
  if (await handleModJailCommand(cmd, args, message)) return true;
  if (await handleModMutesCommand(cmd, args, message)) return true;
  if (await handleModChannelsCommand(cmd, args, message)) return true;
  if (await handleModMembersCommand(cmd, args, message)) return true;

  return false;
}
