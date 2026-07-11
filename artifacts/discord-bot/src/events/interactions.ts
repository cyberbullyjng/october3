import {
  Events, EmbedBuilder, TextChannel, ChannelType, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  AttachmentBuilder, MessageReaction, PartialMessageReaction, User, PartialUser, Message,
  PermissionFlagsBits,
} from "discord.js";
import client from "../client.js";
import { getGS, saveState, paginatedSessions, pendingConfirms, tttGames, blackteaGames, reactionSnipeCache } from "../state.js";
import { gch, fetchMember, buildPageEmbed, buildPageRow } from "../utils.js";
import { BT_JOIN_EMOJI } from "../blacktea.js";
import { COLORS } from "../colors.js";

// ─── Reaction Roles helper ────────────────────────────────────────────────────

async function handleReactionRole(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  add: boolean,
) {
  if (!reaction.message.guild || user.bot) return;
  const gsRR = getGS(reaction.message.guild.id);
  const msgRoles = gsRR.reactionRoles.get(reaction.message.id);
  if (!msgRoles) return;
  const emoji = reaction.emoji.id ?? reaction.emoji.name ?? "";
  const roleId = msgRoles.get(emoji);
  if (!roleId) return;
  try {
    const member = await fetchMember(reaction.message.guild, user.id);
    if (add) await member.roles.add(roleId);
    else await member.roles.remove(roleId);
  } catch {}
}

// ─── Reaction Add ─────────────────────────────────────────────────────────────

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  handleReactionRole(reaction, user, true).catch(() => {});

  if (user.bot || !reaction.message.guild) return;

  // ─── Blacktea lobby join ──────────────────────────────────────────────────
  if (reaction.emoji.name === BT_JOIN_EMOJI) {
    for (const [, btGame] of blackteaGames) {
      if (btGame.phase === "lobby" && btGame.lobbyMessageId === reaction.message.id) {
        btGame.joiners.add(user.id);
        break;
      }
    }
  }

  // ─── Clownboard ──────────────────────────────────────────────────────────
  if (reaction.emoji.name === "🤡") {
    const gsCB = getGS(reaction.message.guild.id);
    if (gsCB.clownboardChannelId) {
      const cbChannel = gch(reaction.message.guild, gsCB.clownboardChannelId);
      if (cbChannel) {
        const fullReactionCB = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
        const countCB = fullReactionCB?.count ?? 0;
        const originalMsgCB = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message as Message;
        if (originalMsgCB) {
          const clownEmbed = new EmbedBuilder()
            .setColor(COLORS.orange)
            .setAuthor({ name: originalMsgCB.author.tag, iconURL: originalMsgCB.author.displayAvatarURL() })
            .setDescription(originalMsgCB.content?.slice(0, 2000) || null)
            .addFields({ name: "Source", value: `[Jump to message](${originalMsgCB.url})`, inline: true })
            .setTimestamp(originalMsgCB.createdAt);
          const imgCB = originalMsgCB.attachments.find((a) => a.contentType?.startsWith("image/"));
          if (imgCB) clownEmbed.setImage(imgCB.url);
          const contentCB = `🤡 **${countCB}** <#${originalMsgCB.channelId}>`;
          const existingCBId = gsCB.clownboardPosted.get(originalMsgCB.id);
          if (existingCBId) {
            const existingCB = await cbChannel.messages.fetch(existingCBId).catch(() => null);
            if (existingCB) {
              if (countCB < gsCB.clownboardThreshold) {
                await existingCB.delete().catch(() => {});
                gsCB.clownboardPosted.delete(originalMsgCB.id);
                saveState();
              } else {
                await existingCB.edit({ content: contentCB, embeds: [clownEmbed] }).catch(() => {});
              }
            }
          } else if (countCB >= gsCB.clownboardThreshold) {
            const posted = await cbChannel.send({ content: contentCB, embeds: [clownEmbed] }).catch(() => null);
            if (posted) {
              gsCB.clownboardPosted.set(originalMsgCB.id, posted.id);
              saveState();
            }
          }
        }
      }
    }
    return;
  }

  // ─── Starboard ───────────────────────────────────────────────────────────
  const emojiName = reaction.emoji.name;
  if (emojiName !== "⭐") return;
  const gsSB = getGS(reaction.message.guild.id);
  if (!gsSB.starboardChannelId) return;
  const sbChannel = gch(reaction.message.guild, gsSB.starboardChannelId);
  if (!sbChannel) return;

  const fullReaction = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
  if (!fullReaction) return;
  const count = fullReaction.count ?? 0;
  const originalMsg = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message as Message;
  if (!originalMsg) return;

  const starEmbed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setAuthor({ name: originalMsg.author.tag, iconURL: originalMsg.author.displayAvatarURL() })
    .setDescription(originalMsg.content?.slice(0, 2000) || null)
    .addFields({ name: "Source", value: `[Jump to message](${originalMsg.url})`, inline: true })
    .setTimestamp(originalMsg.createdAt);
  const img = originalMsg.attachments.find((a) => a.contentType?.startsWith("image/"));
  if (img) starEmbed.setImage(img.url);
  const content = `⭐ **${count}** <#${originalMsg.channelId}>`;

  const existingId = gsSB.starboardPosted.get(originalMsg.id);
  if (existingId) {
    try {
      const existing = await sbChannel.messages.fetch(existingId).catch(() => null);
      if (existing) {
        if (count < gsSB.starboardThreshold) {
          await existing.delete().catch(() => {});
          gsSB.starboardPosted.delete(originalMsg.id);
          saveState();
        } else {
          await existing.edit({ content, embeds: [starEmbed] }).catch(() => {});
        }
      }
    } catch {}
    return;
  }

  if (count >= gsSB.starboardThreshold && !gsSB.starboardPosted.has(originalMsg.id)) {
    try {
      const posted = await sbChannel.send({ content, embeds: [starEmbed] });
      gsSB.starboardPosted.set(originalMsg.id, posted.id);
      saveState();
    } catch {}
  }
});

