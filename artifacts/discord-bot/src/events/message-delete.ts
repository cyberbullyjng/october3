import { Events, EmbedBuilder, Message, PartialMessage } from "discord.js";
import client from "../client.js";
import { getGS, msgStore, snipeCache } from "../state.js";
import { gch } from "../utils.js";
import { COLORS } from "../colors.js";

client.on(Events.MessageDelete, async (message: Message | PartialMessage) => {
  if (!message.guild) return;
  const gsMD = getGS(message.guild.id);
  const messageDeleteChannel = gch(message.guild, gsMD.messageDeleteChannelId);
  const automodLogChannelMD = gch(message.guild, gsMD.automodLogChannelId);
  if (message.author?.bot) return;

  // Populate snipe cache
  const stored = msgStore.get(message.id);
  const resolvedContent = message.content || stored?.content || "";
  const resolvedAuthorTag = message.author?.tag ?? stored?.authorTag ?? null;
  const resolvedAuthorAvatar = message.author?.displayAvatarURL() ?? stored?.authorAvatar ?? null;
  const resolvedAuthorId = message.author?.id ?? "unknown";
  const resolvedAttachments: string[] = message.attachments.size > 0
    ? message.attachments.map((a) => a.url)
    : (stored?.attachments ?? []);
  if ((resolvedContent || resolvedAttachments.length > 0) && resolvedAuthorTag) {
    const existing = snipeCache.get(message.channelId) ?? [];
    existing.unshift({ content: resolvedContent, authorTag: resolvedAuthorTag, authorAvatar: resolvedAuthorAvatar, authorId: resolvedAuthorId, timestamp: Date.now(), attachments: resolvedAttachments });
    if (existing.length > 10) existing.length = 10;
    snipeCache.set(message.channelId, existing);
  }
  msgStore.delete(message.id);

  if (!messageDeleteChannel) return;

  // Skip automod deletions
  const logChannelIds = [automodLogChannelMD?.id].filter(Boolean);
  if (logChannelIds.includes(message.channelId)) return;

  try {
    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle("Message Deleted")
      .setDescription(
        resolvedContent
          ? `"${resolvedContent}"`
          : "*Message content unavailable*",
      )
      .addFields(
        {
          name: "Author",
          value: resolvedAuthorTag
            ? `<@${resolvedAuthorId}> (${resolvedAuthorTag})`
            : "Unknown",
          inline: true,
        },
        { name: "Channel", value: `${message.channel}`, inline: true },
      )
      .setFooter({ text: `Message ID: ${message.id}` })
      .setTimestamp();

    if (message.attachments.size > 0) {
      embed.addFields({
        name: "Attachments",
        value: message.attachments.map((a) => a.name).join(", "),
      });
    }

    await messageDeleteChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("[error] message delete:", err);
  }
});
