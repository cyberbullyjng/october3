import {
  EmbedBuilder, TextChannel, VoiceChannel, PermissionFlagsBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, ChannelType, Guild, GuildMember,
  CategoryChannel, Role, Collection,
} from "discord.js";
import type { Message } from "discord.js";
import { OWNER_ID } from "../../constants.js";
import {
  getGS, saveState, afkUsers, maintenanceMode, globalBannedUsers, blacklistedServers,
  snipeCache, editSnipeCache, reactionSnipeCache, msgStore, jailTimers, activeGiveawayTimers,
  floodTracker, antiSpamTracker, spamOffenses, joinTracker, raidModeActive,
  xpCooldowns, pendingConfirms, paginatedSessions, autoresponderCooldowns,
} from "../../state.js";
import { dmOwner } from "../../state.js";
import client from "../../client.js";
import {
  re, ri, gch, fetchMember, fetchRole, resolveRole, rQueue, parseDuration,
  checkAutostaffPromotion, recordModAction, checkCooldown, sendConfirm,
  sendPaginated, sendPaginatedI, isRepping, getStatusText, canPing,
  checkHierarchy, modActionEmbed, findOrCreateTextChannel, findOrCreateVoiceChannel,
  scheduleStatsUpdate, updateStats, handleSlowmode, getAntinukeActions, countRecent,
  setupJailSystem, punishAntinuke, runSetup, snapshotInvites, resolveGiveaway,
  scheduleGiveaway, xpForLevel, levelFromXp, fetchGuildChannel, EVERYONE_HIDDEN,
  buildPageEmbed, buildPageRow,
  safeReply,
} from "../../utils.js";
import { BLOCKED_TERMS, BLOCKED_PATTERNS } from "../../wordlist.js";
import {
  blackteaGames, wordValidCache,
} from "../../state.js";
import { COLORS } from "../../colors.js";