// ─── Reaction Remove ─────────────────────────────────────────────────────────

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (!user.bot && reaction.message.guild) {
    const fullUser = user.partial ? await user.fetch().catch(() => null) : user;
    if (fullUser && !fullUser.bot) {
      const emojiStr = reaction.emoji.id
        ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
        : (reaction.emoji.name ?? "");
      reactionSnipeCache.set(reaction.message.channelId, {
        emoji: emojiStr,
        authorTag: fullUser.tag,
        authorAvatar: fullUser.displayAvatarURL(),
        authorId: fullUser.id,
        messageId: reaction.message.id,
        timestamp: Date.now(),
      });
    }
  }
  handleReactionRole(reaction, user, false).catch(() => {});
});

// ─── Pagination Button Interactions ───────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("oct:page:")) return;
  const parts = interaction.customId.split(":");
  const key = parts[2];
  const dir = parts[3];
  const session = paginatedSessions.get(key);
  if (!session || Date.now() > session.expiresAt) {
    await interaction.update({ content: "These pages have expired.", embeds: [], components: [] }).catch(() => {});
    return;
  }
  if (interaction.user.id !== session.authorId) {
    await interaction.reply({ content: "Only the person who ran the command can flip pages.", ephemeral: true });
    return;
  }
  if (dir === "close") {
    paginatedSessions.delete(key);
    await interaction.update({ content: "", embeds: [], components: [] }).catch(() => {});
    return;
  }
  if (dir === "first") session.current = 0;
  else if (dir === "last") session.current = session.pages.length - 1;
  else if (dir === "prev" && session.current > 0) session.current--;
  else if (dir === "next" && session.current < session.pages.length - 1) session.current++;
  await interaction.update({ embeds: [buildPageEmbed(session)], components: [buildPageRow(key, session)] }).catch(() => {});
});

