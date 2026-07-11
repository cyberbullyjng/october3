import { Events, EmbedBuilder, TextChannel, ChannelType, Message } from "discord.js";
import client from "../client.js";
import {
  getGS, afkUsers, maintenanceMode, globalBannedUsers, blacklistedServers,
  spamOffenses, antiSpamTracker, everyonePingTracker, xpCooldowns,
  floodTracker, msgStore, MSG_STORE_MAX, saveState, blackteaGames,
} from "../state.js";
import {
  gch, fetchMember, checkCooldown, safeReply, re, levelFromXp,
  handleSlowmode, checkAutostaffPromotion,
} from "../utils.js";
import { handleAutomod, handleMediaAutomod } from "../automod.js";
import {
  isOwner, BUILTIN_ALIASES, FLOOD_USER_THRESHOLD, FLOOD_WINDOW_MS,
} from "../constants.js";
import {
  BT_TURN_MS, BT_JOIN_EMOJI, isRealWord, canMakeWord, btStartTurn, btHandleTimeout,
} from "../blacktea.js";
import { handleBumpDetection, uwuify, getUwuWebhook } from "../commands/prefix/extras.js";
import { handleOwnerCategoryCommand } from "../commands/prefix/owner.js";
import { handleCommand } from "./handle-command.js";
import { COLORS } from "../colors.js";

// ─── Pre-compiled constants (module-level, not per-message) ───────────────────
const RE_MUSIC_EXTS  = /\.(mp3|wav|ogg|flac|m4a|aac|wma|aiff|opus)$/i;
const RE_EMOJI       = /(\p{Emoji_Presentation}|\p{Extended_Pictographic}|<a?:\w+:\d+>)/gu;
const RE_SPOILER     = /\|\|.+?\|\|/s;
const _arRegexCache  = new Map<string, RegExp>();
const _floodPrunedAt    = new Map<string, number>();
const _floodResponseAt  = new Map<string, number>();
const spamProcessing = new Set<string>();
const spamSweepAt    = new Map<string, number>();
const spamLogBatch   = new Map<string, { count: number; timer: ReturnType<typeof setTimeout> }>();

client.on("error", (err) => console.error("[Discord client error]", err));

