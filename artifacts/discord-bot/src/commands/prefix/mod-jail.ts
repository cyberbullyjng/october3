import {
  EmbedBuilder, PermissionFlagsBits,
} from "discord.js";
import type { Message } from "discord.js";
import { getGS, saveState, jailTimers } from "../../state.js";
import client from "../../client.js";
import {
  re, gch, fetchMember, parseDuration,
  recordModAction, checkHierarchy, modActionEmbed, safeReply,
  setupJailSystem, sendPaginated, ensureMembersCache,
} from "../../utils.js";
import { COLORS } from "../../colors.js";

export async function handleModJailCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;
  const jailedRole = gs.jailRoleId ? guild.roles.cache.get(gs.jailRoleId) ?? null : null;
  const jailChannel = gch(guild, gs.jailChannelId);

  switch (cmd) {
    case "jailsetup":
    case "setupjail": {
      const actorMember = await fetchMember(guild, message.author.id).catch(() => null);
      if (!actorMember?.permissions.has(PermissionFlagsBits.ManageChannels) || !actorMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await safeReply(message, re("You need **Manage Channels** and **Manage Roles** to set up jail."));
        return true;
      }
      await safeReply(message, re("Setting up jail — creating/fixing the Jailed role, Jail category, and #jail channel..."));
      try {
        await setupJailSystem(guild);
        const freshGs = getGS(guild.id);
        await safeReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.success)
              .setTitle("Jail Setup Complete")
              .setDescription("The jail system is ready.")
              .addFields(
                { name: "Jailed Role", value: freshGs.jailRoleId ? `<@&${freshGs.jailRoleId}>` : "Created", inline: true },
                { name: "Jail Channel", value: freshGs.jailChannelId ? `<#${freshGs.jailChannelId}>` : "Created", inline: true },
                { name: "Use", value: `\`${p}jail @user [duration] [reason]\`\n\`${p}unjail @user\``, inline: false },
              )
              .setTimestamp(),
          ],
        });
      } catch (err) {
        console.error("[jailsetup] error:", err);
        await safeReply(message, re("Jail setup failed — make sure my role has Manage Channels and Manage Roles, and is above the Jailed role."));
      }
      return true;
    }
    case "jail": {
      if (args[0]?.toLowerCase() === "setup") {
        const actorMember = await fetchMember(guild, message.author.id).catch(() => null);
        if (!actorMember?.permissions.has(PermissionFlagsBits.ManageChannels) || !actorMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
          await safeReply(message, re("You need **Manage Channels** and **Manage Roles** to set up jail."));
          return true;
        }
        await safeReply(message, re("Setting up jail — creating/fixing the Jailed role, Jail category, and #jail channel..."));
        try {
          await setupJailSystem(guild);
          const freshGs = getGS(guild.id);
          await safeReply(message, re(`Jail setup complete: ${freshGs.jailRoleId ? `<@&${freshGs.jailRoleId}>` : "**Jailed** role"} + ${freshGs.jailChannelId ? `<#${freshGs.jailChannelId}>` : "**#jail** channel"}.`, 0x57f287));
        } catch (err) {
          console.error("[jail setup] error:", err);
          await safeReply(message, re("Jail setup failed — make sure my role has Manage Channels and Manage Roles, and is above the Jailed role."));
        }
        return true;
      }
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}jail @user [duration] [reason]\` — e.g. \`${p}jail @user 1h spamming\``));
        return true;
      }
      if (!jailedRole || !jailChannel) {
        await safeReply(message, re("Jail system isn't set up yet — try again in a moment."));
        return true;
      }
      let jailDurationMs: number | null = null;
      let reasonStartIdx = 1;
      if (args[1] && parseDuration(args[1])) {
        jailDurationMs = parseDuration(args[1]);
        reasonStartIdx = 2;
      }
      const jailReason = args.slice(reasonStartIdx).join(" ") || "Jailed";
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        if (member.roles.cache.has(jailedRole.id)) {
          await safeReply(message, re("That user is already jailed."));
          return true;
        }
        const savedRoles = member.roles.cache
          .filter((r) => r.id !== message.guild!.roles.everyone.id)
          .map((r) => r.id);
        gs.jailedMembers.set(userId, savedRoles);
        const managedRoleIds = member.roles.cache.filter((r) => r.managed).map((r) => r.id);
        await member.roles.set([jailedRole.id, ...managedRoleIds]);
        const durationStr = jailDurationMs ? ` for ${args[1]}` : "";
        await jailChannel.send({
          embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(` ${member} — you have been jailed${durationStr}. A moderator will review your case shortly.`)],
        });
        await safeReply(message, modActionEmbed({
          action: "Member Jailed", emoji: "", color: 0xed4245,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason: jailDurationMs ? `${jailReason} (${args[1]})` : jailReason,
        }));
        await recordModAction(message.guild!, userId, "jail", jailDurationMs ? `${jailReason} (${args[1]})` : jailReason, message.author.tag, message.author.id);
        if (jailDurationMs) {
          const guildTimers = jailTimers.get(message.guild!.id) ?? new Map();
          const existing = guildTimers.get(userId);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(async () => {
            guildTimers.delete(userId);
            try {
              const g = client.guilds.cache.get(message.guild!.id);
              if (!g) return;
              const gsT = getGS(g.id);
              const m = await fetchMember(g, userId).catch(() => null);
              if (!m) return;
              if (!m.roles.cache.has(jailedRole!.id)) return;
              const saved = gsT.jailedMembers.get(userId) ?? [];
              gsT.jailedMembers.delete(userId);
              gsT.jailExpiry.delete(userId);
              const valid = saved.filter((id) => g.roles.cache.has(id));
              const currentRoleIds = [...m.roles.cache.keys()].filter((id) => id !== jailedRole!.id);
              const combined = [...new Set([...currentRoleIds, ...valid])];
              await m.roles.set(combined).catch(() => {});
              const jch = gch(g, gsT.jailChannelId);
              if (jch) await jch.send({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(` ${m} — your temporary jail has expired. Welcome back.`)] }).catch(() => {});
              await recordModAction(g, userId, "unjail", `Auto-unjail after ${args[1]}`, "AutoMod");
              saveState();
            } catch {}
          }, jailDurationMs);
          guildTimers.set(userId, timer);
          jailTimers.set(message.guild!.id, guildTimers);
          gs.jailExpiry.set(userId, Date.now() + jailDurationMs);
          saveState();
        }
      } catch (err) {
        console.error("[jail] error:", err);
        await safeReply(message, re("Couldn't jail that user."));
      }
      return true;
    }
    case "unjail": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}unjail @user\``));
        return true;
      }
      if (!jailedRole) {
        await safeReply(message, re("Jail system isn't set up yet."));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        if (!member.roles.cache.has(jailedRole.id)) {
          await safeReply(message, re("That user is not jailed."));
          return true;
        }
        const savedRoles = gs.jailedMembers.get(userId) ?? [];
        gs.jailedMembers.delete(userId);
        gs.jailExpiry.delete(userId);
        saveState();
        // Keep roles the member gained *during* jail, restore pre-jail roles,
        // and strip only the jail role — don't wipe roles like Server Booster.
        const savedValid = savedRoles.filter((id) => message.guild!.roles.cache.has(id));
        const currentRoleIds = [...member.roles.cache.keys()].filter((id) => id !== jailedRole!.id);
        const combined = [...new Set([...currentRoleIds, ...savedValid])];
        await member.roles.set(combined);
        await jailChannel?.send({
          embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(` ${member} — you have been released from jail. Welcome back.`)],
        });
        await safeReply(message, modActionEmbed({
          action: "Member Unjailed", emoji: "", color: 0x57f287,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason: "Released from jail — roles restored",
        }));
      } catch (err) {
        console.error("[unjail] error:", err);
        await safeReply(message, re("Couldn't unjail that user."));
      }
      return true;
    }
    case "jaillist": {
      if (gs.jailedMembers.size === 0) {
        await safeReply(message, re("Nobody is currently jailed."));
        return true;
      }
      await ensureMembersCache(guild);
      const items: string[] = [];
      for (const [userId] of gs.jailedMembers) {
        const m = guild.members.cache.get(userId);
        items.push(m ? `${m} \`${m.user.tag}\`` : `Unknown user (\`${userId}\`)`);
      }
      await sendPaginated(message, ` Currently Jailed (${items.length})`, items, { perPage: 15, color: 0xcc2222 });
      return true;
    }
    default:
      return false;
  }
}
