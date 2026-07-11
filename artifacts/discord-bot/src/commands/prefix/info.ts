import {
  EmbedBuilder, TextChannel, VoiceChannel, PermissionFlagsBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, ChannelType, Guild, GuildMember,
  CategoryChannel, Role, Collection, AuditLogEvent, StickerFormatType,
} from "discord.js";
import type { Message, User } from "discord.js";
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
  ensureMembersCache,
  safeReply,
} from "../../utils.js";
import { BLOCKED_TERMS, BLOCKED_PATTERNS } from "../../wordlist.js";
import {
  blackteaGames, wordValidCache,
} from "../../state.js";
import { COLORS } from "../../colors.js";

const USER_MENTION_RE = /<@!?(\d{17,20})>/;
const SNOWFLAKE_RE = /^\d{17,20}$/;

async function resolveUserTarget(message: Message, args: string[]): Promise<User | null> {
  const raw = args.join(" ").trim();
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned;
  if (!raw) {
    const replied = message.reference?.messageId
      ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
      : null;
    return replied?.author ?? message.author;
  }

  const cleaned = raw.replace(/^@/, "").trim();
  const id = raw.match(USER_MENTION_RE)?.[1] ?? (SNOWFLAKE_RE.test(cleaned) ? cleaned : null);
  if (id) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id, { force: true }).catch(() => null);
  }

  if (!message.guild) return null;
  const lower = cleaned.toLowerCase();
  const cachedMember = message.guild.members.cache.find((member) =>
    member.user.username.toLowerCase() === lower
    || member.user.tag.toLowerCase() === lower
    || member.displayName.toLowerCase() === lower
    || member.user.globalName?.toLowerCase() === lower
  );
  if (cachedMember) return cachedMember.user;

  const fetched = await message.guild.members.fetch({ query: cleaned, limit: 5 }).catch(() => null);
  const member = fetched?.find((candidate) =>
    candidate.user.username.toLowerCase() === lower
    || candidate.user.tag.toLowerCase() === lower
    || candidate.displayName.toLowerCase() === lower
    || candidate.user.globalName?.toLowerCase() === lower
  ) ?? fetched?.first() ?? null;
  return member?.user ?? null;
}

async function resolveMemberTarget(message: Message, args: string[]): Promise<GuildMember | null> {
  if (!message.guild) return null;
  const raw = args.join(" ").trim();
  const mentioned = message.mentions.members?.first();
  if (mentioned) return mentioned;
  if (!raw) {
    const replied = message.reference?.messageId
      ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
      : null;
    const targetId = replied?.author.id ?? message.author.id;
    return await fetchMember(message.guild, targetId).catch(() => null);
  }

  const cleaned = raw.replace(/^@/, "").trim();
  const id = raw.match(USER_MENTION_RE)?.[1] ?? (SNOWFLAKE_RE.test(cleaned) ? cleaned : null);
  if (id) return await fetchMember(message.guild, id).catch(() => null);

  const lower = cleaned.toLowerCase();
  const cachedMember = message.guild.members.cache.find((member) =>
    member.user.username.toLowerCase() === lower
    || member.user.tag.toLowerCase() === lower
    || member.displayName.toLowerCase() === lower
    || member.user.globalName?.toLowerCase() === lower
  );
  if (cachedMember) return cachedMember;

  const fetched = await message.guild.members.fetch({ query: cleaned, limit: 5 }).catch(() => null);
  return fetched?.find((candidate) =>
    candidate.user.username.toLowerCase() === lower
    || candidate.user.tag.toLowerCase() === lower
    || candidate.displayName.toLowerCase() === lower
    || candidate.user.globalName?.toLowerCase() === lower
  ) ?? fetched?.first() ?? null;
}

