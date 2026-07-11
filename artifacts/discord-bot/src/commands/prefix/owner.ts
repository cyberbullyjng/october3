import {
  EmbedBuilder, TextChannel, VoiceChannel, PermissionFlagsBits, ActionRowBuilder, ActivityType,
  ButtonBuilder, ButtonStyle, ComponentType, ChannelType, Guild, GuildMember,
  CategoryChannel, Role, Collection,
} from "discord.js";
import type { Message } from "discord.js";
import { OWNER_ID, isOwner } from "../../constants.js";
import { loadState, guildStates } from "../../state.js";
import {
  getGS, saveState, afkUsers, maintenanceMode, setMaintenanceMode, globalBannedUsers, blacklistedServers,
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

export async function handleOwnerCategoryCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  const guild = message.guild ?? null;
  const gs = guild ? getGS(guild.id) : getGS("__dm__");
  const p = gs.prefix || ",";
  const dmLogChannel = guild ? gch(guild, gs.dmLogChannelId) : null;

  switch (cmd) {
    case "dmall": {
      const text = args.join(" ");
      if (!text) {
        await safeReply(message, re(`Usage: \`${p}dmall message\``));
        return true;
      }
      await ensureMembersCache(message.guild!);
      const humans = message.guild!.members.cache.filter((m) => !m.user.bot);
      const status = await safeReply(message, re(`Sending DMs to ${humans.size} members...`));
      let sent = 0;
      let failed = 0;
      for (const [, member] of humans) {
        let attempts = 0;
        let delivered = false;
        while (attempts < 4) {
          try {
            await member.send(text);
            delivered = true;
            break;
          } catch (err: any) {
            if (err?.status === 429 || err?.httpStatus === 429) {
              const waitMs = ((err?.rawError?.retry_after ?? err?.retryAfter ?? 2)) * 1000;
              await new Promise((r) => setTimeout(r, waitMs + 100));
              attempts++;
            } else {
              break;
            }
          }
        }
        if (delivered) sent++; else failed++;
        await new Promise((r) => setTimeout(r, 1000));
      }
      const dmallLogEmbed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle("Mass DM Sent")
        .addFields(
          { name: "Sent By", value: `${message.author} (${message.author.tag})`, inline: true },
          { name: "Server", value: message.guild!.name, inline: true },
          { name: "\u200b", value: "\u200b", inline: true },
          { name: "Delivered", value: `${sent}`, inline: true },
          { name: "Failed", value: `${failed}`, inline: true },
          { name: "Total", value: `${sent + failed}`, inline: true },
          { name: "Message", value: text.length > 1024 ? text.slice(0, 1021) + "..." : text },
        )
        .setFooter({ text: `Author ID: ${message.author.id}` })
        .setTimestamp();
      if (dmLogChannel) {
        await dmLogChannel.send({ embeds: [dmallLogEmbed] }).catch(() => {});
        await status.edit(re(` DM blast complete — **${sent}** delivered, **${failed}** failed. Logged in ${dmLogChannel}.`)).catch(() => {});
      } else {
        await status.edit(re(` DM blast complete — **${sent}** delivered, **${failed}** failed.`)).catch(() => {});
      }
      return true;
    }
    case "grantaccess": {
      if (!isOwner(message.author.id)) return true;
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}grantaccess @user\` or \`${p}grantaccess <userID>\``));
        return true;
      }
      if (gs.botAccessUsers.has(userId)) {
        await safeReply(message, re("That user already has bot access."));
        return true;
      }
      gs.botAccessUsers.add(userId);
      saveState();
      const user = await message.client.users.fetch(userId).catch(() => null);
      await safeReply(message, re(`**${user?.tag ?? userId}** can now use all bot commands.`));
      return true;
    }
    case "revokeaccess": {
      if (!isOwner(message.author.id)) return true;
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}revokeaccess @user\` or \`${p}revokeaccess <userID>\``));
        return true;
      }
      if (!gs.botAccessUsers.has(userId)) {
        await safeReply(message, re("That user doesn't have bot access."));
        return true;
      }
      gs.botAccessUsers.delete(userId);
      saveState();
      const user = await message.client.users.fetch(userId).catch(() => null);
      await safeReply(message, re(`**${user?.tag ?? userId}**'s bot access has been revoked.`));
      return true;
    }
    case "listaccess": {
      if (gs.botAccessUsers.size === 0) {
        await safeReply(message, re("No users have been granted bot access."));
        return true;
      }
      const lines = [...gs.botAccessUsers].map((id) => `<@${id}> (\`${id}\`)`);
      await sendPaginated(message, ` Bot Access Users (${lines.length})`, lines, { perPage: 20, color: 0x5865f2 });
      return true;
    }
    case "setstatus": {
      if (!isOwner(message.author.id)) return true;
      const typeArg = args[0]?.toLowerCase();
      const text = args.slice(1).join(" ");
      if (!typeArg) {
        await safeReply(message, re(`Usage: \`${p}setstatus playing <text>\` | \`watching\` | \`listening\` | \`competing\` | \`clear\``));
        return true;
      }
      const typeMap: Record<string, ActivityType> = {
        playing:   ActivityType.Playing,
        watching:  ActivityType.Watching,
        listening: ActivityType.Listening,
        competing: ActivityType.Competing,
        streaming: ActivityType.Streaming,
      };
      if (typeArg === "clear") {
        client.user!.setPresence({ activities: [] });
        await safeReply(message, re("Bot status cleared."));
        return true;
      }
      if (!(typeArg in typeMap)) {
        await safeReply(message, re("Unknown type. Use: `playing`, `watching`, `listening`, `competing`, `streaming`, `clear`"));
        return true;
      }
      if (!text) {
        await safeReply(message, re(`Provide text after the type. Example: \`${p}setstatus ${typeArg} your text here\``));
        return true;
      }
      client.user!.setActivity(text, { type: typeMap[typeArg] });
      await safeReply(message, re(`Status set to **${typeArg}** ${text}`));
      return true;
    }
    case "botstats": {
      if (!isOwner(message.author.id)) return true;
      const mem = process.memoryUsage();
      const toMB = (n: number) => (n / 1024 / 1024).toFixed(1);
      const totalUsers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
      const uptimeSec = Math.floor(process.uptime());
      const h = Math.floor(uptimeSec / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);
      const s = uptimeSec % 60;
      const uptimeStr = `${h}h ${m}m ${s}s`;
      await safeReply(message, { embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Bot Stats")
          .addFields(
            { name: "Uptime",          value: uptimeStr,                                inline: true },
            { name: "Ping",            value: `${client.ws.ping}ms`,                   inline: true },
            { name: "Servers",         value: String(client.guilds.cache.size),         inline: true },
            { name: "Total Users",     value: String(totalUsers),                       inline: true },
            { name: "RAM (RSS)",       value: `${toMB(mem.rss)} MB`,                   inline: true },
            { name: "RAM (Heap Used)", value: `${toMB(mem.heapUsed)} MB`,              inline: true },
            { name: "Global Bans",     value: String(globalBannedUsers.size),           inline: true },
            { name: "Maintenance",     value: maintenanceMode ? " On" : " Off",   inline: true },
          )
          .setTimestamp(),
      ]});
      return true;
    }
    case "maintenance": {
      if (!isOwner(message.author.id)) return true;
      const toggle = args[0]?.toLowerCase();
      if (toggle === "on") {
        setMaintenanceMode(true);
        await safeReply(message, re("Maintenance mode **enabled**. Only you can use the bot."));
      } else if (toggle === "off") {
        setMaintenanceMode(false);
        await safeReply(message, re("Maintenance mode **disabled**. Bot is open to all users."));
      } else {
        await safeReply(message, re(`Maintenance mode is currently **${maintenanceMode ? "ON" : "OFF"}**. Use \`${p}maintenance on\` or \`${p}maintenance off\`.`));
      }
      return true;
    }
    case "globalban": {
      if (!isOwner(message.author.id)) return true;
      const rawId = args[0]?.replace(/[<@!>]/g, "");
      if (!rawId) {
        await safeReply(message, re(`Usage: \`${p}globalban <userId> [reason]\``));
        return true;
      }
      if (isOwner(rawId)) {
        await safeReply(message, re("You can't globally ban yourself."));
        return true;
      }
      const reason = args.slice(1).join(" ") || "No reason provided";
      const user = await client.users.fetch(rawId).catch(() => null);
      globalBannedUsers.set(rawId, { reason, timestamp: Date.now() });
      saveState();
      await safeReply(message, re(`**${user?.tag ?? rawId}** has been globally banned from using the bot.\nReason: ${reason}`));
      return true;
    }
    case "globalunban": {
      if (!isOwner(message.author.id)) return true;
      const rawId = args[0]?.replace(/[<@!>]/g, "");
      if (!rawId) {
        await safeReply(message, re(`Usage: \`${p}globalunban <userId>\``));
        return true;
      }
      if (!globalBannedUsers.has(rawId)) {
        await safeReply(message, re("That user is not globally banned."));
        return true;
      }
      globalBannedUsers.delete(rawId);
      saveState();
      const user = await client.users.fetch(rawId).catch(() => null);
      await safeReply(message, re(`**${user?.tag ?? rawId}** has been globally unbanned.`));
      return true;
    }
    case "globalbans": {
      if (!isOwner(message.author.id)) return true;
      if (globalBannedUsers.size === 0) {
        await safeReply(message, re("No users are globally banned."));
        return true;
      }
      const items = [...globalBannedUsers.entries()].map(
        ([id, data]) => `<@${id}> — ${data.reason} <t:${Math.floor(data.timestamp / 1000)}:R>`,
      );
      await sendPaginated(message, ` Globally Banned Users (${items.length})`, items, { perPage: 15, color: 0xcc2222 });
      return true;
    }
    case "clearglobalbans": {
      if (!isOwner(message.author.id)) return true;
      if (globalBannedUsers.size === 0) {
        await safeReply(message, re("No users are currently globally banned."));
        return true;
      }
      const count = globalBannedUsers.size;
      await sendConfirm(
        message,
        ` This will remove all **${count}** global ban(s). Affected users will immediately be able to use the bot again.`,
        async () => {
          globalBannedUsers.clear();
          saveState();
          await message.channel.send(re(`Cleared **${count}** global ban(s).`)).catch(() => {});
        },
        0xed4245,
      );
      return true;
    }
    case "blacklistserver": {
      if (!isOwner(message.author.id)) return true;
      const guildId = args[0];
      if (!guildId) {
        await safeReply(message, re(`Usage: \`${p}blacklistserver <guildId>\``));
        return true;
      }
      if (blacklistedServers.has(guildId)) {
        await safeReply(message, re("That server is already blacklisted."));
        return true;
      }
      blacklistedServers.add(guildId);
      saveState();
      const targetName = client.guilds.cache.get(guildId)?.name ?? guildId;
      await safeReply(message, re(`**${targetName}** is now blacklisted — the bot will ignore all commands there.`));
      return true;
    }
    case "unblacklistserver": {
      if (!isOwner(message.author.id)) return true;
      const guildId = args[0];
      if (!guildId) {
        await safeReply(message, re(`Usage: \`${p}unblacklistserver <guildId>\``));
        return true;
      }
      if (!blacklistedServers.has(guildId)) {
        await safeReply(message, re("That server is not blacklisted."));
        return true;
      }
      blacklistedServers.delete(guildId);
      saveState();
      const targetName = client.guilds.cache.get(guildId)?.name ?? guildId;
      await safeReply(message, re(`**${targetName}** has been removed from the blacklist.`));
      return true;
    }
    case "blacklistedservers": {
      if (!isOwner(message.author.id)) return true;
      if (blacklistedServers.size === 0) {
        await safeReply(message, re("No servers are currently blacklisted."));
        return true;
      }
      const lines = [...blacklistedServers].map((id) => {
        const name = client.guilds.cache.get(id)?.name;
        return name ? `${name} (\`${id}\`)` : `\`${id}\``;
      });
      await sendPaginated(message, ` Blacklisted Servers (${lines.length})`, lines, { perPage: 15, color: 0xed4245 });
      return true;
    }
    case "rename": {
      if (!isOwner(message.author.id)) return true;
      const newName = args.join(" ").trim();
      if (!newName) {
        await safeReply(message, re(`Usage: \`${p}rename <new name>\``));
        return true;
      }
      try {
        await client.user!.setUsername(newName);
        await safeReply(message, re(`Bot username changed to **${newName}**.`));
      } catch (err: any) {
        await safeReply(message, re(`Failed to rename: ${err.message ?? err}`));
      }
      return true;
    }
    case "setavatar": {
      if (!isOwner(message.author.id)) return true;
      const url = args[0] ?? message.attachments.first()?.url;
      if (!url) {
        await safeReply(message, re(`Usage: \`${p}setavatar <image url>\` or attach an image.`));
        return true;
      }
      try {
        await client.user!.setAvatar(url);
        await safeReply(message, re("Bot avatar updated."));
      } catch (err: any) {
        await safeReply(message, re(`Failed to set avatar: ${err.message ?? err}`));
      }
      return true;
    }
    case "eval": {
      if (!isOwner(message.author.id)) return true;
      const code = args.join(" ");
      if (!code) {
        await safeReply(message, re(`Usage: \`${p}eval <code>\``));
        return true;
      }
      try {
        // eslint-disable-next-line no-eval
        let result = eval(code);
        if (result instanceof Promise) result = await result;
        const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        const truncated = output && output.length > 1900 ? output.slice(0, 1900) + "\n…(truncated)" : output ?? "undefined";
        await safeReply(message, { embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle("Eval")
            .setDescription(`\`\`\`js\n${truncated}\n\`\`\``)
            .setTimestamp(),
        ]});
      } catch (err: any) {
        await safeReply(message, { embeds: [
          new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle("Eval Error")
            .setDescription(`\`\`\`\n${err?.message ?? err}\n\`\`\``)
            .setTimestamp(),
        ]});
      }
      return true;
    }
    case "save": {
      if (!isOwner(message.author.id)) return true;
      saveState();
      await safeReply(message, re("State saved to disk."));
      return true;
    }
    case "reload": {
      if (!isOwner(message.author.id)) return true;
      try {
        loadState();
        await safeReply(message, re("State reloaded from disk."));
      } catch (err) {
        await safeReply(message, re(`Failed to reload state: ${err}`));
      }
      return true;
    }
    case "shutdown": {
      if (!isOwner(message.author.id)) return true;
      await safeReply(message, re("Shutting down. Goodbye."));
      saveState();
      setTimeout(() => process.exit(0), 1000);
      return true;
    }
    case "servers": {
      if (!isOwner(message.author.id)) return true;
      const guilds = [...client.guilds.cache.values()];
      if (guilds.length === 0) {
        await safeReply(message, re("Bot is not in any servers."));
        return true;
      }
      const lines: string[] = [];
      for (let i = 0; i < guilds.length; i++) {
        const g = guilds[i];
        let invite = "";
        try {
          const channel = g.systemChannel
            ?? g.channels.cache
              .filter(c => c.isTextBased() && c.type === 0)
              .sort((a, b) => (a as any).rawPosition - (b as any).rawPosition)
              .first() as any;
          if (channel) {
            const inv = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: "servers cmd" });
            invite = ` — [invite](https://discord.gg/${inv.code})`;
          }
        } catch {}
        lines.push(`**${i + 1}.** ${g.name} (\`${g.id}\`) — ${g.memberCount} members${invite}`);
        if (i < guilds.length - 1) await new Promise(r => setTimeout(r, 300));
      }
      await sendPaginated(message, ` Servers (${guilds.length})`, lines, { perPage: 15, color: 0x5865f2 });
      return true;
    }
    case "leave": {
      if (!isOwner(message.author.id)) return true;
      const guildId = args[0];
      if (!guildId) {
        await safeReply(message, re(`Usage: \`${p}leave <guildId>\``));
        return true;
      }
      const target = client.guilds.cache.get(guildId);
      if (!target) {
        await safeReply(message, re(`Bot is not in a guild with ID \`${guildId}\`.`));
        return true;
      }
      const guildName = target.name;
      await target.leave();
      await safeReply(message, re(`Left **${guildName}** (\`${guildId}\`).`));
      return true;
    }
    case "broadcast": {
      if (!isOwner(message.author.id)) return true;
      const text = args.join(" ");
      if (!text) {
        await safeReply(message, re(`Usage: \`${p}broadcast <message>\``));
        return true;
      }
      const status = await safeReply(message, re(`Broadcasting to ${client.guilds.cache.size} servers...`));
      let sent = 0;
      let failed = 0;
      for (const g of client.guilds.cache.values()) {
        const chan = g.systemChannel ?? g.channels.cache
          .filter((c) => c.isTextBased() && c.type === 0)
          .sort((a, b) => (a as any).rawPosition - (b as any).rawPosition)
          .first();
        if (!chan || !chan.isTextBased()) { failed++; continue; }
        try {
          await (chan as any).send({
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.primary)
                .setTitle("Announcement from Bot Owner")
                .setDescription(text)
                .setTimestamp(),
            ],
          });
          sent++;
        } catch {
          failed++;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      await status.edit(re(`Broadcast complete — **${sent}** delivered, **${failed}** failed.`));
      return true;
    }
    case "spyguild": {
      if (!isOwner(message.author.id)) return true;
      const guildId = args[0];
      if (!guildId) {
        await safeReply(message, re(`Usage: \`${p}spyguild <guildId>\``));
        return true;
      }
      const target = client.guilds.cache.get(guildId);
      if (!target) {
        await safeReply(message, re(`Bot is not in a guild with ID \`${guildId}\`.`));
        return true;
      }
      let invite = "N/A";
      try {
        const inviteChan = target.systemChannel
          ?? target.channels.cache.filter((c) => c.isTextBased() && c.type === 0).first();
        if (inviteChan && inviteChan.isTextBased()) {
          const inv = await (inviteChan as any).createInvite({ maxAge: 300, maxUses: 1, reason: "Owner spyguild" });
          invite = inv.url;
        }
      } catch {
        invite = "Couldn't create invite";
      }
      const owner = await client.users.fetch(target.ownerId).catch(() => null);
      await safeReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle(`Guild Info — ${target.name}`)
            .setThumbnail(target.iconURL() ?? null)
            .addFields(
              { name: "Guild ID",    value: target.id,                                    inline: true },
              { name: "Owner",       value: owner ? `${owner.tag} (${owner.id})` : target.ownerId, inline: true },
              { name: "Members",     value: String(target.memberCount),                   inline: true },
              { name: "Channels",    value: String(target.channels.cache.size),           inline: true },
              { name: "Roles",       value: String(target.roles.cache.size),              inline: true },
              { name: "Created",     value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
              { name: "Invite (5m)", value: invite },
            )
            .setTimestamp(),
        ],
      });
      return true;
    }
    case "clone": {
      if (!isOwner(message.author.id)) return true;
      const [sourceId, targetId] = args;
      if (!sourceId || !targetId) {
        await safeReply(message, re(`Usage: \`${p}clone <sourceGuildId> <targetGuildId>\``));
        return true;
      }
      if (sourceId === targetId) {
        await safeReply(message, re("Source and target must be different servers."));
        return true;
      }
      const sourceGuild = client.guilds.cache.get(sourceId);
      const targetGuild = client.guilds.cache.get(targetId);
      if (!sourceGuild) {
        await safeReply(message, re(`Bot is not in source guild \`${sourceId}\`.`)); return true;
      }
      if (!targetGuild) {
        await safeReply(message, re(`Bot is not in target guild \`${targetId}\`.`)); return true;
      }

      await sendConfirm(
        message,
        ` **Confirm Server Clone**\n\n` +
        `Clone **${sourceGuild.name}** → **${targetGuild.name}**\n\n` +
        `This will:\n` +
        `• Delete all existing roles & channels in **${targetGuild.name}**\n` +
        `• Recreate them from **${sourceGuild.name}**\n` +
        `• Copy all bot config (commands, filters, autoresponders, etc.)\n\n` +
        `**This action cannot be undone.**`,
        async () => {
          const statusMsg = await message.channel.send(re("Cloning server — this may take a few minutes…"));
          const delay = (ms = 400) => new Promise<void>(r => setTimeout(r, ms));

          try {
            await sourceGuild.roles.fetch();
            await sourceGuild.channels.fetch();
            await targetGuild.roles.fetch();
            await targetGuild.channels.fetch();

            // ── 1) Snapshot source roles ──────────────────────────────────
            const boosterRoleId = sourceGuild.roles.premiumSubscriberRole?.id;
            const srcRoles = [...sourceGuild.roles.cache.values()]
              .filter(r => r.id !== sourceGuild.id && !r.managed && r.id !== boosterRoleId)
              .sort((a, b) => b.position - a.position)
              .map(r => ({
                oldId: r.id,
                name: r.name,
                color: r.color,
                permissions: r.permissions.bitfield.toString(),
                hoist: r.hoist,
                mentionable: r.mentionable,
              }));

            // ── 2) Snapshot source channels ───────────────────────────────
            const mapOverwrites = (ch: import("discord.js").GuildChannel) =>
              [...ch.permissionOverwrites.cache.values()].map(ow => ({
                id: ow.id,
                type: ow.type as 0 | 1,
                allow: ow.allow.bitfield.toString(),
                deny: ow.deny.bitfield.toString(),
              }));

            const srcCategories = [...sourceGuild.channels.cache.values()]
              .filter(c => c.type === ChannelType.GuildCategory)
              .sort((a, b) => a.position - b.position)
              .map(c => ({
                oldId: c.id,
                name: c.name,
                position: c.position,
                overwrites: mapOverwrites(c as import("discord.js").GuildChannel),
              }));

            const srcChannels = [...sourceGuild.channels.cache.values()]
              .filter(c =>
                c.type === ChannelType.GuildText ||
                c.type === ChannelType.GuildVoice ||
                c.type === ChannelType.GuildAnnouncement ||
                c.type === ChannelType.GuildStageVoice ||
                c.type === ChannelType.GuildForum
              )
              .sort((a, b) => a.position - b.position)
              .map(c => {
                const tc = c as any;
                return {
                  oldId: c.id,
                  name: c.name,
                  type: c.type,
                  position: c.position,
                  topic: tc.topic ?? null,
                  nsfw: tc.nsfw ?? false,
                  rateLimitPerUser: tc.rateLimitPerUser ?? 0,
                  parentId: tc.parentId ?? null,
                  bitrate: tc.bitrate,
                  userLimit: tc.userLimit,
                  overwrites: mapOverwrites(c as import("discord.js").GuildChannel),
                };
              });

            await statusMsg.edit(re("Deleting existing roles & channels in target…")).catch(() => {});

            // ── 3) Delete target channels (keep current channel) ──────────
            const protectedId = message.channelId;
            const tgtNonCats = [...targetGuild.channels.cache.values()]
              .filter(c => c.id !== protectedId && c.type !== ChannelType.GuildCategory);
            const tgtCats = [...targetGuild.channels.cache.values()]
              .filter(c => c.type === ChannelType.GuildCategory);
            for (const ch of tgtNonCats) {
              await (ch as import("discord.js").GuildChannel).delete("Clone").catch(() => {});
              await delay();
            }
            for (const cat of tgtCats) {
              await (cat as import("discord.js").GuildChannel).delete("Clone").catch(() => {});
              await delay();
            }

            // ── 4) Delete target roles ────────────────────────────────────
            const tgtRoles = [...targetGuild.roles.cache.values()]
              .filter(r => r.id !== targetGuild.id && !r.managed && r.id !== targetGuild.roles.botRoleFor(client.user!)?.id)
              .sort((a, b) => b.position - a.position);
            for (const role of tgtRoles) {
              await role.delete("Clone").catch(() => {});
              await delay();
            }

            await statusMsg.edit(re("Creating roles…")).catch(() => {});

            // ── 5) Recreate roles, build ID map ───────────────────────────
            const roleMap = new Map<string, string>(); // old → new
            for (const sr of srcRoles) {
              try {
                const newRole = await targetGuild.roles.create({
                  name: sr.name,
                  color: sr.color,
                  permissions: BigInt(sr.permissions),
                  hoist: sr.hoist,
                  mentionable: sr.mentionable,
                  reason: "Clone",
                });
                roleMap.set(sr.oldId, newRole.id);
              } catch {}
              await delay();
            }

            const mapOw = (overwrites: { id: string; type: 0 | 1; allow: string; deny: string }[]) =>
              overwrites.map(ow => ({
                id: ow.type === 0 ? (roleMap.get(ow.id) ?? targetGuild.id) : ow.id,
                type: ow.type,
                allow: BigInt(ow.allow),
                deny: BigInt(ow.deny),
              }));

            await statusMsg.edit(re("Creating categories & channels…")).catch(() => {});

            // ── 6) Recreate categories, build ID map ──────────────────────
            const catMap = new Map<string, string>(); // old → new
            for (const sc of srcCategories) {
              try {
                const newCat = await targetGuild.channels.create({
                  name: sc.name,
                  type: ChannelType.GuildCategory,
                  position: sc.position,
                  permissionOverwrites: mapOw(sc.overwrites),
                  reason: "Clone",
                });
                catMap.set(sc.oldId, newCat.id);
              } catch {}
              await delay();
            }

            // ── 7) Recreate channels ──────────────────────────────────────
            for (const sc of srcChannels) {
              try {
                const parentId = sc.parentId ? (catMap.get(sc.parentId) ?? undefined) : undefined;
                const opts: any = {
                  name: sc.name,
                  type: sc.type,
                  position: sc.position,
                  permissionOverwrites: mapOw(sc.overwrites),
                  reason: "Clone",
                  ...(parentId ? { parent: parentId } : {}),
                };
                if (sc.type === ChannelType.GuildText || sc.type === ChannelType.GuildAnnouncement || sc.type === ChannelType.GuildForum) {
                  if (sc.topic) opts.topic = sc.topic;
                  opts.nsfw = sc.nsfw;
                  opts.rateLimitPerUser = sc.rateLimitPerUser;
                }
                if (sc.type === ChannelType.GuildVoice || sc.type === ChannelType.GuildStageVoice) {
                  if (sc.bitrate) opts.bitrate = sc.bitrate;
                  if (sc.userLimit !== undefined) opts.userLimit = sc.userLimit;
                }
                await targetGuild.channels.create(opts);
              } catch {}
              await delay();
            }

            // ── 8) Copy bot config settings ───────────────────────────────
            const src = getGS(sourceId);
            const tgt = getGS(targetId);
            tgt.prefix                       = src.prefix;
            tgt.repKeyword                   = src.repKeyword;
            tgt.repEnabled                   = src.repEnabled;
            tgt.welcomeMessage               = src.welcomeMessage;
            tgt.welcomeSelfDestruct          = src.welcomeSelfDestruct;
            tgt.goodbyeMessage               = src.goodbyeMessage;
            tgt.goodbyeSelfDestruct          = src.goodbyeSelfDestruct;
            tgt.boostMessage                 = src.boostMessage;
            tgt.boostSelfDestruct            = src.boostSelfDestruct;
            tgt.leaveDmEnabled               = src.leaveDmEnabled;
            tgt.leaveDmMessage               = src.leaveDmMessage;
            tgt.boosterDmEnabled             = src.boosterDmEnabled;
            tgt.boosterDmMessage             = src.boosterDmMessage;
            tgt.autoPubEnabled               = src.autoPubEnabled;
            tgt.inviteFilterEnabled          = src.inviteFilterEnabled;
            tgt.antiSpamEnabled              = src.antiSpamEnabled;
            tgt.antiSpamThreshold            = src.antiSpamThreshold;
            tgt.antiSpamWindowMs             = src.antiSpamWindowMs;
            tgt.capsLockFilterEnabled        = src.capsLockFilterEnabled;
            tgt.capsLockThreshold            = src.capsLockThreshold;
            tgt.capsFilterEnabled            = src.capsFilterEnabled;
            tgt.capsFilterPercent            = src.capsFilterPercent;
            tgt.emojiFilterEnabled           = src.emojiFilterEnabled;
            tgt.emojiFilterMax               = src.emojiFilterMax;
            tgt.massmentionFilterEnabled     = src.massmentionFilterEnabled;
            tgt.massmentionFilterThreshold   = src.massmentionFilterThreshold;
            tgt.musicFileFilterEnabled       = src.musicFileFilterEnabled;
            tgt.spoilerFilterEnabled         = src.spoilerFilterEnabled;
            tgt.antiAltEnabled               = src.antiAltEnabled;
            tgt.antiAltDays                  = src.antiAltDays;
            tgt.antinukeEnabled              = src.antinukeEnabled;
            tgt.antinukeThresholds           = { ...src.antinukeThresholds };
            tgt.warnKickThreshold            = src.warnKickThreshold;
            tgt.warnBanThreshold             = src.warnBanThreshold;
            tgt.xpEnabled                    = src.xpEnabled;
            tgt.bumpReminderEnabled          = src.bumpReminderEnabled;
            tgt.antiEveryonePingEnabled      = src.antiEveryonePingEnabled;
            tgt.antiEveryonePingAction       = src.antiEveryonePingAction;
            tgt.permGuardEnabled             = src.permGuardEnabled;
            tgt.pingOnJoinEnabled            = src.pingOnJoinEnabled;
            tgt.antiraidDefaultPfpEnabled    = src.antiraidDefaultPfpEnabled;
            tgt.antiraidDefaultPfpAction     = src.antiraidDefaultPfpAction;
            tgt.antiraidNewAccountsEnabled   = src.antiraidNewAccountsEnabled;
            tgt.antiraidNewAccountsAge       = src.antiraidNewAccountsAge;
            tgt.antiraidNewAccountsAction    = src.antiraidNewAccountsAction;
            tgt.joinRaidProtectionEnabled    = src.joinRaidProtectionEnabled;
            tgt.joinRaidThreshold            = src.joinRaidThreshold;
            tgt.joinRaidWindowMs             = src.joinRaidWindowMs;
            tgt.joinAgeGateEnabled           = src.joinAgeGateEnabled;
            tgt.joinAgeGateDays              = src.joinAgeGateDays;
            tgt.roleRestoreEnabled           = src.roleRestoreEnabled;
            tgt.raidAction                   = src.raidAction;
            tgt.starboardThreshold           = src.starboardThreshold;
            tgt.clownboardThreshold          = src.clownboardThreshold;
            tgt.autostaffEnabled             = src.autostaffEnabled;
            tgt.imageLocked                  = src.imageLocked;
            tgt.customCommands   = new Map(src.customCommands);
            tgt.aliases          = new Map(src.aliases);
            tgt.autoresponders   = new Map([...src.autoresponders].map(([k, v]) => [k, { ...v }]));
            tgt.tags             = new Map([...src.tags].map(([k, v]) => [k, { ...v }]));
            tgt.customFilterWords = new Set(src.customFilterWords);
            tgt.disabledEvents    = new Set(src.disabledEvents);
            saveState();

            await statusMsg.edit({ embeds: [
              new EmbedBuilder().setColor(COLORS.success).setTitle("Server Cloned")
                .addFields(
                  { name: "Source", value: `${sourceGuild.name} (\`${sourceId}\`)`, inline: true },
                  { name: "Target", value: `${targetGuild.name} (\`${targetId}\`)`, inline: true },
                  { name: "Roles", value: `${roleMap.size} / ${srcRoles.length}`, inline: true },
                  { name: "Categories", value: `${catMap.size} / ${srcCategories.length}`, inline: true },
                  { name: "Channels", value: `${srcChannels.length}`, inline: true },
                )
                .setDescription("Bot config, roles, and channels have all been cloned. You'll still need to set channel/role IDs for the bot (modlog, rep role, etc.) since those point to new IDs.")
                .setTimestamp(),
            ]}).catch(() => {});

          } catch (err) {
            await statusMsg.edit(re("Clone failed partway through. Check bot permissions.")).catch(() => {});
            console.error("[clone]", err);
          }
        },
        0xed4245,
      );
      return true;
    }

    case "resetguild": {
      if (!isOwner(message.author.id)) return true;
      const capturedGuildId = guild.id;
      const capturedGuildName = guild.name;
      await sendConfirm(
        message,
        ` This will **permanently wipe** all bot data for **${capturedGuildName}** (settings, warnings, jail, backups, etc.).\nThis action cannot be undone.`,
        async () => {
          guildStates.delete(capturedGuildId);
          saveState();
          await message.channel.send(re(`All bot data for **${capturedGuildName}** has been reset to defaults.`)).catch(() => {});
        },
        0xed4245,
      );
      return true;
    }

    default:
      return false;
  }
}