export async function handleVoiceCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "vclock": {
      const chId = args[0]?.replace(/[<#>]/g, "");
      if (!chId) {
        await safeReply(message, re(`Usage: \`${p}vclock #voice-channel [limit]\` — set a user limit (0 = unlimited, max 99). Example: \`${p}vclock #general-vc 5\``));
        return true;
      }
      const vc = guild.channels.cache.get(chId);
      if (!vc || (vc.type !== ChannelType.GuildVoice && vc.type !== ChannelType.GuildStageVoice)) {
        await safeReply(message, re("That's not a voice channel."));
        return true;
      }
      const limit = args[1] !== undefined ? parseInt(args[1]) : 0;
      if (isNaN(limit) || limit < 0 || limit > 99) {
        await safeReply(message, re("Limit must be between **0** (unlimited) and **99**."));
        return true;
      }
      await (vc as VoiceChannel).setUserLimit(limit, `Set by ${message.author.tag}`);
      await safeReply(message, re(
        limit === 0
          ? ` User limit removed from **${vc.name}** — open to everyone.`
          : ` **${vc.name}** capped at **${limit}** user${limit !== 1 ? "s" : ""}.`
      ));
      return true;
    }
    case "move": {
      const mention = args[0];
      const channelMention = args[1];
      const userId = mention?.replace(/[<@!>]/g, "");
      const channelId = channelMention?.replace(/[<#>]/g, "");
      if (!userId || !channelId) {
        await safeReply(message, re(`Usage: \`${p}move @user #voice-channel\``));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        if (!member.voice.channel) {
          await safeReply(message, re("That user isn't in a voice channel."));
          return true;
        }
        const vc = (await message.guild!.channels.fetch(
          channelId,
        )) as VoiceChannel;
        await member.voice.setChannel(vc);
        await message.react("");
      } catch {
        await safeReply(message, re("Couldn't move that user."));
      }
      return true;
    }
    case "moveall": {
      const fromId = args[0]?.replace(/[<#>]/g, "");
      const toId   = args[1]?.replace(/[<#>]/g, "");
      if (!fromId || !toId) {
        await safeReply(message, re(`Usage: \`${p}moveall #from-vc #to-vc\` — moves everyone in one VC to another.`));
        return true;
      }
      const fromCh = message.guild!.channels.cache.get(fromId);
      const toCh   = message.guild!.channels.cache.get(toId);
      if (!fromCh?.isVoiceBased()) { await safeReply(message, re("Source channel not found or is not a voice channel.")); return true; }
      if (!toCh?.isVoiceBased())   { await safeReply(message, re("Destination channel not found or is not a voice channel.")); return true; }
      const vcMembers = [...(fromCh as VoiceChannel).members.values()];
      if (vcMembers.length === 0) {
        await safeReply(message, re(`Nobody is in **${fromCh.name}**.`));
        return true;
      }
      let moved = 0;
      for (const m of vcMembers) { await m.voice.setChannel(toCh as VoiceChannel).catch(() => {}); moved++; }
      await safeReply(message, re(`Moved **${moved}** member${moved !== 1 ? "s" : ""} from **${fromCh.name}** → **${toCh.name}**.`));
      return true;
    }
    case "vc": {
      const sub = args[0]?.toLowerCase();
      const guild = message.guild!;

      if (sub === "setup") {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator) && guild.ownerId !== message.author.id) {
          await safeReply(message, re("You need **Administrator** to set up VoiceMaster."));
          return true;
        }
        const existingCategory = gs.vcSetupCategoryId
          ? guild.channels.cache.get(gs.vcSetupCategoryId)
          : null;
        const category = existingCategory?.type === ChannelType.GuildCategory
          ? existingCategory as CategoryChannel
          : (guild.channels.cache.find((ch) =>
              ch.type === ChannelType.GuildCategory &&
              ["vc", "voicemaster", "voice master"].includes(ch.name.toLowerCase())
            ) as CategoryChannel | undefined) ?? await guild.channels.create({
              name: "vc",
              type: ChannelType.GuildCategory,
            }) as CategoryChannel;
        const existingJoinChannel = gs.vcJoinChannelId
          ? guild.channels.cache.get(gs.vcJoinChannelId)
          : null;
        const j2c = existingJoinChannel?.type === ChannelType.GuildVoice
          ? existingJoinChannel as VoiceChannel
          : (guild.channels.cache.find((ch) =>
              ch.type === ChannelType.GuildVoice &&
              ch.parentId === category.id &&
              ["j2c", "join to create", "join-2-create", "join 2 create"].includes(ch.name.toLowerCase())
            ) as VoiceChannel | undefined) ?? await guild.channels.create({
              name: "j2c",
              type: ChannelType.GuildVoice,
              parent: category.id,
            }) as VoiceChannel;
        if (j2c.parentId !== category.id) {
          await j2c.setParent(category.id).catch(() => {});
        }
        gs.vcSetupCategoryId = category.id;
        gs.vcJoinChannelId = j2c.id;
        saveState();
        await safeReply(message, re(`VoiceMaster is ready! Join **${j2c.name}** in the **${category.name}** category to create your own VC.`));
        return true;
      }

      // All other subcommands require the user to be in a voice channel
      const memberVC = message.member?.voice.channel as VoiceChannel | null;
      if (!memberVC) {
        await safeReply(message, re("You need to be in your voice channel to use this command."));
        return true;
      }
      const vcOwnerId = gs.vcChannelOwners.get(memberVC.id);
      const isVcOwner = vcOwnerId === message.author.id;

      // claim and info are open to anyone in the VC; all other subcommands need ownership
      const ownerOnlySubcmds = ["lock","unlock","hide","unhide","kick","allow","reject","deny","rename","limit"];
      if (ownerOnlySubcmds.includes(sub ?? "") && !isVcOwner) {
        await safeReply(message, re("Only the owner of this voice channel can use that command."));
        return true;
      }

      switch (sub) {
        case "lock": {
          await memberVC.permissionOverwrites.edit(guild.roles.everyone, { Connect: false }).catch(() => {});
          for (const uid of gs.vcAllowList.get(memberVC.id) ?? []) {
            const m = await fetchMember(guild, uid).catch(() => null);
            if (m) await memberVC.permissionOverwrites.edit(m, { Connect: true, ViewChannel: true }).catch(() => {});
          }
          await safeReply(message, re("Your voice channel has been **locked**."));
          break;
        }
        case "unlock": {
          await memberVC.permissionOverwrites.edit(guild.roles.everyone, { Connect: null }).catch(() => {});
          await safeReply(message, re("Your voice channel has been **unlocked**."));
          break;
        }
        case "hide": {
          await memberVC.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => {});
          for (const uid of gs.vcAllowList.get(memberVC.id) ?? []) {
            const m = await fetchMember(guild, uid).catch(() => null);
            if (m) await memberVC.permissionOverwrites.edit(m, { Connect: true, ViewChannel: true }).catch(() => {});
          }
          await safeReply(message, re("Your voice channel is now **hidden**."));
          break;
        }
        case "unhide": {
          await memberVC.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null }).catch(() => {});
          await safeReply(message, re("Your voice channel is now **visible**."));
          break;
        }
        case "kick": {
          const targetMention = args[1];
          const targetId = targetMention?.replace(/[<@!>]/g, "");
          if (!targetId) { await safeReply(message, re(`Usage: \`${p}vc kick @user\``)); break; }
          if (targetId === message.author.id) { await safeReply(message, re("You can't kick yourself.")); break; }
          const target = await fetchMember(guild, targetId).catch(() => null);
          if (!target || target.voice.channelId !== memberVC.id) {
            await safeReply(message, re("That user isn't in your voice channel."));
            break;
          }
          await target.voice.disconnect("Kicked from VC by owner").catch(() => {});
          await safeReply(message, re(`**${target.user.tag}** has been removed from your voice channel.`));
          break;
        }
        case "allow": {
          const targetMention = args[1];
          const targetId = targetMention?.replace(/[<@!>]/g, "");
          if (!targetId) { await safeReply(message, re(`Usage: \`${p}vc allow @user\``)); break; }
          const target = await fetchMember(guild, targetId).catch(() => null);
          if (!target) { await safeReply(message, re("User not found.")); break; }
          if (!gs.vcAllowList.has(memberVC.id)) gs.vcAllowList.set(memberVC.id, new Set());
          gs.vcAllowList.get(memberVC.id)!.add(targetId);
          await memberVC.permissionOverwrites.edit(target, { Connect: true, ViewChannel: true }).catch(() => {});
          await safeReply(message, re(`**${target.user.tag}** can now join your voice channel.`));
          break;
        }
        case "reject":
        case "deny": {
          const targetMention = args[1];
          const targetId = targetMention?.replace(/[<@!>]/g, "");
          if (!targetId) { await safeReply(message, re(`Usage: \`${p}vc reject @user\``)); break; }
          const target = await fetchMember(guild, targetId).catch(() => null);
          if (!target) { await safeReply(message, re("User not found.")); break; }
          gs.vcAllowList.get(memberVC.id)?.delete(targetId);
          await memberVC.permissionOverwrites.edit(target, { Connect: false }).catch(() => {});
          if (target.voice.channelId === memberVC.id) {
            await target.voice.disconnect("Removed by VC owner").catch(() => {});
          }
          await safeReply(message, re(`**${target.user.tag}** has been blocked from your voice channel.`));
          break;
        }
        case "rename": {
          const newName = args.slice(1).join(" ");
          if (!newName) { await safeReply(message, re(`Usage: \`${p}vc rename <new name>\``)); break; }
          if (newName.length > 100) { await safeReply(message, re("Name must be under 100 characters.")); break; }
          try {
            await memberVC.setName(newName, `Renamed by ${message.author.tag}`);
            await safeReply(message, re(`Your voice channel has been renamed to **${newName}**.`));
          } catch {
            await safeReply(message, re("Couldn't rename the channel — check my permissions."));
          }
          break;
        }
        case "limit": {
          const limit = parseInt(args[1]);
          if (isNaN(limit) || limit < 0 || limit > 99) { await safeReply(message, re(`Usage: \`${p}vc limit <0-99>\` (0 = unlimited)`)); break; }
          try {
            await memberVC.setUserLimit(limit);
            await safeReply(message, re(limit === 0 ? "User limit removed — your VC is now open." : `User limit set to **${limit}**.`));
            saveState();
          } catch {
            await safeReply(message, re("Couldn't set the user limit."));
          }
          break;
        }
        case "claim": {
          if (isVcOwner) { await safeReply(message, re("You already own this voice channel.")); break; }
          const prevOwnerId = vcOwnerId;
          const prevOwner = prevOwnerId ? memberVC.members.get(prevOwnerId) : null;
          if (prevOwner) { await safeReply(message, re("The current owner is still in the channel — you can't claim it.")); break; }
          gs.vcChannelOwners.set(memberVC.id, message.author.id);
          saveState();
          await safeReply(message, re(`You've claimed ownership of **${memberVC.name}**.`));
          break;
        }
        case "info": {
          const ownerId = gs.vcChannelOwners.get(memberVC.id);
          const allowList = gs.vcAllowList.get(memberVC.id);
          const embed = new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle(`VC Info: ${memberVC.name}`)
            .addFields(
              { name: "Owner", value: ownerId ? `<@${ownerId}>` : "None", inline: true },
              { name: "Members", value: `${memberVC.members.size}${memberVC.userLimit ? `/${memberVC.userLimit}` : ""}`, inline: true },
              { name: "Bitrate", value: `${memberVC.bitrate / 1000}kbps`, inline: true },
              { name: "Allow List", value: allowList && allowList.size > 0 ? [...allowList].map((id) => `<@${id}>`).join(", ") : "None", inline: false },
            )
            .setFooter({ text: `Channel ID: ${memberVC.id}` });
          await safeReply(message, { embeds: [embed] });
          break;
        }
        default: {
          await safeReply(message, re(`**VoiceMaster commands:**\n\`${p}vc setup\` — set up VoiceMaster (admin)\n\`${p}vc lock\` — lock your VC\n\`${p}vc unlock\` — unlock your VC\n\`${p}vc hide\` — hide your VC\n\`${p}vc unhide\` — unhide your VC\n\`${p}vc kick @user\` — remove someone\n\`${p}vc allow @user\` — allow someone\n\`${p}vc reject @user\` — block someone\n\`${p}vc rename <name>\` — rename your VC\n\`${p}vc limit <0-99>\` — set user limit\n\`${p}vc claim\` — claim an empty VC\n\`${p}vc info\` — view VC details`));
        }
      }
      return true;
    }
    case "slowall": {
      if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await safeReply(message, re("You need **Manage Channels** to use this."));
        return true;
      }
      const raw = args[0]?.toLowerCase();
      if (!raw) {
        await safeReply(message, re(`Usage: \`${p}slowall <duration>\` or \`${p}slowall off\`\nExamples: \`${p}slowall 5s\`, \`${p}slowall 2m\`, \`${p}slowall off\``));
        return true;
      }
      let seconds = 0;
      if (raw !== "off" && raw !== "0") {
        const match = raw.match(/^(\d+)(s|m|h)?$/);
        if (!match) {
          await safeReply(message, re("Invalid duration. Use `5s`, `2m`, `1h`, or `off`."));
          return true;
        }
        const n = parseInt(match[1]);
        const unit = match[2] ?? "s";
        seconds = unit === "h" ? n * 3600 : unit === "m" ? n * 60 : n;
        if (seconds > 21600) {
          await safeReply(message, re("Maximum slowmode is 6 hours (21600s)."));
          return true;
        }
      }
      const textChannels = guild.channels.cache.filter(
        (c) => c.isTextBased() && c.type === ChannelType.GuildText
      );
      const status = await safeReply(message, re(`Setting slowmode on **${textChannels.size}** channels...`));
      let done = 0;
      let failed = 0;
      await rQueue([...textChannels.values()], async (ch) => {
        try {
          await (ch as any).setRateLimitPerUser(seconds);
          done++;
        } catch {
          failed++;
        }
      }, 300);
      const label = seconds === 0 ? "disabled" : `set to **${raw}**`;
      await status.edit({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(` Slowmode ${label} on **${done}** channel(s)${failed ? ` (${failed} skipped)` : ""}.`)] });
      return true;
    }

    default:
      return false;
  }
}
