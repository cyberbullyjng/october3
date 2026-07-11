import { Message, PermissionFlagsBits } from "discord.js";
import client from "../client.js";
import { getGS } from "../state.js";
import { fetchMember, safeReply, re } from "../utils.js";
import {
  BUILTIN_ALIASES, CMD_PERMS, PERM_NAMES, DMALL_ALLOWED_IDS, GIVEAWAY_MANAGERS, isOwner,
} from "../constants.js";
import { handleModerationCommand } from "../commands/prefix/moderation.js";
import { handleAntinukeCommand } from "../commands/prefix/antinuke.js";
import { handleUtilityCommand } from "../commands/prefix/utility.js";
import { handleInfoCommand } from "../commands/prefix/info.js";
import { handleConfigCommand } from "../commands/prefix/config.js";
import { handleFunCommand } from "../commands/prefix/fun.js";
import { handleVoiceCommand } from "../commands/prefix/voice.js";
import { handleRolesCommand } from "../commands/prefix/roles.js";
import { handleOwnerCategoryCommand } from "../commands/prefix/owner.js";
import { handleExtrasCommand } from "../commands/prefix/extras.js";
import { handleLastfmCommand } from "../commands/prefix/lastfm.js";
import { handleMusicCommand } from "../commands/prefix/music.js";
import { handleFeedsCommand } from "../commands/prefix/feeds.js";

export async function handleCommand(message: Message, skipPermCheck = false): Promise<boolean> {
  if (!message.guild) throw new Error("This command requires a server context — use it in a channel instead.");
  const guild = message.guild;
  const gs = getGS(guild.id);
  const content = message.content.trim();
  if (!content.startsWith(gs.prefix)) return false;
  const jailedRole = gs.jailRoleId ? guild.roles.cache.get(gs.jailRoleId) ?? null : null;

  const parts = content.slice(gs.prefix.length).split(" ");
  const rawCommand = parts[0].toLowerCase();

  const args = parts.slice(1);
  const resolvedCommand = rawCommand === "uto" && args[0]?.toLowerCase() === "all"
    ? "untimeoutall"
    : gs.aliases.get(rawCommand) ?? BUILTIN_ALIASES.get(rawCommand) ?? rawCommand;

  // ── Permission check (skipped for owner / botAccessUsers) ─────────────────
  if (!skipPermCheck && !isOwner(message.author.id)) {
    const requiredPerm = CMD_PERMS[resolvedCommand];
    if (requiredPerm !== undefined) {
      const member = guild.members.cache.get(message.author.id)
        ?? await fetchMember(guild, message.author.id).catch(() => null);
      let denied = false;
      let reason = "";
      if (requiredPerm === "dmall_only") {
        if (!DMALL_ALLOWED_IDS.has(message.author.id)) {
          denied = true;
          reason = "You are not authorized to use this command.";
        }
      } else if (requiredPerm === "bot_owner") {
        if (!isOwner(message.author.id)) {
          denied = true;
          reason = "This command can only be used by the bot owner.";
        }
      } else if (requiredPerm === "server_owner") {
        if (guild.ownerId !== message.author.id) {
          denied = true;
          reason = "Only the **server owner** can use this command.";
        }
      } else if (requiredPerm === "antinuke_admin") {
        if (!gs.antinukeAdmins.has(message.author.id) && !member?.permissions.has(PermissionFlagsBits.Administrator)) {
          denied = true;
          reason = "You need to be granted **Antinuke Admin** to use this command. Ask a server admin to run `!antinukeadmin grant @you`.";
        }
      } else if (requiredPerm === "admin") {
        if (!member?.permissions.has(PermissionFlagsBits.Administrator) && guild.ownerId !== message.author.id) {
          denied = true;
          reason = "You need **Administrator** permission to use this command.";
        }
      } else {
        const GIVEAWAY_CMDS = new Set(["giveaway", "gend", "greroll"]);
        const isGiveawayManager = GIVEAWAY_CMDS.has(resolvedCommand) && GIVEAWAY_MANAGERS.has(message.author.id);
        if (!isGiveawayManager && !member?.permissions.has(requiredPerm)) {
          const permName = PERM_NAMES[String(requiredPerm)] ?? "the required permission";
          denied = true;
          reason = `You need the **${permName}** permission to use this command.`;
        }
      }
      if (denied) {
        await safeReply(message, re(`${reason}`)).catch(() => {});
        return true;
      }
    }
  }

  // ── Disabled command check ─────────────────────────────────────────────────
  {
    const globallyDisabled = gs.disabledCommands.get("__global__");
    const channelDisabled = gs.disabledCommands.get(message.channel.id);
    if (globallyDisabled?.has(resolvedCommand) || channelDisabled?.has(resolvedCommand)) {
      return true;
    }
  }

  // ── Delegate to category handlers ──────────────────────────────────────────
  if (await handleModerationCommand(resolvedCommand, args, message)) return true;
  if (await handleAntinukeCommand(resolvedCommand, args, message)) return true;
  if (await handleUtilityCommand(resolvedCommand, args, message)) return true;
  if (await handleInfoCommand(resolvedCommand, args, message)) return true;
  if (await handleConfigCommand(resolvedCommand, args, message)) return true;
  if (await handleFunCommand(resolvedCommand, args, message)) return true;
  if (await handleVoiceCommand(resolvedCommand, args, message)) return true;
  if (await handleRolesCommand(resolvedCommand, args, message)) return true;
  if (await handleOwnerCategoryCommand(resolvedCommand, args, message)) return true;
  if (await handleExtrasCommand(resolvedCommand, args, message)) return true;
  if (await handleMusicCommand(resolvedCommand, args, message)) return true;
  if (await handleFeedsCommand(resolvedCommand, args, message)) return true;
  if (await handleLastfmCommand(resolvedCommand, args, message)) return true;
  return false;
}
