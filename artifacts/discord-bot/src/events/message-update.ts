import { Events, EmbedBuilder } from "discord.js";
import client from "../client.js";
import { getGS, msgStore, editSnipeCache } from "../state.js";
import { gch } from "../utils.js";
import { COLORS } from "../colors.js";

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  const stored = msgStore.get(newMessage.id);
  const beforeContent = oldMessage.content || stored?.content || null;
  const afterContent = newMessage.content || null;
  if (!beforeContent || !afterContent || beforeContent === afterContent) return;

  // Update rolling store with new content
  if (afterContent && newMessage.author) {
    msgStore.set(newMessage.id, {
      content: afterContent,
      authorTag: newMessage.author.tag,
      authorAvatar: newMessage.author.displayAvatarURL(),
      attachments: newMessage.attachments.map((a) => a.url),
    });
  }

  // Populate edit snipe cache
  if (newMessage.author) {
    editSnipeCache.set(newMessage.channelId, {
      before: beforeContent,
      after: afterContent,
      authorTag: newMessage.author.tag,
      authorAvatar: newMessage.author.displayAvatarURL(),
      authorId: newMessage.author.id,
      messageUrl: `https://discord.com/channels/${newMessage.guild.id}/${newMessage.channelId}/${newMessage.id}`,
      timestamp: Date.now(),
    });
  }

  const gsMU = getGS(newMessage.guild.id);
  const editLogChannel = gch(newMessage.guild, gsMU.editLogChannelId);
  if (!editLogChannel) return;
  try {
    await editLogChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Message Edited")
          .addFields(
            {
              name: "Author",
              value: newMessage.author
                ? `${newMessage.author} (${newMessage.author.tag})`
                : "Unknown",
              inline: true,
            },
            { name: "Channel", value: `${newMessage.channel}`, inline: true },
            { name: "Before", value: `"${beforeContent.slice(0, 1000)}"` },
            { name: "After", value: `"${afterContent.slice(0, 1000)}"` },
          )
          .setFooter({ text: `Message ID: ${newMessage.id}` })
          .setTimestamp(),
      ],
    });
  } catch (err) {
    console.error("[error] message edit log:", err);
  }
});