client.on(Events.MessageCreate, async (message) => {
  // ─── Bump reminder detection (runs before bot filter) ─────────────────────
  if (message.author.bot && message.guild) {
    handleBumpDetection(message as Message);
  }

  if (message.author.bot) return;

  // ─── DM Handler (owner only) ──────────────────────────────────────────────
  if (!message.guild) {
    if (!isOwner(message.author.id)) return;
    const DM_PREFIXES = ["!", ",", ".", "-"];
    const usedPrefix = DM_PREFIXES.find(pfx => message.content.startsWith(pfx));
    if (!usedPrefix) {
      await safeReply(message, re("Send commands here using `!` or `,`. Guild-specific commands (ban, kick, etc.) must be used in a server."));
      return;
    }
    const dmParts = message.content.slice(usedPrefix.length).trim().split(/\s+/);
    const dmCmd = dmParts[0]?.toLowerCase();
    const dmArgs = dmParts.slice(1);
    if (!dmCmd) return;
    const dmResolved = BUILTIN_ALIASES.get(dmCmd) ?? dmCmd;
    try {
      const handled = await handleOwnerCategoryCommand(dmResolved, dmArgs, message);
      if (!handled) {
        await safeReply(message, re("That command isn't available in DMs. Guild-specific commands must be used in a server.")).catch(() => {});
      }
    } catch {
      await safeReply(message, re("That command requires a server context — use it in a channel instead.")).catch(() => {});
    }
    return;
  }

  // Feed our rolling message store
  if (message.content || message.attachments.size > 0) {
    if (msgStore.size >= MSG_STORE_MAX) {
      const firstKey = msgStore.keys().next().value;
      if (firstKey) msgStore.delete(firstKey);
    }
    msgStore.set(message.id, {
      content: message.content,
      authorTag: message.author.tag,
      authorAvatar: message.author.displayAvatarURL(),
      attachments: message.attachments.map((a) => a.url),
    });
  }

  const gsMC = getGS(message.guild.id);
  const automodLogChannel = gch(message.guild, gsMC.automodLogChannelId);

  if (blacklistedServers.has(message.guild.id)) return;
  if (globalBannedUsers.has(message.author.id)) return;
  if (maintenanceMode && message.content.startsWith(gsMC.prefix) && !isOwner(message.author.id)) {
    await safeReply(message, re("The bot is currently in maintenance mode. Try again later.")).catch(() => {});
    return;
  }

  // ─── AFK: clear the user's AFK if they send a message ────────────────────
  {
    const isSettingAfk = message.content.trimStart().toLowerCase().startsWith(`${gsMC.prefix}afk`);
    if (afkUsers.has(message.author.id) && !isSettingAfk) {
      const afkEntry = afkUsers.get(message.author.id)!;
      afkUsers.delete(message.author.id);
      const elapsed = Date.now() - afkEntry.timestamp;
      const secs = Math.floor(elapsed / 1000);
      const mins = Math.floor(secs / 60);
      const hrs  = Math.floor(mins / 60);
      const days = Math.floor(hrs / 24);
      const awayStr = days > 0 ? `${days} day${days !== 1 ? "s" : ""}` :
                      hrs  > 0 ? `${hrs} hour${hrs !== 1 ? "s" : ""}` :
                      mins > 0 ? `${mins} minute${mins !== 1 ? "s" : ""}` :
                                 `${secs} second${secs !== 1 ? "s" : ""}`;
      const notice = await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setDescription(`👋 ${message.author}: Welcome back, you went away ${awayStr}`)] });
      setTimeout(() => notice.delete().catch(() => {}), 5000);
    }
  }

  // ─── Blacktea — active game word detection ───────────────────────────────
  {
    const btGame = blackteaGames.get(message.channelId);
    const word = message.content.trim();
    if (btGame && btGame.phase === "active" && /^[a-zA-Z]{3,}$/.test(word) && !word.startsWith(gsMC.prefix)) {
      const currentPlayer = btGame.players[btGame.currentIdx];
      if (message.author.id === currentPlayer.userId) {
        const wordKey = word.toLowerCase();
        if (!canMakeWord(word.toUpperCase(), btGame.letters)) {
          await message.react("❌").catch(() => {});
        } else if (btGame.usedWords.has(wordKey)) {
          await message.react("🔁").catch(() => {});
        } else {
          const remaining = Math.max(500, BT_TURN_MS - (Date.now() - btGame.turnStartedAt));
          if (btGame.turnTimer) { clearTimeout(btGame.turnTimer); btGame.turnTimer = null; }
          await message.react("⏳").catch(() => {});
          const valid = await isRealWord(word);
          await message.reactions.cache.get("⏳")?.remove().catch(() => {});
          if (valid) {
            btGame.usedWords.add(wordKey);
            btGame.score++;
            await message.react("✅").catch(() => {});
            btGame.currentIdx = (btGame.currentIdx + 1) % btGame.players.length;
            await btStartTurn(btGame, message.channel as TextChannel);
          } else {
            await message.react("❌").catch(() => {});
            btGame.turnTimer = setTimeout(() => { btHandleTimeout(btGame.channelId, btGame.guildId).catch(() => {}); }, remaining);
          }
        }
      }
    }
  }

  // ─── UwU Lock: intercept and repost as UwU ────────────────────────────────
  if (
    gsMC.uwuLockedUsers.has(message.author.id) &&
    message.content &&
    !message.content.startsWith(gsMC.prefix) &&
    message.channel.type === ChannelType.GuildText
  ) {
    const ch = message.channel as TextChannel;
    try {
      const member = message.guild.members.cache.get(message.author.id)
        ?? await fetchMember(message.guild, message.author.id).catch(() => null);
      const displayName = member?.displayName ?? message.author.username;
      const avatarUrl = message.author.displayAvatarURL();
      const uwuText = uwuify(message.content);
      const wh = await getUwuWebhook(ch);
      if (wh) {
        await message.delete().catch(() => {});
        await wh.send({ content: uwuText, username: displayName, avatarURL: avatarUrl });
      }
    } catch (err) {
      console.error("[uwulock]", err);
    }
    return;
  }

  // Owner: run commands in any server, skip permission checks
  if (isOwner(message.author.id)) {
    const ownerHandled = await handleCommand(message, true).catch((err) => {
      console.error("[error] owner command:", err);
      return false;
    });
    if (ownerHandled) {
      saveState();
      const sticky2 = gsMC.stickyMessages.get(message.channelId);
      if (sticky2 && checkCooldown(`sticky:${message.channelId}`, 5_000)) {
        try {
          await message.channel.messages.fetch(sticky2.messageId).then((m) => m.delete()).catch(() => {});
          const sent = await (message.channel as TextChannel).send(`${sticky2.content}`);
          gsMC.stickyMessages.set(message.channelId, { content: sticky2.content, messageId: sent.id });
        } catch {}
      }
    }
    return;
  }

  // Bot access users — same full access as owner (per-guild)
  if (gsMC.botAccessUsers.has(message.author.id)) {
    const accessHandled = await handleCommand(message, true).catch((err) => {
      console.error("[error] access user command:", err);
      return false;
    });
    if (accessHandled) {
      saveState();
      const sticky = gsMC.stickyMessages.get(message.channelId);
      if (sticky && checkCooldown(`sticky:${message.channelId}`, 5_000)) {
        try {
          await message.channel.messages.fetch(sticky.messageId).then((m) => m.delete()).catch(() => {});
          const sent = await (message.channel as TextChannel).send(`${sticky.content}`);
          gsMC.stickyMessages.set(message.channelId, { content: sticky.content, messageId: sent.id });
        } catch {}
      }
    }
    return;
  }

  // ─── Anti-spam ─────────────────────────────────────────────────────────────
  if (gsMC.antiSpamEnabled && !gsMC.spamBypass.has(message.author.id)) {
    const now = Date.now();
    if (!antiSpamTracker.has(message.guild!.id)) antiSpamTracker.set(message.guild!.id, new Map());
    const guildTracker = antiSpamTracker.get(message.guild!.id)!;
    const userTs = guildTracker.get(message.author.id) ?? [];
    const recent = userTs.filter((t) => now - t < gsMC.antiSpamWindowMs);
    recent.push(now);
    guildTracker.set(message.author.id, recent);
    if (recent.length >= gsMC.antiSpamThreshold) {
      guildTracker.delete(message.author.id);

      const userLockKey = `${message.guild!.id}:${message.author.id}`;
      if (spamProcessing.has(userLockKey)) return;
      spamProcessing.add(userLockKey);
      setTimeout(() => spamProcessing.delete(userLockKey), 10_000);

      try {
        const spamMember = await fetchMember(message.guild!, message.author.id);
        if (!spamMember.isCommunicationDisabled()) {
          if (!spamOffenses.has(message.guild!.id)) spamOffenses.set(message.guild!.id, new Map());
          const guildOffenses = spamOffenses.get(message.guild!.id)!;
          const offense = (guildOffenses.get(message.author.id) ?? 0) + 1;
          guildOffenses.set(message.author.id, offense);
          const timeoutDurations = [30_000, 120_000, 600_000, 3_600_000];
          const timeoutMs = timeoutDurations[Math.min(offense - 1, timeoutDurations.length - 1)];
          const timeoutLabel = timeoutMs < 60_000 ? `${timeoutMs / 1000}s` : `${timeoutMs / 60_000}m`;

          await spamMember.timeout(timeoutMs, `Anti-spam: flood (offense #${offense})`);

          let spamDeletedCount = 0;
          let spamSample = "";
          const lastSweep = spamSweepAt.get(message.channelId) ?? 0;
          if (now - lastSweep > 5_000) {
            spamSweepAt.set(message.channelId, now);
            try {
              const fetched = await message.channel.messages.fetch({ limit: 100 });
              const cutoff = Date.now() - 13 * 24 * 60 * 60 * 1000;
              const toDelete = fetched
                .filter((m: Message) => m.author.id === message.author.id && m.createdTimestamp > cutoff)
                .first(10);
              const snippets = toDelete
                .map((m: Message) => m.content?.trim())
                .filter(Boolean)
                .slice(0, 3)
                .map((c: string) => c.length > 80 ? c.slice(0, 80) + "…" : c);
              spamSample = snippets.length > 0 ? snippets.map((s: string) => `\`${s}\``).join("\n") : "*[no text content]*";
              if (toDelete.length > 1) {
                await (message.channel as TextChannel).bulkDelete(toDelete, true).catch(() => {});
              } else if (toDelete.length === 1) {
                await toDelete[0].delete().catch(() => {});
              }
              spamDeletedCount = toDelete.length;
            } catch {}
          }

          const modLogCh = gch(message.guild!, gsMC.modLogChannelId);
          if (modLogCh) {
            const logKey = message.guild!.id;
            const existing = spamLogBatch.get(logKey);
            if (!existing) {
              const batchEntry = {
                count: 1,
                timer: setTimeout(() => {
                  const entry = spamLogBatch.get(logKey);
                  spamLogBatch.delete(logKey);
                  if (entry && entry.count > 1) {
                    modLogCh.send({ embeds: [
                      new EmbedBuilder().setColor(COLORS.error).setTitle("⚠️ Anti-Spam — Raid Burst")
                        .setDescription(`**${entry.count - 1} more member(s)** were timed out for spam in the same burst.`)
                        .setTimestamp()
                    ]}).catch(() => {});
                  }
                }, 3_000),
              };
              spamLogBatch.set(logKey, batchEntry);
              modLogCh.send({ embeds: [
                new EmbedBuilder().setColor(COLORS.warning).setTitle("Anti-Spam Triggered")
                  .addFields(
                    { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: "Channel", value: `<#${message.channelId}>`, inline: true },
                    { name: "Offense", value: `#${offense}`, inline: true },
                    { name: "Timeout", value: timeoutLabel, inline: true },
                    { name: "Messages Deleted", value: `${spamDeletedCount}`, inline: true },
                    { name: "Spam Content (sample)", value: spamSample || "*[raid sweep active]*" },
                  ).setTimestamp()
              ]}).catch(() => {});
            } else {
              existing.count++;
            }
          }
        }
      } catch {}
      return;
    }
  }

  // Regular users — route through permission-checked command handler
  if (message.content.startsWith(gsMC.prefix)) {
    const handled = await handleCommand(message, false).catch((err) => {
      console.error("[error] user command:", err);
      return false;
    });
    if (handled) {
      saveState();
      const stickyUser = gsMC.stickyMessages.get(message.channelId);
      if (stickyUser && checkCooldown(`sticky:${message.channelId}`, 5_000)) {
        try {
          await message.channel.messages.fetch(stickyUser.messageId).then((m) => m.delete()).catch(() => {});
          const sent = await (message.channel as TextChannel).send(` ${stickyUser.content}`);
          gsMC.stickyMessages.set(message.channelId, { content: stickyUser.content, messageId: sent.id });
        } catch {}
      }
      return;
    }
  }

  // Skip log channels themselves
  const logChannelIds = [
    gsMC.joinLeaveChannelId,
    gsMC.messageDeleteChannelId,
    gsMC.automodLogChannelId,
  ].filter(Boolean);
  if (logChannelIds.includes(message.channelId)) return;

  // ─── AFK: notify if pinging an AFK user ──────────────────────────────────
  {
    const afkNotices = [...message.mentions.users.values()]
      .filter((u) => afkUsers.has(u.id))
      .map((u) => {
        const afk = afkUsers.get(u.id)!;
        const when = Math.floor(afk.timestamp / 1000);
        return message.reply(` **${u.username}** is AFK: ${afk.reason} — <t:${when}:R>`).catch(() => {});
      });
    if (afkNotices.length) await Promise.all(afkNotices);
  }

  // ─── Auto-publish in announcement channels ───────────────────────────────
  if (
    gsMC.autoPubEnabled &&
    message.channel?.type === ChannelType.GuildAnnouncement
  ) {
    await message.crosspost().catch(() => {});
  }

  // ─── Image blacklist enforcement ─────────────────────────────────────────
  if (gsMC.imageBlacklist.has(message.author.id)) {
    const hasAttachment = message.attachments.some((a) =>
      a.contentType?.startsWith("image/") || a.contentType?.startsWith("video/")
    );
    const hasImageUrl = /https?:\/\/\S+\.(png|jpe?g|gif|gifv|webp|mp4|mov|webm)/i.test(message.content)
      || /https?:\/\/(tenor\.com|giphy\.com|media\.discordapp|cdn\.discordapp)\//i.test(message.content);
    const hasEmbed = message.embeds.some((e) => e.image || e.video || e.thumbnail);
    if (hasAttachment || hasImageUrl || hasEmbed) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(re(`${message.author} — you are not allowed to post images here.`)).catch(() => null);
      if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
  }

  // ─── Image-mute GIF enforcement ───────────────────────────────────────────
  if (gsMC.imageMutedRoleId && message.member?.roles.cache.has(gsMC.imageMutedRoleId)) {
    const hasGifAttachment = message.attachments.some((a) =>
      a.contentType === "image/gif" || a.name?.toLowerCase().endsWith(".gif")
    );
    const hasGifUrl = /https?:\/\/(tenor\.com|media\.tenor\.com|giphy\.com|media\.giphy\.com|c\.tenor\.com)\//i.test(message.content)
      || /https?:\/\/\S+\.gif(\?[^\s]*)?(\s|$)/i.test(message.content);
    if (hasGifAttachment || hasGifUrl) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(re(`${message.author} — you are not allowed to post GIFs while image muted.`)).catch(() => null);
      if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
  }

  // ─── Image-only channels ──────────────────────────────────────────────────
  if (gsMC.imageOnlyChannels.has(message.channelId)) {
    const hasImage = message.attachments.some((a) => a.contentType?.startsWith("image/") || a.contentType?.startsWith("video/"))
      || /https?:\/\/\S+\.(png|jpe?g|gif|webp|mp4|mov)/i.test(message.content);
    if (!hasImage) {
      await message.delete().catch(() => {});
      const notice = await message.channel.send(re(`${message.author} — this channel is image/video only.`)).catch(() => null);
      if (notice) setTimeout(() => notice.delete().catch(() => {}), 5000);
      return;
    }
  }

  // ─── Counting channel ─────────────────────────────────────────────────────
  if (gsMC.countingChannelId && message.channelId === gsMC.countingChannelId) {
    const num = parseInt(message.content.trim(), 10);
    const expected = gsMC.countingCurrent + 1;
    const wrongUser = message.author.id === gsMC.countingLastUserId;
    if (isNaN(num) || num !== expected || wrongUser) {
      await message.delete().catch(() => {});
      const was = gsMC.countingCurrent;
      gsMC.countingCurrent = 0;
      gsMC.countingLastUserId = null;
      saveState();
      const reason = wrongUser ? "can't count twice in a row" : `wrong number (expected **${expected}**)`;
      const notice = await message.channel.send(
        ` ${message.author} ${reason}. Count reset from **${was}** back to **0**.`
      ).catch(() => null);
      if (notice) setTimeout(() => notice.delete().catch(() => {}), 8000);
    } else {
      gsMC.countingCurrent = num;
      gsMC.countingLastUserId = message.author.id;
      saveState();
      await message.react("✅").catch(() => {});
    }
    return;
  }

  // ─── Anti @everyone ping ──────────────────────────────────────────────────
  if (gsMC.antiEveryonePingEnabled && message.mentions.everyone && !message.author.bot) {
    const EVERYONE_PING_LIMIT = 3;
    const EVERYONE_PING_WINDOW = 10_000;
    const now2 = Date.now();
    if (!everyonePingTracker.has(message.guild!.id)) everyonePingTracker.set(message.guild!.id, new Map());
    const guildEPTracker = everyonePingTracker.get(message.guild!.id)!;
    const userEPTs = guildEPTracker.get(message.author.id) ?? [];
    const recentEP = userEPTs.filter((t) => now2 - t < EVERYONE_PING_WINDOW);
    recentEP.push(now2);
    guildEPTracker.set(message.author.id, recentEP);
    if (recentEP.length >= EVERYONE_PING_LIMIT) {
      guildEPTracker.delete(message.author.id);
      await message.delete().catch(() => {});
      const modLogCh = gch(message.guild!, gsMC.modLogChannelId);
      try {
        const raidMember = await fetchMember(message.guild!, message.author.id);
        const action = gsMC.antiEveryonePingAction;
        let actionTaken = "Message deleted";
        if (action === "mute") {
          const tenMin = 10 * 60 * 1000;
          await raidMember.disableCommunicationUntil(Date.now() + tenMin, "Anti @everyone ping raid protection");
          actionTaken = "Muted 10 min + message deleted";
        } else if (action === "ban") {
          await raidMember.ban({ reason: "Anti @everyone ping raid protection", deleteMessageSeconds: 60 });
          actionTaken = "Banned + message deleted";
        }
        if (modLogCh) {
          await modLogCh.send({ embeds: [
            new EmbedBuilder().setColor(COLORS.error).setTitle("🚨 Anti-Raid: @everyone Ping Flood")
              .setDescription(`**${message.author.tag}** sent **${EVERYONE_PING_LIMIT}** @everyone pings within 10 seconds.`)
              .addFields(
                { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: "Channel", value: `<#${message.channelId}>`, inline: true },
                { name: "Action", value: actionTaken, inline: true },
              ).setTimestamp()
          ]}).catch(() => {});
        }
      } catch {}
    }
  }

  // ─── Caps filters ─────────────────────────────────────────────────────────
  if ((gsMC.capsLockFilterEnabled || gsMC.capsFilterEnabled) && !message.author.bot && message.content.length >= 10) {
    const letters = message.content.replace(/[^a-zA-Z]/g, "");
    if (letters.length >= 5) {
      let upperCount = 0;
      for (const c of letters) if (c >= 'A' && c <= 'Z') upperCount++;
      const upperPct = (upperCount / letters.length) * 100;
      if (gsMC.capsLockFilterEnabled && upperPct >= gsMC.capsLockThreshold) {
        await message.delete().catch(() => {});
        const warn = await message.channel.send(re(`<@${message.author.id}> — please don't use excessive caps lock.`)).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
      } else if (gsMC.capsFilterEnabled && !gsMC.filterBypassUsers.has(message.author.id) && upperPct >= gsMC.capsFilterPercent) {
        await message.delete().catch(() => {});
        const warn = await message.channel.send(re(`<@${message.author.id}> Please don't use excessive caps. (>${gsMC.capsFilterPercent}%)`)).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
      }
    }
  }

  // ─── Emoji filter ────────────────────────────────────────────────────────
  if (gsMC.emojiFilterEnabled && !message.author.bot && !gsMC.filterBypassUsers.has(message.author.id)) {
    const emojiMatches = message.content.match(RE_EMOJI) ?? [];
    if (emojiMatches.length > gsMC.emojiFilterMax) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(re(`<@${message.author.id}> Too many emojis (max ${gsMC.emojiFilterMax}).`));
      setTimeout(() => warn.delete().catch(() => {}), 5000);
    }
  }

  // ─── Configurable mass mention filter ────────────────────────────────────
  if (gsMC.massmentionFilterEnabled && !message.author.bot && !gsMC.filterBypassUsers.has(message.author.id)) {
    const mentionCount = (message.mentions.users.size + message.mentions.roles.size);
    if (mentionCount > gsMC.massmentionFilterThreshold) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(re(`<@${message.author.id}> Too many mentions (max ${gsMC.massmentionFilterThreshold}).`));
      setTimeout(() => warn.delete().catch(() => {}), 5000);
    }
  }

  // ─── Music file filter ───────────────────────────────────────────────────
  if (gsMC.musicFileFilterEnabled && !message.author.bot && !gsMC.filterBypassUsers.has(message.author.id) && message.attachments.size > 0) {
    const hasMusicFile = message.attachments.some((a) => RE_MUSIC_EXTS.test(a.name ?? ""));
    if (hasMusicFile) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(re(`<@${message.author.id}> Audio file uploads are not allowed in this server.`));
      setTimeout(() => warn.delete().catch(() => {}), 5000);
    }
  }

  // ─── Spoiler filter ──────────────────────────────────────────────────────
  if (gsMC.spoilerFilterEnabled && !message.author.bot && !gsMC.filterBypassUsers.has(message.author.id)) {
    if (RE_SPOILER.test(message.content)) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(re(`<@${message.author.id}> Spoiler tags are not allowed in this server.`));
      setTimeout(() => warn.delete().catch(() => {}), 5000);
    }
  }

  // ─── XP / Leveling ────────────────────────────────────────────────────────
  if (gsMC.xpEnabled && !message.author.bot) {
    const now = Date.now();
    if (!xpCooldowns.has(message.guild!.id)) xpCooldowns.set(message.guild!.id, new Map());
    const guildCooldowns = xpCooldowns.get(message.guild!.id)!;
    const lastGrant = guildCooldowns.get(message.author.id) ?? 0;
    if (now - lastGrant >= 60_000) {
      guildCooldowns.set(message.author.id, now);
      const xpGain = Math.floor(Math.random() * 11) + 15;
      const current = gsMC.xpData.get(message.author.id) ?? { xp: 0, level: 0, messages: 0 };
      const newXp = current.xp + xpGain;
      const newLevel = levelFromXp(newXp);
      const leveledUp = newLevel > current.level;
      gsMC.xpData.set(message.author.id, { xp: newXp, level: newLevel, messages: current.messages + 1 });
      if (leveledUp) {
        saveState();
        const rolesToGive = gsMC.xpRoles.filter((r) => r.minLevel <= newLevel).map((r) => r.roleId);
        try {
          const xpMember = await fetchMember(message.guild!, message.author.id);
          for (const rId of rolesToGive) {
            if (!xpMember.roles.cache.has(rId)) {
              await xpMember.roles.add(rId).catch(() => {});
              await new Promise((r) => setTimeout(r, 300));
            }
          }
        } catch {}
        const lvlUpCh = gch(message.guild!, gsMC.xpLevelUpChannelId) ?? (message.channel as TextChannel);
        await lvlUpCh.send({ embeds: [
          new EmbedBuilder().setColor(COLORS.success).setTitle("Level Up!")
            .setDescription(`${message.author} reached **Level ${newLevel}**! (${newXp} XP)`)
            .setTimestamp()
        ]}).catch(() => {});
      } else if (current.messages % 20 === 0) {
        saveState();
      }
    }
  }

  // ─── Custom commands ─────────────────────────────────────────────────────
  if (message.content.startsWith(gsMC.prefix)) {
    const trigger = message.content.slice(gsMC.prefix.length).split(" ")[0].toLowerCase();
    const response = gsMC.customCommands.get(trigger);
    if (response && checkCooldown(`cmd:${message.channelId}:${trigger}`, 5_000)) {
      await safeReply(message, response).catch(() => {});
      return;
    }
  }

  // ─── Autoresponders ───────────────────────────────────────────────────────
  if (gsMC.autoresponders.size > 0 && message.content) {
    const contentLower = message.content.toLowerCase();
    for (const [trigger, ar] of gsMC.autoresponders) {
      let matches: boolean;
      if (ar.regex) {
        try {
          let arRe = _arRegexCache.get(trigger);
          if (!arRe) { arRe = new RegExp(trigger, "i"); _arRegexCache.set(trigger, arRe); }
          matches = arRe.test(message.content);
        } catch { matches = false; }
      } else if (ar.strict) {
        matches = message.content === trigger;
      } else {
        matches = ar.exact ? contentLower === trigger : contentLower.includes(trigger);
      }
      if (matches && checkCooldown(`ar:${message.channelId}:${trigger}`, 3_000)) {
        const response = ar.response
          .replace("{user}", message.author.toString())
          .replace("{username}", message.author.username)
          .replace("{server}", message.guild?.name ?? "");
        if (ar.deleteMsg) {
          await message.delete().catch(() => {});
        }
        let sent: import("discord.js").Message | null = null;
        if (ar.dm) {
          await message.author.send(response).catch(() => {});
        } else if (ar.reply) {
          sent = await safeReply(message, response).catch(() => null);
        } else {
          sent = await message.channel.send(response).catch(() => null);
        }
        if (ar.selfDestruct && sent) {
          setTimeout(() => sent!.delete().catch(() => {}), ar.selfDestruct * 1_000);
        }
        break;
      }
    }
  }

  // ─── Duplicate flood detection ───────────────────────────────────────────
  {
    const key = message.content.trim().toLowerCase();
    if (key.length > 2) {
      const now = Date.now();
      if (!floodTracker.has(message.channelId)) floodTracker.set(message.channelId, new Map());
      const channelMap = floodTracker.get(message.channelId)!;

      const _lastPrune = _floodPrunedAt.get(message.channelId) ?? 0;
      if (now - _lastPrune > FLOOD_WINDOW_MS) {
        _floodPrunedAt.set(message.channelId, now);
        for (const [k, v] of channelMap) {
          if (now - v.firstSeen > FLOOD_WINDOW_MS) channelMap.delete(k);
        }
      }

      if (!channelMap.has(key)) {
        channelMap.set(key, { users: new Set(), messageIds: [], firstSeen: now });
      }
      const entry = channelMap.get(key)!;
      entry.users.add(message.author.id);
      entry.messageIds.push(message.id);

      if (entry.users.size >= FLOOD_USER_THRESHOLD) {
        channelMap.delete(key);
        const ch = message.channel as TextChannel;
        const msgIds = [...entry.messageIds];
        const userCount = entry.users.size;
        const lastResponse = _floodResponseAt.get(message.channelId) ?? 0;
        const cooldownActive = now - lastResponse < 10_000;
        _floodResponseAt.set(message.channelId, now);

        ;(async () => {
          await ch.bulkDelete(msgIds, true).catch(() => {});

          const FLOOD_SLOWMODE_SECONDS = 15;
          const FLOOD_SLOWMODE_DURATION_MS = 2 * 60 * 1000;
          const prevSlowmode = ch.rateLimitPerUser ?? 0;
          if (prevSlowmode < FLOOD_SLOWMODE_SECONDS) {
            await ch.setRateLimitPerUser(FLOOD_SLOWMODE_SECONDS, "Flood detected — temporary slowmode").catch(() => {});
            setTimeout(async () => {
              const fresh = ch.rateLimitPerUser ?? 0;
              if (fresh === FLOOD_SLOWMODE_SECONDS) {
                await ch.setRateLimitPerUser(prevSlowmode, "Flood slowmode lifted").catch(() => {});
              }
            }, FLOOD_SLOWMODE_DURATION_MS);
            console.log(`[automod] Flood slowmode: ${FLOOD_SLOWMODE_SECONDS}s on #${ch.name} for ${FLOOD_SLOWMODE_DURATION_MS / 1000}s`);
          }

          if (!cooldownActive) {
            const warn = await ch.send({
              embeds: [new EmbedBuilder()
                .setColor(COLORS.error)
                .setTitle("Flood Detected — Messages Purged")
                .setDescription(`${msgIds.length} identical messages from ${userCount} users were deleted.\n⏱️ Slowmode enabled for 2 minutes.`)
                .setTimestamp()]
            }).catch(() => null);
            if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);
            if (automodLogChannel) {
              await automodLogChannel.send({ embeds: [
                new EmbedBuilder().setColor(COLORS.error).setTitle("Duplicate Flood Detected")
                  .addFields(
                    { name: "Channel", value: `${ch}`, inline: true },
                    { name: "Unique Users", value: `${userCount}`, inline: true },
                    { name: "Messages Deleted", value: `${msgIds.length}`, inline: true },
                    { name: "Slowmode", value: `${FLOOD_SLOWMODE_SECONDS}s for 2 min`, inline: true },
                    { name: "Content", value: `\`${key.slice(0, 512)}\`` }
                  ).setTimestamp()
              ]}).catch(() => {});
            }
          }
          console.log(`[automod] Flood: deleted ${msgIds.length} messages in #${ch.name}`);
        })().catch(() => {});
        return;
      }
    }
  }

  const blocked = await handleAutomod(message);
  if (!blocked && message.attachments.size > 0) {
    handleMediaAutomod(message).catch(() => {});
  }
  if (
    !blocked &&
    message.channel.isTextBased() &&
    !message.channel.isDMBased()
  ) {
    handleSlowmode(message.channel as TextChannel).catch(() => {});
  }

  // ─── Autostaff: count message activity ───────────────────────────────────
  if (!blocked && gsMC.autostaffEnabled && !message.author.bot) {
    const member = message.member ?? message.guild!.members.cache.get(message.author.id) ?? null;
    const passesBaseRole = !gsMC.autostaffBaseRoleId || (member?.roles.cache.has(gsMC.autostaffBaseRoleId) ?? false);
    if (passesBaseRole) {
      const astats = gsMC.autostaffStats.get(message.author.id) ?? { mods: 0, messages: 0, tier: -1 };
      astats.messages++;
      gsMC.autostaffStats.set(message.author.id, astats);
      if (astats.messages % 25 === 0) {
        checkAutostaffPromotion(message.guild!, message.author.id).catch(() => {});
      }
    }
  }

  // ─── Sticky: re-post at bottom of channel ────────────────────────────────
  const sticky = gsMC.stickyMessages.get(message.channelId);
  if (sticky && !blocked && checkCooldown(`sticky:${message.channelId}`, 5_000)) {
    try {
      await message.channel.messages
        .fetch(sticky.messageId)
        .then((m) => m.delete())
        .catch(() => {});
      const sent = await (message.channel as TextChannel).send(
        ` ${sticky.content}`,
      );
      gsMC.stickyMessages.set(message.channelId, {
        content: sticky.content,
        messageId: sent.id,
      });
    } catch {}
  }
});

// Flush stale per-channel tracking maps every 5 minutes to prevent
// unbounded growth as channels are created and deleted over time.
setInterval(() => {
  const now = Date.now();
  const STALE_MS = 5 * 60 * 1000;
  for (const [key, ts] of spamSweepAt) {
    if (now - ts > 30_000) spamSweepAt.delete(key);
  }
  for (const [key, ts] of _floodPrunedAt) {
    if (now - ts > STALE_MS) _floodPrunedAt.delete(key);
  }
  for (const [key, ts] of _floodResponseAt) {
    if (now - ts > STALE_MS) _floodResponseAt.delete(key);
  }
  // Cap the autoresponder regex cache to avoid unbounded growth
  // when guilds add many dynamic triggers.
  if (_arRegexCache.size > 500) _arRegexCache.clear();
}, 5 * 60 * 1000).unref();
