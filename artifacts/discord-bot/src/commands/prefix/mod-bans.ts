import {
  EmbedBuilder, TextChannel, PermissionFlagsBits,
} from "discord.js";
import type { Message } from "discord.js";
import { isOwner } from "../../constants.js";
import { getGS, saveState, dmOwner } from "../../state.js";
import client from "../../client.js";
import {
  re, gch, fetchMember, rQueue, parseDuration,
  recordModAction, sendConfirm, auditReason,
  sendPaginated, checkHierarchy, modActionEmbed, safeReply,
} from "../../utils.js";
import { COLORS } from "../../colors.js";

export async function handleModBansCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "ban": {
      const userMention = args[0];
      const reason = args.slice(1).join(" ") || "No reason provided";
      const userId = userMention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}ban @user reason\``));
        return true;
      }
      try {
        const user = await message.client.users.fetch(userId);
        const targetMember = guild.members.cache.get(userId) ?? await fetchMember(guild, userId).catch(() => null);
        if (targetMember) {
          const hierr = checkHierarchy(guild, message.author.id, targetMember);
          if (hierr) { await safeReply(message, re(hierr)); return true; }
        }
        const isBooster = !!targetMember?.premiumSince;
        const doBan = async () => {
          try {
            await message.guild!.members.ban(userId, { reason: auditReason(reason, message.author.tag) });
            await message.channel.send(modActionEmbed({
              action: "Member Banned", emoji: "", color: 0xed4245,
              targetTag: user.tag, targetId: userId,
              targetAvatar: user.displayAvatarURL(),
              moderatorTag: message.author.tag, moderatorId: message.author.id,
              reason,
            }));
            recordModAction(message.guild!, userId, "ban", reason, message.author.tag, message.author.id).catch(() => {});
            dmOwner(`**Ban** in **${message.guild!.name}**\nUser: ${user.tag} (${userId})\nMod: ${message.author.tag}\nReason: ${reason}`).catch(() => {});
          } catch {
            await message.channel.send(re("Couldn't ban that user — check role hierarchy.")).catch(() => {});
          }
        };
        if (isBooster) {
          await sendConfirm(
            message,
            ` **${user.tag}** is currently boosting this server. Banning them will remove their boost.\nAre you sure?`,
            doBan,
            0xed4245,
          );
        } else {
          await doBan();
        }
      } catch {
        await safeReply(message, re("Couldn't ban that user — check role hierarchy."));
      }
      return true;
    }
    case "hardban": {
      const sub = args[0]?.toLowerCase();

      if (sub === "remove" || sub === "undo") {
        const targetId = args[1];
        if (!targetId) {
          await safeReply(message, re(`Usage: \`${p}hardban remove <userID>\``));
          return true;
        }
        gs.hardbannedUsers.delete(targetId);
        saveState();
        try {
          const bannedUser = await message.client.users.fetch(targetId).catch(() => null);
          await guild.bans.remove(targetId, `Hardban lifted by ${message.author.tag}`);
          await safeReply(message, modActionEmbed({
            action: "Hardban Removed", emoji: "", color: 0x57f287,
            targetTag: bannedUser?.tag ?? targetId, targetId,
            targetAvatar: bannedUser?.displayAvatarURL() ?? null,
            moderatorTag: message.author.tag, moderatorId: message.author.id,
            reason: "Hardban flag removed and ban lifted",
          }));
        } catch {
          await safeReply(message, re("Hardban flag removed. (User was not in the ban list or already unbanned.)"));
        }
        return true;
      }

      const userMention = args[0];
      const reason = args.slice(1).join(" ") || "No reason provided";
      const userId = userMention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}hardban @user reason\` — permanently bans and deletes all accessible messages.\nTo lift: \`${p}hardban remove <userID>\``));
        return true;
      }
      try {
        const user = await message.client.users.fetch(userId);
        const targetMember = guild.members.cache.get(userId) ?? await fetchMember(guild, userId).catch(() => null);
        if (targetMember) {
          const hierr = checkHierarchy(guild, message.author.id, targetMember);
          if (hierr) { await safeReply(message, re(hierr)); return true; }
        }
        await guild.members.ban(userId, {
          reason: auditReason(`[Hardban] ${reason}`, message.author.tag),
          deleteMessageSeconds: 604800,
        });
        gs.hardbannedUsers.add(userId);
        saveState();
        await safeReply(message, modActionEmbed({
          action: "Member Hardbanned", emoji: "", color: 0xed4245,
          targetTag: user.tag, targetId: userId,
          targetAvatar: user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason,
          note: `7 days of messages deleted · cannot be unbanned with \`${p}unban\``,
        }));
        recordModAction(guild, userId, "hardban", reason, message.author.tag, message.author.id).catch(() => {});
      } catch {
        await safeReply(message, re("Couldn't hardban that user — check role hierarchy."));
      }
      return true;
    }
    case "hackban": {
      const userId = args[0]?.replace(/[<@!>]/g, "");
      const reason = args.slice(1).join(" ") || "No reason provided";
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}hackban <userID> [reason]\` — bans a user by ID even if they're not in the server.`));
        return true;
      }
      try {
        const user = await message.client.users.fetch(userId);
        const targetMember = guild.members.cache.get(userId) ?? await fetchMember(guild, userId).catch(() => null);
        if (targetMember) {
          const hierr = checkHierarchy(guild, message.author.id, targetMember);
          if (hierr) { await safeReply(message, re(hierr)); return true; }
        }
        await guild.members.ban(userId, { reason: auditReason(reason, message.author.tag) });
        await safeReply(message, modActionEmbed({
          action: "Member Hackbanned", emoji: "", color: 0xed4245,
          targetTag: user.tag, targetId: userId,
          targetAvatar: user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason,
          note: "Banned by user ID — may not have been in the server.",
        }));
        recordModAction(guild, userId, "ban", `[hackban] ${reason}`, message.author.tag, message.author.id).catch(() => {});
        dmOwner(`**Hackban** in **${guild.name}**\nUser: ${user.tag} (${userId})\nMod: ${message.author.tag}\nReason: ${reason}`).catch(() => {});
      } catch {
        await safeReply(message, re("Couldn't ban that user — double-check the ID."));
      }
      return true;
    }
    case "softban": {
      const mention = args[0];
      const reason = args.slice(1).join(" ") || "No reason given";
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}softban @user reason\``));
        return true;
      }
      try {
        const user = await message.client.users.fetch(userId).catch(() => null);
        const targetMember = guild.members.cache.get(userId) ?? await fetchMember(guild, userId).catch(() => null);
        if (targetMember) {
          const hierr = checkHierarchy(guild, message.author.id, targetMember);
          if (hierr) { await safeReply(message, re(hierr)); return true; }
        }
        await message.guild!.members.ban(userId, {
          reason: auditReason(`[Softban] ${reason}`, message.author.tag),
          deleteMessageSeconds: 604800,
        });
        const unbanOk = await message.guild!.bans.remove(userId, "Softban — immediate unban").then(() => true).catch(() => false);
        if (!unbanOk) {
          await safeReply(message, re(`⚠️ The messages were deleted but the **immediate unban failed** — ${userId} may still be banned. Run \`${p}unban ${userId}\` to lift it manually.`));
          await recordModAction(message.guild!, userId, "softban", reason, message.author.tag, message.author.id);
          return true;
        }
        await safeReply(message, modActionEmbed({
          action: "Member Softbanned", emoji: "", color: 0xfee75c,
          targetTag: user?.tag ?? userId, targetId: userId,
          targetAvatar: user?.displayAvatarURL() ?? null,
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason,
          note: "Messages wiped — user is **not** permanently banned.",
        }));
        await recordModAction(message.guild!, userId, "softban", reason, message.author.tag, message.author.id);
      } catch {
        await safeReply(message, re("Couldn't softban that user."));
      }
      return true;
    }
    case "tempban": {
      const mention = args[0];
      const timeStr = args[1];
      const reason = args.slice(2).join(" ") || "No reason given";
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId || !timeStr) {
        await safeReply(message, re(`Usage: \`${p}tempban @user <time> reason\` — e.g. \`${p}tempban @user 1d rule breaking\``));
        return true;
      }
      const ms = parseDuration(timeStr);
      if (!ms) {
        await safeReply(message, re("Time format: `30s`, `10m`, `2h`, `1d`"));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        await member.ban({ reason: auditReason(`[Tempban ${timeStr}] ${reason}`, message.author.tag) });
        await safeReply(message, modActionEmbed({
          action: "Temporary Ban", emoji: "", color: 0xed4245,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          duration: timeStr, reason,
        }));
        await dmOwner(`**Tempban** in **${message.guild!.name}**\nUser: ${member.user.tag} (${userId})\nDuration: ${timeStr}\nMod: ${message.author.tag}\nReason: ${reason}`);
        gs.tempBans.set(userId, { unbanAt: Date.now() + ms, moderatorTag: message.author.tag });
        saveState();
        setTimeout(async () => {
          await message.guild!.bans.remove(userId, "Tempban expired").catch(() => {});
          gs.tempBans.delete(userId);
          saveState();
          console.log(`[tempban] Auto-unbanned ${userId} after ${timeStr}`);
        }, ms);
      } catch {
        await safeReply(message, re("Couldn't tempban that user."));
      }
      return true;
    }
    case "unban": {
      const userId = args[0];
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}unban <userID>\``));
        return true;
      }
      if (gs.hardbannedUsers.has(userId)) {
        await safeReply(message, re(`**${userId}** was hardbanned and cannot be unbanned with \`${p}unban\`.\nTo lift a hardban use \`${p}hardban remove ${userId}\` (Administrator only).`));
        return true;
      }
      try {
        const bannedUser = await message.client.users.fetch(userId).catch(() => null);
        await message.guild!.bans.remove(userId);
        await safeReply(message, modActionEmbed({
          action: "Member Unbanned", emoji: "", color: 0x57f287,
          targetTag: bannedUser?.tag ?? userId, targetId: userId,
          targetAvatar: bannedUser?.displayAvatarURL() ?? null,
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason: "Ban lifted",
        }));
      } catch {
        await safeReply(message, re("Couldn't unban — they may not be banned or the ID is wrong."));
      }
      return true;
    }
    case "unbanall": {
      const bans = await message.guild!.bans.fetch().catch(() => null);
      if (!bans || bans.size === 0) {
        await safeReply(message, re("No banned users to unban."));
        return true;
      }
      const capturedGuild = message.guild!;
      const capturedGs = gs;
      const capturedAuthor = message.author;
      const capturedChannel = message.channel;
      await sendConfirm(
        message,
        ` This will unban **${bans.size}** user(s).\nHardbanned users will be skipped.`,
        async () => {
          const freshBans = await capturedGuild.bans.fetch().catch(() => null);
          if (!freshBans) return;
          let success = 0, skipped = 0;
          await rQueue([...freshBans.keys()], async (uid) => {
            if (capturedGs.hardbannedUsers.has(uid)) { skipped++; return; }
            await capturedGuild.bans.remove(uid, `Mass unban by ${capturedAuthor.tag}`).then(() => success++).catch(() => skipped++);
          }, 600);
          await (capturedChannel as TextChannel).send(re(
            ` Unban complete — **${success}** unbanned${skipped > 0 ? `, **${skipped}** skipped (hardbanned or error)` : ""}.`
          )).catch(() => {});
        },
      );
      return true;
    }
    case "banlist": {
      try {
        const bans = await message.guild!.bans.fetch();
        if (bans.size === 0) {
          await safeReply(message, re("No banned users."));
          return true;
        }
        const entries = [...bans.values()].map((ban, i) =>
          `\`${i + 1}.\` **${ban.user.tag}** (\`${ban.user.id}\`)${ban.reason ? `\n↳ ${ban.reason}` : ""}`
        );
        await sendPaginated(message, `Ban List — ${bans.size} total`, entries, { perPage: 10, color: 0xed4245 });
      } catch {
        await safeReply(message, re("Couldn't fetch ban list."));
      }
      return true;
    }
    case "massban": {
      const mentionedUsers = [...message.mentions.users.values()];
      if (mentionedUsers.length === 0) {
        await safeReply(message, re(`Usage: \`${p}massban @user1 @user2 ... [reason]\` — mention at least one user.`));
        return true;
      }
      const reasonWords = args.filter((a) => !a.match(/^<@!?\d+>$/));
      const reason = reasonWords.join(" ") || "Mass ban";
      const actorMember = guild.members.cache.get(message.author.id) ?? await fetchMember(guild, message.author.id).catch(() => null);
      const actorHighest = actorMember?.roles.highest.position ?? 0;
      const botHighest = guild.members.me!.roles.highest.position;
      const progress = await safeReply(message, re(`Banning ${mentionedUsers.length} user(s)…`));
      let success = 0, failed = 0, skipped = 0;
      await rQueue(mentionedUsers, async (user) => {
        try {
          const targetMember = guild.members.cache.get(user.id) ?? await fetchMember(guild, user.id).catch(() => null);
          if (targetMember) {
            if (targetMember.roles.highest.position >= botHighest) { skipped++; return; }
            if (guild.ownerId !== message.author.id && !isOwner(message.author.id) && targetMember.roles.highest.position >= actorHighest) { skipped++; return; }
          }
          await guild.bans.create(user.id, { reason: `[Mass Ban] ${reason} — by ${message.author.tag}`, deleteMessageSeconds: 0 });
          success++;
        } catch {
          failed++;
        }
      }, 600);
      const resultLines = [` Banned: **${success}**`];
      if (skipped) resultLines.push(` Skipped: **${skipped}** (hierarchy)`);
      if (failed) resultLines.push(` Failed: **${failed}**`);
      await progress.edit({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle("Mass Ban Complete")
          .setDescription(resultLines.join("\n"))
          .addFields({ name: "Reason", value: reason })
          .setTimestamp(),
      ]});
      return true;
    }
    case "hardbans": {
      if (!gs.hardbannedUsers.size) {
        await safeReply(message, re("No hard-banned users in this server."));
        return true;
      }
      const lines: string[] = [];
      await rQueue([...gs.hardbannedUsers], async (uid) => {
        const u = await client.users.fetch(uid).catch(() => null);
        lines.push(`**${u?.tag ?? "Unknown User"}** (\`${uid}\`)`);
      }, 200);
      await sendPaginated(message, ` Hard-Banned Users (${lines.length})`, lines, { color: 0xed4245 });
      return true;
    }
    default:
      return false;
  }
}
