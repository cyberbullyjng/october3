import { Events, EmbedBuilder, TextChannel, ChannelType, AuditLogEvent } from "discord.js";
import client from "../client.js";
import { getGS, saveState } from "../state.js";
import { gch, punishAntinuke } from "../utils.js";
import { COLORS } from "../colors.js";

// ─── Auto-apply mute role overrides to newly created channels ────────────────
client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  if (!(channel.isTextBased() && !channel.isDMBased())) return;
  const gs = getGS(channel.guild.id);
  const tc = channel as TextChannel;
  try {
    if (gs.mutedRoleId && channel.guild.roles.cache.has(gs.mutedRoleId)) {
      await tc.permissionOverwrites.edit(gs.mutedRoleId, {
        SendMessages: false, SendMessagesInThreads: false, AddReactions: false, Speak: false,
      }).catch(() => {});
    }
    if (gs.imageMutedRoleId && channel.guild.roles.cache.has(gs.imageMutedRoleId)) {
      await tc.permissionOverwrites.edit(gs.imageMutedRoleId, {
        AttachFiles: false, EmbedLinks: false,
      }).catch(() => {});
    }
    if (gs.reactionMutedRoleId && channel.guild.roles.cache.has(gs.reactionMutedRoleId)) {
      await tc.permissionOverwrites.edit(gs.reactionMutedRoleId, {
        AddReactions: false, UseExternalEmojis: false,
      }).catch(() => {});
    }
  } catch {}
});

// ─── Antinuke: Vanity URL Protection ─────────────────────────────────────────
client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
  if (oldGuild.vanityURLCode === newGuild.vanityURLCode) return;

  const gsGU = getGS(newGuild.id);
  if (!gsGU.antinukeEnabled) return;

  try {
    const logs = await newGuild.fetchAuditLogs({
      type: AuditLogEvent.GuildUpdate,
      limit: 1,
    });
    const entry = logs.entries.first();
    if (!entry?.executor) return;
    const executorId = entry.executor.id;

    if (gsGU.antinukeWhitelist.has(executorId)) return;

    if (oldGuild.vanityURLCode) {
      await client.rest.patch(`/guilds/${newGuild.id}`, {
        body: { vanity_url_code: oldGuild.vanityURLCode },
      }).catch(() => {});
    }

    await punishAntinuke(
      newGuild,
      executorId,
      `Unauthorized vanity URL change (${oldGuild.vanityURLCode} → ${newGuild.vanityURLCode})`,
    );

    const logCh = gch(newGuild, gsGU.antinukeLogChannelId);
    if (logCh) {
      await logCh
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle("Vanity URL Protected")
              .addFields(
                { name: "Executor", value: `<@${executorId}>`, inline: true },
                {
                  name: "Attempted Change",
                  value: `\`${oldGuild.vanityURLCode}\` → \`${newGuild.vanityURLCode}\``,
                  inline: true,
                },
                {
                  name: "Action",
                  value: "Reverted & executor banned",
                  inline: true,
                },
              )
              .setTimestamp(),
          ],
        })
        .catch(() => {});
    }
  } catch (err) {
    console.error("[antinuke] vanity check error:", err);
  }
});
