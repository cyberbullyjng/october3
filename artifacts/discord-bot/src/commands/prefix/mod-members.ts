import {
  EmbedBuilder, PermissionFlagsBits,
} from "discord.js";
import type { Message } from "discord.js";
import { ELEVATED_PERMS, DEHOIST_RE, isOwner } from "../../constants.js";
import { getGS, saveState, dmOwner } from "../../state.js";
import client from "../../client.js";
import {
  re, fetchMember, rQueue,
  recordModAction, sendConfirm, auditReason,
  sendPaginated, checkHierarchy, modActionEmbed, safeReply,
  ensureMembersCache,
} from "../../utils.js";
import { COLORS } from "../../colors.js";

export async function handleModMembersCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "kick": {
      const userMention = args[0];
      const reason = args.slice(1).join(" ") || "No reason provided";
      const userId = userMention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}kick @user reason\``));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        const isBooster = !!member.premiumSince;
        const doKick = async () => {
          try {
            await member.kick(auditReason(reason, message.author.tag));
            await safeReply(message, modActionEmbed({
              action: "Member Kicked", emoji: "", color: 0xed4245,
              targetTag: member.user.tag, targetId: userId,
              targetAvatar: member.user.displayAvatarURL(),
              moderatorTag: message.author.tag, moderatorId: message.author.id,
              reason,
            }));
            recordModAction(message.guild!, userId, "kick", reason, message.author.tag, message.author.id).catch(() => {});
            dmOwner(`**Kick** in **${message.guild!.name}**\nUser: ${member.user.tag} (${userId})\nMod: ${message.author.tag}\nReason: ${reason}`).catch(() => {});
          } catch {
            await safeReply(message, re("Couldn't kick that user — check role hierarchy.")).catch(() => {});
          }
        };
        if (isBooster) {
          await sendConfirm(
            message,
            ` **${member.user.tag}** is currently boosting this server. Kicking them will remove their boost.\nAre you sure?`,
            doKick,
            0xed4245,
          );
        } else {
          await doKick();
        }
      } catch {
        await safeReply(message, re("Couldn't kick that user — check role hierarchy."));
      }
      return true;
    }
    case "history": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}history @user\``));
        return true;
      }
      const history = gs.modHistory.get(userId) ?? [];
      if (history.length === 0) {
        await safeReply(message, re("No mod history for that user."));
        return true;
      }
      const items = history.map((a) => {
        const caseStr = a.caseId ? `[#${a.caseId}] ` : "";
        return `${caseStr}\`${a.type.toUpperCase()}\` — ${a.reason} by **${a.moderator}** <t:${Math.floor(a.timestamp / 1000)}:R>`;
      });
      await sendPaginated(message, ` Mod History for <@${userId}> (${history.length})`, items, { perPage: 10, color: 0xed4245 });
      return true;
    }
    case "case": {
      const subArg = args[0];
      const caseNum = parseInt(subArg);
      if (isNaN(caseNum)) {
        await safeReply(message, re(`Usage: \`${p}case <id>\` or \`${p}case <id> reason <new reason>\``));
        return true;
      }
      const targetUserId = gs.caseIndex.get(caseNum);
      if (!targetUserId) {
        await safeReply(message, re(`Case #${caseNum} not found.`));
        return true;
      }
      const history = gs.modHistory.get(targetUserId) ?? [];
      const action = history.find((a) => a.caseId === caseNum);
      if (!action) {
        await safeReply(message, re(`Case #${caseNum} not found.`));
        return true;
      }
      if (args[1]?.toLowerCase() === "reason") {
        const newReason = args.slice(2).join(" ");
        if (!newReason) {
          await safeReply(message, re(`Usage: \`${p}case <id> reason <new reason>\``));
          return true;
        }
        action.reason = newReason;
        gs.modHistory.set(targetUserId, history);
        saveState();
        await safeReply(message, re(`Case #${caseNum} reason updated to: **${newReason}**`));
        return true;
      }
      const colors: Record<string, number> = {
        warn: 0xfee75c, kick: 0xff7733, ban: 0xed4245,
        tempban: 0xed4245, softban: 0xed4245, mute: 0x5865f2,
        jail: 0x808080, note: 0x5865f2, hardban: 0xed4245,
      };
      await safeReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(colors[action.type] ?? 0x5865f2)
            .setTitle(`Case #${caseNum} — ${action.type.charAt(0).toUpperCase() + action.type.slice(1)}`)
            .addFields(
              { name: "User", value: `<@${targetUserId}> (${targetUserId})`, inline: true },
              { name: "Moderator", value: action.moderator, inline: true },
              { name: "Reason", value: action.reason },
              { name: "Date", value: `<t:${Math.floor(action.timestamp / 1000)}:F>`, inline: true },
            )
            .setFooter({ text: `Use !case ${caseNum} reason <text> to edit the reason` })
            .setTimestamp(action.timestamp),
        ],
      });
      return true;
    }
    case "stripstaff": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}stripstaff @user\``));
        return true;
      }
      if (isOwner(userId)) {
        await safeReply(message, re("Cannot strip the owner."));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        const botHighestPos = message.guild!.members.me!.roles.highest.position;
        const rolesToStrip = member.roles.cache.filter(
          (r) =>
            r.id !== message.guild!.roles.everyone.id &&
            r.managed === false &&
            r.id !== gs.staffBlacklistRoleId &&
            r.position < botHighestPos,
        );
        if (rolesToStrip.size === 0) {
          await safeReply(message, re("That user has no strippable roles (roles may all be above the bot in hierarchy, managed, or protected)."));
          return true;
        }
        gs.strippedStaff.set(userId, rolesToStrip.map((r) => r.id));
        let stripped = 0, failed = 0;
        await rQueue([...rolesToStrip.values()], async (role) => {
          try { await member.roles.remove(role, auditReason("Staff stripped", message.author.tag)); stripped++; }
          catch { failed++; }
        }, 300);
        saveState();
        await safeReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle("Staff Stripped")
              .addFields(
                { name: "User", value: `${member.user.tag}`, inline: true },
                {
                  name: "Roles Removed",
                  value: rolesToStrip.map((r) => `<@&${r.id}>`).join(", ").slice(0, 1024) || "None",
                },
                ...(failed > 0 ? [{ name: "Failed", value: `${failed} role(s) could not be removed (hierarchy issue).` }] : []),
              )
              .setFooter({ text: "Use !restorestaff @user to give roles back" })
              .setTimestamp(),
          ],
        });
        await recordModAction(message.guild!, userId, "stripstaff", `${stripped} role(s) removed`, message.author.tag, message.author.id);
      } catch (err) {
        await safeReply(message, re("Couldn't strip that user — check the bot's role hierarchy."));
        console.error("[stripstaff] error:", err);
      }
      return true;
    }
    case "restorestaff": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}restorestaff @user\``));
        return true;
      }
      const saved = gs.strippedStaff.get(userId);
      if (!saved?.length) {
        await safeReply(message, re("No saved roles for that user. Either they were never stripped or roles were already restored."));
        return true;
      }
      const member = await fetchMember(message.guild!, userId).catch(() => null);
      if (!member) {
        await safeReply(message, re("That user is no longer in this server. Their role list is still saved — run this command again once they rejoin."));
        return true;
      }
      try {
        const isBlacklisted = gs.staffBlacklist.has(userId);
        const rolesToRestore = saved.filter((roleId) => {
          if (!isBlacklisted) return true;
          const role = message.guild!.roles.cache.get(roleId);
          return role ? (role.permissions.bitfield & ELEVATED_PERMS) === 0n : false;
        });
        const blockedCount = saved.length - rolesToRestore.length;
        let restored = 0, failed = 0;
        await rQueue(rolesToRestore, async (roleId) => {
          try { await member.roles.add(roleId, auditReason("Staff restored", message.author.tag)); restored++; }
          catch { failed++; }
        }, 300);
        if (restored > 0 || blockedCount === saved.length) {
          gs.strippedStaff.delete(userId);
          saveState();
        }
        const embed = new EmbedBuilder()
          .setColor(restored > 0 ? 0x57f287 : 0xed4245)
          .setTitle("Staff Restored")
          .addFields(
            { name: "User", value: `${member.user.tag}`, inline: true },
            { name: "Roles Restored", value: `${restored}`, inline: true },
            ...(failed > 0 ? [{ name: "Failed", value: `${failed} role(s) couldn't be applied — the bot's role may be too low in hierarchy. Move the bot's role higher and try again.`, inline: false }] : []),
            ...(blockedCount > 0 ? [{ name: "Sblacklist Blocked", value: `${blockedCount} elevated role(s) were skipped — **${member.user.tag}** is on the staff blacklist. Use \`${p}sblacklist remove\` first if you want to restore those.` }] : []),
          )
          .setTimestamp();
        await safeReply(message, { embeds: [embed] });
      } catch (err) {
        await safeReply(message, re(`Something went wrong while restoring roles. Check that the bot has Manage Roles permission.`));
        console.error("[restorestaff] error:", err);
      }
      return true;
    }
    case "voicekick": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}voicekick @user\``));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        if (!member.voice.channel) {
          await safeReply(message, re("That user isn't in a voice channel."));
          return true;
        }
        const vcOwnerId = gs.vcChannelOwners.get(member.voice.channel.id);
        const actorMember = guild.members.cache.get(message.author.id) ?? await fetchMember(guild, message.author.id).catch(() => null);
        const isVcOwner = vcOwnerId === message.author.id;
        const hasMovePerm = actorMember?.permissions.has(PermissionFlagsBits.MoveMembers) ?? false;
        if (!isVcOwner && !hasMovePerm) {
          await safeReply(message, re("Only the voice channel owner or a member with **Move Members** permission can use this command."));
          return true;
        }
        await member.voice.disconnect();
        await safeReply(message, re(`**${member.user.tag}** has been disconnected from voice.`));
      } catch {
        await safeReply(message, re("Couldn't disconnect that user."));
      }
      return true;
    }
    case "dehoist": {
      await ensureMembersCache(guild);
      const toRename = guild.members.cache.filter(
        (m) => !m.user.bot && DEHOIST_RE.test(m.displayName),
      );
      if (toRename.size === 0) {
        await safeReply(message, re("No hoisted members found."));
        return true;
      }
      const status = await safeReply(message, re(`Dehoisting ${toRename.size} members...`));
      let done = 0;
      for (const [, m] of toRename) {
        const cleaned = m.displayName.replace(/^[!-/:-@[-`{-~]+/, "").trim() || "dehoisted";
        await m.setNickname(cleaned).catch(() => {});
        done++;
        await new Promise((r) => setTimeout(r, 300));
      }
      await status.edit(re(`Dehoisted **${done}** members.`));
      return true;
    }
    case "note": {
      const mention = args[0];
      const text = args.slice(1).join(" ");
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId || !text) {
        await safeReply(message, re(`Usage: \`${p}note @user text\``));
        return true;
      }
      const notes = gs.modNotes.get(userId) ?? [];
      notes.push({ text, timestamp: Date.now() });
      gs.modNotes.set(userId, notes);
      saveState();
      await safeReply(message, re(`Note added for <@${userId}>.`));
      return true;
    }
    case "notes": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}notes @user\``));
        return true;
      }
      const notes = gs.modNotes.get(userId) ?? [];
      if (notes.length === 0) {
        await safeReply(message, re("No notes for that user."));
        return true;
      }
      const items = notes.map((n, i) => `**${i + 1}.** ${n.text} — <t:${Math.floor(n.timestamp / 1000)}:R>`);
      await sendPaginated(message, ` Mod Notes for <@${userId}> (${notes.length})`, items, { perPage: 10, color: 0xfee75c });
      return true;
    }
    case "clearnotes": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}clearnotes @user\``));
        return true;
      }
      gs.modNotes.delete(userId);
      saveState();
      await safeReply(message, re("Notes cleared."));
      return true;
    }
    case "warn": {
      if (args[0]?.toLowerCase() === "remove") {
        const idx = parseInt(args[1]);
        const mention = args[2];
        const userId = mention?.replace(/[<@!>]/g, "");
        if (!userId || isNaN(idx) || idx < 1) {
          await safeReply(message, re(`Usage: \`${p}warn remove <#> @user\`\nThe \`<#>\` is the warning number shown in \`${p}warnings @user\`.`));
          return true;
        }
        const userWarns = gs.warnings.get(userId) ?? [];
        if (idx > userWarns.length) {
          await safeReply(message, re(`That user only has **${userWarns.length}** warning(s).`));
          return true;
        }
        const removed = userWarns.splice(idx - 1, 1)[0];
        if (userWarns.length === 0) gs.warnings.delete(userId);
        else gs.warnings.set(userId, userWarns);
        saveState();
        await safeReply(message, re(`Warning #${idx} removed. *(was: "${removed.reason}")* They now have **${userWarns.length}** warning(s).`));
        return true;
      }
      const mention = args[0];
      const reason = args.slice(1).join(" ") || "No reason given";
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}warn @user reason\` · \`${p}warn remove <#> @user\``));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        const userWarns = gs.warnings.get(userId) ?? [];
        userWarns.push({ reason, timestamp: Date.now() });
        gs.warnings.set(userId, userWarns);
        saveState();
        const kickAt = gs.warnKickThreshold > 0 ? gs.warnKickThreshold : null;
        const banAt  = gs.warnBanThreshold  > 0 ? gs.warnBanThreshold  : null;
        const noteStr = kickAt || banAt
          ? `Warning **${userWarns.length}**${kickAt ? ` — auto-kick at **${kickAt}**` : ""}${banAt ? `, auto-ban at **${banAt}**` : ""}`
          : `Warning **${userWarns.length}** — no auto-actions configured`;
        await safeReply(message, modActionEmbed({
          action: "Member Warned", emoji: "", color: 0xfee75c,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason,
          note: noteStr,
        }));
        recordModAction(message.guild!, userId, "warn", reason, message.author.tag, message.author.id).catch(() => {});
        member.user.send(
          `⚠️ You have been warned in **${message.guild!.name}**.\n**Reason:** ${reason}`
        ).catch(() => {});
        if (banAt && userWarns.length >= banAt) {
          await member.ban({ reason: `Auto-ban: reached ${banAt} warnings` }).catch(() => {});
          await message.channel.send({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle("Auto-Ban")
              .setDescription(`**${member.user.tag}** was automatically banned for reaching **${banAt} warnings**.`)
              .setTimestamp()],
          });
          await recordModAction(message.guild!, userId, "ban", `Auto-ban: ${banAt} warnings`, "AutoMod");
          await dmOwner(`**Auto-Ban** in **${message.guild!.name}**\nUser: ${member.user.tag} (${userId})\nReason: Reached ${banAt} warnings`);
        } else if (kickAt && userWarns.length >= kickAt) {
          await member.kick(`Auto-kick: reached ${kickAt} warnings`).catch(() => {});
          await message.channel.send({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle("Auto-Kick")
              .setDescription(`**${member.user.tag}** was automatically kicked for reaching **${kickAt} warnings**.`)
              .setTimestamp()],
          });
          await recordModAction(message.guild!, userId, "kick", `Auto-kick: ${kickAt} warnings`, "AutoMod");
          await dmOwner(`**Auto-Kick** in **${message.guild!.name}**\nUser: ${member.user.tag} (${userId})\nReason: Reached ${kickAt} warnings`);
        }
      } catch {
        await safeReply(message, re("Couldn't warn that user."));
      }
      return true;
    }
    case "warnings": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}warnings @user\``));
        return true;
      }
      const userWarns = gs.warnings.get(userId) ?? [];
      if (userWarns.length === 0) {
        await safeReply(message, re("That user has no warnings."));
        return true;
      }
      try {
        const user = await message.client.users.fetch(userId);
        const items = userWarns.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(w.timestamp / 1000)}:R>`);
        await sendPaginated(message, ` Warnings for ${user.tag} (${userWarns.length})`, items, { perPage: 10, color: 0xfee75c });
      } catch {
        await safeReply(message, re("Couldn't fetch that user."));
      }
      return true;
    }
    case "clearwarns": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}clearwarns @user\``));
        return true;
      }
      gs.warnings.delete(userId);
      saveState();
      await safeReply(message, re("Warnings cleared."));
      return true;
    }
    case "warnthreshold": {
      const action = args[0]?.toLowerCase();
      const valArg = args[1]?.toLowerCase();
      if (!action || !valArg || (action !== "kick" && action !== "ban")) {
        await safeReply(message, re(
          `**Warn Thresholds:**\n` +
          `Auto-kick at: **${gs.warnKickThreshold > 0 ? gs.warnKickThreshold : "disabled"}** warnings\n` +
          `Auto-ban at: **${gs.warnBanThreshold > 0 ? gs.warnBanThreshold : "disabled"}** warnings\n\n` +
          `Usage: \`${p}warnthreshold kick <N|off>\` · \`${p}warnthreshold ban <N|off>\``
        ));
        return true;
      }
      const val = valArg === "off" ? 0 : parseInt(valArg);
      if (isNaN(val) || val < 0) {
        await safeReply(message, re("Provide a number (1–20) or `off`."));
        return true;
      }
      if (action === "kick") {
        gs.warnKickThreshold = val;
        await safeReply(message, re(val === 0 ? " Auto-kick on warns **disabled**." : ` Members will be auto-kicked at **${val}** warnings.`));
      } else {
        gs.warnBanThreshold = val;
        await safeReply(message, re(val === 0 ? " Auto-ban on warns **disabled**." : ` Members will be auto-banned at **${val}** warnings.`));
      }
      saveState();
      return true;
    }
    case "clearhistory": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}clearhistory @user\``));
        return true;
      }
      gs.modHistory.delete(userId);
      gs.caseIndex.forEach((uid, caseId) => { if (uid === userId) gs.caseIndex.delete(caseId); });
      saveState();
      await safeReply(message, re("Mod history cleared for that user."));
      return true;
    }
    case "modstats": {
      const mention = args[0];
      const targetUser = mention
        ? await client.users.fetch(mention.replace(/[<@!>]/g, "")).catch(() => null)
        : message.author;
      if (!targetUser) {
        await safeReply(message, re("Couldn't find that user."));
        return true;
      }
      const counts: Record<string, number> = {};
      let total = 0;
      for (const actions of gs.modHistory.values()) {
        for (const a of actions) {
          if (a.moderator === targetUser.tag || (a as any).moderatorId === targetUser.id) {
            counts[a.type] = (counts[a.type] ?? 0) + 1;
            total++;
          }
        }
      }
      if (total === 0) {
        await safeReply(message, re(`No recorded mod actions for **${targetUser.tag}** in this server.`));
        return true;
      }
      const lines = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, n]) => `**${type}**: ${n}`);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`Mod Stats — ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(lines.join("\n"))
        .setFooter({ text: `Total actions: ${total}` })
        .setTimestamp();
      await safeReply(message, { embeds: [embed] });
      return true;
    }
    case "warnlb": {
      if (!gs.warnings.size) {
        await safeReply(message, re("No warnings recorded in this server."));
        return true;
      }
      const entries = [...gs.warnings.entries()]
        .map(([uid, warns]) => ({ uid, count: warns.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 25);
      const lines: string[] = [];
      for (let i = 0; i < entries.length; i++) {
        const { uid, count } = entries[i];
        const u = await client.users.fetch(uid).catch(() => null);
        const tag = u?.tag ?? `Unknown (${uid})`;
        lines.push(`**${i + 1}.** ${tag} — **${count}** warning${count === 1 ? "" : "s"}`);
        await new Promise((r) => setTimeout(r, 200));
      }
      await sendPaginated(message, " Most Warned Members", lines, { color: 0xfee75c });
      return true;
    }
    case "forcenick": {
      const mention = args[0];
      const nick = args.slice(1).join(" ");
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId || !nick) {
        await safeReply(message, re(`Usage: \`${p}forcenick @user <nickname>\`\nUse \`${p}unforcenick @user\` to remove.`));
        return true;
      }
      if (nick.length > 32) {
        await safeReply(message, re("Nickname must be 32 characters or fewer."));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        await member.setNickname(nick, `Force nickname by ${message.author.tag}`);
        gs.forcedNicknames.set(userId, nick);
        saveState();
        await safeReply(message, modActionEmbed({
          action: "Nickname Forced", emoji: "📛", color: 0x5865f2,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason: `Locked to: **${nick}**`,
          note: "User cannot change their nickname while this is active.",
        }));
      } catch {
        await safeReply(message, re("Couldn't force that nickname — check my role position."));
      }
      return true;
    }
    case "unforcenick": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}unforcenick @user\``));
        return true;
      }
      if (!gs.forcedNicknames.has(userId)) {
        await safeReply(message, re("That user doesn't have a forced nickname."));
        return true;
      }
      const oldNick = gs.forcedNicknames.get(userId)!;
      gs.forcedNicknames.delete(userId);
      saveState();
      const member = await fetchMember(message.guild!, userId).catch(() => null);
      if (member) {
        await member.setNickname(null, `Force nickname removed by ${message.author.tag}`).catch(() => {});
      }
      await safeReply(message, re(`Forced nickname \`${oldNick}\` removed — <@${userId}> can now change their nickname freely.`));
      return true;
    }
    case "forcenicks":
    case "listforcenicks": {
      if (gs.forcedNicknames.size === 0) {
        await safeReply(message, re("No forced nicknames active in this server."));
        return true;
      }
      const lines = [...gs.forcedNicknames.entries()].map(([id, nick]) => `<@${id}> → \`${nick}\``);
      await sendPaginated(message, `📛 Forced Nicknames (${lines.length})`, lines, { color: 0x5865f2, perPage: 15 });
      return true;
    }
    case "striphumans": {
      if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await safeReply(message, re("You need **Administrator** permission to use this command."));
        return true;
      }
      await ensureMembersCache(message.guild!);
      const botHighestPos = message.guild!.members.me!.roles.highest.position;
      const humans = message.guild!.members.cache.filter(m =>
        !m.user.bot && !isOwner(m.id) && m.id !== message.author.id &&
        m.roles.highest.position < botHighestPos
      );
      type Victim = { member: import("discord.js").GuildMember; roles: import("discord.js").Role[] };
      const victims: Victim[] = [];
      for (const [, m] of humans) {
        const elevatedRoles = m.roles.cache.filter(r =>
          r.id !== message.guild!.roles.everyone.id &&
          !r.managed &&
          r.position < botHighestPos &&
          (r.permissions.bitfield & ELEVATED_PERMS) !== 0n
        );
        if (elevatedRoles.size > 0) victims.push({ member: m, roles: [...elevatedRoles.values()] });
      }
      if (victims.length === 0) {
        await safeReply(message, re("No human members below the bot have roles with moderation permissions. Nothing to strip."));
        return true;
      }
      const totalRoles = victims.reduce((n, v) => n + v.roles.length, 0);
      await sendConfirm(
        message,
        ` This will strip **${totalRoles}** moderation-permission role(s) from **${victims.length}** member(s) below the bot.\n\n**Affected members:** ${victims.slice(0, 10).map(v => `<@${v.member.id}>`).join(", ")}${victims.length > 10 ? ` + ${victims.length - 10} more` : ""}\n\nThis action is **not** automatically reversible. Proceed?`,
        async () => {
          let stripped = 0, failed = 0, membersAffected = 0;
          const pairs: { member: import("discord.js").GuildMember; role: import("discord.js").Role }[] = [];
          for (const { member, roles } of victims) {
            for (const role of roles) pairs.push({ member, role });
          }
          const strippedMembers = new Set<string>();
          await rQueue(pairs, async ({ member, role }) => {
            try { await member.roles.remove(role, `striphumans by ${message.author.tag}`); stripped++; strippedMembers.add(member.id); }
            catch { failed++; }
          }, 300);
          membersAffected = strippedMembers.size;
          await message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.error)
                .setTitle("Strip Humans Complete")
                .addFields(
                  { name: "Members Affected", value: `${membersAffected}`, inline: true },
                  { name: "Roles Stripped", value: `${stripped}`, inline: true },
                  ...(failed > 0 ? [{ name: "Failed", value: `${failed} role(s) could not be removed (hierarchy or permission issue).`, inline: true }] : []),
                )
                .setFooter({ text: `Requested by ${message.author.tag}` })
                .setTimestamp(),
            ],
          });
          await recordModAction(message.guild!, "0", "striphumans", `${stripped} mod role(s) stripped from ${membersAffected} member(s)`, message.author.tag, message.author.id);
        },
        0xed4245,
      );
      return true;
    }
    default:
      return false;
  }
}