// ─── Confirmation Button Interactions ─────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("oct:confirm:") && !interaction.customId.startsWith("oct:cancel:")) return;
  const parts = interaction.customId.split(":");
  const type = parts[1];
  const key = parts[2];
  const pending = pendingConfirms.get(key);
  if (!pending || Date.now() > pending.expiresAt) {
    await interaction.update({ content: "This confirmation has expired.", embeds: [], components: [] }).catch(() => {});
    return;
  }
  if (interaction.user.id !== pending.authorId) {
    await interaction.reply({ content: "Only the person who ran the command can use these buttons.", ephemeral: true });
    return;
  }
  pendingConfirms.delete(key);
  if (type === "cancel") {
    await interaction.update({ content: "Action cancelled.", embeds: [], components: [] }).catch(() => {});
    return;
  }
  await interaction.update({ content: "Processing…", embeds: [], components: [] }).catch(() => {});
  await pending.action().catch((err) => console.error("[confirm-action]", err));
});

// ─── Button Role Interactions ─────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;
  if (!interaction.customId.startsWith("br:")) return;
  const [, guildId, roleId] = interaction.customId.split(":");
  if (guildId !== interaction.guild.id) return;
  try {
    const member = await fetchMember(interaction.guild, interaction.user.id);
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) { await interaction.reply({ content: "That role no longer exists.", ephemeral: true }); return; }
    const botHighest = interaction.guild.members.me?.roles.highest.position ?? 0;
    if (role.position >= botHighest) {
      await interaction.reply({ content: "That role is above my highest role — I can't manage it.", ephemeral: true });
      return;
    }
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: `Removed **${role.name}**.`, ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: `Gave you **${role.name}**.`, ephemeral: true });
    }
  } catch (err) {
    await interaction.reply({ content: "Couldn't update your role — check my permissions.", ephemeral: true }).catch(() => {});
    console.error("[button-role]", err);
  }
});

// ─── Ticket Open Button ───────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "oct:ticket:open") return;
  if (!interaction.guild) return;

  const gs = getGS(interaction.guild.id);
  const existing = interaction.guild.channels.cache.find(
    (c) =>
      c.name === `ticket-${interaction.user.username.toLowerCase()}` &&
      gs.ticketChannels.has(c.id),
  );
  if (existing) {
    await interaction.reply({ content: `You already have an open ticket: <#${existing.id}>`, ephemeral: true });
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("oct:ticket:reason")
    .setPlaceholder("Select a reason for your ticket…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Report Staff")
        .setDescription("Report a staff member for abuse or misconduct")
        .setValue("report_staff")
        .setEmoji("🚨"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Buy Roles")
        .setDescription("Purchase a server role")
        .setValue("buy_roles")
        .setEmoji("💎"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Request Custom Role")
        .setDescription("Request a custom display role")
        .setValue("custom_role")
        .setEmoji("✨"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Paid Ban")
        .setDescription("Purchase a ban on a user")
        .setValue("paid_ban")
        .setEmoji("🔨"),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle("Open a Ticket")
        .setDescription("Please select the reason for your ticket below."),
    ],
    components: [row],
    ephemeral: true,
  });
});