export async function handleInfoCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "roleinfo": {
      const roleInput = args.join(" ").trim();
      if (!roleInput) {
        await safeReply(message, re(`Usage: \`${p}roleinfo @role\` or \`${p}roleinfo role name\``));
        return true;
      }
      try {
        const role = resolveRole(message.guild!, roleInput);
        if (!role) {
          await safeReply(message, re("Role not found. Try mentioning it, its ID, or typing its name."));
          return true;
        }
        await ensureMembersCache(message.guild!);
        const members = message.guild!.members.cache.filter((m) =>
          m.roles.cache.has(role.id),
        );
        const perms =
          role.permissions
            .toArray()
            .map((p) =>
              p
                .replace(/_/g, " ")
                .toLowerCase()
                .replace(/\b\w/g, (c) => c.toUpperCase()),
            )
            .join(", ") || "None";
        await safeReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(role.color || 0x5865f2)
              .setTitle(`Role: ${role.name}`)
              .addFields(
                { name: "ID", value: role.id, inline: true },
                { name: "Color", value: role.hexColor, inline: true },
                { name: "Position", value: `${role.position}`, inline: true },
                { name: "Members", value: `${members.size}`, inline: true },
                {
                  name: "Mentionable",
                  value: role.mentionable ? "Yes" : "No",
                  inline: true,
                },
                {
                  name: "Hoisted",
                  value: role.hoist ? "Yes" : "No",
                  inline: true,
                },
                {
                  name: "Created",
                  value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`,
                  inline: true,
                },
                { name: "Permissions", value: perms.slice(0, 1024) },
              ),
          ],
        });
      } catch {
        await safeReply(message, re("Couldn't fetch role info."));
      }
      return true;
    }
    case "channelinfo": {
      const ch = message.channel as TextChannel;
      await safeReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle(`Channel: #${ch.name}`)
            .addFields(
              { name: "ID", value: ch.id, inline: true },
              { name: "Type", value: String(ch.type), inline: true },
              {
                name: "Category",
                value: ch.parent?.name ?? "None",
                inline: true,
              },
              {
                name: "Topic",
                value: (ch as TextChannel).topic || "No topic",
                inline: false,
              },
              {
                name: "Slowmode",
                value: `${(ch as TextChannel).rateLimitPerUser ?? 0}s`,
                inline: true,
              },
              {
                name: "NSFW",
                value: (ch as TextChannel).nsfw ? "Yes" : "No",
                inline: true,
              },
              {
                name: "Created",
                value: `<t:${Math.floor(ch.createdTimestamp! / 1000)}:R>`,
                inline: true,
              },
            ),
        ],
      });
      return true;
    }
    case "invites": {
      try {
        const invites = await message.guild!.invites.fetch();
        if (invites.size === 0) {
          await safeReply(message, re("No active invites."));
          return true;
        }
        const items = invites.map(
          (inv) =>
            `**discord.gg/${inv.code}** — ${inv.uses ?? 0} uses — by **${inv.inviter?.tag ?? "Unknown"}**${inv.maxAge ? ` — expires <t:${Math.floor((inv.createdTimestamp! + inv.maxAge * 1000) / 1000)}:R>` : " — never expires"}`,
        );
        await sendPaginated(message, ` Active Invites (${invites.size})`, [...items], { perPage: 10, color: 0x5865f2 });
      } catch {
        await safeReply(message, re("Couldn't fetch invites."));
      }
      return true;
    }
    case "userinfo": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "") ?? message.author.id;
      try {
        const member = await fetchMember(message.guild!, userId);
        const user = member.user;
        const roles =
          member.roles.cache
            .filter((r) => r.id !== message.guild!.id)
            .sort((a, b) => b.position - a.position)
            .map((r) => `${r}`)
            .join(", ") || "None";

        // Join position — sort all members by joinedTimestamp
        await ensureMembersCache(message.guild!);
        const allSorted = [...message.guild!.members.cache.values()]
          .filter((m) => m.joinedTimestamp)
          .sort((a, b) => a.joinedTimestamp! - b.joinedTimestamp!);
        const joinPos = allSorted.findIndex((m) => m.id === user.id) + 1;

        // Account age warning (< 7 days old)
        const accountAgeMs = Date.now() - user.createdTimestamp;
        const isNewAccount = accountAgeMs < 7 * 24 * 60 * 60 * 1000;

        // Status / activity
        const presence = member.presence;
        const statusMap: Record<string, string> = { online: "Online", idle: "Idle", dnd: "DND", offline: "Offline" };
        const statusStr = statusMap[presence?.status ?? "offline"] ?? " Offline";
        const activity = presence?.activities[0];
        const activityStr = activity ? `${activity.type === 0 ? "Playing" : activity.type === 1 ? "Streaming" : activity.type === 2 ? "Listening to" : "Doing"} ${activity.name}` : "None";

        const embed = new EmbedBuilder()
          .setColor(isNewAccount ? 0xed4245 : 0x5865f2)
          .setTitle(`${user.tag}${isNewAccount ? " (New Account)" : ""}`)
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: "ID", value: user.id, inline: true },
            { name: "Nickname", value: member.nickname ?? "None", inline: true },
            { name: "Status", value: statusStr, inline: true },
            { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>\n(<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`, inline: true },
            { name: "Joined Server", value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n(<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)` : "Unknown", inline: true },
            { name: "Join Position", value: `#${joinPos} / ${message.guild!.memberCount}`, inline: true },
            { name: "Activity", value: activityStr, inline: true },
            { name: "Warnings", value: `${gs.warnings.get(user.id)?.length ?? 0}`, inline: true },
            { name: "XP / Level", value: (() => { const d = gs.xpData.get(user.id); return d ? `Level ${d.level} · ${d.xp} XP` : "No XP"; })(), inline: true },
            { name: `Roles (${member.roles.cache.size - 1})`, value: roles.slice(0, 1024) },
          )
          .setFooter({ text: `Bot: ${user.bot ? "Yes" : "No"} · Boosting: ${member.premiumSince ? "Yes" : "No"}` })
          .setTimestamp();

        if (isNewAccount) {
          embed.setDescription("**This account was created less than 7 days ago.**");
        }

        await safeReply(message, { embeds: [embed] });
      } catch {
        await safeReply(message, re("Couldn't find that user."));
      }
      return true;
    }
    case "permissions": {
      const targetId = args[0]?.replace(/[<@!>]/g, "");
      if (!targetId) {
        await safeReply(message, re(`Usage: \`${p}permissions @user [#channel]\` — show a member's permissions, optionally in a specific channel.`));
        return true;
      }
      const target = guild.members.cache.get(targetId) ?? await fetchMember(guild, targetId).catch(() => null);
      if (!target) {
        await safeReply(message, re("Member not found."));
        return true;
      }
      const chId = args[1]?.replace(/[<#>]/g, "");
      const ch = chId ? guild.channels.cache.get(chId) : null;
      const perms = ch ? target.permissionsIn(ch) : target.permissions;
      const PERM_PAIRS: [string, bigint][] = [
        ["Administrator",     PermissionFlagsBits.Administrator],
        ["Manage Server",     PermissionFlagsBits.ManageGuild],
        ["Manage Channels",   PermissionFlagsBits.ManageChannels],
        ["Manage Roles",      PermissionFlagsBits.ManageRoles],
        ["Manage Messages",   PermissionFlagsBits.ManageMessages],
        ["Manage Nicknames",  PermissionFlagsBits.ManageNicknames],
        ["Manage Emojis",     PermissionFlagsBits.ManageEmojisAndStickers],
        ["Kick Members",      PermissionFlagsBits.KickMembers],
        ["Ban Members",       PermissionFlagsBits.BanMembers],
        ["Moderate Members",  PermissionFlagsBits.ModerateMembers],
        ["Mention @everyone", PermissionFlagsBits.MentionEveryone],
        ["View Channels",     PermissionFlagsBits.ViewChannel],
        ["Send Messages",     PermissionFlagsBits.SendMessages],
        ["Attach Files",      PermissionFlagsBits.AttachFiles],
        ["Embed Links",       PermissionFlagsBits.EmbedLinks],
        ["Add Reactions",     PermissionFlagsBits.AddReactions],
        ["Ext. Emojis",       PermissionFlagsBits.UseExternalEmojis],
        ["Connect (Voice)",   PermissionFlagsBits.Connect],
        ["Speak (Voice)",     PermissionFlagsBits.Speak],
        ["Move Members",      PermissionFlagsBits.MoveMembers],
        ["Mute Members",      PermissionFlagsBits.MuteMembers],
        ["Deafen Members",    PermissionFlagsBits.DeafenMembers],
      ];
      const granted = PERM_PAIRS.filter(([, f]) => perms.has(f)).map(([n]) => n);
      const denied  = PERM_PAIRS.filter(([, f]) => !perms.has(f)).map(([n]) => n);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`Permissions — ${target.user.tag}`)
        .setDescription(ch ? `In <#${ch.id}>` : "Server-wide permissions")
        .addFields(
          { name: "Granted", value: granted.join("\n") || "*None*", inline: true },
          { name: "Denied",  value: denied.join("\n")  || "*None*", inline: true },
        )
        .setFooter({ text: `ID: ${target.user.id}` });
      await safeReply(message, { embeds: [embed] });
      return true;
    }
    case "roleperms": {
      const roleId = args[0]?.replace(/[<@&>]/g, "");
      if (!roleId) {
        await safeReply(message, re(`Usage: \`${p}roleperms @role\` — shows every permission granted or denied for a role.`));
        return true;
      }
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        await safeReply(message, re("Role not found. Make sure to @mention the role."));
        return true;
      }
      const perms = role.permissions;
      const ROLE_PERM_PAIRS: [string, bigint][] = [
        ["Administrator",     PermissionFlagsBits.Administrator],
        ["Manage Server",     PermissionFlagsBits.ManageGuild],
        ["Manage Channels",   PermissionFlagsBits.ManageChannels],
        ["Manage Roles",      PermissionFlagsBits.ManageRoles],
        ["Manage Messages",   PermissionFlagsBits.ManageMessages],
        ["Manage Nicknames",  PermissionFlagsBits.ManageNicknames],
        ["Manage Emojis",     PermissionFlagsBits.ManageEmojisAndStickers],
        ["Manage Webhooks",   PermissionFlagsBits.ManageWebhooks],
        ["Kick Members",      PermissionFlagsBits.KickMembers],
        ["Ban Members",       PermissionFlagsBits.BanMembers],
        ["Moderate Members",  PermissionFlagsBits.ModerateMembers],
        ["Mention @everyone", PermissionFlagsBits.MentionEveryone],
        ["View Channels",     PermissionFlagsBits.ViewChannel],
        ["Send Messages",     PermissionFlagsBits.SendMessages],
        ["Embed Links",       PermissionFlagsBits.EmbedLinks],
        ["Attach Files",      PermissionFlagsBits.AttachFiles],
        ["Add Reactions",     PermissionFlagsBits.AddReactions],
        ["Ext. Emojis",       PermissionFlagsBits.UseExternalEmojis],
        ["Read History",      PermissionFlagsBits.ReadMessageHistory],
        ["Connect (Voice)",   PermissionFlagsBits.Connect],
        ["Speak (Voice)",     PermissionFlagsBits.Speak],
        ["Move Members",      PermissionFlagsBits.MoveMembers],
        ["Mute Members",      PermissionFlagsBits.MuteMembers],
        ["Deafen Members",    PermissionFlagsBits.DeafenMembers],
        ["Priority Speaker",  PermissionFlagsBits.PrioritySpeaker],
        ["Stream/Camera",     PermissionFlagsBits.Stream],
      ];
      const granted = ROLE_PERM_PAIRS.filter(([, f]) => perms.has(f)).map(([n]) => n);
      const denied  = ROLE_PERM_PAIRS.filter(([, f]) => !perms.has(f)).map(([n]) => n);
      const memberCount = guild.members.cache.filter((m) => m.roles.cache.has(role.id)).size;
      const embed = new EmbedBuilder()
        .setColor(role.color || 0x5865f2)
        .setTitle(`Role Permissions — @${role.name}`)
        .addFields(
          { name: "Granted", value: granted.join("\n") || "*None*", inline: true },
          { name: "Not Granted", value: denied.join("\n") || "*None*", inline: true },
        )
        .setFooter({ text: `ID: ${role.id} · ${memberCount} member${memberCount !== 1 ? "s" : ""}` });
      await safeReply(message, { embeds: [embed] });
      return true;
    }
    case "id": {
      const raw = args[0];
      if (!raw) {
        await safeReply(message, re(`Your ID: \`${message.author.id}\``));
        return true;
      }
      const userId = raw.match(/^<@!?(\d+)>$/)?.[1];
      if (userId) {
        const u = await client.users.fetch(userId).catch(() => null);
        await safeReply(message, re(u ? ` **${u.tag}** → \`${u.id}\`` : `User ID: \`${userId}\``));
        return true;
      }
      const roleId = raw.match(/^<@&(\d+)>$/)?.[1];
      if (roleId) {
        const r = guild.roles.cache.get(roleId);
        await safeReply(message, re(r ? ` **@${r.name}** → \`${r.id}\`` : `Role ID: \`${roleId}\``));
        return true;
      }
      const channelId = raw.match(/^<#(\d+)>$/)?.[1];
      if (channelId) {
        const c = guild.channels.cache.get(channelId);
        await safeReply(message, re(c ? ` **#${c.name}** → \`${c.id}\`` : `Channel ID: \`${channelId}\``));
        return true;
      }
      await safeReply(message, re(`Usage: \`${p}id @user\`, \`${p}id @role\`, or \`${p}id #channel\` — no mention detected.`));
      return true;
    }
    case "avatar": {
      try {
        const user = await resolveUserTarget(message, args);
        if (!user) {
          await safeReply(message, re("Couldn't find that user. Try mentioning them or using their user ID."));
          return true;
        }
        const url = user.displayAvatarURL({ size: 4096, extension: "png", forceStatic: true });
        const embed = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`${user.tag}'s Avatar`)
          .setImage(url)
          .setDescription(`[Open in browser](${url})`);
        await safeReply(message, { embeds: [embed] });
      } catch (err) {
        console.error("[avatar] command failed:", err);
        await safeReply(message, re("Couldn't find that user."));
      }
      return true;
    }
    case "banner": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "") ?? message.author.id;
      try {
        const user = await client.users.fetch(userId, { force: true });
        const bannerUrl = user.bannerURL({ size: 4096, extension: "png" });
        if (!bannerUrl) {
          await safeReply(message, re("That user has no banner set."));
          return true;
        }
        const embed = new EmbedBuilder()
          .setColor(user.accentColor ?? 0x5865f2)
          .setTitle(`${user.tag}'s Banner`)
          .setImage(bannerUrl)
          .setDescription(`[Open in browser](${bannerUrl})`);
        await safeReply(message, { embeds: [embed] });
      } catch {
        await safeReply(message, re("Couldn't find that user."));
      }
      return true;
    }
    case "serveravatar": {
      try {
        const member = await resolveMemberTarget(message, args);
        if (!member) {
          await safeReply(message, re("Couldn't find that member. Try mentioning them or using their user ID."));
          return true;
        }
        const serverAvatarUrl = member.avatarURL({ size: 4096, extension: "png", forceStatic: true });
        if (!serverAvatarUrl) {
          await safeReply(message, re("That user has no server-specific avatar."));
          return true;
        }
        const embed = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`${member.user.tag}'s Server Avatar`)
          .setImage(serverAvatarUrl)
          .setDescription(`[Open in browser](${serverAvatarUrl})`);
        await safeReply(message, { embeds: [embed] });
      } catch (err) {
        console.error("[serveravatar] command failed:", err);
        await safeReply(message, re("Couldn't find that member."));
      }
      return true;
    }
    case "serverbanner": {
      try {
        const guild = await message.guild!.fetch();
        const bannerUrl = guild.bannerURL({ size: 4096, extension: "png" });
        if (!bannerUrl) {
          await safeReply(message, re("This server has no banner set."));
          return true;
        }
        const embed = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`${guild.name}'s Banner`)
          .setImage(bannerUrl)
          .setDescription(`[Open in browser](${bannerUrl})`);
        await safeReply(message, { embeds: [embed] });
      } catch {
        await safeReply(message, re("Couldn't fetch the server banner."));
      }
      return true;
    }
    case "serverinfo": {
      const guild = message.guild!;
      await guild.fetch();
      const members = guild.memberCount;
      const bots = guild.members.cache.filter((m) => m.user.bot).size;
      const channels = guild.channels.cache.size;
      const roles = guild.roles.cache.size;
      await safeReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL())
            .addFields(
              { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
              {
                name: "Members",
                value: `${members - bots} humans, ${bots} bots`,
                inline: true,
              },
              { name: "Channels", value: `${channels}`, inline: true },
              { name: "Roles", value: `${roles}`, inline: true },
              {
                name: "Created",
                value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
                inline: true,
              },
              {
                name: "Boost Level",
                value: `Level ${guild.premiumTier}`,
                inline: true,
              },
            )
            .setFooter({ text: `ID: ${guild.id}` })
            .setTimestamp(),
        ],
      });
      return true;
    }
    case "membercount": {
      const guild = message.guild!;
      await ensureMembersCache(guild);
      const total = guild.memberCount;
      const bots = guild.members.cache.filter((m) => m.user.bot).size;
      const humans = total - bots;
      const online = guild.members.cache.filter((m) => !m.user.bot && m.presence?.status !== "offline" && m.presence?.status !== undefined).size;
      await safeReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(`${guild.name} — Member Count`)
            .addFields(
              { name: "Total",  value: `**${total}**`,  inline: true },
              { name: "Humans", value: `**${humans}**`, inline: true },
              { name: "Bots",   value: `**${bots}**`,   inline: true },
              { name: "Online (approx.)", value: `**${online}**`, inline: true },
            )
            .setThumbnail(guild.iconURL())
            .setTimestamp(),
        ],
      });
      return true;
    }
    case "oldest": {
      await ensureMembersCache(guild);
      const count = Math.min(parseInt(args[0] ?? "10") || 10, 25);
      const sorted = [...guild.members.cache.values()]
        .filter((m) => !m.user.bot)
        .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0))
        .slice(0, count);
      const lines = sorted.map((m, i) => `**${i + 1}.** ${m} — joined <t:${Math.floor((m.joinedTimestamp ?? 0) / 1000)}:D>`);
      await sendPaginated(message, ` Oldest Members (top ${count})`, lines, { perPage: 10, color: 0x5865f2 });
      return true;
    }
    case "newest": {
      await ensureMembersCache(guild);
      const count = Math.min(parseInt(args[0] ?? "10") || 10, 25);
      const sorted = [...guild.members.cache.values()]
        .filter((m) => !m.user.bot)
        .sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0))
        .slice(0, count);
      const lines = sorted.map((m, i) => `**${i + 1}.** ${m} — joined <t:${Math.floor((m.joinedTimestamp ?? 0) / 1000)}:R>`);
      await sendPaginated(message, ` Newest Members (top ${count})`, lines, { perPage: 10, color: 0x57f287 });
      return true;
    }
    case "roles": {
      const guild = message.guild!;
      await ensureMembersCache(guild);
      const sorted = guild.roles.cache
        .filter((r) => r.id !== guild.id) // exclude @everyone
        .sort((a, b) => b.position - a.position);
      if (sorted.size === 0) {
        await safeReply(message, re("No roles found."));
        return true;
      }
      const rolesArr = [...sorted.values()];
      const pad = String(rolesArr.length).length;
      const items = rolesArr.map((r, i) =>
        `\`${String(i + 1).padStart(pad, "0")}\` <@&${r.id}> — \`${r.id}\``
      );
      await sendPaginated(
        message,
        ` Server Roles (${sorted.size})`,
        items,
        { perPage: 10, color: 0x5865f2 },
      );
      return true;
    }
    case "inrole": {
      const input = args.join(" ").trim();
      if (!input) {
        await safeReply(message, re(`Usage: \`${p}inrole @role\` or \`${p}inrole role name\``));
        return true;
      }
      const guild = message.guild!;
      // 1) try as mention/ID
      const maybeId = input.replace(/[<@&>]/g, "").trim();
      let role =
        guild.roles.cache.get(maybeId) ??
        // 2) exact name (case-insensitive)
        guild.roles.cache.find((r) => r.name.toLowerCase() === input.toLowerCase()) ??
        // 3) partial name (case-insensitive)
        guild.roles.cache.find((r) => r.name.toLowerCase().includes(input.toLowerCase()));
      if (!role) {
        await safeReply(message, re(`No role found matching **${input}**. Try mentioning it, using its ID, or checking the spelling.`));
        return true;
      }
      await ensureMembersCache(guild);
      const members = role.members
        .filter((m) => !m.user.bot)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (members.size === 0) {
        await safeReply(message, re(`No members have the **${role.name}** role.`));
        return true;
      }
      const items = members.map((m) => `${m} — \`${m.user.tag}\``);
      await sendPaginated(
        message,
        ` ${role.name} — ${members.size} member${members.size !== 1 ? "s" : ""}`,
        items,
        { perPage: 20, color: role.color || 0x5865f2 },
      );
      return true;
    }
    case "emojis": {
      const query = args.join(" ").toLowerCase();
      let emojis = [...guild.emojis.cache.values()];
      if (query) emojis = emojis.filter((e) => e.name?.toLowerCase().includes(query));
      if (emojis.length === 0) {
        await safeReply(message, re(query ? `No emojis matching **${query}**.` : "This server has no custom emojis."));
        return true;
      }
      const lines = emojis.map((e) => `${e} \`:${e.name}:\` — \`${e.id}\`${e.animated ? " *(animated)*" : ""}`);
      await sendPaginated(message, ` Custom Emojis (${lines.length})`, lines, { perPage: 15, color: 0xfee75c });
      return true;
    }
    case "bots": {
      const bots = guild.members.cache.filter((m) => m.user.bot);
      if (bots.size === 0) {
        await safeReply(message, re("No bots in this server."));
        return true;
      }
      const lines = bots.map((m) => `${m.user.tag} (\`${m.id}\`)`).sort();
      await sendPaginated(message, ` Bots (${bots.size})`, [...lines], { color: 0x5865f2 });
      return true;
    }
    case "sticker":
    case "stickers": {
      const sub = args[0]?.toLowerCase();

      // ── sticker add ──────────────────────────────────────────────────────
      if (sub === "add") {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
          await safeReply(message, re("You need **Manage Expressions** permission to add stickers."));
          return true;
        }

        // Resolve sticker from reply
        if (!message.reference) {
          await safeReply(message, re(`Reply to a message that contains a sticker, then use \`${p}sticker add [name]\`.`));
          return true;
        }

        const ref = await message.fetchReference().catch(() => null);
        if (!ref) {
          await safeReply(message, re("Couldn't fetch the replied-to message."));
          return true;
        }

        const srcSticker = ref.stickers.first();
        if (!srcSticker) {
          await safeReply(message, re("No sticker found in that message. Reply to a message that contains a sticker."));
          return true;
        }

        // Lottie stickers can't be cloned to regular servers
        if (srcSticker.format === StickerFormatType.Lottie) {
          await safeReply(message, re("Lottie stickers (animated Discord-official stickers) can't be cloned to other servers."));
          return true;
        }

        const stickerName = (args[1] || srcSticker.name).slice(0, 30).replace(/[^a-zA-Z0-9_ ]/g, "_");
        if (stickerName.length < 2) {
          await safeReply(message, re("Sticker name must be at least 2 characters."));
          return true;
        }

        const created = await guild.stickers.create({
          file: srcSticker.url,
          name: stickerName,
          tags: srcSticker.tags ?? "📌",
          description: srcSticker.description ?? "",
          reason: `Cloned by ${message.author.tag}`,
        }).catch((e: Error) => { message.reply(re(`Failed to clone sticker: ${e.message}`)); return null; });

        if (created) {
          await safeReply(message, {
            embeds: [new EmbedBuilder()
              .setColor(COLORS.success)
              .setDescription(`Sticker **${created.name}** cloned from **${srcSticker.name}**.`)
              .setThumbnail(srcSticker.url)
              .setFooter({ text: `ID: ${created.id}` })],
          });
        }
        return true;
      }

      // ── sticker remove ───────────────────────────────────────────────────
      if (sub === "remove" || sub === "delete") {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
          await safeReply(message, re("You need **Manage Expressions** permission to remove stickers."));
          return true;
        }
        const nameOrId = args[1];
        if (!nameOrId) {
          await safeReply(message, re(`Usage: \`${p}sticker remove <name or ID>\``));
          return true;
        }
        const target = guild.stickers.cache.find((s) => s.name === nameOrId || s.id === nameOrId);
        if (!target) {
          await safeReply(message, re(`Sticker \`${nameOrId}\` not found. Use \`${p}stickers\` to list them.`));
          return true;
        }
        await target.delete(`Removed by ${message.author.tag}`);
        await safeReply(message, re(`Sticker **${target.name}** removed.`));
        return true;
      }

      // ── stickers list (default) ──────────────────────────────────────────
      const stickers = [...guild.stickers.cache.values()];
      if (stickers.length === 0) {
        await safeReply(message, re(`This server has no custom stickers.\nUse \`${p}sticker add\` (reply to a message with a sticker) to clone one.`));
        return true;
      }
      const lines = stickers.map((s) => `**${s.name}** — \`${s.id}\`${s.description ? ` — *${s.description}*` : ""}`);
      await sendPaginated(message, ` Server Stickers (${stickers.length})`, lines, { color: 0xfee75c });
      return true;
    }
    case "randomuser": {
      let pool = guild.members.cache.filter((m) => !m.user.bot);
      const roleId = args[0]?.replace(/[<@&>]/g, "");
      if (roleId) {
        const role = guild.roles.cache.get(roleId);
        if (!role) {
          await safeReply(message, re("Role not found."));
          return true;
        }
        pool = pool.filter((m) => m.roles.cache.has(role.id));
        if (pool.size === 0) {
          await safeReply(message, re(`No members with the role **${role.name}**.`));
          return true;
        }
      }
      const arr = [...pool.values()];
      const pick = arr[Math.floor(Math.random() * arr.length)];
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle("Random Member")
        .setThumbnail(pick.user.displayAvatarURL())
        .setDescription(`<@${pick.id}> — **${pick.user.tag}**`)
        .setFooter({ text: `Picked from ${arr.length} eligible member${arr.length === 1 ? "" : "s"}` })
        .setTimestamp();
      await safeReply(message, { embeds: [embed] });
      return true;
    }
    case "lookup": {
      const rawId = args[0]?.replace(/[<@!>]/g, "");
      if (!rawId) {
        await safeReply(message, re(`Usage: \`${p}lookup <userId>\``));
        return true;
      }
      const user = await client.users.fetch(rawId, { force: true }).catch(() => null);
      if (!user) {
        await safeReply(message, re("Couldn't find a user with that ID."));
        return true;
      }
      const member = guild.members.cache.get(user.id);
      const created = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`User Lookup — ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "ID", value: `\`${user.id}\``, inline: true },
          { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
          { name: "Account Created", value: created, inline: true },
          { name: "In This Server", value: member ? `Yes — joined <t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:R>` : "No", inline: false },
        )
        .setTimestamp();
      if (user.banner) embed.setImage(user.bannerURL({ size: 512 }) ?? null);
      await safeReply(message, { embeds: [embed] });
      return true;
    }

    case "audit": {
      // Usage: !audit [filter] [by @user] [limit]
      // filter: ban, kick, unban, mute, timeout, role, channel, message, webhook, invite, emoji, server, thread, automod, stage, sticker, event, bot
      // by @user: filter entries by executor (who performed the action)
      // limit: 1–100 (default 100)

      const AUDIT_FILTER_ALIASES: Record<string, AuditLogEvent> = {
        ban:           AuditLogEvent.MemberBanAdd,
        bans:          AuditLogEvent.MemberBanAdd,
        unban:         AuditLogEvent.MemberBanRemove,
        unbans:        AuditLogEvent.MemberBanRemove,
        kick:          AuditLogEvent.MemberKick,
        kicks:         AuditLogEvent.MemberKick,
        prune:         AuditLogEvent.MemberPrune,
        mute:          AuditLogEvent.MemberUpdate,
        timeout:       AuditLogEvent.MemberUpdate,
        memberupdate:  AuditLogEvent.MemberUpdate,
        memberrole:    AuditLogEvent.MemberRoleUpdate,
        rolegiven:     AuditLogEvent.MemberRoleUpdate,
        roletaken:     AuditLogEvent.MemberRoleUpdate,
        move:          AuditLogEvent.MemberMove,
        disconnect:    AuditLogEvent.MemberDisconnect,
        bot:           AuditLogEvent.BotAdd,
        botadd:        AuditLogEvent.BotAdd,
        role:          AuditLogEvent.RoleCreate,
        rolecreate:    AuditLogEvent.RoleCreate,
        roleupdate:    AuditLogEvent.RoleUpdate,
        roledelete:    AuditLogEvent.RoleDelete,
        channel:       AuditLogEvent.ChannelCreate,
        channelcreate: AuditLogEvent.ChannelCreate,
        channelupdate: AuditLogEvent.ChannelUpdate,
        channeldelete: AuditLogEvent.ChannelDelete,
        overwrite:     AuditLogEvent.ChannelOverwriteCreate,
        message:       AuditLogEvent.MessageDelete,
        messagedelete: AuditLogEvent.MessageDelete,
        bulk:          AuditLogEvent.MessageBulkDelete,
        bulkdelete:    AuditLogEvent.MessageBulkDelete,
        pin:           AuditLogEvent.MessagePin,
        unpin:         AuditLogEvent.MessageUnpin,
        webhook:       AuditLogEvent.WebhookCreate,
        webhookcreate: AuditLogEvent.WebhookCreate,
        webhookupdate: AuditLogEvent.WebhookUpdate,
        webhookdelete: AuditLogEvent.WebhookDelete,
        invite:        AuditLogEvent.InviteCreate,
        invitecreate:  AuditLogEvent.InviteCreate,
        invitedelete:  AuditLogEvent.InviteDelete,
        emoji:         AuditLogEvent.EmojiCreate,
        emojicreate:   AuditLogEvent.EmojiCreate,
        emojiupdate:   AuditLogEvent.EmojiUpdate,
        emojidelete:   AuditLogEvent.EmojiDelete,
        sticker:       AuditLogEvent.StickerCreate,
        stickercreate: AuditLogEvent.StickerCreate,
        stickerupdate: AuditLogEvent.StickerUpdate,
        stickerdelete: AuditLogEvent.StickerDelete,
        server:        AuditLogEvent.GuildUpdate,
        guildupdate:   AuditLogEvent.GuildUpdate,
        thread:        AuditLogEvent.ThreadCreate,
        threadcreate:  AuditLogEvent.ThreadCreate,
        threadupdate:  AuditLogEvent.ThreadUpdate,
        threaddelete:  AuditLogEvent.ThreadDelete,
        stage:         AuditLogEvent.StageInstanceCreate,
        event:         AuditLogEvent.GuildScheduledEventCreate,
        integration:   AuditLogEvent.IntegrationCreate,
        automod:       AuditLogEvent.AutoModerationRuleCreate,
        automodrule:   AuditLogEvent.AutoModerationRuleCreate,
        automodblock:  AuditLogEvent.AutoModerationBlockMessage,
        application:   AuditLogEvent.ApplicationCommandPermissionUpdate,
        appperms:      AuditLogEvent.ApplicationCommandPermissionUpdate,
      };

      const AUDIT_ACTION_LABELS: Partial<Record<AuditLogEvent, [string, string]>> = {
        [AuditLogEvent.GuildUpdate]:                              ["⚙️",  "Server Update"],
        [AuditLogEvent.ChannelCreate]:                            ["📁",  "Channel Create"],
        [AuditLogEvent.ChannelUpdate]:                            ["✏️",  "Channel Update"],
        [AuditLogEvent.ChannelDelete]:                            ["🗑️", "Channel Delete"],
        [AuditLogEvent.ChannelOverwriteCreate]:                   ["🔒",  "Perm Override Create"],
        [AuditLogEvent.ChannelOverwriteUpdate]:                   ["🔒",  "Perm Override Update"],
        [AuditLogEvent.ChannelOverwriteDelete]:                   ["🔓",  "Perm Override Delete"],
        [AuditLogEvent.MemberKick]:                               ["👢",  "Member Kick"],
        [AuditLogEvent.MemberPrune]:                              ["✂️",  "Member Prune"],
        [AuditLogEvent.MemberBanAdd]:                             ["🔨",  "Member Ban"],
        [AuditLogEvent.MemberBanRemove]:                          ["🔓",  "Member Unban"],
        [AuditLogEvent.MemberUpdate]:                             ["👤",  "Member Update"],
        [AuditLogEvent.MemberRoleUpdate]:                         ["🎭",  "Member Role Change"],
        [AuditLogEvent.MemberMove]:                               ["↗️",  "Member Moved (VC)"],
        [AuditLogEvent.MemberDisconnect]:                         ["❌",  "Member Disconnected (VC)"],
        [AuditLogEvent.BotAdd]:                                   ["🤖",  "Bot Added"],
        [AuditLogEvent.RoleCreate]:                               ["🏷️", "Role Create"],
        [AuditLogEvent.RoleUpdate]:                               ["✏️",  "Role Update"],
        [AuditLogEvent.RoleDelete]:                               ["🗑️", "Role Delete"],
        [AuditLogEvent.InviteCreate]:                             ["🔗",  "Invite Create"],
        [AuditLogEvent.InviteUpdate]:                             ["✏️",  "Invite Update"],
        [AuditLogEvent.InviteDelete]:                             ["🗑️", "Invite Delete"],
        [AuditLogEvent.WebhookCreate]:                            ["🪝",  "Webhook Create"],
        [AuditLogEvent.WebhookUpdate]:                            ["✏️",  "Webhook Update"],
        [AuditLogEvent.WebhookDelete]:                            ["🗑️", "Webhook Delete"],
        [AuditLogEvent.EmojiCreate]:                              ["😀",  "Emoji Create"],
        [AuditLogEvent.EmojiUpdate]:                              ["✏️",  "Emoji Update"],
        [AuditLogEvent.EmojiDelete]:                              ["🗑️", "Emoji Delete"],
        [AuditLogEvent.MessageDelete]:                            ["🗑️", "Message Delete"],
        [AuditLogEvent.MessageBulkDelete]:                        ["🔇",  "Message Bulk Delete"],
        [AuditLogEvent.MessagePin]:                               ["📌",  "Message Pin"],
        [AuditLogEvent.MessageUnpin]:                             ["📌",  "Message Unpin"],
        [AuditLogEvent.IntegrationCreate]:                        ["🔗",  "Integration Create"],
        [AuditLogEvent.IntegrationUpdate]:                        ["✏️",  "Integration Update"],
        [AuditLogEvent.IntegrationDelete]:                        ["🗑️", "Integration Delete"],
        [AuditLogEvent.StageInstanceCreate]:                      ["🎙️", "Stage Create"],
        [AuditLogEvent.StageInstanceUpdate]:                      ["✏️",  "Stage Update"],
        [AuditLogEvent.StageInstanceDelete]:                      ["🗑️", "Stage Delete"],
        [AuditLogEvent.StickerCreate]:                            ["🎨",  "Sticker Create"],
        [AuditLogEvent.StickerUpdate]:                            ["✏️",  "Sticker Update"],
        [AuditLogEvent.StickerDelete]:                            ["🗑️", "Sticker Delete"],
        [AuditLogEvent.GuildScheduledEventCreate]:                ["📅",  "Event Create"],
        [AuditLogEvent.GuildScheduledEventUpdate]:                ["✏️",  "Event Update"],
        [AuditLogEvent.GuildScheduledEventDelete]:                ["🗑️", "Event Delete"],
        [AuditLogEvent.ThreadCreate]:                             ["🧵",  "Thread Create"],
        [AuditLogEvent.ThreadUpdate]:                             ["✏️",  "Thread Update"],
        [AuditLogEvent.ThreadDelete]:                             ["🗑️", "Thread Delete"],
        [AuditLogEvent.ApplicationCommandPermissionUpdate]:       ["🤖",  "App Cmd Perms Update"],
        [AuditLogEvent.AutoModerationRuleCreate]:                 ["🛡️", "AutoMod Rule Create"],
        [AuditLogEvent.AutoModerationRuleUpdate]:                 ["✏️",  "AutoMod Rule Update"],
        [AuditLogEvent.AutoModerationRuleDelete]:                 ["🗑️", "AutoMod Rule Delete"],
        [AuditLogEvent.AutoModerationBlockMessage]:               ["🛡️", "AutoMod Block Msg"],
        [AuditLogEvent.AutoModerationFlagToChannel]:              ["🚨",  "AutoMod Flag to Channel"],
        [AuditLogEvent.AutoModerationUserCommunicationDisabled]:  ["⏱️",  "AutoMod Timeout Member"],
      };

      let filterType: AuditLogEvent | undefined;
      let filterAlias = "";
      let limit = 100;
      let byUserId: string | undefined;

      // Parse args: look for "by @mention", a filter word, or a number
      const argsCopy = [...args];
      const byIdx = argsCopy.findIndex((a) => a.toLowerCase() === "by");
      if (byIdx !== -1 && argsCopy[byIdx + 1]) {
        const mention = argsCopy[byIdx + 1];
        const resolved = mention.replace(/[<@!>]/g, "");
        if (/^\d+$/.test(resolved)) byUserId = resolved;
        argsCopy.splice(byIdx, 2);
      }

      for (const arg of argsCopy) {
        const n = parseInt(arg, 10);
        if (!isNaN(n) && n >= 1) {
          limit = Math.min(100, n);
        } else {
          const key = arg.toLowerCase().replace(/[^a-z]/g, "");
          const resolved = AUDIT_FILTER_ALIASES[key];
          if (resolved !== undefined) {
            filterType = resolved;
            filterAlias = arg.toLowerCase();
          }
        }
      }

      try {
        const fetchOpts: Parameters<typeof guild.fetchAuditLogs>[0] = { limit };
        if (filterType !== undefined) fetchOpts.type = filterType;
        const logs = await guild.fetchAuditLogs(fetchOpts);

        // Filter by executor if "by @user" was provided
        let entries = [...logs.entries.values()];
        if (byUserId) {
          entries = entries.filter((e) => e.executorId === byUserId);
        }

        if (entries.length === 0) {
          const byTag = byUserId ? ` by <@${byUserId}>` : "";
          const filterTag = filterAlias ? ` for \`${filterAlias}\`` : "";
          await safeReply(message, re(`No audit log entries found${filterTag}${byTag}.`));
          return true;
        }

        // Build formatted line itemsc (numbered, clean style)
        const items: string[] = [];
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const [, label] = AUDIT_ACTION_LABELS[entry.action] ?? ["📝", `Action #${entry.action}`];
          const num = String(i + 1).padStart(2, "0");
          const executor = entry.executor
            ? entry.executor.tag
            : "Unknown";
          const target = entry.target
            ? ("tag" in entry.target && typeof (entry.target as any).tag === "string"
                ? (entry.target as any).tag
                : "name" in entry.target && typeof (entry.target as any).name === "string"
                ? (entry.target as any).name
                : entry.targetId ?? "")
            : "";
          const ts = Math.floor(entry.createdTimestamp / 1000);
          const targetPart = target ? ` — ${target}` : "";
          items.push(`${num} ${label} — ${executor}${targetPart} <t:${ts}:R>`);
        }

        const filterLabel = filterAlias ? ` [${filterAlias}]` : "";
        const byLabel = byUserId ? ` · by <@${byUserId}>` : "";
        const headerLine = `Recent audit log entries for this server.${filterLabel}${byLabel}`;

        await sendPaginated(
          message,
          "Audit log",
          items,
          {
            perPage: 10,
            color: 0x5865f2,
            header: headerLine,
            style: "audit",
          },
        );
      } catch (err: any) {
        if (err?.code === 50013) {
          await safeReply(message, re("I need the **View Audit Log** permission to use this command."));
        } else {
          await safeReply(message, re(`Failed to fetch audit logs: ${err?.message ?? "Unknown error"}`));
        }
      }
      return true;
    }

    default:
      return false;
  }
}
