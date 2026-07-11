import {
  EmbedBuilder, TextChannel, VoiceChannel, PermissionFlagsBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, ChannelType, Guild, GuildMember,
  CategoryChannel, Role, Collection, AttachmentBuilder,
} from "discord.js";
import type { Message } from "discord.js";
import { OWNER_ID } from "../../constants.js";
import type { BackupOverwrite, BackupRole, BackupChannel, ServerBackup } from "../../types.js";
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

export async function handleConfigCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "autorole": {
      const arg = args[0];
      if (!arg) {
        await safeReply(message, re(gs.autoRoleId
            ? `Auto-role is currently set to <@&${gs.autoRoleId}>. Use \`${p}autorole off\` to disable.`
            : `No auto-role set. Use \`${p}autorole @role\` to set one.`));
        return true;
      }
      if (arg.toLowerCase() === "off") {
        gs.autoRoleId = null;
        saveState();
        await safeReply(message, re("Auto-role disabled."));
        return true;
      }
      const role = resolveRole(message.guild!, arg);
      if (!role) {
        await safeReply(message, re("Role not found. Try mentioning it, its ID, or typing its name."));
        return true;
      }
      gs.autoRoleId = role.id;
      saveState();
      await safeReply(message, re(`Auto-role set to **${role.name}** — new members will receive it on join.`));
      return true;
    }
    case "hide": {
      const targetId = args[0]?.replace(/[<#>]/g, "");
      const ch = targetId
        ? (await guild.channels.fetch(targetId).catch(() => null)) as TextChannel | null
        : (message.channel as TextChannel);
      if (!ch) { await safeReply(message, re("Channel not found.")); return true; }
      try {
        await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
        if (ch.id !== message.channel.id) {
          await safeReply(message, re(`${ch} is now hidden from @everyone.`));
        } else {
          await ch.send({ embeds: [new EmbedBuilder().setColor(COLORS.muted).setDescription("This channel is now hidden from @everyone.")] });
        }
      } catch {
        await safeReply(message, re("Couldn't hide the channel (check my permissions)."));
      }
      return true;
    }
    case "unhide": {
      const targetId = args[0]?.replace(/[<#>]/g, "");
      const ch = targetId
        ? (await guild.channels.fetch(targetId).catch(() => null)) as TextChannel | null
        : (message.channel as TextChannel);
      if (!ch) { await safeReply(message, re("Channel not found.")); return true; }
      try {
        await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null });
        await safeReply(message, re(`${ch} is now visible to @everyone.`));
      } catch {
        await safeReply(message, re("Couldn't unhide the channel (check my permissions)."));
      }
      return true;
    }
    case "slowmode": {
      const seconds = parseInt(args[0]);
      if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
        await safeReply(message, re(`Usage: \`${p}slowmode <seconds>\` (0 to disable, max 21600)`));
        return true;
      }
      try {
        const channel = message.channel as TextChannel;
        await channel.setRateLimitPerUser(seconds);
        await safeReply(message, re(seconds === 0 ? " Slowmode disabled." : ` Slowmode set to ${seconds}s.`));
      } catch {
        await safeReply(message, re("Couldn't set slowmode (check permissions)."));
      }
      return true;
    }
    case "slowmodelist": {
      const results = guild.channels.cache
        .filter((c): c is TextChannel => c.isTextBased() && !c.isDMBased() && (c as TextChannel).rateLimitPerUser > 0)
        .map((c) => {
          const s = (c as TextChannel).rateLimitPerUser;
          const fmt = s >= 3600 ? `${Math.floor(s / 3600)}h` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;
          return `<#${c.id}> — **${fmt}**`;
        });
      if (results.length === 0) {
        await safeReply(message, re("No channels currently have slowmode enabled."));
        return true;
      }
      await sendPaginated(message, ` Active Slowmodes (${results.length} channel${results.length !== 1 ? "s" : ""})`, results, { perPage: 15, color: 0xfee75c });
      return true;
    }
    case "sticky": {
      const content = args.join(" ");
      if (!content) {
        await safeReply(message, re(`Usage: \`${p}sticky <message>\``));
        return true;
      }
      const old = gs.stickyMessages.get(message.channelId);
      if (old) {
        await message.channel.messages
          .fetch(old.messageId)
          .then((m) => m.delete())
          .catch(() => {});
      }
      const sent = await (message.channel as TextChannel).send(`${content}`);
      gs.stickyMessages.set(message.channelId, { content, messageId: sent.id });
      await message
        .reply(" Sticky message set.")
        .then((r) => setTimeout(() => r.delete().catch(() => {}), 3000));
      return true;
    }
    case "unsticky": {
      const sticky = gs.stickyMessages.get(message.channelId);
      if (!sticky) {
        await safeReply(message, re("No sticky in this channel."));
        return true;
      }
      await message.channel.messages
        .fetch(sticky.messageId)
        .then((m) => m.delete())
        .catch(() => {});
      gs.stickyMessages.delete(message.channelId);
      await safeReply(message, re("Sticky removed."));
      return true;
    }
    case "stickylist": {
      if (gs.stickyMessages.size === 0) {
        await safeReply(message, re("No active sticky messages in this server."));
        return true;
      }
      const lines = [...gs.stickyMessages.entries()].map(
        ([chId, s]) => `<#${chId}> — ${s.content.slice(0, 60)}${s.content.length > 60 ? "…" : ""}`,
      );
      await sendPaginated(message, ` Active Stickies (${lines.length})`, lines, { perPage: 15, color: 0x5865f2 });
      return true;
    }
    case "delcmd": {
      const trigger = args[0]?.toLowerCase();
      if (!trigger) {
        await safeReply(message, re(`Usage: \`${p}delcmd <trigger>\``));
        return true;
      }
      if (!gs.customCommands.has(trigger)) {
        await safeReply(message, re("That command doesn't exist."));
        return true;
      }
      gs.customCommands.delete(trigger);
      saveState();
      await safeReply(message, re(`Custom command \`${p}${trigger}\` removed.`));
      return true;
    }
    case "listcmds": {
      if (gs.customCommands.size === 0) {
        await safeReply(message, re("No custom commands set."));
        return true;
      }
      const lines = [...gs.customCommands.entries()].map(([t, r]) => `\`${p}${t}\` → ${r}`);
      await sendPaginated(message, ` Custom Commands (${lines.length})`, lines, { perPage: 15, color: 0x5865f2 });
      return true;
    }
    case "reactionrole": {
      const channelMention = args[0];
      const msgId = args[1];
      const emoji = args[2];
      const roleMention = args[3];
      if (!channelMention || !msgId || !emoji || !roleMention) {
        await safeReply(message, re(`Usage: \`${p}reactionrole #channel <messageID> <emoji> @role\``));
        return true;
      }
      const channelId = channelMention.replace(/[<#>]/g, "");
      const rrRole = resolveRole(message.guild!, roleMention);
      if (!rrRole) {
        await safeReply(message, re("Role not found. Try mentioning it, its ID, or typing its name."));
        return true;
      }
      try {
        const ch = (await message.guild!.channels.fetch(channelId)) as TextChannel;
        const msg = await ch.messages.fetch(msgId);
        await msg.react(emoji);
        if (!gs.reactionRoles.has(msgId)) gs.reactionRoles.set(msgId, new Map());
        gs.reactionRoles.get(msgId)!.set(emoji, rrRole.id);
        saveState();
        await safeReply(message, re(`Reaction role set: react with ${emoji} on that message to get <@&${rrRole.id}>.`));
      } catch {
        await safeReply(message, re("Couldn't set up reaction role (check channel, message ID, and emoji)."));
      }
      return true;
    }
    case "removereactionrole": {
      const msgId = args[0];
      const emoji = args[1];
      if (!msgId || !emoji) {
        await safeReply(message, re(`Usage: \`${p}removereactionrole <messageID> <emoji>\``));
        return true;
      }
      const msgRoles = gs.reactionRoles.get(msgId);
      if (!msgRoles?.has(emoji)) {
        await safeReply(message, re("No reaction role found for that message/emoji."));
        return true;
      }
      msgRoles.delete(emoji);
      if (msgRoles.size === 0) gs.reactionRoles.delete(msgId);
      saveState();
      await safeReply(message, re("Reaction role removed."));
      return true;
    }
    case "boosterrole": {
      const sub = args[0]?.toLowerCase();
      if (!sub || !["set", "give", "remove", "list"].includes(sub)) {
        await safeReply(message, re(`Usage:\n\`${p}boosterrole set @role\` — set auto-booster role\n\`${p}boosterrole give @user\` — manually grant booster role\n\`${p}boosterrole remove @user\` — manually remove booster role\n\`${p}boosterrole list\` — list current boosters`));
        return true;
      }
      if (sub === "list") {
        const boosters = message.guild.members.cache.filter((m) => !!m.premiumSince);
        if (boosters.size === 0) {
          await safeReply(message, re("No current boosters."));
          return true;
        }
        const lines = boosters.map((m) => {
          const customRoleId = gs.boosterCustomRoles.get(m.id);
          const customRole = customRoleId ? message.guild.roles.cache.get(customRoleId) : null;
          return `${m} — since <t:${Math.floor(m.premiumSince!.getTime() / 1000)}:R>${customRole ? ` · custom role: ${customRole}` : ""}`;
        });
        const embed = new EmbedBuilder()
          .setColor(COLORS.special)
          .setTitle(`Boosters (${boosters.size})`)
          .setDescription(lines.join("\n").slice(0, 4000));
        await safeReply(message, { embeds: [embed] });
        return true;
      }
      // set / give / remove — need a target
      const target = message.mentions.roles.first() || message.mentions.members?.first();
      if (sub === "set") {
        const targetRole = message.mentions.roles.first();
        if (!targetRole) {
          await safeReply(message, re(`Mention a role: \`${p}boosterrole set @role\``));
          return true;
        }
        gs.boosterRoleId = targetRole.id;
        saveState();
        await safeReply(message, re(`Booster role set to ${targetRole}. I'll assign it automatically when members boost.`));
        return true;
      }
      const targetMember = message.mentions.members?.first();
      if (!targetMember) {
        await safeReply(message, re(`Mention a user: \`${p}boosterrole ${sub} @user\``));
        return true;
      }
      if (!gs.boosterRoleId) {
        await safeReply(message, re(`No booster role configured. Use \`${p}boosterrole set @role\` first.`));
        return true;
      }
      const bRole = message.guild.roles.cache.get(gs.boosterRoleId);
      if (!bRole) {
        await safeReply(message, re("The configured booster role no longer exists."));
        return true;
      }
      if (sub === "give") {
        await targetMember.roles.add(bRole).catch(() => {});
        await safeReply(message, re(`Gave ${targetMember} the ${bRole} role.`));
      } else {
        await targetMember.roles.remove(bRole).catch(() => {});
        await safeReply(message, re(`Removed ${bRole} from ${targetMember}.`));
      }
      return true;
    }
    case "br": {
      // Check caller is a booster (has premiumSince) or has ManageRoles
      const callerMember = message.member!;
      const isBooster = !!callerMember.premiumSince;
      const isAdmin = callerMember.permissions.has(PermissionFlagsBits.ManageRoles);
      if (!isBooster && !isAdmin) {
        await safeReply(message, re("Only server boosters can use personal booster roles."));
        return true;
      }
      const sub = args[0]?.toLowerCase();
      if (!sub || !["create", "color", "colour", "gradient", "name", "delete", "info", "icon"].includes(sub)) {
        await safeReply(message, re(`**Personal Booster Role**\n\`${p}br create <name> <#hex>\` — create your role\n\`${p}br color <#hex>\` — change to a flat color\n\`${p}br gradient <#hex1> <#hex2>\` — set a two-color gradient\n\`${p}br name <new name>\` — rename\n\`${p}br icon <emoji | url | clear>\` — set a role icon\n\`${p}br delete\` — delete your role\n\`${p}br info\` — show your role`));
        return true;
      }
      const existingRoleId = gs.boosterCustomRoles.get(callerMember.id);
      const existingRole = existingRoleId ? message.guild.roles.cache.get(existingRoleId) : null;
      // Helper: parse a color — accepts #RRGGBB hex or a named color
      const COLOR_NAMES: Record<string, number> = {
        red: 0xFF0000, crimson: 0xDC143C, firebrick: 0xB22222, darkred: 0x8B0000,
        orange: 0xFF8000, darkorange: 0xFF8C00, coral: 0xFF6347, tomato: 0xFF4500,
        gold: 0xFFD700, yellow: 0xFFFF00, khaki: 0xF0E68C,
        green: 0x008000, lime: 0x00FF00, limegreen: 0x32CD32, forestgreen: 0x228B22,
        darkgreen: 0x006400, springgreen: 0x00FF7F, mediumspringgreen: 0x00FA9A,
        teal: 0x008080, cyan: 0x00FFFF, aqua: 0x00FFFF, turquoise: 0x40E0D0,
        blue: 0x0000FF, royalblue: 0x4169E1, dodgerblue: 0x1E90FF, deepskyblue: 0x00BFFF,
        steelblue: 0x4682B4, navy: 0x000080, midnightblue: 0x191970, cornflowerblue: 0x6495ED,
        purple: 0x800080, violet: 0xEE82EE, magenta: 0xFF00FF, fuchsia: 0xFF00FF,
        indigo: 0x4B0082, darkviolet: 0x9400D3, blueviolet: 0x8A2BE2, orchid: 0xDA70D6,
        pink: 0xFFC0CB, hotpink: 0xFF69B4, deeppink: 0xFF1493, lightpink: 0xFFB6C1,
        white: 0xFFFFFF, snow: 0xFFFAFA, ivory: 0xFFFFF0,
        black: 0x000001, // Discord treats 0 as "no color", use 1 instead
        gray: 0x808080, grey: 0x808080, silver: 0xC0C0C0, darkgray: 0xA9A9A9, lightgray: 0xD3D3D3,
        brown: 0xA52A2A, saddlebrown: 0x8B4513, sienna: 0xA0522D, chocolate: 0xD2691E, peru: 0xCD853F,
        tan: 0xD2B48C, wheat: 0xF5DEB3, beige: 0xF5F5DC,
      };
      const parseColor = (str: string): number | null => {
        const clean = str.trim().toLowerCase();
        if (clean in COLOR_NAMES) return COLOR_NAMES[clean];
        const hex = str.replace("#", "");
        if (/^[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex, 16);
        return null;
      };
      if (sub === "info") {
        if (!existingRole) {
          await safeReply(message, re(`You don't have a personal booster role yet. Use \`${p}br create <name> <#hex>\` to create one.`));
          return true;
        }
        try {
          const rawRole = await client.rest.get(`/guilds/${message.guild.id}/roles/${existingRole.id}`) as any;
          const pc = rawRole?.colors?.primary_color;
          const sc = rawRole?.colors?.secondary_color;
          const toHex = (n: number) => `#${n.toString(16).padStart(6, "0").toUpperCase()}`;
          if (pc != null && sc != null) {
            await safeReply(message, re(`Your role: ${existingRole}\nGradient: \`${toHex(pc)}\` → \`${toHex(sc)}\``));
          } else {
            await safeReply(message, re(`Your role: ${existingRole} — color: \`#${existingRole.color.toString(16).padStart(6, "0").toUpperCase()}\``));
          }
        } catch {
          await safeReply(message, re(`Your role: ${existingRole} — color: \`#${existingRole.color.toString(16).padStart(6, "0").toUpperCase()}\``));
        }
        return true;
      }
      if (sub === "create") {
        if (existingRole) {
          await safeReply(message, re(`You already have a personal role: ${existingRole}. Use \`${p}br color\` or \`${p}br name\` to modify it.`));
          return true;
        }
        // Args: everything except last word is the name, last word is the hex
        const colorStr = args[args.length - 1];
        const roleName = args.slice(1, -1).join(" ");
        if (!roleName || !colorStr) {
          await safeReply(message, re(`Usage: \`${p}br create <name> <color>\`\nExamples: \`${p}br create Crimson #DC143C\` · \`${p}br create Risk red\``));
          return true;
        }
        const color = parseColor(colorStr);
        if (color === null) {
          await safeReply(message, re("Invalid color. Use a hex code like `#FF0099\` or a name like `red`, `blue`, `crimson`."));
          return true;
        }
        try {
          // Place the new role just above the server booster role, or just below the bot's highest role as a fallback
          const botMember = message.guild.members.me!;
          const botHighestPos = botMember.roles.highest.position;
          const boosterRole = gs.boosterRoleId ? message.guild.roles.cache.get(gs.boosterRoleId) : null;
          const targetPosition = boosterRole
            ? Math.min(boosterRole.position + 1, botHighestPos - 1)
            : Math.max(botHighestPos - 1, 1);
          const newRole = await message.guild.roles.create({
            name: roleName,
            color,
            position: Math.max(targetPosition, 1),
            reason: `Personal booster role for ${callerMember.user.tag}`,
          });
          await callerMember.roles.add(newRole).catch(() => {});
          gs.boosterCustomRoles.set(callerMember.id, newRole.id);
          saveState();
          await safeReply(message, re(`Created your personal role: ${newRole} in \`#${color.toString(16).padStart(6, "0").toUpperCase()}\`.`));
        } catch (err) {
          await safeReply(message, re(`Failed to create role. Make sure I have Manage Roles permission.`));
        }
        return true;
      }
      if (sub === "delete") {
        if (!existingRole) {
          await safeReply(message, re("You don't have a personal booster role to delete."));
          return true;
        }
        await existingRole.delete(`Personal booster role deleted by ${callerMember.user.tag}`).catch(() => {});
        gs.boosterCustomRoles.delete(callerMember.id);
        saveState();
        await safeReply(message, re("Your personal booster role has been deleted."));
        return true;
      }
      if (sub === "color" || sub === "colour") {
        if (!existingRole) {
          await safeReply(message, re(`You don't have a personal booster role yet. Use \`${p}br create <name> <#hex>\` first.`));
          return true;
        }
        const color = parseColor(args[1] ?? "");
        if (color === null) {
          await safeReply(message, re(`Invalid color. Usage: \`${p}br color <#hex or name>\` (e.g. \`${p}br color #FF0099\` or \`${p}br color red\`)`));
          return true;
        }
        // Use raw REST to set flat color and clear any gradient
        await client.rest.patch(`/guilds/${message.guild.id}/roles/${existingRole.id}`, {
          body: { color, colors: null },
        }).catch(() => {});
        await safeReply(message, re(`Updated your role color to \`#${color.toString(16).padStart(6, "0").toUpperCase()}\`. Any gradient has been cleared.`));
        return true;
      }
      if (sub === "gradient") {
        if (!existingRole) {
          await safeReply(message, re(`You don't have a personal booster role yet. Use \`${p}br create <name> <#hex>\` first.`));
          return true;
        }
        const color1 = parseColor(args[1] ?? "");
        const color2 = parseColor(args[2] ?? "");
        if (color1 === null || color2 === null) {
          await safeReply(message, re(`Usage: \`${p}br gradient <color1> <color2>\`\nExample: \`${p}br gradient #FF0099 #0099FF\` or \`${p}br gradient red blue\``));
          return true;
        }
        try {
          await client.rest.patch(`/guilds/${message.guild.id}/roles/${existingRole.id}`, {
            body: {
              colors: {
                primary_color: color1,
                secondary_color: color2,
              },
            },
          });
          const toHex = (n: number) => `#${n.toString(16).padStart(6, "0").toUpperCase()}`;
          await safeReply(message, re(`Set gradient on your role: \`${toHex(color1)}\` → \`${toHex(color2)}\`.`));
        } catch (err) {
          await safeReply(message, re("Failed to set gradient. Your server may not support gradient roles (requires Level 3 boost)."));
        }
        return true;
      }
      if (sub === "name") {
        if (!existingRole) {
          await safeReply(message, re(`You don't have a personal booster role yet. Use \`${p}br create <name> <#hex>\` first.`));
          return true;
        }
        const newName = args.slice(1).join(" ");
        if (!newName) {
          await safeReply(message, re(`Usage: \`${p}br name <new name>\``));
          return true;
        }
        await existingRole.setName(newName).catch(() => {});
        await safeReply(message, re(`Renamed your role to **${newName}**.`));
        return true;
      }
      if (sub === "icon") {
        if (!existingRole) {
          await safeReply(message, re(`You don't have a personal booster role yet. Use \`${p}br create <name> <#hex>\` first.`));
          return true;
        }
        const iconArg = args.slice(1).join(" ").trim();
        const att = message.attachments.first();
        if (!iconArg && !att) {
          await safeReply(message, re(`Usage: \`${p}br icon <emoji | imageURL | clear>\`\nExamples:\n\`${p}br icon \`\n\`${p}br icon https://i.imgur.com/example.png\`\n\`${p}br icon clear\``));
          return true;
        }
        try {
          const input = iconArg || "";
          if (input === "clear" || input === "remove" || input === "none") {
            await existingRole.setIcon(null);
            await safeReply(message, re("Cleared your role icon."));
            return true;
          }
          // Custom Discord emoji <:name:id> or <a:name:id>
          const customEmojiMatch = input.match(/^<a?:[\w]+:(\d+)>$/);
          if (customEmojiMatch) {
            const emojiId = customEmojiMatch[1];
            const isAnimated = input.startsWith("<a:");
            const ext = isAnimated ? "gif" : "png";
            const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
            const buf = await fetch(emojiUrl).then((r) => r.arrayBuffer()).then((ab) => Buffer.from(ab));
            await existingRole.setIcon(buf);
            await safeReply(message, re("Set your role icon to the custom emoji."));
            return true;
          }
          // Unicode emoji
          const unicodeEmojiRx = /^\p{Emoji_Presentation}(\u200d\p{Emoji_Presentation})*\uFE0F?$/u;
          const singleEmoji = [...input][0] ?? "";
          if (input && unicodeEmojiRx.test(singleEmoji) && [...input].length <= 2) {
            await existingRole.setUnicodeEmoji(singleEmoji);
            await safeReply(message, re(`Set your role icon to ${singleEmoji}`));
            return true;
          }
          // URL or attachment
          let imageUrl = /^https?:\/\//.test(input) ? input : (att?.url ?? "");
          if (!imageUrl) {
            await safeReply(message, re("Provide a valid image URL, a Unicode emoji, a custom emoji, or attach an image."));
            return true;
          }
          const buf = await fetch(imageUrl).then((r) => r.arrayBuffer()).then((ab) => Buffer.from(ab));
          await existingRole.setIcon(buf);
          await safeReply(message, re("Set your role icon from image."));
        } catch (err) {
          await safeReply(message, re("Couldn't set the role icon — the server may not meet the required boost level (level 2+), or the image is invalid."));
          console.error("[br icon]", err);
        }
        return true;
      }
      return true;
    }
    case "ticketsetup": {
      if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await safeReply(message, re("You need **Manage Server** permission to run ticket setup."));
        return true;
      }

      const statusMsg = await safeReply(message, re("Setting up ticket system…"));

      try {
        // ── 1. Delete existing Tickets category and all channels inside it ────
        let existingCategory = gs.ticketCategoryId
          ? (await message.guild!.channels.fetch(gs.ticketCategoryId).catch(() => null) as CategoryChannel | null)
          : null;

        if (!existingCategory) {
          existingCategory = message.guild!.channels.cache.find(
            c => c.type === ChannelType.GuildCategory && c.name === "Tickets"
          ) as CategoryChannel | undefined ?? null;
        }

        if (existingCategory) {
          const children = message.guild!.channels.cache.filter(
            c => (c as TextChannel).parentId === existingCategory!.id
          );
          for (const [, ch] of children) {
            gs.ticketChannels.delete(ch.id);
            await ch.delete().catch(() => {});
            await new Promise((r) => setTimeout(r, 300));
          }
          await existingCategory.delete().catch(() => {});
        }

        gs.ticketCategoryId = undefined as any;
        gs.ticketChannels.clear();
        saveState();

        // ── 2. Create fresh Tickets category ──────────────────────────────────
        const category = await message.guild!.channels.create({
          name: "Tickets",
          type: ChannelType.GuildCategory,
        }) as CategoryChannel;
        gs.ticketCategoryId = category.id;

        // ── 3. Create #open-a-ticket channel ─────────────────────────────────
        const panelCh = await message.guild!.channels.create({
          name: "open-a-ticket",
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            {
              id: message.guild!.roles.everyone,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
              deny: [PermissionFlagsBits.SendMessages],
            },
          ],
        }) as TextChannel;

        saveState();

        // ── 4. Post panel ─────────────────────────────────────────────────────
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("oct:ticket:open")
            .setLabel("📩  Open a Ticket")
            .setStyle(ButtonStyle.Primary),
        );

        await panelCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.primary)
              .setTitle("Support Tickets")
              .setDescription(
                "Need help from the team? Click the button below to open a private support ticket.\n\n" +
                "**Before opening a ticket:**\n" +
                "• Make sure your issue hasn't already been answered\n" +
                "• Describe your issue clearly so staff can help you faster\n" +
                "• Only open one ticket per issue"
              )
              .setFooter({ text: "Your ticket will be a private channel only visible to you and staff." })
              .setTimestamp(),
          ],
          components: [row],
        });

        await statusMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.success)
              .setTitle("Ticket System Ready")
              .addFields(
                { name: "Category", value: `${category}`, inline: true },
                { name: "Panel Channel", value: `<#${panelCh.id}>`, inline: true },
                { name: "Next Steps", value: `• Staff with **Manage Channels** will automatically see all ticket channels\n• Users open tickets by clicking the button in <#${panelCh.id}>\n• Close tickets with \`${p}closeticket\` inside the ticket channel` },
              )
              .setTimestamp(),
          ],
        });
      } catch (err) {
        console.error("[ticketsetup]", err);
        await statusMsg.edit(re("Setup failed — make sure I have **Manage Channels** permission."));
      }
      return true;
    }
    case "ticket": {
      const reason = args.join(" ") || "Support request";
      try {
        let category = gs.ticketCategoryId
          ? ((await message
              .guild!.channels.fetch(gs.ticketCategoryId)
              .catch(() => null)) as CategoryChannel | null)
          : null;
        if (!category) {
          category = (await message.guild!.channels.create({
            name: "Tickets",
            type: ChannelType.GuildCategory,
          })) as CategoryChannel;
          gs.ticketCategoryId = category.id;
        }
        const existing = message.guild!.channels.cache.find(
          (c) =>
            c.name === `ticket-${message.author.username.toLowerCase()}` &&
            gs.ticketChannels.has(c.id),
        );
        if (existing) {
          await safeReply(message, re(`You already have an open ticket: <#${existing.id}>`));
          return true;
        }
        const ticketCh = (await message.guild!.channels.create({
          name: `ticket-${message.author.username.toLowerCase()}`,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            {
              id: message.guild!.roles.everyone,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: message.author.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
              ],
            },
          ],
        })) as TextChannel;
        gs.ticketChannels.add(ticketCh.id);
        saveState();
        await ticketCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.success)
              .setTitle("Ticket Opened")
              .addFields(
                { name: "User", value: `${message.author}`, inline: true },
                { name: "Reason", value: reason },
              )
              .setFooter({ text: "Use !closeticket to close this ticket." })
              .setTimestamp(),
          ],
        });
        await safeReply(message, re(`Ticket created: <#${ticketCh.id}>`));
      } catch {
        await safeReply(message, re("Couldn't create ticket."));
      }
      return true;
    }
    case "closeticket": {
      if (!gs.ticketChannels.has(message.channelId)) {
        await safeReply(message, re("This isn't a ticket channel."));
        return true;
      }
      await message.channel.send(re(" Closing ticket in 3 seconds…"));
      setTimeout(async () => {
        try {
          const ch = message.channel as TextChannel;
          const fetched = await ch.messages.fetch({ limit: 100 });
          const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
          const transcriptLines = sorted.map((m) => {
            const ts = new Date(m.createdTimestamp).toISOString();
            const content = m.content || (m.embeds.length > 0 ? "[embed]" : "[attachment/other]");
            return `[${ts}] ${m.author.tag}: ${content}`;
          });
          transcriptLines.unshift(`=== Ticket Transcript: #${ch.name} ===`, `Closed by: ${message.author.tag}`, `Closed at: ${new Date().toISOString()}`, "");
          const transcriptBuffer = Buffer.from(transcriptLines.join("\n"), "utf-8");
          const attachment = new AttachmentBuilder(transcriptBuffer, { name: `transcript-${ch.name}.txt` });
          const logChId = gs.modLogChannelId ?? gs.dmLogChannelId;
          if (logChId) {
            const logCh = gch(message.guild!, logChId) as TextChannel | null;
            if (logCh) {
              await logCh.send({
                embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("Ticket Closed")
                  .addFields(
                    { name: "Channel", value: `#${ch.name}`, inline: true },
                    { name: "Closed by", value: message.author.tag, inline: true },
                    { name: "Messages", value: `${sorted.length}`, inline: true },
                  ).setTimestamp()],
                files: [attachment],
              }).catch(() => {});
            }
          }
        } catch {}
        gs.ticketChannels.delete(message.channelId);
        saveState();
        await message.channel.delete().catch(() => {});
      }, 3000);
      return true;
    }
    case "autostaff": {
      const sub = args[0]?.toLowerCase();

      // !autostaff on / off
      if (sub === "on" || sub === "off") {
        gs.autostaffEnabled = sub === "on";
        await safeReply(message, re(`Autostaff is now **${sub === "on" ? "enabled" : "disabled"}**.`));
        saveState();
        return true;
      }

      // !autostaff addtier @role "Label" <minMods> <minMessages>
      if (sub === "addtier") {
        const roleRaw = args[1];
        // Gather quoted label or plain word
        const rest = args.slice(2).join(" ");
        const labelMatch = rest.match(/^"([^"]+)"\s+(\d+)\s+(\d+)/) ?? rest.match(/^(\S+)\s+(\d+)\s+(\d+)/);
        if (!roleRaw || !labelMatch) {
          await safeReply(message, re(
            `Usage: \`${p}autostaff addtier @role "Label" <minMods> <minMessages>\`\nExample: \`${p}autostaff addtier @TrialMod "Trial Mod" 5 200\``
          ));
          return true;
        }
        const label = labelMatch[1];
        const minMods = parseInt(labelMatch[2]);
        const minMessages = parseInt(labelMatch[3]);
        const role = resolveRole(message.guild!, roleRaw);
        if (!role) {
          await safeReply(message, re("Role not found. Try mentioning it, its ID, or typing its name."));
          return true;
        }
        if (gs.autostaffTiers.some((t) => t.roleId === role.id)) {
          await safeReply(message, re(`That role is already a tier. Remove it first with \`${p}autostaff removetier @role\`.`));
          return true;
        }
        gs.autostaffTiers.push({ roleId: role.id, label, minMods, minMessages });
        // Sort by total requirements ascending so tiers are in order
        gs.autostaffTiers.sort((a, b) => (a.minMods + a.minMessages) - (b.minMods + b.minMessages));
        await safeReply(message, re(
          ` Added tier **${label}** (<@&${role.id}>)\n` +
          `Requires **${minMods}** mod actions + **${minMessages}** messages.`
        ));
        saveState();
        return true;
      }

      // !autostaff removetier @role / role name
      if (sub === "removetier") {
        const roleRaw2 = args[1];
        if (!roleRaw2) {
          await safeReply(message, re(`Usage: \`${p}autostaff removetier @role\``));
          return true;
        }
        const rtRole = resolveRole(message.guild!, roleRaw2);
        const resolvedId = rtRole?.id ?? roleRaw2.replace(/[<@&>]/g, "").trim();
        const idx = gs.autostaffTiers.findIndex((t) => t.roleId === resolvedId);
        if (idx === -1) {
          await safeReply(message, re("That role isn't a configured autostaff tier."));
          return true;
        }
        const removed = gs.autostaffTiers.splice(idx, 1)[0];
        // Reset anyone who had this tier index or higher in their stored tier
        for (const [uid, stats] of gs.autostaffStats) {
          if (stats.tier >= idx) stats.tier = idx - 1;
          gs.autostaffStats.set(uid, stats);
        }
        await safeReply(message, re(`Removed tier **${removed.label}** from the autostaff ladder.`));
        saveState();
        return true;
      }

      // !autostaff tiers — list all configured tiers
      if (sub === "tiers") {
        if (gs.autostaffTiers.length === 0) {
          await safeReply(message, re(`No autostaff tiers configured. Use \`${p}autostaff addtier @role \"Label\" <minMods> <minMessages>\` to add one.`));
          return true;
        }
        const lines = gs.autostaffTiers.map((t, i) =>
          `**${i + 1}. ${t.label}** — <@&${t.roleId}>\n` +
          `↳ ${t.minMods} mod actions · ${t.minMessages} messages`
        );
        await safeReply(message, re(
          ` **Autostaff Tiers** (${gs.autostaffEnabled ? " enabled" : " disabled"})\n\n` +
          lines.join("\n\n")
        ));
        return true;
      }

      // !autostaff progress [@user]
      if (sub === "progress") {
        const targetRaw = args[1]?.replace(/[<@!>]/g, "") ?? message.author.id;
        const stats = gs.autostaffStats.get(targetRaw) ?? { mods: 0, messages: 0, tier: -1 };
        const currentTierLabel = stats.tier >= 0 && gs.autostaffTiers[stats.tier]
          ? gs.autostaffTiers[stats.tier].label
          : "None";
        const nextTier = gs.autostaffTiers[stats.tier + 1];
        let progressLine = " Max tier reached!";
        if (nextTier) {
          const modsNeeded = Math.max(0, nextTier.minMods - stats.mods);
          const msgsNeeded = Math.max(0, nextTier.minMessages - stats.messages);
          progressLine = `**Next: ${nextTier.label}** — needs ${modsNeeded} more mod action${modsNeeded !== 1 ? "s" : ""} + ${msgsNeeded} more message${msgsNeeded !== 1 ? "s" : ""}`;
        }
        const target = await message.client.users.fetch(targetRaw).catch(() => null);
        await safeReply(message, re(
          ` **Autostaff Progress — ${target?.tag ?? targetRaw}**\n\n` +
          `Mod Actions: **${stats.mods}**\n` +
          `Messages: **${stats.messages}**\n` +
          `Current Tier: **${currentTierLabel}**\n\n` +
          progressLine
        ));
        return true;
      }

      // !autostaff reset @user
      if (sub === "reset") {
        const targetRaw = args[1]?.replace(/[<@!>]/g, "");
        if (!targetRaw) {
          await safeReply(message, re(`Usage: \`${p}autostaff reset @user\``));
          return true;
        }
        gs.autostaffStats.delete(targetRaw);
        await safeReply(message, re(`Autostaff stats reset for <@${targetRaw}>.`));
        saveState();
        return true;
      }

      // !autostaff setlog #channel
      if (sub === "setlog") {
        const chId = args[1]?.replace(/[<#>]/g, "");
        if (!chId) {
          await safeReply(message, re(`Usage: \`${p}autostaff setlog #channel\``));
          return true;
        }
        gs.autostaffLogChannelId = chId;
        await safeReply(message, re(`Autostaff promotions will be announced in <#${chId}>.`));
        saveState();
        return true;
      }

      // !autostaff stats — top users by mod actions
      if (sub === "stats") {
        const sorted = [...gs.autostaffStats.entries()]
          .sort((a, b) => b[1].mods - a[1].mods)
          .slice(0, 10);
        if (sorted.length === 0) {
          await safeReply(message, re("No autostaff stats recorded yet."));
          return true;
        }
        const lines = sorted.map(([uid, s], i) => {
          const tierLabel = s.tier >= 0 && gs.autostaffTiers[s.tier] ? gs.autostaffTiers[s.tier].label : "None";
          return `**${i + 1}.** <@${uid}> — ${s.mods} mods · ${s.messages} msgs · Tier: ${tierLabel}`;
        });
        await safeReply(message, re(`**Top Autostaff Activity**\n\n${lines.join("\n")}`));
        return true;
      }

      // !autostaff baserole @role / clear
      if (sub === "baserole") {
        if (args[1]?.toLowerCase() === "clear") {
          gs.autostaffBaseRoleId = null;
          await safeReply(message, re("Base role cleared. All users\` messages will now be tracked."));
          saveState();
          return true;
        }
        const brRaw = args[1];
        if (!brRaw) {
          const current = gs.autostaffBaseRoleId
            ? `Currently set to <@&${gs.autostaffBaseRoleId}>.`
            : "No base role set — all users are tracked.";
          await safeReply(message, re(
            `**Usage:** \`${p}autostaff baserole @role\` — only users with this role have messages counted.\n` +
            `\`${p}autostaff baserole clear\` — remove the restriction.\n\n${current}`
          ));
          return true;
        }
        const brRole = resolveRole(message.guild!, brRaw);
        if (!brRole) {
          await safeReply(message, re(`Role not found. Try mentioning it, its ID, or typing its name.`));
          return true;
        }
        gs.autostaffBaseRoleId = brRole.id;
        await safeReply(message, re(`Base role set to **${brRole.name}**. Only members with this role will have their messages counted by autostaff.`));
        saveState();
        return true;
      }

      // Default help
      await safeReply(message, re(
        "**Autostaff Commands:**\n" +
        `\`${p}autostaff on/off\` — enable or disable the system\n` +
        `\`${p}autostaff addtier @role "Label" <minMods> <minMessages>\` — add a promotion tier\n` +
        `\`${p}autostaff removetier @role\` — remove a tier\n` +
        `\`${p}autostaff tiers\` — list all configured tiers and requirements\n` +
        `\`${p}autostaff progress [@user]\` — show someone's stats and next tier\n` +
        `\`${p}autostaff reset @user\` — clear a user's tracked stats\n` +
        `\`${p}autostaff setlog #channel\` — where to announce promotions\n` +
        `\`${p}autostaff stats\` — top 10 most active staff candidates\n` +
        `\`${p}autostaff baserole @role\` — only track messages from users with this role\n` +
        `\`${p}autostaff baserole clear\` — remove the base role restriction`
      ));
      return true;
    }
    case "autopublish": {
      const toggle = args[0]?.toLowerCase();
      if (toggle === "on") {
        gs.autoPubEnabled = true;
        saveState();
        await safeReply(message, re("Auto-publish enabled. Bot will publish all announcement channel messages."));
      } else if (toggle === "off") {
        gs.autoPubEnabled = false;
        saveState();
        await safeReply(message, re("Auto-publish disabled."));
      } else {
        await safeReply(message, re(`Auto-publish is currently **${gs.autoPubEnabled ? "ON" : "OFF"}**. Use \`${p}autopublish on/off\`.`));
      }
      return true;
    }
    case "topic": {
      const text = args.join(" ");
      if (!text) {
        await safeReply(message, re(`Usage: \`${p}topic your channel topic here\``));
        return true;
      }
      try {
        await (message.channel as TextChannel).setTopic(text);
        await safeReply(message, re(`Channel topic updated.`));
      } catch {
        await safeReply(message, re("Couldn't set the topic."));
      }
      return true;
    }
    case "setnick": {
      const name = args.join(" ") || null;
      try {
        const me = await message.guild!.members.fetchMe();
        await me.setNickname(name);
        await safeReply(message, re(name ? ` Bot nickname set to **${name}**.` : " Bot nickname cleared."));
      } catch {
        await safeReply(message, re("Couldn't change my nickname."));
      }
      return true;
    }
    case "alias": {
      const sub = args[0]?.toLowerCase();
      const aliasName = args[1]?.toLowerCase();
      const targetCmd = args[2]?.toLowerCase();

      if (sub === "add") {
        if (!aliasName || !targetCmd) {
          await safeReply(message, re(`Usage: \`${p}alias add <alias> <command>\` — e.g. \`${p}alias add j jail\``));
          return true;
        }
        gs.aliases.set(aliasName, targetCmd);
        saveState();
        await safeReply(message, re(`\`${p}${aliasName}\` is now an alias for \`${p}${targetCmd}\`.`));
      } else if (sub === "remove") {
        if (!aliasName) {
          await safeReply(message, re(`Usage: \`${p}alias remove <alias>\``));
          return true;
        }
        if (!gs.aliases.has(aliasName)) {
          await safeReply(message, re("That alias doesn't exist."));
          return true;
        }
        gs.aliases.delete(aliasName);
        saveState();
        await safeReply(message, re(`Alias \`${p}${aliasName}\` removed.`));
      } else if (sub === "list") {
        if (gs.aliases.size === 0) {
          await safeReply(message, re(`No aliases set. Use \`${p}alias add <alias> <command>\` to create one.`));
          return true;
        }
        const items = [...gs.aliases.entries()].map(([a, c]) => `\`${p}${a}\` → \`${p}${c}\``);
        await sendPaginated(message, ` Custom Aliases (${items.length})`, items, { perPage: 20, color: 0x5865f2 });
      } else {
        await safeReply(message, re(`Usage: \`${p}alias add <alias> <command>\` | \`${p}alias remove <alias>\` | \`${p}alias list\``));
      }
      return true;
    }
    case "togglerolerestore": {
      gs.roleRestoreEnabled = !gs.roleRestoreEnabled;
      saveState();
      const status = gs.roleRestoreEnabled ? "**enabled **" : "**disabled **";
      await safeReply(message, re(`Role restore is now ${status}. Members\` roles will ${gs.roleRestoreEnabled ? "now be saved when they leave and restored when they rejoin." : "no longer be saved or restored."}`));
      return true;
    }
    case "restoreuser": {
      const target = message.mentions.members?.first() ?? (args[0] ? await fetchMember(guild, args[0]).catch(() => null) : null);
      if (!target) {
        await safeReply(message, re(`Usage: \`${p}restoreuser @user\` — restores the saved roles for a user who is currently in the server.`));
        return true;
      }
      const savedRoles = gs.roleBackup.get(target.id);
      if (!savedRoles || savedRoles.length === 0) {
        await safeReply(message, re(`No saved roles found for **${target.user.tag}**.`));
        return true;
      }
      const validRoles = savedRoles.filter((id) => guild.roles.cache.has(id));
      if (validRoles.length === 0) {
        await safeReply(message, re(`All saved roles for **${target.user.tag}** no longer exist.`));
        gs.roleBackup.delete(target.id);
        saveState();
        return true;
      }
      await target.roles.add(validRoles, `Role restore by ${message.author.tag}`).catch(() => {});
      gs.roleBackup.delete(target.id);
      saveState();
      const roleList = validRoles.map((id) => `<@&${id}>`).join(", ");
      await safeReply(message, re(`Restored **${validRoles.length}** role${validRoles.length === 1 ? "" : "s"} for **${target.user.tag}**: ${roleList}`));
      return true;
    }
    case "clearrolebackup": {
      const targetId = message.mentions.users.first()?.id ?? args[0];
      if (!targetId) {
        await safeReply(message, re(`Usage: \`${p}clearrolebackup @user\` — clears the saved role backup for a user.`));
        return true;
      }
      if (!gs.roleBackup.has(targetId)) {
        await safeReply(message, re("No saved role backup found for that user."));
        return true;
      }
      gs.roleBackup.delete(targetId);
      saveState();
      await safeReply(message, re("Role backup cleared."));
      return true;
    }
    case "starboard": {
      const sub = args[0]?.toLowerCase();
      if (sub === "channel") {
        const chId = args[1]?.replace(/[<#>]/g, "");
        if (!chId) { await safeReply(message, re(`Usage: \`${p}starboard channel #channel\``)); return true; }
        gs.starboardChannelId = chId;
        await safeReply(message, re(`Starboard channel set to <#${chId}>.`));
      } else if (sub === "threshold") {
        const n = parseInt(args[1], 10);
        if (isNaN(n) || n < 1) { await safeReply(message, re(`Usage: \`${p}starboard threshold <number>\``)); return true; }
        gs.starboardThreshold = n;
        await safeReply(message, re(`Starboard threshold set to **${n}** `));
      } else if (sub === "off") {
        gs.starboardChannelId = null;
        await safeReply(message, re("Starboard disabled."));
      } else {
        const status = gs.starboardChannelId ? `<#${gs.starboardChannelId}> · threshold: ${gs.starboardThreshold} ` : "Disabled";
        await safeReply(message, re(`Starboard: ${status}\nSubcommands: \`channel #ch\` · \`threshold N\` · \`off\``));
      }
      saveState();
      return true;
    }
    case "counting": {
      const sub = args[0]?.toLowerCase();
      if (sub === "set") {
        const chId = args[1]?.replace(/[<#>]/g, "");
        if (!chId) { await safeReply(message, re(`Usage: \`${p}counting set #channel\``)); return true; }
        gs.countingChannelId = chId;
        gs.countingCurrent = 0;
        gs.countingLastUserId = null;
        await safeReply(message, re(`Counting channel set to <#${chId}>. Count starts at 0.`));
      } else if (sub === "off") {
        gs.countingChannelId = null;
        await safeReply(message, re("Counting channel disabled."));
      } else if (sub === "reset") {
        const n = parseInt(args[1], 10);
        gs.countingCurrent = isNaN(n) ? 0 : n;
        gs.countingLastUserId = null;
        await safeReply(message, re(`Count reset to **${gs.countingCurrent}**.`));
      } else {
        const status = gs.countingChannelId ? `<#${gs.countingChannelId}> · current: **${gs.countingCurrent}**` : "Disabled";
        await safeReply(message, re(`Counting: ${status}\nSubcommands: \`set #ch\` · \`off\` · \`reset [N]\``));
      }
      saveState();
      return true;
    }
    case "level": {
      const sub = args[0]?.toLowerCase();

      if (sub === "enable" || sub === "disable") {
        gs.xpEnabled = sub === "enable";
        await safeReply(message, re(`XP system **${sub}d**.`));
        saveState(); return true;
      }
      if (sub === "channel") {
        const chId = args[1]?.replace(/[<#>]/g, "");
        if (chId === "off") { gs.xpLevelUpChannelId = null; await safeReply(message, re("Level-up announcements disabled.")); }
        else if (chId) { gs.xpLevelUpChannelId = chId; await safeReply(message, re(`Level-up announcements → <#${chId}>.`)); }
        else { await safeReply(message, re(`Usage: \`${p}xp channel #ch\` or \`${p}xp channel off\``)); }
        saveState(); return true;
      }
      if (sub === "setrole") {
        const minLevel = parseInt(args[1], 10);
        const rId = args[2]?.replace(/[<@&>]/g, "");
        if (isNaN(minLevel) || !rId) { await safeReply(message, re(`Usage: \`${p}xp setrole <minLevel> @role\``)); return true; }
        const role = await fetchRole(message.guild!, rId).catch(() => null);
        if (!role) { await safeReply(message, re("Role not found.")); return true; }
        gs.xpRoles = gs.xpRoles.filter((r) => r.roleId !== rId && r.minLevel !== minLevel);
        gs.xpRoles.push({ minLevel, roleId: rId });
        gs.xpRoles.sort((a, b) => a.minLevel - b.minLevel);
        await safeReply(message, re(`<@&${rId}> will be awarded at level **${minLevel}**.`));
        saveState(); return true;
      }
      if (sub === "reset") {
        const uid = args[1]?.replace(/[<@!>]/g, "");
        if (!uid) { await safeReply(message, re(`Usage: \`${p}xp reset @user\``)); return true; }
        gs.xpData.delete(uid);
        await safeReply(message, re(`XP reset for <@${uid}>.`));
        saveState(); return true;
      }
      if (sub === "leaderboard" || sub === "lb") {
        const sorted = [...gs.xpData.entries()].sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
        if (!sorted.length) { await safeReply(message, re("No XP data yet.")); return true; }
        const lines = sorted.map(([uid, d], i) => `**${i + 1}.** <@${uid}> — Level ${d.level} · ${d.xp} XP`);
        await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("XP Leaderboard").setDescription(lines.join("\n")).setTimestamp()] });
        return true;
      }
      // !xp [@user]
      {
        const uid = (sub?.startsWith("<") ? sub : args[0])?.replace(/[<@!>]/g, "") ?? message.author.id;
        const d = gs.xpData.get(uid) ?? { xp: 0, level: 0, messages: 0 };
        const nextLevelXp = xpForLevel(d.level + 1);
        const progress = Math.min(100, Math.floor((d.xp / nextLevelXp) * 100));
        const bar = "█".repeat(Math.floor(progress / 10)) + "░".repeat(10 - Math.floor(progress / 10));
        await safeReply(message, { embeds: [
          new EmbedBuilder().setColor(COLORS.success).setTitle("XP Info")
            .setDescription(`<@${uid}>`)
            .addFields(
              { name: "Level", value: `${d.level}`, inline: true },
              { name: "XP", value: `${d.xp} / ${nextLevelXp}`, inline: true },
              { name: "Messages", value: `${d.messages}`, inline: true },
              { name: `Progress to Level ${d.level + 1}`, value: `${bar} ${progress}%` },
            ).setTimestamp()
        ]});
      }
      return true;
    }
    case "buttonrole": {
      const sub = args[0]?.toLowerCase();
      if (sub === "create") {
        const rest = args.slice(1).join(" ");
        const parts = rest.split("|").map((p) => p.trim()).filter(Boolean);
        // First part = channel + title, remaining = label @role pairs
        if (parts.length < 2) {
          await safeReply(message, re(`Usage: \`${p}buttonrole create #channel Title | Label @role | Label2 @role2\``));
          return true;
        }
        const [chAndTitle, ...buttonParts] = parts;
        const chMatch = chAndTitle.match(/^<#(\d+)>\s*(.*)/);
        if (!chMatch) { await safeReply(message, re("Couldn't parse channel. Make sure to mention it with #")); return true; }
        const chId = chMatch[1];
        const title = chMatch[2].trim() || "Role Selection";
        const ch = message.guild!.channels.cache.get(chId) as TextChannel | undefined;
        if (!ch) { await safeReply(message, re("Channel not found.")); return true; }
        const buttons: { label: string; emoji?: string; roleId: string }[] = [];
        for (const bp of buttonParts) {
          const roleMatch = bp.match(/<@&(\d+)>/);
          if (!roleMatch) continue;
          const roleId = roleMatch[1];
          const label = bp.replace(/<@&\d+>/, "").trim() || "Role";
          buttons.push({ label, roleId });
        }
        if (buttons.length === 0) { await safeReply(message, re("No valid role buttons found.")); return true; }
        // Build button row(s) — max 5 per row, 5 rows max
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        for (let i = 0; i < Math.min(buttons.length, 25); i += 5) {
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            buttons.slice(i, i + 5).map((b) =>
              new ButtonBuilder()
                .setCustomId(`br:${message.guild!.id}:${b.roleId}`)
                .setLabel(b.label.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)
            )
          );
          rows.push(row);
        }
        const posted = await ch.send({
          embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(title)
            .setDescription(buttons.map((b) => `<@&${b.roleId}>`).join("  "))],
          components: rows,
        });
        gs.buttonRoleMessages.set(posted.id, { channelId: chId, buttons });
        saveState();
        await safeReply(message, re(`Button role message created in <#${chId}>.`));
      } else if (sub === "delete") {
        const msgId = args[1];
        if (!msgId || !gs.buttonRoleMessages.has(msgId)) { await safeReply(message, re("Message ID not found in button role list.")); return true; }
        const data = gs.buttonRoleMessages.get(msgId)!;
        const ch = message.guild!.channels.cache.get(data.channelId) as TextChannel | undefined;
        if (ch) {
          const m = await ch.messages.fetch(msgId).catch(() => null);
          if (m) await m.delete().catch(() => {});
        }
        gs.buttonRoleMessages.delete(msgId);
        saveState();
        await safeReply(message, re("Button role message deleted."));
      } else {
        await safeReply(message, re("Subcommands: `create #channel Title | Label @role | ...\` · `delete <msgId>`"));
      }
      return true;
    }
    case "leavedm": {
      const sub = args[0]?.toLowerCase();
      if (sub === "enable" || sub === "disable") {
        gs.leaveDmEnabled = sub === "enable";
        await safeReply(message, re(`Leave DM **${sub}d**.`));
      } else if (sub === "message") {
        const text = args.slice(1).join(" ");
        if (!text) { await safeReply(message, re(`Usage: \`${p}leavedm message <text>\` · Variables: \`{user}\` \`{server}\``)); return true; }
        gs.leaveDmMessage = text;
        await safeReply(message, re(`Leave DM message set.`));
      } else if (sub === "preview") {
        const preview = gs.leaveDmMessage.replace("{user}", message.author.tag).replace("{server}", message.guild!.name);
        await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("Leave DM Preview").setDescription(preview)] });
        return true;
      } else {
        await safeReply(message, re(
          ` Leave DM: **${gs.leaveDmEnabled ? "enabled" : "disabled"}**\nMessage: ${gs.leaveDmMessage}\n\nSubcommands: \`enable\` · \`disable\` · \`message <text>\` · \`preview\`\nVariables: \`{user}\` \`{server}\``
        ));
        return true;
      }
      saveState();
      return true;
    }
    case "backup": {
      const sub = args[0]?.toLowerCase();
      const g = message.guild!;

      // ─ create ──────────────────────────────────────────────────────────────
      if (sub === "create") {
        const statusMsg = await safeReply(message, re("Creating backup — scanning roles & channels…"));
        try {
          await g.roles.fetch();
          await g.channels.fetch();

          // Snapshot roles (exclude @everyone)
          const roles: BackupRole[] = g.roles.cache
            .filter((r) => r.id !== g.id && !r.managed)
            .sort((a, b) => a.position - b.position)
            .map((r) => ({
              id: r.id,
              name: r.name,
              color: r.color,
              permissions: r.permissions.bitfield.toString(),
              position: r.position,
              hoist: r.hoist,
              mentionable: r.mentionable,
            }));

          // Helper to map channel overwrites
          const mapOverwrites = (ch: import("discord.js").GuildChannel): BackupOverwrite[] =>
            [...ch.permissionOverwrites.cache.values()].map((ow) => ({
              id: ow.id,
              type: ow.type as 0 | 1,
              allow: ow.allow.bitfield.toString(),
              deny: ow.deny.bitfield.toString(),
            }));

          // Categories
          const categories: BackupChannel[] = g.channels.cache
            .filter((c) => c.type === ChannelType.GuildCategory)
            .sort((a, b) => a.position - b.position)
            .map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              position: c.position,
              topic: null,
              nsfw: false,
              rateLimitPerUser: 0,
              parentId: null,
              overwrites: mapOverwrites(c as import("discord.js").GuildChannel),
            }));

          // Text / voice / announcement channels
          const channels: BackupChannel[] = g.channels.cache
            .filter((c) =>
              c.type === ChannelType.GuildText ||
              c.type === ChannelType.GuildVoice ||
              c.type === ChannelType.GuildAnnouncement ||
              c.type === ChannelType.GuildStageVoice ||
              c.type === ChannelType.GuildForum
            )
            .sort((a, b) => a.position - b.position)
            .map((c) => {
              const tc = c as import("discord.js").TextChannel & import("discord.js").VoiceChannel;
              return {
                id: c.id,
                name: c.name,
                type: c.type,
                position: c.position,
                topic: (tc as any).topic ?? null,
                nsfw: (tc as any).nsfw ?? false,
                rateLimitPerUser: (tc as any).rateLimitPerUser ?? 0,
                parentId: (tc as any).parentId ?? null,
                overwrites: mapOverwrites(c as import("discord.js").GuildChannel),
                bitrate: (tc as any).bitrate,
                userLimit: (tc as any).userLimit,
              };
            });

          const backupId = Math.random().toString(16).slice(2, 10).toUpperCase();
          const backup: ServerBackup = {
            id: backupId,
            createdAt: Date.now(),
            createdBy: message.author.id,
            guildName: g.name,
            memberCount: g.memberCount,
            roles,
            categories,
            channels,
          };
          gs.backups.set(backupId, backup);
          saveState();

          await statusMsg.edit({ embeds: [
            new EmbedBuilder().setColor(COLORS.success).setTitle("Backup Created")
              .addFields(
                { name: "Backup ID", value: `\`${backupId}\``, inline: true },
                { name: "Roles", value: `${roles.length}`, inline: true },
                { name: "Channels", value: `${categories.length + channels.length}`, inline: true },
                { name: "Server", value: g.name, inline: true },
                { name: "Members", value: `${g.memberCount}`, inline: true },
                { name: "Created", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
              )
              .setFooter({ text: `Use \`!backup load ${backupId}\` to restore this backup` })
              .setTimestamp(),
          ]});
        } catch (err) {
          await statusMsg.edit(re("Backup failed. Check bot permissions.")).catch(() => {});
          console.error("[backup create]", err);
        }
        return true;
      }

      // ─ load ────────────────────────────────────────────────────────────────
      if (sub === "load") {
        const backupId = args[1]?.toUpperCase();
        if (!backupId) { await safeReply(message, re(`Usage: \`${p}backup load <ID>\``)); return true; }
        const bk = gs.backups.get(backupId);
        if (!bk) { await safeReply(message, re(`No backup found with ID \`${backupId}\`. Use \`${p}backup list\` to see saved backups.`)); return true; }

        await sendConfirm(
          message,
          ` **Confirm Backup Load**\n\nThis will **delete all existing roles and channels** and rebuild them from backup \`${backupId}\`.\n\n` +
          `**Backup info:**\n` +
          `• Server: ${bk.guildName} · ${bk.memberCount} members\n` +
          `• Roles: ${bk.roles.length} · Categories: ${bk.categories.length} · Channels: ${bk.channels.length}\n` +
          `• Created: <t:${Math.floor(bk.createdAt / 1000)}:R>\n\n` +
          `**This action is irreversible.**`,
          async () => {
        const statusMsg = await message.channel.send(re("Loading backup — this may take a moment…"));
        try {
          await g.roles.fetch();
          await g.channels.fetch();

          const backupDelay = (ms = 400) => new Promise<void>(r => setTimeout(r, ms));

          // 1) Delete all channels except the current one
          const protectedChannelId = message.channelId;
          const channelsToDelete = [...g.channels.cache.values()]
            .filter((c) => c.id !== protectedChannelId && c.type !== ChannelType.GuildCategory);
          const categoriesToDelete = [...g.channels.cache.values()]
            .filter((c) => c.type === ChannelType.GuildCategory);

          for (const ch of channelsToDelete) {
            await (ch as import("discord.js").GuildChannel).delete("Backup load").catch(() => {});
            await backupDelay();
          }
          for (const cat of categoriesToDelete) {
            await (cat as import("discord.js").GuildChannel).delete("Backup load").catch(() => {});
            await backupDelay();
          }

          // 2) Delete all non-managed, non-everyone roles
          const rolesToDelete = [...g.roles.cache.values()]
            .filter((r) => r.id !== g.id && !r.managed && r.id !== g.roles.botRoleFor(client.user!)?.id)
            .sort((a, b) => b.position - a.position);
          for (const role of rolesToDelete) {
            await role.delete("Backup load").catch(() => {});
            await backupDelay();
          }

          // 3) Build old→new role ID map
          const roleMap = new Map<string, string>(); // old ID → new ID
          for (const br of bk.roles) {
            try {
              const newRole = await g.roles.create({
                name: br.name,
                color: br.color,
                permissions: BigInt(br.permissions),
                hoist: br.hoist,
                mentionable: br.mentionable,
                reason: `Backup ${backupId} load`,
              });
              roleMap.set(br.id, newRole.id);
            } catch {}
            await backupDelay();
          }

          // Helper to map permission overwrites using the roleMap
          const mapOw = (overwrites: BackupOverwrite[]) =>
            overwrites.map((ow) => ({
              id: ow.type === 0 ? (roleMap.get(ow.id) ?? g.id) : ow.id,
              type: ow.type,
              allow: BigInt(ow.allow),
              deny: BigInt(ow.deny),
            }));

          // 4) Recreate categories
          const catMap = new Map<string, string>(); // old ID → new ID
          for (const bc of bk.categories) {
            try {
              const newCat = await g.channels.create({
                name: bc.name,
                type: ChannelType.GuildCategory,
                position: bc.position,
                permissionOverwrites: mapOw(bc.overwrites),
                reason: `Backup ${backupId} load`,
              });
              catMap.set(bc.id, newCat.id);
            } catch {}
            await backupDelay();
          }

          // 5) Recreate channels
          for (const bc of bk.channels) {
            try {
              const parentId = bc.parentId ? (catMap.get(bc.parentId) ?? undefined) : undefined;
              const baseOptions: any = {
                name: bc.name,
                type: bc.type,
                position: bc.position,
                permissionOverwrites: mapOw(bc.overwrites),
                reason: `Backup ${backupId} load`,
                ...(parentId ? { parent: parentId } : {}),
              };
              if (bc.type === ChannelType.GuildText || bc.type === ChannelType.GuildAnnouncement || bc.type === ChannelType.GuildForum) {
                if (bc.topic) baseOptions.topic = bc.topic;
                baseOptions.nsfw = bc.nsfw;
                baseOptions.rateLimitPerUser = bc.rateLimitPerUser;
              }
              if (bc.type === ChannelType.GuildVoice || bc.type === ChannelType.GuildStageVoice) {
                if (bc.bitrate) baseOptions.bitrate = bc.bitrate;
                if (bc.userLimit !== undefined) baseOptions.userLimit = bc.userLimit;
              }
              await g.channels.create(baseOptions);
            } catch {}
            await backupDelay();
          }

          await statusMsg.edit({ embeds: [
            new EmbedBuilder().setColor(COLORS.success).setTitle("Backup Loaded")
              .setDescription(`Restored \`${backupId}\` (${bk.guildName})`)
              .addFields(
                { name: "Roles restored", value: `${roleMap.size} / ${bk.roles.length}`, inline: true },
                { name: "Categories", value: `${catMap.size} / ${bk.categories.length}`, inline: true },
                { name: "Channels", value: `${bk.channels.length}`, inline: true },
              ).setTimestamp()
          ]}).catch(() => {});
        } catch (err) {
          await statusMsg.edit(re("Load failed partway through. Check bot permissions.")).catch(() => {});
          console.error("[backup load]", err);
        }
          },
          0xed4245,
        );
        return true;
      }

      // ─ list ────────────────────────────────────────────────────────────────
      if (sub === "list") {
        if (gs.backups.size === 0) {
          await safeReply(message, re(`No backups saved for this server yet. Use \`${p}backup create\` to make one.`));
          return true;
        }
        const sorted = [...gs.backups.values()].sort((a, b) => b.createdAt - a.createdAt);
        const lines = sorted.map((b) =>
          `\`${b.id}\` — ${b.guildName} · ${b.roles.length}R ${b.categories.length + b.channels.length}CH — <t:${Math.floor(b.createdAt / 1000)}:R>`
        );
        await safeReply(message, { embeds: [
          new EmbedBuilder().setColor(COLORS.primary).setTitle("Saved Backups")
            .setDescription(lines.join("\n"))
            .setFooter({ text: `${gs.backups.size} backup(s) · !backup info <ID> · !backup load <ID> · !backup delete <ID>` })
            .setTimestamp()
        ]});
        return true;
      }

      // ─ info ────────────────────────────────────────────────────────────────
      if (sub === "info") {
        const backupId = args[1]?.toUpperCase();
        if (!backupId) { await safeReply(message, re(`Usage: \`${p}backup info <ID>\``)); return true; }
        const bk = gs.backups.get(backupId);
        if (!bk) { await safeReply(message, re(`No backup found with ID \`${backupId}\`.`)); return true; }

        const voiceCount = bk.channels.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).length;
        const textCount = bk.channels.filter((c) => c.type !== ChannelType.GuildVoice && c.type !== ChannelType.GuildStageVoice).length;

        await safeReply(message, { embeds: [
          new EmbedBuilder().setColor(COLORS.primary).setTitle(`Backup \`${bk.id}\``)
            .addFields(
              { name: "Original Server", value: bk.guildName, inline: true },
              { name: "Members at Backup", value: `${bk.memberCount}`, inline: true },
              { name: "Created By", value: `<@${bk.createdBy}>`, inline: true },
              { name: "Created", value: `<t:${Math.floor(bk.createdAt / 1000)}:F>`, inline: true },
              { name: "Roles", value: `${bk.roles.length}`, inline: true },
              { name: "Categories", value: `${bk.categories.length}`, inline: true },
              { name: "Text Channels", value: `${textCount}`, inline: true },
              { name: "Voice Channels", value: `${voiceCount}`, inline: true },
              { name: "Role Names", value: bk.roles.slice(0, 20).map((r) => r.name).join(", ") + (bk.roles.length > 20 ? `… +${bk.roles.length - 20} more` : "") || "None" },
            ).setTimestamp()
        ]});
        return true;
      }

      // ─ delete ──────────────────────────────────────────────────────────────
      if (sub === "delete") {
        const backupId = args[1]?.toUpperCase();
        if (!backupId) { await safeReply(message, re(`Usage: \`${p}backup delete <ID>\``)); return true; }
        if (!gs.backups.has(backupId)) { await safeReply(message, re(`No backup found with ID \`${backupId}\`.`)); return true; }
        gs.backups.delete(backupId);
        saveState();
        await safeReply(message, re(`Backup \`${backupId}\` deleted.`));
        return true;
      }

      // ─ help ────────────────────────────────────────────────────────────────
      await safeReply(message, { embeds: [
        new EmbedBuilder().setColor(COLORS.primary).setTitle("Backup — Commands")
          .addFields(
            { name: `\`${p}backup create\``, value: "Take a full snapshot of roles, channels & permissions" },
            { name: `\`${p}backup list\``, value: "List all saved backups for this server" },
            { name: `\`${p}backup info <ID>\``, value: "Show details of a backup" },
            { name: `\`${p}backup load <ID>\``, value: "Restore a backup (requires confirmation)" },
            { name: `\`${p}backup delete <ID>\``, value: "Delete a backup" },
          ).setFooter({ text: "Backup IDs are 8-character codes shown after !backup create" })
      ]});
      return true;
    }
    case "editrole": {
      const role = resolveRole(message.guild!, args[0] ?? "");
      if (!role) { await safeReply(message, re(`Usage: \`${p}editrole @role color #hex | name New Name | hoist on/off | mention on/off\``)); return true; }
      const sub = args[1]?.toLowerCase();
      const rest = args.slice(2).join(" ");
      if (!sub || !rest) {
        await safeReply(message, re(`Usage: \`${p}editrole @role color #hex\` · \`${p}editrole @role name New Name\` · \`${p}editrole @role hoist on/off\` · \`${p}editrole @role mention on/off\``));
        return true;
      }
      if (sub === "color") {
        const hex = rest.replace("#", "");
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) { await safeReply(message, re("Bad hex color. Use `#rrggbb`.")); return true; }
        await role.setColor(parseInt(hex, 16), `Edited by ${message.author.tag}`);
        await safeReply(message, re(`**${role.name}** color set to \`#${hex.toUpperCase()}\`.`));
      } else if (sub === "name") {
        if (!rest) { await safeReply(message, re("Provide a new name.")); return true; }
        const oldName = role.name;
        await role.setName(rest, `Edited by ${message.author.tag}`);
        await safeReply(message, re(`Role renamed **${oldName}** → **${rest}**.`));
      } else if (sub === "hoist") {
        const on = rest.toLowerCase() === "on";
        await role.setHoist(on, `Edited by ${message.author.tag}`);
        await safeReply(message, re(`**${role.name}** hoist ${on ? "enabled" : "disabled"}.`));
      } else if (sub === "mention") {
        const on = rest.toLowerCase() === "on";
        await role.setMentionable(on, `Edited by ${message.author.tag}`);
        await safeReply(message, re(`**${role.name}** mentionable ${on ? "enabled" : "disabled"}.`));
      } else {
        await safeReply(message, re("Sub-command must be `color`, `name`, `hoist`, or `mention`."));
      }
      return true;
    }
    case "emoji": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "list") {
        const emojis = [...message.guild!.emojis.cache.values()];
        if (!emojis.length) { await safeReply(message, re("This server has no custom emojis.")); return true; }
        const animated = emojis.filter((e) => e.animated);
        const staticE = emojis.filter((e) => !e.animated);
        const fmt = (arr: typeof emojis) => arr.map((e) => `${e} \`:${e.name}:\``).join("\n").slice(0, 1000);
        const embed = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`Emojis — ${message.guild!.name}`)
          .setDescription(`**${emojis.length}** total (${staticE.length} static, ${animated.length} animated)`);
        if (staticE.length) embed.addFields({ name: `Static (${staticE.length})`, value: fmt(staticE) || "—" });
        if (animated.length) embed.addFields({ name: `Animated (${animated.length})`, value: fmt(animated) || "—" });
        await safeReply(message, { embeds: [embed] });
      } else if (sub === "add") {
        // Helper: extract the first custom emoji from a string
        const extractEmoji = (text: string) => {
          const m = text.match(/<(a?):([^:]+):(\d+)>/);
          if (!m) return null;
          return { animated: m[1] === "a", name: m[2], id: m[3] };
        };
        const emojiCdnUrl = (e: { animated: boolean; id: string }) =>
          `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}?size=128`;
        // Discord only allows a-z, A-Z, 0-9, _ in emoji names (2–32 chars)
        const sanitizeName = (n: string) => {
          const clean = n.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
          return clean.length >= 2 ? clean : clean.padEnd(2, "_");
        };

        let imageUrl: string | null = null;
        let resolvedName: string | null = null;

        // 1. Emoji mention as the first argument: !emoji add <:blob:123> [name]
        const emojiInArg = args[1] ? extractEmoji(args[1]) : null;
        if (emojiInArg) {
          imageUrl = emojiCdnUrl(emojiInArg);
          resolvedName = args[2] || emojiInArg.name;
        }

        // 2. Message is a reply — look for a custom emoji in the referenced message
        if (!imageUrl && message.reference) {
          const ref = await message.fetchReference().catch(() => null);
          if (ref) {
            const refEmoji = extractEmoji(ref.content);
            if (refEmoji) {
              imageUrl = emojiCdnUrl(refEmoji);
              resolvedName = args[1] || refEmoji.name;
            }
          }
        }

        // 3. Custom emoji anywhere else in this message (e.g. !emoji add name <:blob:123>)
        if (!imageUrl) {
          const msgEmoji = extractEmoji(message.content);
          if (msgEmoji) {
            imageUrl = emojiCdnUrl(msgEmoji);
            resolvedName = args[1] || msgEmoji.name;
          }
        }

        // 4. Fallback: explicit URL or attachment
        if (!imageUrl) {
          imageUrl = args[2] || message.attachments.first()?.url || null;
          resolvedName = args[1] || null;
        }

        if (!resolvedName || !imageUrl) {
          await safeReply(message, re(`Usage:\n\`${p}emoji add <name> <url>\` — add from URL\n\`${p}emoji add <:emoji:> [name]\` — steal an emoji from another server\n\`${p}emoji add [name]\` — reply to a message containing an emoji to steal it`));
          return true;
        }
        const finalName = sanitizeName(resolvedName);
        const created = await message.guild!.emojis.create({ attachment: imageUrl, name: finalName })
          .catch((e: Error) => { message.reply(re(`Failed: ${e.message}`)); return null; });
        if (created) await safeReply(message, re(`Emoji ${created} \`:${created.name}:\` added.`));
      } else if (sub === "addmany") {
        const extractEmoji = (text: string) => {
          const m = text.match(/<(a?):([^:]+):(\d+)>/);
          if (!m) return null;
          return { animated: m[1] === "a", name: m[2], id: m[3] };
        };
        const emojiCdnUrl = (e: { animated: boolean; id: string }) =>
          `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}?size=128`;
        const sanitizeName = (n: string) => {
          const clean = n.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
          return clean.length >= 2 ? clean : clean.padEnd(2, "_");
        };

        // Extract all emoji mentions from the rest of the message content after "addmany"
        const rest = args.slice(1).join(" ");
        const emojiMatches = [...rest.matchAll(/<(a?):([^:]+):(\d+)>/g)].map((m) => ({
          animated: m[1] === "a", name: m[2], id: m[3],
        }));

        if (emojiMatches.length === 0) {
          await safeReply(message, re(`Usage: \`${p}emoji addmany <:emoji1:> <:emoji2:> ...\` — add multiple emojis at once`));
          return true;
        }

        const status = await safeReply(message, re(`Adding ${emojiMatches.length} emoji${emojiMatches.length === 1 ? "" : "s"}…`));
        const added: string[] = [];
        const failed: string[] = [];

        for (const e of emojiMatches) {
          const created = await message.guild!.emojis.create({
            attachment: emojiCdnUrl(e),
            name: sanitizeName(e.name),
          }).catch(() => null);
          if (created) {
            added.push(`${created} \`:${created.name}:\``);
          } else {
            failed.push(`:${e.name}:`);
          }
          await new Promise((r) => setTimeout(r, 600)); // stay under rate limits
        }

        const parts: string[] = [];
        if (added.length) parts.push(`**Added (${added.length}):** ${added.join(", ")}`);
        if (failed.length) parts.push(`**Failed (${failed.length}):** ${failed.map((n) => `\`${n}\``).join(", ")}`);
        await status.edit(re(parts.join("\n")));
      } else if (sub === "remove") {
        const name = args[1];
        if (!name) { await safeReply(message, re(`Usage: \`${p}emoji remove <name>\``)); return true; }
        const emoji = message.guild!.emojis.cache.find((e) => e.name === name);
        if (!emoji) { await safeReply(message, re(`Emoji \`:${name}:\` not found.`)); return true; }
        await emoji.delete(`Removed by ${message.author.tag}`);
        await safeReply(message, re(`Emoji \`:${name}:\` removed.`));
      } else if (sub === "rename") {
        const oldName = args[1];
        const newName = args[2];
        if (!oldName || !newName) { await safeReply(message, re(`Usage: \`${p}emoji rename <old> <new>\``)); return true; }
        const emoji = message.guild!.emojis.cache.find((e) => e.name === oldName);
        if (!emoji) { await safeReply(message, re(`Emoji \`:${oldName}:\` not found.`)); return true; }
        await emoji.setName(newName);
        await safeReply(message, re(`Renamed \`:${oldName}:\` → \`:${newName}:\`.`));
      } else {
        await safeReply(message, re(`Sub-commands: \`list\`, \`add <name> <url>\`, \`addmany <:e1:> <:e2:> ...\`, \`remove <name>\`, \`rename <old> <new>\``));
      }
      return true;
    }
    case "stealemoji": {
      const emojiArg = args[0];
      const nameArg  = args[1];
      if (!emojiArg || !nameArg) {
        await safeReply(message, re(`Usage: \`${p}stealemoji <emoji or url> <name>\` — copies an emoji from another server or an image URL.\nExamples: \`${p}stealemoji :catblob: catblob\` · \`${p}stealemoji https://cdn.example.com/img.png mycool\``));
        return true;
      }
      // Resolve the image source — could be a custom emoji mention, a URL, or an attached image
      let imageUrl: string | null = null;
      const emojiMatch = emojiArg.match(/^<a?:[^:]+:(\d+)>$/);
      if (emojiMatch) {
        const isAnimated = emojiArg.startsWith("<a:");
        imageUrl = `https://cdn.discordapp.com/emojis/${emojiMatch[1]}.${isAnimated ? "gif" : "png"}?size=128`;
      } else if (emojiArg.startsWith("http")) {
        imageUrl = emojiArg;
      } else if (message.attachments.first()) {
        imageUrl = message.attachments.first()!.url;
      }
      if (!imageUrl) {
        await safeReply(message, re("Couldn't find an image. Provide a custom emoji, an image URL, or attach an image."));
        return true;
      }
      const safeName = nameArg.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 32).padEnd(2, "_");
      const created = await message.guild!.emojis.create({ attachment: imageUrl, name: safeName })
        .catch((e: Error) => { message.reply(re(`Failed to steal emoji: ${e.message}`)); return null; });
      if (created) await safeReply(message, re(`Emoji ${created} \`:${created.name}:\` stolen and added.`));
      return true;
    }
    case "reportchannel": {
      const arg = args[0];
      if (!arg) {
        await safeReply(message, re(gs.reportChannelId
          ? `Report channel is <#${gs.reportChannelId}>. Use \`${p}reportchannel #ch\` to change or \`${p}reportchannel off\` to disable.`
          : `No report channel set. Use \`${p}reportchannel #channel\`.`));
        return true;
      }
      if (arg.toLowerCase() === "off") {
        gs.reportChannelId = null;
        saveState();
        await safeReply(message, re("Report channel disabled."));
        return true;
      }
      const chId = arg.replace(/[<#>]/g, "");
      const ch = guild.channels.cache.get(chId);
      if (!ch?.isTextBased()) {
        await safeReply(message, re("Channel not found or not a text channel."));
        return true;
      }
      gs.reportChannelId = ch.id;
      saveState();
      await safeReply(message, re(`Reports will be sent to ${ch}.`));
      return true;
    }
    case "report": {
      const mention = args[0];
      const reason = args.slice(1).join(" ");
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId || !reason) {
        await safeReply(message, re(`Usage: \`${p}report @user <reason>\``));
        return true;
      }
      if (!gs.reportChannelId) {
        await safeReply(message, re(`No report channel has been configured. Ask an admin to run \`${p}reportchannel #ch\`.`));
        return true;
      }
      const reportCh = gch(guild, gs.reportChannelId);
      if (!reportCh) {
        await safeReply(message, re("The configured report channel no longer exists. Ask an admin to reconfigure."));
        return true;
      }
      const target = await client.users.fetch(userId).catch(() => null);
      await reportCh.send({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle("User Report")
          .setThumbnail(target?.displayAvatarURL() ?? null)
          .addFields(
            { name: "Reported User", value: target ? `${target} (${target.tag})` : `<@${userId}>`, inline: true },
            { name: "Reported By",   value: `${message.author} (${message.author.tag})`,          inline: true },
            { name: "Channel",       value: `${message.channel}`,                                  inline: true },
            { name: "Reason",        value: reason },
          )
          .setTimestamp()
          .setFooter({ text: `User ID: ${userId}` }),
      ]});
      await safeReply(message, re("Your report has been submitted to the mod team."));
      return true;
    }
    case "thread": {
      const sub = args[0]?.toLowerCase();
      if (!sub) {
        await safeReply(message, re("Subcommands: `create <name>\` · `lock\` · `unlock\` · `archive\` · `unarchive\` · `rename <name>`"));
        return true;
      }

      if (sub === "create") {
        const name = args.slice(1).join(" ").trim();
        if (!name) {
          await safeReply(message, re(`Usage: \`${p}thread create <name>\``));
          return true;
        }
        if (!message.channel.isTextBased() || message.channel.isDMBased()) {
          await safeReply(message, re("Threads can only be created in text channels."));
          return true;
        }
        try {
          const thread = await (message.channel as any).threads.create({
            name,
            autoArchiveDuration: 1440,
            reason: `Created by ${message.author.tag}`,
          });
          await safeReply(message, re(`Thread created: ${thread}`));
        } catch (err: any) {
          await safeReply(message, re(`Could not create thread: ${err.message ?? err}`));
        }
        return true;
      }

      // For lock/unlock/archive/unarchive/rename the current channel must be a thread
      if (!message.channel.isThread()) {
        await safeReply(message, re("This command must be used inside a thread (except `create`)."));
        return true;
      }
      const thread = message.channel;

      if (sub === "lock") {
        await thread.setLocked(true, `Locked by ${message.author.tag}`);
        await safeReply(message, re("Thread locked."));
      } else if (sub === "unlock") {
        await thread.setLocked(false, `Unlocked by ${message.author.tag}`);
        await safeReply(message, re("Thread unlocked."));
      } else if (sub === "archive") {
        await thread.setArchived(true, `Archived by ${message.author.tag}`);
      } else if (sub === "unarchive") {
        await thread.setArchived(false, `Unarchived by ${message.author.tag}`);
        await safeReply(message, re("Thread unarchived."));
      } else if (sub === "rename") {
        const newName = args.slice(1).join(" ").trim();
        if (!newName) {
          await safeReply(message, re(`Usage: \`${p}thread rename <new name>\``));
          return true;
        }
        await thread.setName(newName, `Renamed by ${message.author.tag}`);
        await safeReply(message, re(`Thread renamed to **${newName}**.`));
      } else {
        await safeReply(message, re("Subcommands: `create <name>\` · `lock\` · `unlock\` · `archive\` · `unarchive\` · `rename <name>`"));
      }
      return true;
    }
    case "suggest": {
      const text = args.join(" ");
      if (!text) {
        await safeReply(message, re(`Usage: \`${p}suggest <your suggestion>\``));
        return true;
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle("New Suggestion")
        .setDescription(text)
        .setFooter({ text: `Suggested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();
      const posted = await message.channel.send({ embeds: [embed] });
      await posted.react("");
      await posted.react("");
      await message.delete().catch(() => {});
      return true;
    }
    case "listthreads": {
      const fetched = await guild.channels.fetchActiveThreads().catch(() => null);
      if (!fetched || fetched.threads.size === 0) {
        await safeReply(message, re("No active threads in this server."));
        return true;
      }
      const lines = fetched.threads.map((t) => {
        const parent = t.parentId ? `<#${t.parentId}>` : "unknown";
        return `**${t.name}** (${parent}) — \`${t.id}\``;
      });
      await sendPaginated(message, ` Active Threads (${lines.length})`, [...lines], { color: 0x5865f2 });
      return true;
    }
    case "archivethreads": {
      if (!message.member?.permissions.has(PermissionFlagsBits.ManageThreads)) {
        await safeReply(message, re("You need **Manage Threads** to use this."));
        return true;
      }
      const fetched = await guild.channels.fetchActiveThreads().catch(() => null);
      if (!fetched || fetched.threads.size === 0) {
        await safeReply(message, re("No active threads to archive."));
        return true;
      }
      const status = await safeReply(message, re(`Archiving **${fetched.threads.size}** thread(s)...`));
      let done = 0;
      let failed = 0;
      for (const t of fetched.threads.values()) {
        try { await t.setArchived(true); done++; } catch { failed++; }
      }
      await status.edit({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(` Archived **${done}** thread(s)${failed ? ` (${failed} skipped)` : ""}.`)] });
      return true;
    }

    case "antieveryoneping": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "status") {
        await safeReply(message, re(
          `**Anti @everyone Ping Raid Protection**\n` +
          `Status: **${gs.antiEveryonePingEnabled ? "✅ Enabled" : "❌ Disabled"}**\n` +
          `Action: **${gs.antiEveryonePingAction}**\n` +
          `Limit: **3 pings per 10 seconds**\n\n` +
          `Subcommands: \`on\` | \`off\` | \`action <delete|mute|ban>\``
        ));
        return true;
      }
      if (sub === "on") {
        gs.antiEveryonePingEnabled = true;
        saveState();
        await safeReply(message, re("🛡️ Anti @everyone ping raid protection **enabled**. Anyone sending 3+ @everyone pings in 10s will be actioned."));
        return true;
      }
      if (sub === "off") {
        gs.antiEveryonePingEnabled = false;
        saveState();
        await safeReply(message, re("Anti @everyone ping raid protection **disabled**."));
        return true;
      }
      if (sub === "action") {
        const act = args[1]?.toLowerCase();
        if (act !== "delete" && act !== "mute" && act !== "ban") {
          await safeReply(message, re("Valid actions: `delete\` (only delete messages), `mute\` (delete + 10min mute), `ban\` (delete + ban)."));
          return true;
        }
        gs.antiEveryonePingAction = act;
        saveState();
        await safeReply(message, re(`Anti @everyone ping action set to **${act}**.`));
        return true;
      }
      await safeReply(message, re("Unknown subcommand. Use: `on\` | `off\` | `action <delete|mute|ban>\` | `status`"));
      return true;
    }

    case "stripall": {
      if (gs.rolePermBackup.size > 0) {
        await safeReply(message, re(`⚠️ There is already an active permission backup. Run \`${p}restoreperms\` to restore roles first, then try again.`));
        return true;
      }
      const roles = message.guild!.roles.cache.filter(r => !r.managed && r.id !== message.guild!.id);
      if (roles.size === 0) {
        await safeReply(message, re("No non-managed roles to strip."));
        return true;
      }
      const status = await safeReply(message, re(`⏳ Stripping permissions from **${roles.size}** roles... this may take a moment.`));
      let stripped = 0, failed = 0;
      for (const [id, role] of roles) gs.rolePermBackup.set(id, role.permissions.bitfield.toString());
      await rQueue([...roles.values()], async (role) => {
        try {
          await role.setPermissions(0n, `${p}stripall by ${message.author.tag}`);
          stripped++;
        } catch { failed++; }
      }, 300);
      saveState();
      await status.edit({ embeds: [new EmbedBuilder().setColor(COLORS.error)
        .setTitle(`🔒 Permissions Stripped`)
        .setDescription(`Stripped permissions from **${stripped}** role(s)${failed ? ` (${failed} failed)` : ""}.\n\nRun \`${p}restoreperms\` to restore everything.`)
        .setTimestamp()]});
      return true;
    }

    case "restoreperms": {
      if (gs.rolePermBackup.size === 0) {
        await safeReply(message, re(`No permission backup found. Run \`${p}stripall\` first.`));
        return true;
      }
      const status2 = await safeReply(message, re(`⏳ Restoring permissions for **${gs.rolePermBackup.size}** roles...`));
      let restored = 0, restoreFailed = 0;
      await rQueue([...gs.rolePermBackup.entries()], async ([id, permStr]) => {
        const role = message.guild!.roles.cache.get(id);
        if (!role) { restoreFailed++; return; }
        try {
          await role.setPermissions(BigInt(permStr), `${p}restoreperms by ${message.author.tag}`);
          restored++;
        } catch { restoreFailed++; }
      }, 300);
      gs.rolePermBackup.clear();
      saveState();
      await status2.edit({ embeds: [new EmbedBuilder().setColor(COLORS.success)
        .setTitle("🔓 Permissions Restored")
        .setDescription(`Restored permissions for **${restored}** role(s)${restoreFailed ? ` (${restoreFailed} couldn't be restored — role may have been deleted)` : ""}.`)
        .setTimestamp()]});
      return true;
    }

    // ── setupmute ─────────────────────────────────────────────────────────────
    case "setupmute": {
      const muteConfirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("confirm").setLabel("Confirm").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger),
      );
      const muteConfirmMsg = await safeReply(message, {
        embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription("⚠️ This will create **3 mute roles** and apply permission overwrites to every channel. Continue?")],
        components: [muteConfirmRow],
      });
      const muteBtn = await muteConfirmMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.user.id === message.author.id,
        time: 30_000,
      }).catch(() => null);
      if (!muteBtn || muteBtn.customId === "cancel") {
        await muteConfirmMsg.edit({ ...re("Setup cancelled."), components: [] });
        return true;
      }
      await muteBtn.deferUpdate();
      const statusMsg = await muteConfirmMsg.edit({ ...re("⏳ Setting up mute roles — applying permission overwrites to all channels..."), components: [] });
      const reason = `setupmute by ${message.author.tag}`;

      async function findOrCreateRole(name: string, color: number) {
        const existing = guild.roles.cache.find(r => r.name === name);
        if (existing) return existing;
        return guild.roles.create({ name, color, reason });
      }

      const [mutedRole, imageMutedRole, reactionMutedRole] = await Promise.all([
        findOrCreateRole("Muted", 0x99aab5),
        findOrCreateRole("Image Muted", 0xe67e22),
        findOrCreateRole("Reaction Muted", 0x9b59b6),
      ]);

      gs.mutedRoleId = mutedRole.id;
      gs.imageMutedRoleId = imageMutedRole.id;
      gs.reactionMutedRoleId = reactionMutedRole.id;
      saveState();

      let ok = 0, fail = 0;
      const textChannels = [...guild.channels.cache.filter(c =>
        c.type === 0 || c.type === 5 || c.type === 11 || c.type === 12
      ).values()];

      const BATCH = 10;
      for (let i = 0; i < textChannels.length; i += BATCH) {
        const batch = textChannels.slice(i, i + BATCH);
        const results = await Promise.allSettled(batch.map(ch =>
          Promise.all([
            (ch as import("discord.js").TextChannel).permissionOverwrites.edit(mutedRole, {
              SendMessages: false, SendMessagesInThreads: false, AddReactions: false, Speak: false,
            }, { reason }),
            (ch as import("discord.js").TextChannel).permissionOverwrites.edit(imageMutedRole, {
              AttachFiles: false, EmbedLinks: false,
            }, { reason }),
            (ch as import("discord.js").TextChannel).permissionOverwrites.edit(reactionMutedRole, {
              AddReactions: false, UseExternalEmojis: false,
            }, { reason }),
          ])
        ));
        for (const r of results) r.status === "fulfilled" ? ok++ : fail++;
      }

      await statusMsg.edit({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle("Mute Roles Ready")
          .setDescription(
            `Three mute roles have been set up and applied to **${ok}** channel${ok !== 1 ? "s" : ""}${fail ? ` (${fail} failed)` : ""}.\n\n` +
            `**Muted** — no send/speak\n**Image Muted** — no files/embeds\n**Reaction Muted** — no reactions`
          )
          .setTimestamp(),
      ] });
      return true;
    }

    // ── enableevent / disableevent ────────────────────────────────────────────
    case "enableevent":
    case "disableevent": {
      const VALID_EVENTS = ["welcome", "goodbye", "boost", "joinlog", "leavelog"];
      const eventName = args[0]?.toLowerCase();
      if (!eventName || !VALID_EVENTS.includes(eventName)) {
        await safeReply(message, re(
          `Usage: \`${p}${cmd} <event>\`\nValid events: ${VALID_EVENTS.map(e => `\`${e}\``).join(", ")}`,
        ));
        return true;
      }
      if (cmd === "disableevent") {
        gs.disabledEvents.add(eventName);
        saveState();
        await safeReply(message, re(`Event **${eventName}** has been disabled — the bot will no longer fire it in this server.`));
      } else {
        gs.disabledEvents.delete(eventName);
        saveState();
        await safeReply(message, re(`Event **${eventName}** has been re-enabled.`));
      }
      return true;
    }

    case "setxp": {
      const uid = args[0]?.replace(/[<@!>]/g, "");
      const amount = parseInt(args[1]);
      if (!uid || isNaN(amount) || amount < 0) {
        await safeReply(message, re(`Usage: \`${p}setxp @user <amount>\``));
        return true;
      }
      const d = gs.xpData.get(uid) ?? { xp: 0, level: 0, messages: 0 };
      d.xp = amount;
      d.level = levelFromXp(amount);
      gs.xpData.set(uid, d);
      saveState();
      await safeReply(message, re(`Set <@${uid}>'s XP to **${amount}** (Level **${d.level}**).`));
      return true;
    }

    case "removexp": {
      const uid = args[0]?.replace(/[<@!>]/g, "");
      const amount = parseInt(args[1]);
      if (!uid || isNaN(amount) || amount < 0) {
        await safeReply(message, re(`Usage: \`${p}removexp @user <amount>\``));
        return true;
      }
      const d = gs.xpData.get(uid) ?? { xp: 0, level: 0, messages: 0 };
      d.xp = Math.max(0, d.xp - amount);
      d.level = levelFromXp(d.xp);
      gs.xpData.set(uid, d);
      saveState();
      await safeReply(message, re(`Removed **${amount}** XP from <@${uid}>. They now have **${d.xp}** XP (Level **${d.level}**).`));
      return true;
    }

    case "setlevel": {
      const uid = args[0]?.replace(/[<@!>]/g, "");
      const level = parseInt(args[1]);
      if (!uid || isNaN(level) || level < 0) {
        await safeReply(message, re(`Usage: \`${p}setlevel @user <level>\``));
        return true;
      }
      const d = gs.xpData.get(uid) ?? { xp: 0, level: 0, messages: 0 };
      d.level = level;
      d.xp = xpForLevel(level);
      gs.xpData.set(uid, d);
      saveState();
      await safeReply(message, re(`Set <@${uid}>'s level to **${level}** (${d.xp} XP).`));
      return true;
    }

    case "rank": {
      const uid = (args[0]?.startsWith("<") ? args[0] : args[0])?.replace(/[<@!>]/g, "") ?? message.author.id;
      const d = gs.xpData.get(uid) ?? { xp: 0, level: 0, messages: 0 };
      const sorted = [...gs.xpData.entries()].sort((a, b) => b[1].xp - a[1].xp);
      const pos = sorted.findIndex(([id]) => id === uid) + 1;
      const nextLevelXp = xpForLevel(d.level + 1);
      const progress = Math.min(100, Math.floor((d.xp / nextLevelXp) * 100));
      const filled = Math.floor(progress / 5);
      const bar = "█".repeat(filled) + "░".repeat(20 - filled);
      await safeReply(message, { embeds: [
        new EmbedBuilder().setColor(COLORS.primary)
          .setTitle("Server Rank")
          .setThumbnail((await client.users.fetch(uid).catch(() => null))?.displayAvatarURL() ?? null)
          .addFields(
            { name: "User", value: `<@${uid}>`, inline: true },
            { name: "Rank", value: `#${pos} / ${sorted.length}`, inline: true },
            { name: "Level", value: `${d.level}`, inline: true },
            { name: "XP", value: `${d.xp} / ${nextLevelXp}`, inline: true },
            { name: "Messages", value: `${d.messages}`, inline: true },
            { name: `Progress to Level ${d.level + 1}`, value: `${bar} ${progress}%` },
          ).setTimestamp()
      ]});
      return true;
    }

    case "settings": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "view" || sub === "overview") {
        const lines: string[] = [
          `**Prefix:** \`${gs.prefix}\``,
          `**XP System:** ${gs.xpEnabled ? "✅" : "❌"} | Level-up channel: ${gs.xpLevelUpChannelId ? `<#${gs.xpLevelUpChannelId}>` : "not set"}`,
          `**Welcome:** ${gs.welcomeChannelId ? `<#${gs.welcomeChannelId}>` : "not set"}  **Goodbye:** ${gs.goodbyeChannelId ? `<#${gs.goodbyeChannelId}>` : "not set"}`,
          `**Modlog:** ${gs.modLogChannelId ? `<#${gs.modLogChannelId}>` : "not set"}  **Automod log:** ${gs.automodLogChannelId ? `<#${gs.automodLogChannelId}>` : "not set"}`,
          `**Antispam:** ${gs.antiSpamEnabled ? "✅" : "❌"}  **Anti-invite:** ${gs.inviteFilterEnabled ? "✅" : "❌"}`,
          `**Antinuke:** ${gs.antinukeEnabled ? "✅" : "❌"}  **Raid protect:** ${gs.joinRaidProtectionEnabled ? `✅ (${gs.joinRaidThreshold}+/30s)` : "❌"}`,
          `**Caps filter:** ${gs.capsFilterEnabled ? `✅ (>${gs.capsFilterPercent}%)` : "❌"}  **Emoji filter:** ${gs.emojiFilterEnabled ? `✅ (max ${gs.emojiFilterMax})` : "❌"}`,
          `**Spoiler filter:** ${gs.spoilerFilterEnabled ? "✅" : "❌"}  **Music file filter:** ${gs.musicFileFilterEnabled ? "✅" : "❌"}`,
          `**Antiraid defaultpfp:** ${gs.antiraidDefaultPfpEnabled ? `✅ (${gs.antiraidDefaultPfpAction})` : "❌"}  **New accounts:** ${gs.antiraidNewAccountsEnabled ? `✅ (<${gs.antiraidNewAccountsAge}d)` : "❌"}`,
          `**Starboard:** ${gs.starboardChannelId ? `<#${gs.starboardChannelId}> (${gs.starboardThreshold}⭐)` : "not set"}`,
          `**Jail role:** ${gs.jailRoleId ? `<@&${gs.jailRoleId}>` : "not set"}  **Mute role:** ${gs.mutedRoleId ? `<@&${gs.mutedRoleId}>` : "not set"}`,
          `**Autoresponders:** ${gs.autoresponders.size}  **Tags:** ${gs.tags.size}  **Custom commands:** ${gs.customCommands.size}`,
        ];
        await safeReply(message, { embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle(`Settings — ${guild.name}`)
            .setDescription(lines.join("\n"))
            .setFooter({ text: `Use ${p}help for all commands` })
            .setTimestamp()
        ]});
        return true;
      }
      await safeReply(message, re(`Usage: \`${p}settings\` or \`${p}settings view\` — shows all configured settings.`));
      return true;
    }

    case "serversetup": {
      if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await safeReply(message, re("You need **Administrator** permission to run server setup."));
        return true;
      }

      const ssConfirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("confirm").setLabel("Confirm").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger),
      );
      const ssConfirmMsg = await safeReply(message, {
        embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription("⚠️ This will create categories and channels for the entire server. Existing channels won't be touched. Continue?")],
        components: [ssConfirmRow],
      });
      const ssBtn = await ssConfirmMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.user.id === message.author.id,
        time: 30_000,
      }).catch(() => null);
      if (!ssBtn || ssBtn.customId === "cancel") {
        await ssConfirmMsg.edit({ ...re("Setup cancelled."), components: [] });
        return true;
      }
      await ssBtn.deferUpdate();
      const statusMsg = await ssConfirmMsg.edit({ ...re("Setting up server structure…"), components: [] });

      try {
        const everyoneRole = guild.roles.everyone;

        const makeCategory = async (name: string, hidden = false) => {
          const existing = guild.channels.cache.find(
            c => c.type === ChannelType.GuildCategory && c.name === name
          ) as CategoryChannel | undefined;
          if (existing) return existing;
          return guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
            permissionOverwrites: hidden
              ? [{ id: everyoneRole, deny: [PermissionFlagsBits.ViewChannel] }]
              : [],
          }) as Promise<CategoryChannel>;
        };

        const makeText = async (name: string, parent: CategoryChannel, opts: {
          readonly?: boolean;
          hidden?: boolean;
          topic?: string;
        } = {}) => {
          const existing = guild.channels.cache.find(
            c => c.name === name && (c as TextChannel).parentId === parent.id
          ) as TextChannel | undefined;
          if (existing) return existing;
          const overwrite = opts.hidden
            ? [{ id: everyoneRole, deny: [PermissionFlagsBits.ViewChannel] }]
            : opts.readonly
              ? [{ id: everyoneRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }]
              : [];
          return guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: parent.id,
            topic: opts.topic,
            permissionOverwrites: overwrite,
          }) as Promise<TextChannel>;
        };

        const makeVoice = async (name: string, parent: CategoryChannel, isAfk = false) => {
          const existing = guild.channels.cache.find(
            c => c.name === name && (c as VoiceChannel).parentId === parent.id
          ) as VoiceChannel | undefined;
          if (existing) return existing;
          return guild.channels.create({
            name,
            type: ChannelType.GuildVoice,
            parent: parent.id,
            userLimit: isAfk ? 99 : 0,
          }) as Promise<VoiceChannel>;
        };

        // ── INFORMATION ────────────────────────────────────────────────────────
        const infoCat = await makeCategory("📋 INFORMATION");
        await makeText("rules", infoCat, { readonly: true, topic: "Server rules — read before participating." });
        await makeText("announcements", infoCat, { readonly: true, topic: "Official server announcements." });
        await makeText("server-info", infoCat, { readonly: true, topic: "Information about the server." });
        await makeText("roles", infoCat, { readonly: true, topic: "React or click to get roles." });

        // ── GENERAL ────────────────────────────────────────────────────────────
        const generalCat = await makeCategory("💬 GENERAL");
        await makeText("general", generalCat, { topic: "General chat." });
        await makeText("introductions", generalCat, { topic: "Introduce yourself to the community." });
        await makeText("media", generalCat, { topic: "Share images, videos, and clips." });
        await makeText("memes", generalCat, { topic: "Post your best memes." });
        await makeText("counting", generalCat, { topic: "Count as high as you can! One number per message." });
        await makeText("bot-commands", generalCat, { topic: "Use bot commands here." });

        // ── VOICE ──────────────────────────────────────────────────────────────
        const voiceCat = await makeCategory("🎙️ VOICE CHANNELS");
        await makeVoice("General VC", voiceCat);
        await makeVoice("Gaming VC", voiceCat);
        await makeVoice("Music VC", voiceCat);
        await makeVoice("AFK", voiceCat, true);

        // ── STAFF (hidden) ─────────────────────────────────────────────────────
        const staffCat = await makeCategory("🔨 STAFF", true);
        const staffChatCh = await makeText("staff-chat", staffCat, { hidden: true, topic: "Staff discussion." });
        const modLogCh    = await makeText("mod-log", staffCat, { hidden: true, topic: "Automated moderation logs." });
        await makeText("admin-chat", staffCat, { hidden: true, topic: "Admin-only discussion." });
        await makeText("bot-log", staffCat, { hidden: true, topic: "Bot activity log." });

        if (!gs.modLogChannelId) {
          gs.modLogChannelId = modLogCh.id;
          saveState();
        }

        await statusMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.success)
              .setTitle("Server Setup Complete")
              .setDescription("Created the following categories and channels:")
              .addFields(
                { name: "📋 INFORMATION", value: "#rules · #announcements · #server-info · #roles", inline: false },
                { name: "💬 GENERAL", value: "#general · #introductions · #media · #memes · #counting · #bot-commands", inline: false },
                { name: "🎙️ VOICE CHANNELS", value: "General VC · Gaming VC · Music VC · AFK", inline: false },
                { name: "🔨 STAFF (hidden)", value: `#staff-chat · #mod-log · #admin-chat · #bot-log\n*Mod log set to <#${modLogCh.id}>*`, inline: false },
              )
              .setFooter({ text: "Existing channels were skipped. Run !ticketsetup to add the ticket system." })
              .setTimestamp(),
          ],
        });
      } catch (err) {
        console.error("[serversetup]", err);
        await statusMsg.edit(re("Setup failed — make sure I have **Manage Channels** and **Administrator** permission."));
      }
      return true;
    }

    case "setuprules": {
      const rulesConfirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("confirm").setLabel("Confirm").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger),
      );
      const rulesConfirmMsg = await safeReply(message, {
        embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription("⚠️ This will post a rules embed in this channel. Continue?")],
        components: [rulesConfirmRow],
      });
      const rulesBtn = await rulesConfirmMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.user.id === message.author.id,
        time: 30_000,
      }).catch(() => null);
      if (!rulesBtn || rulesBtn.customId === "cancel") {
        await rulesConfirmMsg.edit({ ...re("Setup cancelled."), components: [] });
        return true;
      }
      await rulesBtn.deferUpdate();
      await rulesConfirmMsg.delete().catch(() => {});
      const rulesEmbed = new EmbedBuilder()
        .setTitle("📜 Server Rules")
        .setColor(COLORS.primary)
        .setDescription(
          "Please read and follow these rules to keep the server a positive place for everyone.",
        )
        .addFields(
          { name: "1. Be Respectful", value: "Treat all members with respect. Harassment, hate speech, slurs, and personal attacks are not tolerated." },
          { name: "2. No Spam", value: "Do not spam messages, emotes, mentions, or links. Keep conversations relevant to the channel topic." },
          { name: "3. No NSFW Content", value: "Do not post explicit, graphic, or NSFW content anywhere outside designated channels." },
          { name: "4. No Advertising", value: "Do not advertise other Discord servers, social media, or products without staff approval." },
          { name: "5. No Doxxing", value: "Sharing personal information about others without their consent is strictly prohibited." },
          { name: "6. Follow Discord ToS", value: "You must follow [Discord's Terms of Service](https://discord.com/terms) and [Community Guidelines](https://discord.com/guidelines) at all times." },
          { name: "7. Listen to Staff", value: "Follow instructions from staff members. If you disagree with a decision, handle it through proper channels — not in public." },
        )
        .setFooter({ text: "Breaking these rules may result in a warning, mute, or ban." })
        .setTimestamp();
      await message.channel.send({ embeds: [rulesEmbed] });
      await message.delete().catch(() => {});
      return true;
    }

    default:
      return false;
  }
}