// ─── Ticket Reason Select Menu ────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "oct:ticket:reason") return;
  if (!interaction.guild) return;
  await interaction.deferReply({ ephemeral: true });

  const gs = getGS(interaction.guild.id);
  const reason = interaction.values[0];

  try {
    let category = gs.ticketCategoryId
      ? ((await interaction.guild.channels.fetch(gs.ticketCategoryId).catch(() => null)) as import("discord.js").CategoryChannel | null)
      : null;
    if (!category) {
      category = (await interaction.guild.channels.create({
        name: "Tickets",
        type: ChannelType.GuildCategory,
      })) as import("discord.js").CategoryChannel;
      gs.ticketCategoryId = category.id;
      saveState();
    }

    const existing = interaction.guild.channels.cache.find(
      (c) =>
        c.name === `ticket-${interaction.user.username.toLowerCase()}` &&
        gs.ticketChannels.has(c.id),
    );
    if (existing) {
      await interaction.editReply({ content: `You already have an open ticket: <#${existing.id}>` });
      return;
    }

    const ticketCh = (await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username.toLowerCase()}`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ],
    })) as TextChannel;

    gs.ticketChannels.add(ticketCh.id);
    saveState();

    const reasonLabels: Record<string, string> = {
      report_staff: "Report Staff",
      buy_roles: "Buy Roles",
      custom_role: "Request Custom Role",
      paid_ban: "Paid Ban",
    };

    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("oct:ticket:close")
        .setLabel("🔒  Close Ticket")
        .setStyle(ButtonStyle.Danger),
    );

    await ticketCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Ticket Opened")
          .addFields(
            { name: "User", value: `${interaction.user}`, inline: true },
            { name: "Reason", value: reasonLabels[reason] ?? reason, inline: true },
          )
          .setFooter({ text: "Click the button below or use !closeticket to close this ticket." })
          .setTimestamp(),
      ],
      components: [closeRow],
    });

    if (reason === "report_staff") {
      await ticketCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle("🚨 Report Staff")
            .setDescription(
              "To process your report, please provide the following information:\n\n" +
              "**1.** User ID and username of the staff member\n" +
              "**2.** Proof of abuse (screenshots, video, message links, etc.)\n" +
              "**3.** A brief description of what occurred\n\n" +
              "Our team will review your report as soon as possible."
            ),
        ],
      });
    } else if (reason === "buy_roles") {
      await ticketCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle("💎 Buy Roles")
            .setDescription("Here are the available role packages:")
            .addFields(
              { name: "💵 $25 — Permanent Staff Role", value: "No ban or kick permissions. Unrefundable if deemed to be misused." },
              { name: "💵 $50 — All Permissions", value: "Full staff permissions. Unrefundable if deemed to be misused." },
              { name: "💵 $100 — All Permissions + Administrator", value: "Full permissions including administrator. Unrefundable if deemed to be misused." },
              { name: "💵 $200 — Founder", value: "Founder role. Unrefundable if deemed to be misused." },
            )
            .setFooter({ text: "All sales are final and unrefundable if deemed to be misused." }),
        ],
      });
    } else if (reason === "custom_role") {
      await ticketCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.special)
            .setTitle("✨ Request Custom Role")
            .setDescription(
              "Before requesting a custom display role, please make sure you meet the requirements:\n\n" +
              "**1.** Run `s?u` and confirm you have at least **1500 messages**.\n" +
              "**2.** If you meet the requirement, let us know your desired role name and color."
            ),
        ],
      });
    } else if (reason === "paid_ban") {
      await ticketCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle("🔨 Paid Ban")
            .setDescription("Here are the paid ban prices:")
            .addFields(
              { name: "💵 $25 — Non-Staff Ban", value: "Ban any non-staff member." },
              { name: "💵 $50 — Staff Ban", value: "Ban a staff member." },
            )
            .setFooter({ text: "Prices can change based on the person's worth." }),
        ],
      });
    }

    await interaction.editReply({ content: `Your ticket has been created: <#${ticketCh.id}>` });
  } catch (err) {
    console.error("[ticket:reason]", err);
    await interaction.editReply({ content: "Couldn't create your ticket — please check my permissions." });
  }
});

