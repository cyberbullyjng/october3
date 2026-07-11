import {
  EmbedBuilder,
} from "discord.js";
import type { Message } from "discord.js";
import { getGS } from "../../state.js";
import {
  re, fetchMember, rQueue,
  recordModAction, auditReason,
  sendPaginated, checkHierarchy, modActionEmbed, safeReply,
  ensureMembersCache,
} from "../../utils.js";
import { COLORS } from "../../colors.js";

export async function handleModMutesCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "mute":
    case "timeout": {
      const mention = args[0];
      const explicitTime = !!args[1]?.match(/^(\d+)(s|m|h|d)$/i);
      const timeStr = explicitTime ? args[1] : "5m";
      const reason = args.slice(explicitTime ? 2 : 1).join(" ") || "No reason given";
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId || !timeStr) {
        await safeReply(message, re(`Usage: \`${p}${cmd} @user <time> reason\` — e.g. \`${p}${cmd} @user 10m spamming\``));
        return true;
      }
      const match = timeStr.match(/^(\d+)(s|m|h|d)$/i);
      if (!match) {
        await safeReply(message, re("Time format: `30s`, `10m`, `2h`, `1d`"));
        return true;
      }
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const ms =
        unit === "s" ? amount * 1000
        : unit === "m" ? amount * 60_000
        : unit === "h" ? amount * 3_600_000
        : amount * 86_400_000;
      if (ms > 2_419_200_000) {
        await safeReply(message, re("Timeouts can only last up to 28 days."));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        await member.timeout(ms, auditReason(reason, message.author.tag));
        const muteCaseId = await recordModAction(message.guild!, userId, "mute", `${timeStr} — ${reason}`, message.author.tag, message.author.id);
        await safeReply(message, modActionEmbed({
          action: "Member Muted", emoji: "", color: 0xfee75c,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          duration: timeStr, reason,
          note: `Case #${muteCaseId}`,
        }));
      } catch {
        await safeReply(message, re("Couldn't mute that user."));
      }
      return true;
    }
    case "unmute":
    case "untimeout": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}unmute @user\``));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        await member.timeout(null);
        const unmuteCaseId = await recordModAction(message.guild!, userId, "unmute", "Timeout removed", message.author.tag, message.author.id);
        await safeReply(message, modActionEmbed({
          action: "Member Unmuted", emoji: "", color: 0x57f287,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason: "Timeout removed",
          note: `Case #${unmuteCaseId}`,
        }));
      } catch {
        await safeReply(message, re("Couldn't unmute that user."));
      }
      return true;
    }
    case "imute": {
      const mention = args[0];
      const reason = args.slice(1).join(" ") || "No reason given";
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}imute @user [reason]\``));
        return true;
      }
      if (!gs.imageMutedRoleId) {
        await safeReply(message, re(`No Image Muted role set up. Run \`${p}setupmute\` first.`));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        await member.roles.add(gs.imageMutedRoleId, auditReason(reason, message.author.tag));
        const caseId = await recordModAction(message.guild!, userId, "imute", reason, message.author.tag, message.author.id);
        await safeReply(message, modActionEmbed({
          action: "Image Muted", emoji: "", color: 0xe67e22,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason, note: `Case #${caseId}`,
        }));
      } catch {
        await safeReply(message, re("Couldn't image-mute that user."));
      }
      return true;
    }
    case "iunmute": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}iunmute @user\``));
        return true;
      }
      if (!gs.imageMutedRoleId) {
        await safeReply(message, re(`No Image Muted role set up. Run \`${p}setupmute\` first.`));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        await member.roles.remove(gs.imageMutedRoleId, auditReason("Image mute removed", message.author.tag));
        const caseId = await recordModAction(message.guild!, userId, "iunmute", "Image mute removed", message.author.tag, message.author.id);
        await safeReply(message, modActionEmbed({
          action: "Image Unmuted", emoji: "", color: 0x57f287,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason: "Image mute removed", note: `Case #${caseId}`,
        }));
      } catch {
        await safeReply(message, re("Couldn't remove image mute."));
      }
      return true;
    }
    case "rmute": {
      const mention = args[0];
      const reason = args.slice(1).join(" ") || "No reason given";
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}rmute @user [reason]\``));
        return true;
      }
      if (!gs.reactionMutedRoleId) {
        await safeReply(message, re(`No Reaction Muted role set up. Run \`${p}setupmute\` first.`));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        await member.roles.add(gs.reactionMutedRoleId, auditReason(reason, message.author.tag));
        const caseId = await recordModAction(message.guild!, userId, "rmute", reason, message.author.tag, message.author.id);
        await safeReply(message, modActionEmbed({
          action: "Reaction Muted", emoji: "", color: 0x9b59b6,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason, note: `Case #${caseId}`,
        }));
      } catch {
        await safeReply(message, re("Couldn't reaction-mute that user."));
      }
      return true;
    }
    case "runmute": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}runmute @user\``));
        return true;
      }
      if (!gs.reactionMutedRoleId) {
        await safeReply(message, re(`No Reaction Muted role set up. Run \`${p}setupmute\` first.`));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) { await safeReply(message, re(hierr)); return true; }
        await member.roles.remove(gs.reactionMutedRoleId, auditReason("Reaction mute removed", message.author.tag));
        const caseId = await recordModAction(message.guild!, userId, "runmute", "Reaction mute removed", message.author.tag, message.author.id);
        await safeReply(message, modActionEmbed({
          action: "Reaction Unmuted", emoji: "", color: 0x57f287,
          targetTag: member.user.tag, targetId: userId,
          targetAvatar: member.user.displayAvatarURL(),
          moderatorTag: message.author.tag, moderatorId: message.author.id,
          reason: "Reaction mute removed", note: `Case #${caseId}`,
        }));
      } catch {
        await safeReply(message, re("Couldn't remove reaction mute."));
      }
      return true;
    }
    case "uto": {
      if (args[0]?.toLowerCase() !== "all") {
        await safeReply(message, re(`Usage: \`${p}uto all\` — removes all active timeouts in the server.`));
        return true;
      }
      await ensureMembersCache(guild);
      const utoTimedOut = guild.members.cache.filter((m) => !!m.communicationDisabledUntil && m.communicationDisabledUntilTimestamp! > Date.now());
      if (utoTimedOut.size === 0) {
        await safeReply(message, re("There are no timed-out members right now."));
        return true;
      }
      const utoStatus = await safeReply(message, re(`Removing timeouts from **${utoTimedOut.size}** member(s)...`));
      let utoSuccess = 0, utoFailed = 0;
      await rQueue([...utoTimedOut.values()], async (m) => {
        try { await m.timeout(null, `Mass untimeout by ${message.author.tag}`); utoSuccess++; }
        catch { utoFailed++; }
      }, 500);
      await utoStatus.edit(re(`Removed timeouts from **${utoSuccess}** member(s)${utoFailed > 0 ? `, failed on **${utoFailed}**` : ""}.`));
      return true;
    }
    case "untimeoutall": {
      await ensureMembersCache(guild);
      const timedOut = guild.members.cache.filter((m) => !!m.communicationDisabledUntil && m.communicationDisabledUntilTimestamp! > Date.now());
      if (timedOut.size === 0) {
        await safeReply(message, re("There are no timed-out members right now."));
        return true;
      }
      const statusMsg = await safeReply(message, re(`Removing timeouts from **${timedOut.size}** member(s)...`));
      let success = 0, failed = 0;
      await rQueue([...timedOut.values()], async (m) => {
        try { await m.timeout(null, `Mass untimeout by ${message.author.tag}`); success++; }
        catch { failed++; }
      }, 500);
      await statusMsg.edit(re(`Removed timeouts from **${success}** member(s)${failed > 0 ? `, failed on **${failed}**` : ""}.`));
      return true;
    }
    case "mutelist": {
      await ensureMembersCache(guild);
      const now = Date.now();
      const muted = guild.members.cache.filter(
        (m) => !!m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > now,
      );
      if (muted.size === 0) {
        await safeReply(message, re("Nobody is currently timed out."));
        return true;
      }
      const items = muted.map(
        (m) => `${m} \`${m.user.tag}\` — expires <t:${Math.floor(m.communicationDisabledUntilTimestamp! / 1000)}:R>`,
      );
      await sendPaginated(message, ` Currently Timed Out (${muted.size})`, items, { perPage: 10, color: 0xffa500 });
      return true;
    }
    case "voicemute":
    case "voiceunmute": {
      const target = message.mentions.members?.first()
        ?? (args[0] ? await guild.members.fetch(args[0].replace(/[<@!>]/g, "")).catch(() => null) : null);
      if (!target) {
        await safeReply(message, re(`Usage: \`${p}${cmd} @user\``));
        return true;
      }
      const muting = cmd === "voicemute";
      if (!target.voice.channel) {
        await safeReply(message, re(`**${target.user.tag}** is not in a voice channel.`));
        return true;
      }
      await target.voice.setMute(muting, `${muting ? "Muted" : "Unmuted"} by ${message.author.tag}`);
      await safeReply(message, re(`**${target.user.tag}** has been voice-${muting ? "muted" : "unmuted"}.`));
      return true;
    }
    case "voicedeaf":
    case "voiceundeaf": {
      const target = message.mentions.members?.first()
        ?? (args[0] ? await guild.members.fetch(args[0].replace(/[<@!>]/g, "")).catch(() => null) : null);
      if (!target) {
        await safeReply(message, re(`Usage: \`${p}${cmd} @user\``));
        return true;
      }
      const deafening = cmd === "voicedeaf";
      if (!target.voice.channel) {
        await safeReply(message, re(`**${target.user.tag}** is not in a voice channel.`));
        return true;
      }
      await target.voice.setDeaf(deafening, `${deafening ? "Deafened" : "Undeafened"} by ${message.author.tag}`);
      await safeReply(message, re(`**${target.user.tag}** has been voice-${deafening ? "deafened" : "undeafened"}.`));
      return true;
    }
    case "massunmute": {
      if (!message.member?.permissions.has("MuteMembers")) {
        await safeReply(message, re("You need **Mute Members** to use this."));
        return true;
      }
      const muted = guild.members.cache.filter((m) => m.voice.serverMute === true);
      if (muted.size === 0) {
        await safeReply(message, re("No members are currently server-muted."));
        return true;
      }
      const status = await safeReply(message, re(`Unmuting **${muted.size}** member(s)...`));
      let done = 0, failed = 0;
      await rQueue([...muted.values()], async (m) => {
        try { await m.voice.setMute(false); done++; } catch { failed++; }
      }, 300);
      await status.edit({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(` Server-unmuted **${done}** member(s)${failed ? ` (${failed} skipped)` : ""}.`)] });
      return true;
    }
    default:
      return false;
  }
}
