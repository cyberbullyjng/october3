import { Events, EmbedBuilder } from "discord.js";
import client from "../client.js";
import { getGS, recentlyPinged } from "../state.js";
import { fetchMember, gch, isRepping, getStatusText, canPing, scheduleStatsUpdate } from "../utils.js";
import { COLORS } from "../colors.js";

// Dedup map: Discord sometimes sends duplicate PRESENCE_UPDATE gateway events
// for the same state change. Key = "guildId:userId:nowRepping", 3s TTL.
export const repEventDedup = new Map<string, number>();

client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
  try {
    const guild = newPresence.guild;
    if (!guild) return;
    const gsPU = getGS(guild.id);
    if (!gsPU.repRoleId) return;
    if (!gsPU.repEnabled) return;

    const nowRepping = isRepping(newPresence, gsPU.repKeyword);
    const wasRepping = oldPresence
      ? isRepping(oldPresence, gsPU.repKeyword)
      : (guild.members.cache.get(newPresence.userId)?.roles.cache.has(gsPU.repRoleId!) ?? false);

    if (wasRepping === nowRepping) {
      scheduleStatsUpdate();
      return;
    }

    const dedupKey = `${guild.id}:${newPresence.userId}:${nowRepping}`;
    const lastSeen = repEventDedup.get(dedupKey) ?? 0;
    if (Date.now() - lastSeen < 3_000) return;
    repEventDedup.set(dedupKey, Date.now());

    const member = guild.members.cache.get(newPresence.userId)
      ?? await fetchMember(guild, newPresence.userId).catch(() => null);
    if (!member || member.user.bot) return;

    const repChannel = gch(guild, gsPU.pingChannelId);
    if (nowRepping) {
      try {
        await member.roles.add(gsPU.repRoleId);
        console.log(
          `[+rep] ${member.user.tag} in ${guild.name}: "${getStatusText(newPresence)}"`,
        );
        if (repChannel && canPing(member.id)) {
          recentlyPinged.set(member.id, Date.now());
          await repChannel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.primary)
                .setDescription(`**${member.displayName}** is now repping: **${getStatusText(newPresence)}**`)
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp(),
            ],
          });
        }
      } catch (err: any) {
        if (err?.code === 50013)
          console.error(
            `[permission] Can't assign role to ${member.user.tag} — check role hierarchy`,
          );
      }
    } else if (!nowRepping && gsPU.repRoleId && member.roles.cache.has(gsPU.repRoleId)) {
      await member.roles.remove(gsPU.repRoleId).catch(() => {});
      console.log(`[-rep] ${member.user.tag} stopped repping in ${guild.name}`);
    }

    scheduleStatsUpdate();
  } catch (err) {
    console.error("[error] presence update:", err);
  }
});

// Flush stale dedup entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of repEventDedup) {
    if (now - ts > 10_000) repEventDedup.delete(key);
  }
}, 60_000).unref();
