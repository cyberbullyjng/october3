import { Events, EmbedBuilder, GuildMember, PartialGuildMember } from "discord.js";
import client from "../client.js";
import { getGS, saveState } from "../state.js";
import { gch, scheduleStatsUpdate, updateAllCounters } from "../utils.js";
import { COLORS } from "../colors.js";

client.on(
  Events.GuildMemberRemove,
  async (member: GuildMember | PartialGuildMember) => {
    const gsGR = getGS(member.guild.id);
    const joinLeaveChannel = gch(member.guild, gsGR.joinLeaveChannelId);
    if (joinLeaveChannel && !gsGR.disabledEvents.has("leavelog")) {
      try {
        await joinLeaveChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle("Member Left")
              .setThumbnail(member.user.displayAvatarURL())
              .setDescription(`${member.user.tag}`)
              .addFields(
                { name: "Joined", value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Unknown", inline: true },
                { name: "Members Now", value: `${member.guild.memberCount}`, inline: true },
              )
              .setFooter({ text: `ID: ${member.id}` })
              .setTimestamp(),
          ],
        });
        scheduleStatsUpdate();
      } catch (err) {
        console.error("[error] member remove:", err);
      }
    }
    // Goodbye channel message
    if (gsGR.goodbyeChannelId && !gsGR.disabledEvents.has("goodbye")) {
      const goodbyeCh = gch(member.guild, gsGR.goodbyeChannelId);
      if (goodbyeCh) {
        const goodbyeText = gsGR.goodbyeMessage
          .replace("{user}", member.user.tag)
          .replace("{server}", member.guild.name)
          .replace("{count}", String(member.guild.memberCount));
        const sentGoodbye = await goodbyeCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.error)
              .setDescription(goodbyeText)
              .setThumbnail(member.user.displayAvatarURL())
              .setFooter({ text: `ID: ${member.id}` })
              .setTimestamp(),
          ],
        }).catch(() => null);
        if (sentGoodbye && gsGR.goodbyeSelfDestruct) {
          setTimeout(() => sentGoodbye.delete().catch(() => {}), gsGR.goodbyeSelfDestruct * 1000);
        }
      }
    }
    // Counter channel update
    updateAllCounters(member.guild.id);
    // Leave DM
    if (gsGR.leaveDmEnabled) {
      try {
        const dmMsg = gsGR.leaveDmMessage
          .replace("{user}", member.user.tag)
          .replace("{server}", member.guild.name);
        await member.user.send(dmMsg).catch(() => {});
      } catch {}
    }
    // Role restore — save roles when member leaves
    if (gsGR.roleRestoreEnabled && "roles" in member) {
      const rolesToSave = member.roles.cache
        .filter((r) => r.id !== member.guild.id && !r.managed)
        .map((r) => r.id);
      if (rolesToSave.length > 0) {
        gsGR.roleBackup.set(member.id, rolesToSave);
        saveState();
      }
    }
  },
);