// ─── Close Ticket Button ──────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "oct:ticket:close") return;
  if (!interaction.guild) return;

  const gs = getGS(interaction.guild.id);
  if (!gs.ticketChannels.has(interaction.channelId)) {
    await interaction.reply({ content: "This isn't a ticket channel.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: "🔒 Closing ticket in 3 seconds…" });

  setTimeout(async () => {
    try {
      const ch = interaction.channel as TextChannel;
      const fetched = await ch.messages.fetch({ limit: 100 });
      const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const transcriptLines = sorted.map((m) => {
        const ts = new Date(m.createdTimestamp).toISOString();
        const content = m.content || (m.embeds.length > 0 ? "[embed]" : "[attachment/other]");
        return `[${ts}] ${m.author.tag}: ${content}`;
      });
      transcriptLines.unshift(
        `=== Ticket Transcript: #${ch.name} ===`,
        `Closed by: ${interaction.user.tag}`,
        `Closed at: ${new Date().toISOString()}`,
        "",
      );
      const transcriptBuffer = Buffer.from(transcriptLines.join("\n"), "utf-8");
      const attachment = new AttachmentBuilder(transcriptBuffer, { name: `transcript-${ch.name}.txt` });
      const logChId = gs.modLogChannelId ?? gs.dmLogChannelId;
      if (logChId) {
        const logCh = interaction.guild!.channels.cache.get(logChId) as TextChannel | null;
        if (logCh) {
          await logCh.send({
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.primary)
                .setTitle("Ticket Closed")
                .addFields(
                  { name: "Channel", value: `#${ch.name}`, inline: true },
                  { name: "Closed by", value: interaction.user.tag, inline: true },
                  { name: "Messages", value: `${sorted.length}`, inline: true },
                )
                .setTimestamp(),
            ],
            files: [attachment],
          }).catch(() => {});
        }
      }
    } catch {}
    gs.ticketChannels.delete(interaction.channelId);
    saveState();
    await (interaction.channel as TextChannel | null)?.delete().catch(() => {});
  }, 3000);
});

// ─── Tic-Tac-Toe Button Interactions ─────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("ttt:")) return;
  const [, gameId, idxStr] = interaction.customId.split(":");
  const game = tttGames.get(gameId);
  if (!game) {
    await interaction.update({ content: "This game has ended.", embeds: [], components: [] }).catch(() => {});
    return;
  }
  if (Date.now() > game.expiresAt) {
    tttGames.delete(gameId);
    await interaction.update({ content: "⏰ Game expired.", embeds: [], components: [] }).catch(() => {});
    return;
  }
  if (interaction.user.id !== game.turn) {
    await interaction.reply({ content: "It's not your turn!", ephemeral: true });
    return;
  }
  if (interaction.user.id !== game.playerX && interaction.user.id !== game.playerO) {
    await interaction.reply({ content: "You're not in this game.", ephemeral: true });
    return;
  }
  const TTT_X = "❌";
  const TTT_O = "⭕";
  const TTT_BLANK = "⬜";
  const idx = parseInt(idxStr, 10);
  const mark = interaction.user.id === game.playerX ? "X" : "O";
  game.board[idx] = mark;
  const checkWin = (board: (string | null)[]): string | null => {
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of wins) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]!;
    }
    return null;
  };
  const buildRows = (board: (string | null)[], gId: string, disabled: boolean) => {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let r = 0; r < 3; r++) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (let c = 0; c < 3; c++) {
        const i = r * 3 + c;
        const cell = board[i];
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ttt:${gId}:${i}`)
            .setLabel(cell === "X" ? TTT_X : cell === "O" ? TTT_O : TTT_BLANK)
            .setStyle(cell === "X" ? ButtonStyle.Danger : cell === "O" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disabled || cell !== null)
        );
      }
      rows.push(row);
    }
    return rows;
  };
  const winner = checkWin(game.board);
  const isDraw = !winner && game.board.every(c => c !== null);
  const done = !!winner || isDraw;
  if (!done) game.turn = game.turn === game.playerX ? game.playerO : game.playerX;
  const embed = new EmbedBuilder()
    .setColor(winner ? (mark === "X" ? 0xed4245 : 0x5865f2) : isDraw ? 0x99aab5 : 0x5865f2)
    .setTitle("Tic-Tac-Toe")
    .setDescription(
      winner
        ? `${mark === "X" ? TTT_X : TTT_O} <@${interaction.user.id}> wins!`
        : isDraw
        ? "It's a draw!"
        : `${TTT_X} <@${game.playerX}> vs ${TTT_O} <@${game.playerO}>\n\n**Turn:** <@${game.turn}>`
    )
    .setFooter({ text: done ? "Game over" : "Game expires in 5 minutes" });
  if (done) tttGames.delete(gameId);
  await interaction.update({ embeds: [embed], components: buildRows(game.board, gameId, done) }).catch(() => {});
});
