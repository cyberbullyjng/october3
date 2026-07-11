import {
  EmbedBuilder, TextChannel, PermissionFlagsBits,
} from "discord.js";
import type { Message } from "discord.js";
import { getGS, saveState } from "../../state.js";
import {
  re, rBatch, parseDuration,
  sendConfirm, safeReply, sendPaginated,
} from "../../utils.js";
import { COLORS } from "../../colors.js";

export async function handleModChannelsCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "purge":
    case "clear": {
      const ch = message.channel as TextChannel;

      if (args[0]?.toLowerCase() === "images") {
        const limit = Math.min(parseInt(args[1] ?? "100") || 100, 100);
        try {
          await message.delete().catch(() => {});
          const fetched = await ch.messages.fetch({ limit: 100 });
          const imageExts = /\.(png|jpe?g|gif|webp|mp4|mov|webm|bmp)(\?.*)?$/i;
          const toDelete = fetched
            .filter(m =>
              m.attachments.some(a => imageExts.test(a.url) || a.contentType?.startsWith("image/") || a.contentType?.startsWith("video/")) ||
              m.embeds.some(e => e.image || e.video || e.thumbnail)
            )
            .first(limit);
          if (!toDelete.length) {
            const none = await ch.send(re("No image messages found in the last 100 messages."));
            setTimeout(() => none.delete().catch(() => {}), 4000);
            return true;
          }
          await ch.bulkDelete(toDelete, true);
          const confirm = await ch.send(re(` Deleted ${toDelete.length} image message${toDelete.length !== 1 ? "s" : ""}.`));
          setTimeout(() => confirm.delete().catch(() => {}), 3000);
        } catch {
          await safeReply(message, re("Couldn't delete messages (they may be too old)."));
        }
        return true;
      }

      const hasMention = args[0] && /^<@!?\d+>$/.test(args[0]);
      const userId = hasMention ? args[0].replace(/[<@!>]/g, "") : null;
      const rawCount = hasMention ? args[1] : args[0];
      const count = parseInt(rawCount ?? "");

      if (isNaN(count) || count < 1 || count > 100) {
        await safeReply(message, re(`Usage: \`${p}purge <1-100>\`, \`${p}purge @user <1-100>\`, or \`${p}purge images [1-100]\``));
        return true;
      }

      try {
        if (userId) {
          const fetched = await ch.messages.fetch({ limit: 100 });
          const toDelete = fetched.filter((m) => m.author.id === userId).first(count);
          await ch.bulkDelete(toDelete, true);
          const confirm = await ch.send(re(` Deleted ${toDelete.length} messages from <@${userId}>.`));
          setTimeout(() => confirm.delete().catch(() => {}), 4000);
        } else {
          await message.delete().catch(() => {});
          const deleted = await ch.bulkDelete(count, true);
          const confirm = await ch.send(re(` Deleted ${deleted.size} messages.`));
          setTimeout(() => confirm.delete().catch(() => {}), 3000);
        }
      } catch {
        await safeReply(message, re("Couldn't delete messages (they may be too old)."));
      }
      return true;
    }
    case "lock": {
      try {
        const channel = message.channel as TextChannel;
        await channel.permissionOverwrites.edit(message.guild!.roles.everyone, { SendMessages: false });
        await channel.send({
          embeds: [new EmbedBuilder().setColor(COLORS.error)
            .setTitle("Channel Locked")
            .setDescription("This channel has been locked. Only staff can send messages.")
            .setFooter({ text: `Locked by ${message.author.tag}` })
            .setTimestamp()],
        });
      } catch {
        await safeReply(message, re("Couldn't lock the channel — check my permissions."));
      }
      return true;
    }
    case "unlock": {
      try {
        const channel = message.channel as TextChannel;
        await channel.permissionOverwrites.edit(message.guild!.roles.everyone, { SendMessages: null });
        await channel.send({
          embeds: [new EmbedBuilder().setColor(COLORS.success)
            .setTitle("Channel Unlocked")
            .setDescription("This channel has been unlocked. Everyone can send messages again.")
            .setFooter({ text: `Unlocked by ${message.author.tag}` })
            .setTimestamp()],
        });
      } catch {
        await safeReply(message, re("Couldn't unlock the channel — check my permissions."));
      }
      return true;
    }
    case "lockdown": {
      await safeReply(message, re("Locking server..."));
      const everyoneRole = guild.roles.everyone;
      const hadSend = everyoneRole.permissions.has(PermissionFlagsBits.SendMessages);
      if (hadSend) {
        await everyoneRole.setPermissions(
          everyoneRole.permissions.remove(PermissionFlagsBits.SendMessages),
          `Lockdown by ${message.author.tag}`
        ).catch(() => {});
      }
      const textChannels = [...guild.channels.cache.values()].filter(
        (c) => c.isTextBased() && !c.isDMBased()
      );
      await message.channel.send(re(` Server lockdown active — **${textChannels.length}** channels locked.`));
      return true;
    }
    case "unlockdown": {
      await safeReply(message, re("Lifting lockdown..."));
      const everyoneRole = guild.roles.everyone;
      await everyoneRole.setPermissions(
        everyoneRole.permissions.add(PermissionFlagsBits.SendMessages),
        `Unlock by ${message.author.tag}`
      ).catch(() => {});
      const textChannels = [...guild.channels.cache.values()].filter(
        (c) => c.isTextBased() && !c.isDMBased()
      );
      await message.channel.send(re(` Lockdown lifted — **${textChannels.length}** channels unlocked.`));
      return true;
    }
    case "imagelock": {
      if (gs.imageLocked) {
        await safeReply(message, re(`Image lock is already active. Use \`${p}imageunlock\` to lift it.`));
        return true;
      }
      await safeReply(message, re("Locking images server-wide..."));
      const IMAGE_PERMS = PermissionFlagsBits.AttachFiles | PermissionFlagsBits.EmbedLinks;
      const strippedRoleIds: string[] = [];

      const everyoneRole = guild.roles.everyone;
      const everyoneHasImagePerms =
        everyoneRole.permissions.has(PermissionFlagsBits.AttachFiles) ||
        everyoneRole.permissions.has(PermissionFlagsBits.EmbedLinks);
      if (everyoneHasImagePerms) {
        await everyoneRole.setPermissions(
          everyoneRole.permissions.remove(IMAGE_PERMS),
          `Image lock by ${message.author.tag}`
        ).catch(() => {});
        strippedRoleIds.push("@everyone");
      }

      const rolesWithPerms = [...guild.roles.cache.values()].filter(
        (r) => !r.managed && r.id !== guild.roles.everyone.id &&
          (r.permissions.has(PermissionFlagsBits.AttachFiles) || r.permissions.has(PermissionFlagsBits.EmbedLinks))
      );
      await rBatch(rolesWithPerms, async (role) => {
        await role.setPermissions(
          role.permissions.remove(IMAGE_PERMS),
          `Image lock by ${message.author.tag}`
        ).catch(() => {});
        strippedRoleIds.push(role.id);
      }, 5, 200);

      gs.imageLocked = true;
      gs.imageLockRoleIds = strippedRoleIds;
      saveState();
      const roleCount = strippedRoleIds.filter(id => id !== "@everyone").length;
      await message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle("Image Lock Active")
          .setDescription(
            `AttachFiles & EmbedLinks removed from **@everyone**` +
            (roleCount ? ` and **${roleCount}** other role(s)` : "") + `.\n` +
            `Use \`${p}imageunlock\` to restore.`
          )
          .setTimestamp()
        ]
      });
      return true;
    }
    case "imageunlock": {
      if (!gs.imageLocked) {
        await safeReply(message, re("Image lock is not active."));
        return true;
      }
      await safeReply(message, re("Lifting image lock..."));
      const IMAGE_PERMS = PermissionFlagsBits.AttachFiles | PermissionFlagsBits.EmbedLinks;
      const savedIds = gs.imageLockRoleIds;

      if (savedIds.includes("@everyone")) {
        const everyoneRole = guild.roles.everyone;
        await everyoneRole.setPermissions(
          everyoneRole.permissions.add(IMAGE_PERMS),
          `Image unlock by ${message.author.tag}`
        ).catch(() => {});
      }

      const rolesToRestore = [...guild.roles.cache.values()].filter(
        (r) => savedIds.includes(r.id)
      );
      await rBatch(rolesToRestore, async (role) => {
        await role.setPermissions(
          role.permissions.add(IMAGE_PERMS),
          `Image unlock by ${message.author.tag}`
        ).catch(() => {});
      }, 5, 200);

      gs.imageLocked = false;
      gs.imageLockRoleIds = [];
      saveState();
      const restoredRoles = rolesToRestore.length;
      await message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle("Image Lock Lifted")
          .setDescription(
            `AttachFiles & EmbedLinks restored to **@everyone**` +
            (restoredRoles ? ` and **${restoredRoles}** other role(s)` : "") + `.`
          )
          .setTimestamp()
        ]
      });
      return true;
    }
    case "nuke": {
      const nukeChannel = message.channel as TextChannel;
      const nukeAuthorTag = message.author.tag;
      await sendConfirm(
        message,
        ` Are you sure you want to nuke **#${nukeChannel.name}**?\nThis will delete and recreate the channel, wiping all messages.`,
        async () => {
          try {
            const newChannel = await nukeChannel.clone({ reason: `Nuked by ${nukeAuthorTag}` });
            await newChannel.setPosition(nukeChannel.position);
            await nukeChannel.delete();
            await newChannel.send(re(" Channel nuked."));
          } catch {
            // Channel may already be gone or bot lacks perms
          }
        },
        0xed4245,
      );
      return true;
    }
    case "clearreacts": {
      let targetMsg: Message | null = null;
      if (message.reference?.messageId) {
        targetMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
      } else if (args[0]) {
        targetMsg = await message.channel.messages.fetch(args[0]).catch(() => null);
      }
      if (!targetMsg) {
        await safeReply(message, re(`Usage: \`${p}clearreacts <messageId>\` or reply to a message with \`${p}clearreacts\`.`));
        return true;
      }
      await targetMsg.reactions.removeAll().catch(() => {});
      await message.react("✅");
      return true;
    }
    case "schedulenuke": {
      const timeStr = args[0];
      if (!timeStr) {
        await safeReply(message, re(`Usage: \`${p}schedulenuke <time>\` — e.g. \`${p}schedulenuke 30m\`\nFormats: \`30s\` · \`5m\` · \`2h\` · \`1d\``));
        return true;
      }
      const ms = parseDuration(timeStr);
      if (!ms) {
        await safeReply(message, re("Invalid time format. Use `30s`, `5m`, `2h`, `1d`."));
        return true;
      }
      const endsAt = Math.floor((Date.now() + ms) / 1000);
      const nukeChannel = message.channel as TextChannel;
      const nukeAuthorTag = message.author.tag;
      const nukeAuthorId = message.author.id;
      await sendConfirm(
        message,
        ` Schedule a nuke of **#${nukeChannel.name}** for <t:${endsAt}:R>?\nThis will delete and recreate the channel at the scheduled time.\n> ⚠️ This timer does not survive a bot restart.`,
        async () => {
          setTimeout(async () => {
            try {
              const newChannel = await nukeChannel.clone({ reason: `Scheduled nuke by ${nukeAuthorTag}` });
              await newChannel.setPosition(nukeChannel.position);
              await nukeChannel.delete();
              await newChannel.send(re(` Channel nuked (scheduled by <@${nukeAuthorId}>).`));
            } catch {}
          }, ms);
          await nukeChannel.send(re(`Nuke confirmed — fires <t:${endsAt}:R>.`)).catch(() => {});
        },
      );
      return true;
    }
    case "cleanup": {
      const limit = Math.min(parseInt(args[0]) || 50, 100);
      const prefix = gs.prefix ?? ",";
      try {
        const ch = message.channel as TextChannel;
        const fetched = await ch.messages.fetch({ limit: 100 });
        const toDelete = fetched
          .filter((m) => m.author.bot || m.content.startsWith(prefix))
          .first(limit);
        await ch.bulkDelete(toDelete, true);
        const confirm = await ch.send(re(`Deleted ${toDelete.length} messages (bot responses + commands).`));
        setTimeout(() => confirm.delete().catch(() => {}), 3000);
      } catch {
        await safeReply(message, re("Couldn't clean up messages."));
      }
      return true;
    }
    case "pin": {
      const ch = message.channel as TextChannel;
      let targetMsg: Message | null = null;
      if (message.reference?.messageId) {
        targetMsg = await ch.messages.fetch(message.reference.messageId).catch(() => null);
      } else if (args[0]) {
        targetMsg = await ch.messages.fetch(args[0]).catch(() => null);
      }
      if (!targetMsg) {
        await safeReply(message, re("Reply to a message or provide a message ID to pin it."));
        return true;
      }
      if (targetMsg.pinned) {
        await safeReply(message, re("That message is already pinned."));
        return true;
      }
      await targetMsg.pin();
      await safeReply(message, re(`Message pinned.`));
      return true;
    }
    case "unpin": {
      const ch = message.channel as TextChannel;
      if (args[0]) {
        const targetMsg = await ch.messages.fetch(args[0]).catch(() => null);
        if (!targetMsg) { await safeReply(message, re("Couldn't find that message.")); return true; }
        if (!targetMsg.pinned) { await safeReply(message, re("That message is not pinned.")); return true; }
        await targetMsg.unpin();
        await safeReply(message, re(`Message unpinned.`));
      } else {
        const pins = await ch.messages.fetchPinned();
        if (pins.size === 0) { await safeReply(message, re("No pinned messages in this channel.")); return true; }
        const latest = pins.first()!;
        await latest.unpin();
        await safeReply(message, re(`Most recent pinned message unpinned.`));
      }
      return true;
    }
    case "clearpins": {
      if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await safeReply(message, re("You need **Manage Messages** to use this."));
        return true;
      }
      const mentionId = args[0]?.replace(/[<#>]/g, "");
      const target = (mentionId ? guild.channels.cache.get(mentionId) : message.channel) as TextChannel | null;
      if (!target || !target.isTextBased()) {
        await safeReply(message, re("Please mention a valid text channel, or run the command inside one."));
        return true;
      }
      const pins = await (target as any).messages.fetchPinned().catch(() => null);
      if (!pins || pins.size === 0) {
        await safeReply(message, re("No pinned messages in that channel."));
        return true;
      }
      let unpinned = 0;
      for (const m of [...pins.values()]) {
        await (m as any).unpin().catch(() => {});
        unpinned++;
        await new Promise(r => setTimeout(r, 1200));
      }
      await safeReply(message, re(`Unpinned **${unpinned}** message(s) from <#${target.id}>.`));
      return true;
    }
    default:
      return false;
  }
}
