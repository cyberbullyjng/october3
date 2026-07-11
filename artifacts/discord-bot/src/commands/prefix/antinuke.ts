import {
  EmbedBuilder, TextChannel, VoiceChannel, PermissionFlagsBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, ChannelType, Guild, GuildMember,
  CategoryChannel, Role, Collection,
} from "discord.js";
import type { Message } from "discord.js";
import { OWNER_ID, ELEVATED_PERMS, isOwner } from "../../constants.js";
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
  ANTINUKE_RESTORE_BACKUP_ID, refreshAntinukeRestoreSnapshot, restoreAllFromSnapshot,
  safeReply,
} from "../../utils.js";
import { BLOCKED_TERMS, BLOCKED_PATTERNS } from "../../wordlist.js";
import {
  blackteaGames, wordValidCache,
} from "../../state.js";
import { COLORS } from "../../colors.js";

export async function handleAntinukeCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "botwl": {
      const sub = args[0]?.toLowerCase();
      const rawId = args[1]?.replace(/[<@!>]/g, "");

      if (sub === "add" && rawId) {
        gs.botWhitelist.add(rawId);
        saveState();
        await safeReply(message, re(` Bot \`${rawId}\` whitelisted — it can be added to this server without triggering antinuke.`));
      } else if (sub === "remove" && rawId) {
        if (!gs.botWhitelist.has(rawId)) {
          await safeReply(message, re(`\`${rawId}\` is not in the bot whitelist.`));
          return true;
        }
        gs.botWhitelist.delete(rawId);
        saveState();
        await safeReply(message, re(` Bot \`${rawId}\` removed from the whitelist.`));
      } else if (sub === "list") {
        if (gs.botWhitelist.size === 0) {
          await safeReply(message, re("Bot whitelist is empty."));
          return true;
        }
        const items = [...gs.botWhitelist].map((id) => `<@${id}> (\`${id}\`)`);
        await sendPaginated(message, ` Bot Whitelist (${items.length})`, items, { perPage: 20, color: 0x57f287 });
      } else {
        await safeReply(message, re(
          `**Bot Whitelist** — bots in this list can be added by anyone without triggering antinuke.\n\n` +
          `Usage: \`${p}botwl add <botId>\` | \`${p}botwl remove <botId>\` | \`${p}botwl list\``
        ));
      }
      return true;
    }
    case "whitelist": {
      const sub = args[0]?.toLowerCase();
      const mention = args[1];
      const userId = mention?.replace(/[<@!>]/g, "");

      if (sub === "add" && userId) {
        gs.antinukeWhitelist.add(userId);
        saveState();
        await safeReply(message, re(`<@${userId}> added to the antinuke whitelist.`));
      } else if (sub === "remove" && userId) {
        if (isOwner(userId)) {
          await safeReply(message, re("You can't remove yourself."));
          return true;
        }
        gs.antinukeWhitelist.delete(userId);
        saveState();
        await safeReply(message, re(`<@${userId}> removed from the antinuke whitelist.`));
      } else if (sub === "list") {
        if (gs.antinukeWhitelist.size === 0) {
          await safeReply(message, re("Antinuke whitelist is empty."));
          return true;
        }
        const items = [...gs.antinukeWhitelist].map((id) => `<@${id}> (\`${id}\`)`);
        await sendPaginated(message, ` Antinuke Whitelist (${items.length})`, items, { perPage: 20, color: 0x57f287 });
      } else {
        await safeReply(message, re(`Usage: \`${p}whitelist add @user\` | \`${p}whitelist remove @user\` | \`${p}whitelist list\``));
      }
      return true;
    }
    case "unwhitelist": {
      const userId = args[0]?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}unwhitelist @user\``));
        return true;
      }
      if (isOwner(userId)) {
        await safeReply(message, re("You can't remove yourself."));
        return true;
      }
      if (!gs.antinukeWhitelist.has(userId)) {
        await safeReply(message, re(`<@${userId}> is not on the whitelist.`));
        return true;
      }
      gs.antinukeWhitelist.delete(userId);
      saveState();
      await safeReply(message, re(`<@${userId}> removed from the antinuke whitelist.`));
      return true;
    }
    case "permguardwhitelist": {
      const sub = args[0]?.toLowerCase();
      const mention = args[1];
      const userId = mention?.replace(/[<@!>]/g, "");

      if (sub === "add" && userId) {
        gs.permGuardWhitelist.add(userId);
        saveState();
        await safeReply(message, re(`<@${userId}> added to the permguard whitelist — they can hold admin roles.`));
      } else if (sub === "remove" && userId) {
        if (isOwner(userId)) {
          await safeReply(message, re("You can't remove yourself."));
          return true;
        }
        gs.permGuardWhitelist.delete(userId);
        saveState();
        await safeReply(message, re(`<@${userId}> removed from the permguard whitelist.`));
      } else if (sub === "list") {
        if (gs.permGuardWhitelist.size === 0) {
          await safeReply(message, re("Permguard whitelist is empty."));
          return true;
        }
        const items = [...gs.permGuardWhitelist].map((id) => `<@${id}> (\`${id}\`)`);
        await sendPaginated(message, " Permguard Whitelist", items, { perPage: 20, color: 0x57f287 });
      } else {
        await safeReply(message, re(`Usage: \`${p}permguardwhitelist add @user\` | \`${p}permguardwhitelist remove @user\` | \`${p}permguardwhitelist list\``));
      }
      return true;
    }
    case "antinukeadmin": {
      const sub = args[0]?.toLowerCase();
      const userId = args[1]?.replace(/[<@!>]/g, "");
      if (sub === "grant" && userId) {
        gs.antinukeAdmins.add(userId);
        saveState();
        await safeReply(message, re(`<@${userId}> granted **Antinuke Admin** — they can now configure antinuke settings and the whitelist.`));
      } else if (sub === "revoke" && userId) {
        if (isOwner(userId)) { await safeReply(message, re("Cannot revoke from the bot owner.")); return true; }
        gs.antinukeAdmins.delete(userId);
        saveState();
        await safeReply(message, re(`Revoked Antinuke Admin from <@${userId}>.`));
      } else if (sub === "list") {
        if (gs.antinukeAdmins.size === 0) {
          await safeReply(message, re("No antinuke admins set."));
          return true;
        }
        const items = [...gs.antinukeAdmins].map((id) => `<@${id}> (\`${id}\`)`);
        await sendPaginated(message, ` Antinuke Admins (${items.length})`, items, { perPage: 20, color: 0xfee75c });
      } else {
        await safeReply(message, re(`Usage: \`${p}antinukeadmin grant @user\` | \`${p}antinukeadmin revoke @user\` | \`${p}antinukeadmin list\``));
      }
      return true;
    }
    case "antinuke": {
      const type = args[0]?.toLowerCase();
      if (type === "on" || type === "off") {
        gs.antinukeEnabled = type === "on";
        saveState();
        await safeReply(message, re(`Antinuke **${type === "on" ? "enabled" : "disabled"}**.`));
        return true;
      }
      if (type === "restore") {
        const sub = args[1]?.toLowerCase();
        if (sub === "on" || sub === "off") {
          gs.antinukeRestoreEnabled = sub === "on";
          if (gs.antinukeRestoreEnabled) {
            await refreshAntinukeRestoreSnapshot(guild, message.author.id).catch((err) => {
              console.error("[antinuke-restore] manual enable snapshot failed:", err);
            });
          }
          saveState();
          await safeReply(message, re(`Antinuke auto-restore is now **${gs.antinukeRestoreEnabled ? "ON" : "OFF"}**.`));
          return true;
        }
        if (sub === "now") {
          const backup = gs.backups.get(ANTINUKE_RESTORE_BACKUP_ID);
          if (!backup) {
            await safeReply(message, re(`No restore snapshot found. Take one first with \`${p}antinuke restore snapshot\`.`));
            return true;
          }
          const statusMsg = await safeReply(message, re("Running full restore from antinuke snapshot — this may take a moment…"));
          try {
            const result = await restoreAllFromSnapshot(guild);
            await statusMsg.edit({
              embeds: [
                new EmbedBuilder()
                  .setColor(result.roles + result.channels > 0 ? 0x57f287 : 0xfee75c)
                  .setTitle("Antinuke Restore Complete")
                  .setDescription(
                    result.roles + result.channels === 0 && result.missing === 0
                      ? "Nothing needed restoring — server matches the snapshot."
                      : `Restored **${result.roles}** role(s) and **${result.channels}** channel(s) from the snapshot.`
                  )
                  .addFields(
                    { name: "Roles Restored", value: `${result.roles}`, inline: true },
                    { name: "Channels Restored", value: `${result.channels}`, inline: true },
                    { name: "Already Present", value: `${result.skipped}`, inline: true },
                    ...(result.missing > 0 ? [{ name: "Could Not Restore", value: `${result.missing} (not in snapshot)`, inline: true }] : []),
                    { name: "Snapshot Age", value: `<t:${Math.floor(backup.createdAt / 1000)}:R>`, inline: true },
                  )
                  .setTimestamp(),
              ],
            });
          } catch (err) {
            console.error("[antinuke-restore] manual restore failed:", err);
            await statusMsg.edit(re("Restore failed — check my Manage Roles/Channels permissions and try again."));
          }
          return true;
        }
        if (sub === "snapshot") {
          const statusMsg = await safeReply(message, re("Refreshing antinuke restore snapshot — scanning roles and channels…"));
          try {
            const backup = await refreshAntinukeRestoreSnapshot(guild, message.author.id);
            await statusMsg.edit({
              embeds: [
                new EmbedBuilder()
                  .setColor(COLORS.success)
                  .setTitle("Antinuke Restore Snapshot Updated")
                  .addFields(
                    { name: "Roles", value: `${backup.roles.length}`, inline: true },
                    { name: "Categories", value: `${backup.categories.length}`, inline: true },
                    { name: "Channels", value: `${backup.channels.length}`, inline: true },
                    { name: "Saved", value: `<t:${Math.floor(backup.createdAt / 1000)}:R>`, inline: true },
                  ),
              ],
            });
          } catch (err) {
            console.error("[antinuke-restore] manual snapshot failed:", err);
            await statusMsg.edit(re("Couldn't refresh the antinuke restore snapshot. Check my Manage Roles/Channels permissions."));
          }
          return true;
        }
        const backup = gs.backups.get(ANTINUKE_RESTORE_BACKUP_ID);
        await safeReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(gs.antinukeRestoreEnabled ? 0x57f287 : 0xed4245)
              .setTitle("Antinuke Auto-Restore")
              .addFields(
                { name: "Status", value: gs.antinukeRestoreEnabled ? "ON" : "OFF", inline: true },
                { name: "Snapshot", value: backup ? `<t:${Math.floor(backup.createdAt / 1000)}:R>` : "No snapshot saved yet", inline: true },
                { name: "Saved Items", value: backup ? `${backup.roles.length} roles · ${backup.categories.length + backup.channels.length} channels` : "None", inline: false },
              )
              .setFooter({ text: `Use ${p}antinuke restore on/off | ${p}antinuke restore snapshot | ${p}antinuke restore now` }),
          ],
        });
        return true;
      }
      if (type === "window") {
        const n = parseInt(args[1], 10);
        if (isNaN(n) || n < 1 || n > 60) {
          await safeReply(message, re(`Usage: \`${p}antinuke window <seconds>\` (1–60)\nCurrent: **${gs.antinukeWindowMs / 1000}s**`));
          return true;
        }
        gs.antinukeWindowMs = n * 1000;
        saveState();
        await safeReply(message, re(`Antinuke detection window set to **${n}s**. Actions within ${n}s will count toward thresholds.`));
        return true;
      }
      const value = parseInt(args[1]);
      if (!type || isNaN(value) || value < 1) {
        await safeReply(message, re(`Antinuke: **${gs.antinukeEnabled ? "enabled" : "disabled"}**\n\n` +
            `Auto-restore: **${gs.antinukeRestoreEnabled ? "enabled" : "disabled"}**\n` +
            `**Detection window:** ${gs.antinukeWindowMs / 1000}s\n` +
            `**Thresholds** (actions within window to trigger):\n` +
            `Bans: **${gs.antinukeThresholds.bans}** — Kicks: **${gs.antinukeThresholds.kicks}** — ` +
            `Channel deletes: **${gs.antinukeThresholds.channelDeletes}** — Role deletes: **${gs.antinukeThresholds.roleDeletes}** — ` +
            `Bot adds: **${gs.antinukeThresholds.botAdds}**\n\n` +
            `Usage: \`${p}antinuke on/off\` | \`${p}antinuke window <s>\` | \`${p}antinuke restore on/off/snapshot/now\`\n` +
            `Thresholds: \`${p}antinuke bans 3\` | \`${p}antinuke kicks 3\` | \`${p}antinuke channels 2\` | \`${p}antinuke roles 2\` | \`${p}antinuke bots 1\``));
        return true;
      }
      if (type === "bans") gs.antinukeThresholds.bans = value;
      else if (type === "kicks") gs.antinukeThresholds.kicks = value;
      else if (type === "channels") gs.antinukeThresholds.channelDeletes = value;
      else if (type === "roles") gs.antinukeThresholds.roleDeletes = value;
      else if (type === "bots") gs.antinukeThresholds.botAdds = value;
      else {
        await safeReply(message, re("Unknown type. Use: `on`, `off`, `window`, `bans`, `kicks`, `channels`, `roles`, `bots`"));
        return true;
      }
      saveState();
      await safeReply(message, re(`Antinuke threshold for **${type}** set to **${value}**.`));
      return true;
    }
    case "sblacklist": {
      const sub = args[0]?.toLowerCase();
      if (!sub || !["setrole", "add", "remove", "list", "check"].includes(sub)) {
        await safeReply(message, re(
          " **Staff Blacklist** usage:\n" +
          `\`${p}sblacklist setrole @role\` — set the blacklist role\n` +
          `\`${p}sblacklist add @user [reason]\` — blacklist a member (strips elevated-perm roles)\n` +
          `\`${p}sblacklist remove @user\` — remove from blacklist\n` +
          `\`${p}sblacklist list\` — show all blacklisted members\n` +
          `\`${p}sblacklist check @user\` — check if a member is blacklisted`
        ));
        return true;
      }

      // setrole
      if (sub === "setrole") {
        const targetRole = message.mentions.roles.first();
        if (!targetRole) {
          await safeReply(message, re(`Mention a role: \`${p}sblacklist setrole @role\``));
          return true;
        }
        gs.staffBlacklistRoleId = targetRole.id;
        saveState();
        await safeReply(message, re(`Staff blacklist role set to ${targetRole}. Blacklisted members will receive this role and lose any elevated-permission roles.`));
        return true;
      }

      // list
      if (sub === "list") {
        if (gs.staffBlacklist.size === 0) {
          await safeReply(message, re("No members are currently staff-blacklisted."));
          return true;
        }
        const lines = [...gs.staffBlacklist.entries()].map(([uid, data]) =>
          `<@${uid}> — ${data.reason || "no reason"} · added by **${data.addedBy}** <t:${Math.floor(data.timestamp / 1000)}:R>`
        );
        const embed = new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle(`Staff Blacklist (${gs.staffBlacklist.size})`)
          .setDescription(lines.join("\n").slice(0, 4000));
        await safeReply(message, { embeds: [embed] });
        return true;
      }

      // check
      if (sub === "check") {
        const targetMember = message.mentions.members?.first();
        const targetId = targetMember?.id ?? args[1]?.replace(/[<@!>]/g, "");
        if (!targetId) {
          await safeReply(message, re(`Usage: \`${p}sblacklist check @user\``));
          return true;
        }
        const entry = gs.staffBlacklist.get(targetId);
        if (!entry) {
          await safeReply(message, re(`<@${targetId}> is **not** staff-blacklisted.`));
          return true;
        }
        await safeReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle("Staff Blacklisted")
              .addFields(
                { name: "User", value: `<@${targetId}>`, inline: true },
                { name: "Reason", value: entry.reason || "none", inline: true },
                { name: "Added By", value: entry.addedBy, inline: true },
                { name: "Since", value: `<t:${Math.floor(entry.timestamp / 1000)}:F>`, inline: true },
                { name: "Stripped Roles", value: entry.strippedRoles.length ? entry.strippedRoles.map((r) => `<@&${r}>`).join(" ") : "none", inline: false },
              )
              .setTimestamp(),
          ],
        });
        return true;
      }

      // add / remove — need a target member
      const targetMember = message.mentions.members?.first();
      if (!targetMember) {
        await safeReply(message, re(`Mention a user: \`${p}sblacklist ${sub} @user\``));
        return true;
      }

      if (sub === "add") {
        if (isOwner(targetMember.id)) {
          await safeReply(message, re("Cannot blacklist the owner."));
          return true;
        }
        if (gs.staffBlacklist.has(targetMember.id)) {
          await safeReply(message, re(`**${targetMember.user.tag}** is already blacklisted.`));
          return true;
        }
        const reason = args.slice(2).join(" ") || "No reason provided";
        // Strip all roles with elevated permissions
        const elevated = targetMember.roles.cache.filter(
          (r) => r.id !== message.guild.roles.everyone.id && !r.managed && (r.permissions.bitfield & ELEVATED_PERMS) !== 0n
        );
        const strippedIds = elevated.map((r) => r.id);
        await rQueue([...elevated.values()], async (role) => {
          await targetMember.roles.remove(role).catch(() => {});
        }, 300);
        // Give blacklist role if configured
        if (gs.staffBlacklistRoleId) {
          const blRole = message.guild.roles.cache.get(gs.staffBlacklistRoleId);
          if (blRole) await targetMember.roles.add(blRole).catch(() => {});
        }
        gs.staffBlacklist.set(targetMember.id, {
          reason,
          addedBy: message.author.tag,
          timestamp: Date.now(),
          strippedRoles: strippedIds,
        });
        saveState();
        await safeReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle("Staff Blacklisted")
              .addFields(
                { name: "Member", value: `${targetMember.user.tag} (${targetMember})`, inline: true },
                { name: "Reason", value: reason, inline: true },
                { name: "Roles Stripped", value: strippedIds.length ? strippedIds.map((r) => `<@&${r}>`).join(" ") : "none", inline: false },
              )
              .setFooter({ text: `They will have any elevated roles auto-removed going forward.` })
              .setTimestamp(),
          ],
        });
        await recordModAction(message.guild!, targetMember.id, "sblacklist", reason, message.author.tag, message.author.id);
        return true;
      }

      if (sub === "remove") {
        const entry = gs.staffBlacklist.get(targetMember.id);
        if (!entry) {
          await safeReply(message, re(`**${targetMember.user.tag}** is not blacklisted.`));
          return true;
        }
        // Remove blacklist role
        if (gs.staffBlacklistRoleId) {
          const blRole = message.guild.roles.cache.get(gs.staffBlacklistRoleId);
          if (blRole) await targetMember.roles.remove(blRole).catch(() => {});
        }
        gs.staffBlacklist.delete(targetMember.id);
        saveState();
        await safeReply(message, re(`**${targetMember.user.tag}** has been removed from the staff blacklist. Their previously-stripped roles are NOT automatically restored — use \`${p}restorestaff @user\` if needed.`));
        return true;
      }

      return true;
    }
    case "permguard": {
      const toggle = args[0]?.toLowerCase();
      if (toggle === "on") {
        gs.permGuardEnabled = true;
        saveState();
        await safeReply(message, re(
          "**Permission Guard enabled.** Any non-whitelisted member who receives a role with the **Administrator** permission will have it instantly stripped and a warning will be sent to the antinuke log channel."
        ));
      } else if (toggle === "off") {
        gs.permGuardEnabled = false;
        saveState();
        await safeReply(message, re("**Permission Guard disabled.** Dangerous permission assignments will no longer be auto-stripped."));
      } else {
        await safeReply(message, re(
          `Permission Guard is currently **${gs.permGuardEnabled ? "ON" : "OFF"}**.\n\n` +
          `When enabled, any non-whitelisted user who receives a role with the **Administrator** permission ` +
          `will have that role automatically removed and a warning will be posted to the antinuke log channel. ` +
          `All other permissions can be granted normally.\n\n` +
          `Use \`${p}permguard on/off\` to toggle.`
        ));
      }
      return true;
    }
    case "antiinvite": {
      const toggle = args[0]?.toLowerCase();
      if (toggle === "on") {
        gs.inviteFilterEnabled = true;
        saveState();
        await safeReply(message, re("Invite link filter is now **ON** — all Discord invites posted by non-whitelisted users will be deleted."));
      } else if (toggle === "off") {
        gs.inviteFilterEnabled = false;
        saveState();
        await safeReply(message, re("Invite link filter is now **OFF** — members can post invite links."));
      } else {
        await safeReply(message, re(`Invite link filter is currently **${gs.inviteFilterEnabled ? "ON" : "OFF"}**. Use \`${p}antiinvite on/off\` to toggle.`));
      }
      return true;
    }
    case "filter": {
      const sub = args[0]?.toLowerCase();

      if (sub === "caps") {
        const action = args[1]?.toLowerCase();
        if (action === "on") {
          const pct = parseInt(args[2]);
          if (!isNaN(pct) && pct > 0 && pct <= 100) gs.capsFilterPercent = pct;
          gs.capsFilterEnabled = true;
          saveState();
          await safeReply(message, re(`Caps filter **enabled** — messages with >${gs.capsFilterPercent}% uppercase letters will be deleted.`));
        } else if (action === "off") {
          gs.capsFilterEnabled = false;
          saveState();
          await safeReply(message, re("Caps filter **disabled**."));
        } else {
          await safeReply(message, re(
            `**Caps Filter** — Status: **${gs.capsFilterEnabled ? `✅ Enabled (${gs.capsFilterPercent}%)` : "❌ Disabled"}**\n` +
            `\`${p}filter caps on [percent]\` — enable (default 70% threshold)\n\`${p}filter caps off\` — disable`
          ));
        }
        return true;
      }

      if (sub === "emoji") {
        const action = args[1]?.toLowerCase();
        if (action === "on") {
          const max = parseInt(args[2]);
          if (!isNaN(max) && max > 0) gs.emojiFilterMax = max;
          gs.emojiFilterEnabled = true;
          saveState();
          await safeReply(message, re(`Emoji filter **enabled** — messages with more than **${gs.emojiFilterMax}** emojis will be deleted.`));
        } else if (action === "off") {
          gs.emojiFilterEnabled = false;
          saveState();
          await safeReply(message, re("Emoji filter **disabled**."));
        } else {
          await safeReply(message, re(
            `**Emoji Filter** — Status: **${gs.emojiFilterEnabled ? `✅ Enabled (max ${gs.emojiFilterMax})` : "❌ Disabled"}**\n` +
            `\`${p}filter emoji on [max]\` — enable (default 10 max)\n\`${p}filter emoji off\` — disable`
          ));
        }
        return true;
      }

      if (sub === "massmention") {
        const action = args[1]?.toLowerCase();
        if (action === "on") {
          const threshold = parseInt(args[2]);
          if (!isNaN(threshold) && threshold > 0) gs.massmentionFilterThreshold = threshold;
          gs.massmentionFilterEnabled = true;
          saveState();
          await safeReply(message, re(`Mass mention filter **enabled** — messages mentioning more than **${gs.massmentionFilterThreshold}** users will be deleted.`));
        } else if (action === "off") {
          gs.massmentionFilterEnabled = false;
          saveState();
          await safeReply(message, re("Mass mention filter **disabled**."));
        } else {
          await safeReply(message, re(
            `**Mass Mention Filter** — Status: **${gs.massmentionFilterEnabled ? `✅ Enabled (threshold: ${gs.massmentionFilterThreshold})` : "❌ Disabled"}**\n` +
            `\`${p}filter massmention on [count]\` — enable (default 5)\n\`${p}filter massmention off\` — disable`
          ));
        }
        return true;
      }

      if (sub === "musicfiles") {
        const action = args[1]?.toLowerCase();
        if (action === "on") {
          gs.musicFileFilterEnabled = true;
          saveState();
          await safeReply(message, re("Music file filter **enabled** — `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a` attachments will be deleted."));
        } else if (action === "off") {
          gs.musicFileFilterEnabled = false;
          saveState();
          await safeReply(message, re("Music file filter **disabled**."));
        } else {
          await safeReply(message, re(`**Music File Filter** — Status: **${gs.musicFileFilterEnabled ? "✅ Enabled" : "❌ Disabled"}**\n\`${p}filter musicfiles on\` / \`off\``));
        }
        return true;
      }

      if (sub === "spoilers") {
        const action = args[1]?.toLowerCase();
        if (action === "on") {
          gs.spoilerFilterEnabled = true;
          saveState();
          await safeReply(message, re("Spoiler filter **enabled** — messages with spoiler tags `||text||` will be deleted."));
        } else if (action === "off") {
          gs.spoilerFilterEnabled = false;
          saveState();
          await safeReply(message, re("Spoiler filter **disabled**."));
        } else {
          await safeReply(message, re(`**Spoiler Filter** — Status: **${gs.spoilerFilterEnabled ? "✅ Enabled" : "❌ Disabled"}**\n\`${p}filter spoilers on\` / \`off\``));
        }
        return true;
      }

      const word = args.slice(1).join(" ").toLowerCase().trim();
      if (sub === "add") {
        if (!word) { await safeReply(message, re(`Usage: \`${p}filter add <word>\``)); return true; }
        gs.customFilterWords.add(word);
        saveState();
        await safeReply(message, re(`**${word}** added to this server's word filter.`));
      } else if (sub === "remove") {
        if (!word) { await safeReply(message, re(`Usage: \`${p}filter remove <word>\``)); return true; }
        if (!gs.customFilterWords.has(word)) {
          await safeReply(message, re(`**${word}** is not in the custom filter list.`));
          return true;
        }
        gs.customFilterWords.delete(word);
        saveState();
        await safeReply(message, re(`**${word}** removed from this server's word filter.`));
      } else if (sub === "list") {
        if (gs.customFilterWords.size === 0) {
          await safeReply(message, re("No custom filter words set for this server.\nGlobal blocked terms (slurs, TOS violations) still apply."));
          return true;
        }
        const items = [...gs.customFilterWords].map((w) => `\`${w}\``);
        await sendPaginated(message, ` Custom Filter Words (${items.length})`, items, { perPage: 20, color: 0xed4245, footer: "Global TOS-violation terms are always filtered separately." });
      } else {
        await safeReply(message, re(
          "**Filter Commands:**\n" +
          `\`${p}filter add <word>\` — add word to custom filter\n` +
          `\`${p}filter remove <word>\` — remove word from filter\n` +
          `\`${p}filter list\` — view custom filtered words\n` +
          `\`${p}filter caps on/off [%]\` — filter excessive caps\n` +
          `\`${p}filter emoji on/off [max]\` — filter emoji spam\n` +
          `\`${p}filter massmention on/off [count]\` — filter mass mentions\n` +
          `\`${p}filter musicfiles on/off\` — block audio file uploads\n` +
          `\`${p}filter spoilers on/off\` — block spoiler tags`
        ));
      }
      return true;
    }

    case "antiraid": {
      const sub = args[0]?.toLowerCase();

      if (sub === "defaultpfp") {
        const action = args[1]?.toLowerCase();
        if (action === "on") {
          const act = args[2]?.toLowerCase();
          if (act === "ban") gs.antiraidDefaultPfpAction = "ban";
          else gs.antiraidDefaultPfpAction = "kick";
          gs.antiraidDefaultPfpEnabled = true;
          saveState();
          await safeReply(message, re(`Default PFP raid protection **enabled** — users with no avatar will be **${gs.antiraidDefaultPfpAction}ned** on join.`));
        } else if (action === "off") {
          gs.antiraidDefaultPfpEnabled = false;
          saveState();
          await safeReply(message, re("Default PFP raid protection **disabled**."));
        } else {
          await safeReply(message, re(
            `**Antiraid: Default PFP** — Status: **${gs.antiraidDefaultPfpEnabled ? `✅ Enabled (action: ${gs.antiraidDefaultPfpAction})` : "❌ Disabled"}**\n` +
            `\`${p}antiraid defaultpfp on [kick|ban]\` — enable\n\`${p}antiraid defaultpfp off\` — disable`
          ));
        }
        return true;
      }

      if (sub === "newaccounts") {
        const action = args[1]?.toLowerCase();
        if (action === "on") {
          const age = parseInt(args[2]);
          if (!isNaN(age) && age > 0) gs.antiraidNewAccountsAge = age;
          const act = args[3]?.toLowerCase();
          if (act === "ban") gs.antiraidNewAccountsAction = "ban";
          else gs.antiraidNewAccountsAction = "kick";
          gs.antiraidNewAccountsEnabled = true;
          saveState();
          await safeReply(message, re(`New accounts protection **enabled** — accounts younger than **${gs.antiraidNewAccountsAge} day(s)** will be **${gs.antiraidNewAccountsAction}ned** on join.`));
        } else if (action === "off") {
          gs.antiraidNewAccountsEnabled = false;
          saveState();
          await safeReply(message, re("New accounts protection **disabled**."));
        } else {
          await safeReply(message, re(
            `**Antiraid: New Accounts** — Status: **${gs.antiraidNewAccountsEnabled ? `✅ Enabled (age: ${gs.antiraidNewAccountsAge}d, action: ${gs.antiraidNewAccountsAction})` : "❌ Disabled"}**\n` +
            `\`${p}antiraid newaccounts on [days] [kick|ban]\` — enable\n\`${p}antiraid newaccounts off\` — disable`
          ));
        }
        return true;
      }

      if (sub === "massjoin") {
        await safeReply(message, re(`Mass join protection is configured via \`${p}raidprotect\`. Use that command to set thresholds and actions.`));
        return true;
      }

      await safeReply(message, re(
        "**Antiraid Commands:**\n" +
        `\`${p}antiraid defaultpfp on/off [kick|ban]\` — kick/ban users with no profile picture\n` +
        `\`${p}antiraid newaccounts on/off [days] [kick|ban]\` — block new accounts from joining\n` +
        `\`${p}antiraid massjoin\` — see mass-join (raid) protection\n` +
        `\`${p}raidprotect\` — configure mass-join raid protection`
      ));
      return true;
    }
    case "filterbypass": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}filterbypass @user\` — grants that user full filter immunity.`));
        return true;
      }
      if (gs.filterBypassUsers.has(userId)) {
        await safeReply(message, re("That user already has a filter bypass."));
        return true;
      }
      gs.filterBypassUsers.add(userId);
      saveState();
      const user = await message.client.users.fetch(userId).catch(() => null);
      await safeReply(message, re(`**${user?.tag ?? userId}** now has a filter bypass — they can say anything without it being deleted.`));
      return true;
    }
    case "unfilterbypass": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}unfilterbypass @user\``));
        return true;
      }
      if (!gs.filterBypassUsers.has(userId)) {
        await safeReply(message, re("That user doesn't have a filter bypass."));
        return true;
      }
      gs.filterBypassUsers.delete(userId);
      saveState();
      const user = await message.client.users.fetch(userId).catch(() => null);
      await safeReply(message, re(`**${user?.tag ?? userId}**'s filter bypass has been removed.`));
      return true;
    }
    case "listbypasses": {
      if (gs.filterBypassUsers.size === 0) {
        await safeReply(message, re("No users have a filter bypass."));
        return true;
      }
      const lines = [...gs.filterBypassUsers].map((id) => `<@${id}> (\`${id}\`)`);
      await sendPaginated(message, ` Filter Bypass Users (${lines.length})`, lines, { perPage: 20, color: 0x5865f2 });
      return true;
    }
    case "linkbypass": {
      const target = message.mentions.users.first() ?? (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) { await safeReply(message, re(`Usage: \`${p}linkbypass @user\` — lets that user post invite/external links freely.`)); return true; }
      if (gs.linkFilterBypass.has(target.id)) {
        await safeReply(message, re("That user already has a link filter bypass."));
        return true;
      }
      gs.linkFilterBypass.add(target.id);
      saveState();
      await safeReply(message, re(`**${target.tag}** can now post links without being filtered.`));
      return true;
    }
    case "unlinkbypass": {
      const target = message.mentions.users.first() ?? (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) { await safeReply(message, re(`Usage: \`${p}unlinkbypass @user\``)); return true; }
      if (!gs.linkFilterBypass.has(target.id)) {
        await safeReply(message, re("That user doesn't have a link filter bypass."));
        return true;
      }
      gs.linkFilterBypass.delete(target.id);
      saveState();
      await safeReply(message, re(`**${target.tag}**'s link bypass has been removed.`));
      return true;
    }
    case "linkbypasses": {
      if (gs.linkFilterBypass.size === 0) { await safeReply(message, re("No users have a link filter bypass.")); return true; }
      const lines = [...gs.linkFilterBypass].map((id) => `<@${id}> (\`${id}\`)`);
      await sendPaginated(message, ` Link Bypass Users (${lines.length})`, lines, { perPage: 20, color: 0x5865f2 });
      return true;
    }
    case "spambypass": {
      const target = message.mentions.users.first() ?? (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) { await safeReply(message, re(`Usage: \`${p}spambypass @user\` — exempts that user from the anti-spam system.`)); return true; }
      if (gs.spamBypass.has(target.id)) {
        await safeReply(message, re("That user already has a spam bypass."));
        return true;
      }
      gs.spamBypass.add(target.id);
      saveState();
      await safeReply(message, re(`**${target.tag}** is now exempt from anti-spam detection.`));
      return true;
    }
    case "unspambypass": {
      const target = message.mentions.users.first() ?? (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) { await safeReply(message, re(`Usage: \`${p}unspambypass @user\``)); return true; }
      if (!gs.spamBypass.has(target.id)) {
        await safeReply(message, re("That user doesn't have a spam bypass."));
        return true;
      }
      gs.spamBypass.delete(target.id);
      saveState();
      await safeReply(message, re(`**${target.tag}**'s spam bypass has been removed.`));
      return true;
    }
    case "spambypasses": {
      if (gs.spamBypass.size === 0) { await safeReply(message, re("No users have a spam bypass.")); return true; }
      const lines = [...gs.spamBypass].map((id) => `<@${id}> (\`${id}\`)`);
      await sendPaginated(message, ` Spam Bypass Users (${lines.length})`, lines, { perPage: 20, color: 0x5865f2 });
      return true;
    }
    case "imageonly": {
      const sub = args[0]?.toLowerCase();
      if (sub === "list") {
        if (gs.imageOnlyChannels.size === 0) {
          await safeReply(message, re("No image-only channels set."));
          return true;
        }
        const items = [...gs.imageOnlyChannels].map((id) => `<#${id}>`);
        await sendPaginated(message, ` Image-Only Channels (${items.length})`, items, { perPage: 20, color: 0x5865f2 });
        return true;
      }
      const chArg = args[0];
      const toggle = args[1]?.toLowerCase();
      const chId = chArg?.replace(/[<#>]/g, "");
      if (!chId || (toggle !== "on" && toggle !== "off")) {
        await safeReply(message, re(`Usage: \`${p}imageonly #channel on\` / \`${p}imageonly #channel off\` / \`${p}imageonly list\``));
        return true;
      }
      if (toggle === "on") {
        gs.imageOnlyChannels.add(chId);
        await safeReply(message, re(`<#${chId}> is now image/video only.`));
      } else {
        gs.imageOnlyChannels.delete(chId);
        await safeReply(message, re(`Image-only removed from <#${chId}>.`));
      }
      saveState();
      return true;
    }
    case "imageban": {
      const target = message.mentions.users.first() ?? (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) { await safeReply(message, re(`Usage: \`${p}imageban @user\``)); return true; }
      gs.imageBlacklist.add(target.id);
      saveState();
      await safeReply(message, re(`**${target.tag}** can no longer post images in this server.`));
      return true;
    }
    case "imageunban": {
      const target = message.mentions.users.first() ?? (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) { await safeReply(message, re(`Usage: \`${p}imageunban @user\``)); return true; }
      if (target.id === message.author.id) { await safeReply(message, re("You can't unban yourself.")); return true; }
      gs.imageBlacklist.delete(target.id);
      saveState();
      await safeReply(message, re(`**${target.tag}** can post images again.`));
      return true;
    }
    case "imagebans": {
      if (gs.imageBlacklist.size === 0) { await safeReply(message, re("No users are image-banned.")); return true; }
      const lines = [...gs.imageBlacklist].map((id) => `<@${id}> (\`${id}\`)`);
      await sendPaginated(message, ` Image-Banned Users (${lines.length})`, lines, { perPage: 20, color: 0xed4245 });
      return true;
    }
    case "streamban": {
      const target = message.mentions.users.first() ?? (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) { await safeReply(message, re(`Usage: \`${p}streamban @user\``)); return true; }
      gs.streamBlacklist.add(target.id);
      saveState();
      // If they`re currently in a voice channel streaming/on camera, cut it immediately
      const member = message.guild?.members.cache.get(target.id);
      if (member?.voice.channel) {
        if (member.voice.streaming || member.voice.selfVideo) {
          await member.voice.disconnect("Stream/camera banned").catch(() => null);
        }
      }
      await safeReply(message, re(`**${target.tag}** can no longer stream or use camera in this server.`));
      return true;
    }
    case "streamunban": {
      const target = message.mentions.users.first() ?? (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) { await safeReply(message, re(`Usage: \`${p}streamunban @user\``)); return true; }
      if (target.id === message.author.id) { await safeReply(message, re("You can't unban yourself.")); return true; }
      gs.streamBlacklist.delete(target.id);
      saveState();
      await safeReply(message, re(`**${target.tag}** can stream and use camera again.`));
      return true;
    }
    case "streambans": {
      if (gs.streamBlacklist.size === 0) { await safeReply(message, re("No users are stream-banned.")); return true; }
      const lines = [...gs.streamBlacklist].map((id) => `<@${id}> (\`${id}\`)`);
      await sendPaginated(message, ` Stream/Camera-Banned Users (${lines.length})`, lines, { perPage: 20, color: 0xed4245 });
      return true;
    }
    case "antispam": {
      const sub = args[0]?.toLowerCase();
      if (sub === "enable" || sub === "disable") {
        gs.antiSpamEnabled = sub === "enable";
        await safeReply(message, re(`Anti-spam **${sub}d**.`));
      } else if (sub === "threshold") {
        const n = parseInt(args[1], 10);
        if (isNaN(n) || n < 2) { await safeReply(message, re(`Usage: \`${p}antispam threshold <n>\` (min 2)`)); return true; }
        gs.antiSpamThreshold = n;
        await safeReply(message, re(`Anti-spam threshold set to **${n}** messages.`));
      } else if (sub === "window") {
        const n = parseInt(args[1], 10);
        if (isNaN(n) || n < 1) { await safeReply(message, re(`Usage: \`${p}antispam window <seconds>\``)); return true; }
        gs.antiSpamWindowMs = n * 1000;
        await safeReply(message, re(`Anti-spam window set to **${n}s**.`));
      } else {
        await safeReply(message, re(
          ` Anti-spam: **${gs.antiSpamEnabled ? "enabled" : "disabled"}** · threshold: ${gs.antiSpamThreshold} msgs / ${gs.antiSpamWindowMs / 1000}s window\n` +
          `Subcommands: \`enable\` · \`disable\` · \`threshold N\` · \`window N\``
        ));
      }
      saveState();
      return true;
    }
    case "raidprotect": {
      const sub = args[0]?.toLowerCase();
      if (sub === "on" || sub === "off") {
        gs.joinRaidProtectionEnabled = sub === "on";
        if (sub === "off") raidModeActive.delete(message.guild!.id);
        await safeReply(message, re(`Raid protection **${sub === "on" ? "enabled" : "disabled"}**.`));
      } else if (sub === "threshold") {
        const n = parseInt(args[1], 10);
        if (isNaN(n) || n < 2) { await safeReply(message, re(`Usage: \`${p}raidprotect threshold <n>\` (min 2)`)); return true; }
        gs.joinRaidThreshold = n;
        await safeReply(message, re(`Raid threshold set to **${n}** joins.`));
      } else if (sub === "window") {
        const n = parseInt(args[1], 10);
        if (isNaN(n) || n < 1) { await safeReply(message, re(`Usage: \`${p}raidprotect window <seconds>\``)); return true; }
        gs.joinRaidWindowMs = n * 1000;
        await safeReply(message, re(`Raid window set to **${n}s**.`));
      } else if (sub === "action") {
        const act = args[1]?.toLowerCase();
        if (!["kick", "jail", "ban", "timeout"].includes(act)) {
          await safeReply(message, re(`Usage: \`${p}raidprotect action <kick|jail|ban|timeout>\`\n- **kick** — kick raiders (default)\n- **jail** — move raiders to jail role\n- **ban** — ban raiders immediately\n- **timeout** — 10-minute timeout`));
          return true;
        }
        gs.raidAction = act as "kick" | "jail" | "ban" | "timeout";
        await safeReply(message, re(`Raid action set to **${act}**. Raiders will be **${act}${act === "timeout" ? "ed" : act === "ban" ? "ned" : "ed"}** when detected.`));
      } else if (sub === "clear") {
        raidModeActive.delete(message.guild!.id);
        joinTracker.delete(message.guild!.id);
        await safeReply(message, re("Raid mode manually cleared."));
      } else {
        const active = raidModeActive.has(message.guild!.id);
        const actionEmoji: Record<string, string> = { kick: "", jail: "", ban: "", timeout: "" };
        await safeReply(message, {
          embeds: [new EmbedBuilder()
            .setColor(active ? 0xff0000 : gs.joinRaidProtectionEnabled ? 0xffa500 : 0x5865f2)
            .setTitle(`Raid Protection${active ? " —  ACTIVE" : ""}`)
            .addFields(
              { name: "Status", value: gs.joinRaidProtectionEnabled ? " Enabled" : " Disabled", inline: true },
              { name: "Action", value: `${actionEmoji[gs.raidAction] ?? ""} ${gs.raidAction}`, inline: true },
              { name: "Threshold", value: `**${gs.joinRaidThreshold}** joins`, inline: true },
              { name: "Window", value: `**${gs.joinRaidWindowMs / 1000}s**`, inline: true },
              { name: "Commands", value: "`on` · `off` · `clear` · `threshold N` · `window N` · `action <kick|jail|ban|timeout>`", inline: false },
            )
            .setTimestamp()
          ],
        });
        return true;
      }
      saveState();
      return true;
    }
    case "agegate": {
      const sub = args[0]?.toLowerCase();
      if (sub === "on" || sub === "off") {
        gs.joinAgeGateEnabled = sub === "on";
        await safeReply(message, re(`Account age gate **${sub === "on" ? "enabled" : "disabled"}**.`));
      } else if (sub === "days") {
        const n = parseInt(args[1], 10);
        if (isNaN(n) || n < 1) { await safeReply(message, re(`Usage: \`${p}agegate days <n>\` (min 1)`)); return true; }
        gs.joinAgeGateDays = n;
        await safeReply(message, re(`Minimum account age set to **${n} day(s)**.`));
      } else {
        await safeReply(message, re(
          ` Age Gate: **${gs.joinAgeGateEnabled ? "enabled" : "disabled"}** · min age: **${gs.joinAgeGateDays} day(s)**\n` +
          `Subcommands: \`on\` · \`off\` · \`days N\``
        ));
      }
      saveState();
      return true;
    }
    case "banraiders": {
      const RAIDER_SCAN_WINDOW = 5 * 60 * 1000; // 5 minutes — wide enough to catch raiders after detection window closes
      const now = Date.now();
      await ensureMembersCache(guild);
      const raiders = [...guild.members.cache.values()].filter(
        (m) => !m.user.bot && m.joinedTimestamp !== null && (now - m.joinedTimestamp!) < RAIDER_SCAN_WINDOW
      );
      if (raiders.length === 0) {
        await safeReply(message, re(`No members joined within the last **5 minutes**.`));
        return true;
      }
      const reason = args.join(" ") || "Ban raiders — manual cleanup";
      await sendConfirm(
        message,
        ` This will **ban ${raiders.length} member(s)** who joined in the last **5 minutes**.\nReason: *${reason}*\n\nAre you sure?`,
        async () => {
          const prog = await message.channel.send(re(`Banning **${raiders.length}** raider(s)…`));
          let success = 0, failed = 0;
          await rQueue(raiders, async (m) => {
            try { await m.ban({ reason: `[Ban Raiders] ${reason} — by ${message.author.tag}` }); success++; }
            catch { failed++; }
          }, 600);
          raidModeActive.delete(guild.id);
          joinTracker.delete(guild.id);
          await prog.edit(re(`Banned **${success}** raider(s)${failed ? `, failed on **${failed}**` : ""}. Raid mode cleared.`));
        },
        0xcc2222
      );
      return true;
    }
    case "lockserver": {
      try {
        const current = guild.verificationLevel;
        gs.savedVerificationLevel = current;
        saveState();
        await guild.setVerificationLevel(4, `Server locked by ${message.author.tag}`); // 4 = VERY_HIGH
        await safeReply(message, {
          embeds: [new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle("Server Locked")
            .setDescription(`Verification level raised to **Highest** — members must have a verified phone number.\nUse \`${p}unlockserver\` to restore.`)
            .setTimestamp()
          ],
        });
      } catch {
        await safeReply(message, re("Couldn't change verification level. Check bot permissions."));
      }
      return true;
    }
    case "unlockserver": {
      try {
        if (gs.savedVerificationLevel === null) {
          await safeReply(message, re(`No saved verification level — run \`${p}lockserver\` first.`));
          return true;
        }
        const restoreTo = gs.savedVerificationLevel;
        await guild.setVerificationLevel(restoreTo as any, `Server unlocked by ${message.author.tag}`);
        gs.savedVerificationLevel = null;
        saveState();
        const levelNames = ["None", "Low", "Medium", "High", "Highest"];
        await safeReply(message, {
          embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle("Server Unlocked")
            .setDescription(`Verification level restored to **${levelNames[restoreTo] ?? "None"}**.`)
            .setTimestamp()
          ],
        });
      } catch {
        await safeReply(message, re("Couldn't change verification level. Check bot permissions."));
      }
      return true;
    }

    case "antialt": {
      const sub = args[0]?.toLowerCase();
      if (sub === "on") {
        gs.antiAltEnabled = true;
        saveState();
        await safeReply(message, re(`Anti-alt enabled — accounts younger than **${gs.antiAltDays} day(s)** will be kicked on join.`));
      } else if (sub === "off") {
        gs.antiAltEnabled = false;
        saveState();
        await safeReply(message, re("Anti-alt disabled."));
      } else if (sub === "days") {
        const n = parseInt(args[1]);
        if (!n || n < 1 || n > 365) {
          await safeReply(message, re(`Usage: \`${p}antialt days <1–365>\``));
          return true;
        }
        gs.antiAltDays = n;
        saveState();
        await safeReply(message, re(`Anti-alt threshold set to **${n} day(s)**. Accounts younger than this will be kicked on join.`));
      } else {
        await safeReply(message, { embeds: [new EmbedBuilder()
          .setColor(gs.antiAltEnabled ? 0x57f287 : 0x5865f2)
          .setTitle("Anti-Alt Account Protection")
          .addFields(
            { name: "Status", value: gs.antiAltEnabled ? " Enabled" : " Disabled", inline: true },
            { name: "Minimum Age", value: `**${gs.antiAltDays} day(s)**`, inline: true },
          )
          .setDescription(`\`${p}antialt on/off\` — toggle\n\`${p}antialt days <N>\` — set minimum account age`)
          .setTimestamp()
        ] });
      }
      return true;
    }
    case "capslockfilter": {
      const sub = args[0]?.toLowerCase();
      if (sub === "on") {
        gs.capsLockFilterEnabled = true;
        saveState();
        await safeReply(message, re(`Caps lock filter enabled — messages with more than **${gs.capsLockThreshold}%** caps (minimum 10 characters) will be deleted.`));
      } else if (sub === "off") {
        gs.capsLockFilterEnabled = false;
        saveState();
        await safeReply(message, re("Caps lock filter disabled."));
      } else if (sub === "threshold") {
        const n = parseInt(args[1]);
        if (!n || n < 10 || n > 100) {
          await safeReply(message, re(`Usage: \`${p}capslockfilter threshold <10–100>\` — percentage of uppercase letters to trigger (default: 70)`));
          return true;
        }
        gs.capsLockThreshold = n;
        saveState();
        await safeReply(message, re(`Caps lock filter threshold set to **${n}%**.`));
      } else {
        await safeReply(message, { embeds: [new EmbedBuilder()
          .setColor(gs.capsLockFilterEnabled ? 0x57f287 : 0x5865f2)
          .setTitle("Caps Lock Filter")
          .addFields(
            { name: "Status", value: gs.capsLockFilterEnabled ? " Enabled" : " Disabled", inline: true },
            { name: "Threshold", value: `**${gs.capsLockThreshold}%** uppercase`, inline: true },
          )
          .setDescription(`\`${p}capslockfilter on/off\` — toggle\n\`${p}capslockfilter threshold <N>\` — set caps percentage (default 70)`)
          .setTimestamp()
        ] });
      }
      return true;
    }

    default:
      return false;
  }
}
