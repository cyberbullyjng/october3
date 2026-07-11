import {
  Guild,
  VoiceChannel,
  TextChannel,
  CategoryChannel,
  ChannelType,
  EmbedBuilder,
  Presence,
  ActivityType,
  Routes,
  PermissionFlagsBits,
} from "discord.js";
import type { GuildState, GiveawayData } from "./types.js";
import {
  PING_COOLDOWN_MS,
  STATS_DEBOUNCE_MS,
  SLOWMODE_WINDOW_MS,
  SLOWMODE_THRESHOLD,
  SLOWMODE_SECONDS,
  SLOWMODE_LIFT_AFTER_MS,
} from "./constants.js";
import {
  getGS,
  recentlyPinged,
  statsUpdateTimer,
  setStatsUpdateTimer,
  channelMessageTimes,
  slowmodeTimers,
  saveState,
} from "./state.js";
import client from "./client.js";
import {
  gch,
  fetchMember,
  findOrCreateTextChannel,
  findOrCreateVoiceChannel,
} from "./utils.js";
import { COLORS } from "./colors.js";

export async function checkAutostaffPromotion(guild: Guild, userId: string) {
  const gs = getGS(guild.id);
  if (!gs.autostaffEnabled || gs.autostaffTiers.length === 0) return;
  const stats = gs.autostaffStats.get(userId) ?? { mods: 0, messages: 0, tier: -1 };
  let topQualified = -1;
  for (let i = 0; i < gs.autostaffTiers.length; i++) {
    const tier = gs.autostaffTiers[i];
    if (stats.mods >= tier.minMods && stats.messages >= tier.minMessages) topQualified = i;
  }
  if (topQualified <= stats.tier) return;
  const newTier = gs.autostaffTiers[topQualified];
  try {
    const member = await fetchMember(guild, userId);
    for (let i = stats.tier + 1; i <= topQualified; i++) {
      await member.roles.add(gs.autostaffTiers[i].roleId).catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    }
    stats.tier = topQualified;
    gs.autostaffStats.set(userId, stats);
    saveState();
    const logCh = gs.autostaffLogChannelId ? gch(guild, gs.autostaffLogChannelId) : null;
    if (logCh) {
      await logCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle("Autostaff Promotion")
            .setDescription(`${member} has been promoted to **${newTier.label}**.`)
            .addFields(
              { name: "Mod Actions", value: `${stats.mods}`, inline: true },
              { name: "Messages", value: `${stats.messages}`, inline: true },
              { name: "New Role", value: `<@&${newTier.roleId}>`, inline: true },
            )
            .setTimestamp(),
        ],
      }).catch(() => {});
    }
  } catch {}
}

export async function recordModAction(
  guild: Guild,
  userId: string,
  type: string,
  reason: string,
  moderatorTag: string,
  executorId?: string,
): Promise<number> {
  const gs = getGS(guild.id);
  const caseId = ++gs.caseCounter;
  const history = gs.modHistory.get(userId) ?? [];
  history.push({ type, reason, moderator: moderatorTag, timestamp: Date.now(), caseId, targetId: userId });
  gs.modHistory.set(userId, history);
  gs.caseIndex.set(caseId, userId);
  if (executorId && gs.autostaffEnabled) {
    const stats = gs.autostaffStats.get(executorId) ?? { mods: 0, messages: 0, tier: -1 };
    stats.mods++;
    gs.autostaffStats.set(executorId, stats);
    checkAutostaffPromotion(guild, executorId).catch(() => {});
  }
  saveState();
  if (!gs.modLogChannelId) return caseId;
  const ch = gch(guild, gs.modLogChannelId);
  if (!ch) return caseId;
  const actionColors: Record<string, number> = {
    warn: COLORS.warning, kick: COLORS.orange, ban: COLORS.error,
    tempban: COLORS.error, softban: COLORS.error, mute: COLORS.primary,
    jail: COLORS.muted, unjail: COLORS.success, unmute: COLORS.success,
    unban: COLORS.success,
  };
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(actionColors[type] ?? COLORS.primary)
        .setTitle(type.charAt(0).toUpperCase() + type.slice(1))
        .setFooter({ text: `Case #${caseId} • ID: ${userId}` })
        .addFields(
          { name: "User", value: `<@${userId}> \`${userId}\``, inline: true },
          { name: "Moderator", value: moderatorTag, inline: true },
          { name: "Reason", value: reason },
        )
        .setTimestamp(),
    ],
  }).catch(() => {});
  return caseId;
}

export function isRepping(presence: Presence | null | undefined, keyword: string): boolean {
  if (!presence) return false;
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  for (const activity of presence.activities) {
    if (activity.type === ActivityType.Custom) {
      if ((activity.state?.toLowerCase() ?? "").includes(kw)) return true;
    }
  }
  return false;
}

export function getStatusText(presence: Presence | null | undefined): string {
  const custom = presence?.activities.find((a) => a.type === ActivityType.Custom);
  return custom?.state ?? "";
}

export async function syncRepRoles(guild: Guild): Promise<void> {
  const gs = getGS(guild.id);
  if (!gs.repRoleId || !gs.repEnabled) return;
  // Fetch all members with live presences so we catch everyone who is
  // already repping, not just those in the local cache.
  await guild.members.fetch({ withPresences: true } as any).catch(() => {});
  let added = 0, removed = 0;
  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    const repping = isRepping(member.presence, gs.repKeyword);
    const hasRole = member.roles.cache.has(gs.repRoleId);
    if (repping && !hasRole) {
      await member.roles.add(gs.repRoleId).catch(() => {});
      added++;
      await new Promise(r => setTimeout(r, 600));
    } else if (!repping && hasRole) {
      await member.roles.remove(gs.repRoleId).catch(() => {});
      removed++;
      await new Promise(r => setTimeout(r, 600));
    }
  }
  if (added || removed) {
    console.log(`[rep-sync] ${guild.name}: +${added} added, -${removed} removed`);
  }
}

export function canPing(userId: string): boolean {
  const last = recentlyPinged.get(userId);
  return !last || Date.now() - last > PING_COOLDOWN_MS;
}

export function scheduleStatsUpdate() {
  if (statsUpdateTimer) return;
  const t = setTimeout(async () => {
    setStatsUpdateTimer(null);
    await updateStats();
  }, STATS_DEBOUNCE_MS);
  t.unref();
  setStatsUpdateTimer(t);
}

export async function updateStats() {
  const tasks: Promise<void>[] = [];
  for (const guild of client.guilds.cache.values()) {
    const gs = getGS(guild.id);
    const memberCountChannel = gs.memberCountChannelId
      ? (guild.channels.cache.get(gs.memberCountChannelId) as VoiceChannel | undefined)
      : undefined;
    const onlineCountChannel = gs.onlineCountChannelId
      ? (guild.channels.cache.get(gs.onlineCountChannelId) as VoiceChannel | undefined)
      : undefined;
    if (!memberCountChannel && !onlineCountChannel) continue;
    tasks.push((async () => {
      try {
        const total = guild.memberCount;
        const online = guild.presences.cache.filter(
          (p) => !guild.members.cache.get(p.userId)?.user.bot &&
                  ["online", "dnd", "idle"].includes(p.status),
        ).size;
        const memberName = `Members: ${total}`;
        const onlineName = `Online: ${online}`;
        const renames: Promise<unknown>[] = [];
        if (memberCountChannel && memberCountChannel.name !== memberName) {
          renames.push(memberCountChannel.setName(memberName).catch((err) =>
            console.error("[stats] setName members failed:", err?.message ?? err)
          ));
        }
        if (onlineCountChannel && onlineCountChannel.name !== onlineName) {
          renames.push(onlineCountChannel.setName(onlineName).catch((err) =>
            console.error("[stats] setName online failed:", err?.message ?? err)
          ));
        }
        if (renames.length) await Promise.all(renames);
        console.log(`[stats] ${guild.name}: ${memberName} | ${onlineName}`);
      } catch (err) {
        console.error("[stats] Failed to update:", err);
      }
    })());
  }
  await Promise.allSettled(tasks);
}

export async function handleSlowmode(channel: TextChannel) {
  const now = Date.now();
  const times = (channelMessageTimes.get(channel.id) ?? []).filter(
    (t) => now - t < SLOWMODE_WINDOW_MS,
  );
  times.push(now);
  channelMessageTimes.set(channel.id, times);

  if (times.length >= SLOWMODE_THRESHOLD && channel.rateLimitPerUser === 0) {
    try {
      await channel.setRateLimitPerUser(SLOWMODE_SECONDS);
      console.log(`[slowmode] Enabled in #${channel.name} (${times.length} msgs/${SLOWMODE_WINDOW_MS / 1000}s)`);
    } catch {
      return;
    }
  }

  if (channel.rateLimitPerUser > 0) {
    const existing = slowmodeTimers.get(channel.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      slowmodeTimers.delete(channel.id);
      try {
        await channel.setRateLimitPerUser(0);
        console.log(`[slowmode] Lifted in #${channel.name}`);
      } catch { /* ignore */ }
    }, SLOWMODE_LIFT_AFTER_MS);
    slowmodeTimers.set(channel.id, timer);
  }
}

export async function setupJailSystem(guild: Guild) {
  const gs = getGS(guild.id);
  let jailedRole = guild.roles.cache.find((r) => r.name === "Jailed") ?? null;
  if (!jailedRole) {
    jailedRole = await guild.roles.create({
      name: "Jailed",
      color: 0x808080,
      permissions: [],
      reason: "Jail system setup",
    });
    console.log("[jail] Created Jailed role");
  }
  gs.jailRoleId = jailedRole.id;

  let jailCategory = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === "Jail",
  ) as CategoryChannel | undefined;
  if (!jailCategory) {
    jailCategory = (await guild.channels.create({
      name: "Jail",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: jailedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    })) as CategoryChannel;
  } else {
    await jailCategory.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => {});
    await jailCategory.permissionOverwrites.edit(jailedRole.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    }).catch(() => {});
  }

  const existing = guild.channels.cache.find(
    (c) => c.name === "jail" && c.parentId === jailCategory!.id,
  ) as TextChannel | undefined;

  let jailChannel: TextChannel;
  if (existing) {
    jailChannel = existing;
    await jailChannel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => {});
    await jailChannel.permissionOverwrites.edit(jailedRole.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    }).catch(() => {});
  } else {
    jailChannel = (await guild.channels.create({
      name: "jail",
      type: ChannelType.GuildText,
      parent: jailCategory.id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: jailedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    })) as TextChannel;
  }

  for (const [, channel] of guild.channels.cache) {
    if (channel.parentId === jailCategory.id) continue;
    if (!channel.isTextBased() && !channel.isVoiceBased()) continue;
    await (channel as TextChannel).permissionOverwrites.edit(jailedRole.id, { ViewChannel: false }).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
  }

  gs.jailChannelId = jailChannel.id;
  saveState();
  console.log("[jail] Jail system ready");
}

export async function runSetup(guild: Guild, gs: GuildState) {
  let category = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildCategory && ch.name === "Server Logs",
  ) as CategoryChannel | undefined;
  if (!category) {
    category = (await guild.channels.create({
      name: "Server Logs",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }],
    })) as CategoryChannel;
  } else {
    await category.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => {});
  }
  const OLD_LOG_NAMES = [
    "join-leave-log", "message-delete-log", "automod-log",
    "dm-log", "edit-log", "voice-log", "nickname-log",
  ];
  for (const ch of guild.channels.cache.values()) {
    if (
      ch.type === ChannelType.GuildText &&
      OLD_LOG_NAMES.includes(ch.name) &&
      (ch as TextChannel).parentId === category.id
    ) {
      await ch.delete("Consolidating log channels").catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  const modLogCh      = (await findOrCreateTextChannel(category, "mod-log",      true)).id;
  const activityLogCh = (await findOrCreateTextChannel(category, "activity-log", true)).id;
  const antinukeCh    = (await findOrCreateTextChannel(category, "antinuke-log", true)).id;
  const reportsCh     = (await findOrCreateTextChannel(category, "reports",      true)).id;

  gs.automodLogChannelId    = modLogCh;
  gs.dmLogChannelId         = modLogCh;
  gs.messageDeleteChannelId = modLogCh;
  gs.modLogChannelId        = modLogCh;
  gs.joinLeaveChannelId     = activityLogCh;
  gs.editLogChannelId       = activityLogCh;
  gs.voiceLogChannelId      = activityLogCh;
  gs.nicknameLogChannelId   = activityLogCh;
  gs.autostaffLogChannelId  = activityLogCh;
  gs.antinukeLogChannelId   = antinukeCh;
  gs.reportChannelId        = reportsCh;

  const mcc = await findOrCreateVoiceChannel(category, "Members: 0");
  const occ = await findOrCreateVoiceChannel(category, "Online: 0");
  gs.memberCountChannelId = mcc.id;
  gs.onlineCountChannelId = occ.id;
  await setupJailSystem(guild);
  saveState();
  console.log(`[setup] Channels ready in "${guild.name}"`);
}

export async function snapshotInvites(guildId: string) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const invites = await guild.invites.fetch();
    const snapshot = new Map<string, number>();
    invites.forEach((inv) => snapshot.set(inv.code, inv.uses ?? 0));
    const { inviteCache } = await import("./state.js");
    inviteCache.set(guildId, snapshot);
  } catch {}
}

export async function resolveGiveaway(gw: GiveawayData, reroll = false): Promise<boolean> {
  const { activeGiveawayTimers } = await import("./state.js");
  try {
    const guild = client.guilds.cache.get(gw.guildId);
    if (!guild) return false;
    const channel = (guild.channels.cache.get(gw.channelId) ?? await guild.channels.fetch(gw.channelId).catch(() => null)) as TextChannel | null;
    if (!channel?.isTextBased()) return false;
    type RawUser = { id: string; bot?: boolean };
    let rawUsers: RawUser[] = [];
    try {
      let after: string | undefined;
      do {
        const batch = await client.rest.get(
          Routes.channelMessageReaction(gw.channelId, gw.messageId, encodeURIComponent("🎉")),
          { query: new URLSearchParams({ limit: "100", ...(after ? { after } : {}) }) },
        ) as RawUser[];
        rawUsers.push(...batch);
        after = batch.length === 100 ? batch[batch.length - 1]?.id : undefined;
      } while (after);
    } catch (err) {
      console.error("[giveaway] Failed to fetch reaction users:", err);
      rawUsers = [];
    }
    const entrantIds = [...new Set(rawUsers.filter(u => !u.bot && u.id !== client.user!.id).map(u => u.id))];

    if (entrantIds.length === 0) {
      await channel.send({ content: reroll ? "Couldn't reroll this giveaway because nobody entered." : "The giveaway ended but nobody entered.", reply: { messageReference: gw.messageId } });
      if (!reroll) {
        const gMsg = await channel.messages.fetch(gw.messageId).catch(() => null);
        if (gMsg) {
          await gMsg.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.error)
                .setTitle("Giveaway Ended")
                .setDescription(`**${gw.prize}**\n\nWinner(s): None`)
                .setFooter({ text: `Hosted by ${gw.hostTag}` })
                .setTimestamp(),
            ],
          }).catch(() => {});
        }
        const gs = getGS(gw.guildId);
        const stored = gs.giveaways.get(gw.messageId);
        if (stored) stored.ended = true;
        else { gw.ended = true; gs.giveaways.set(gw.messageId, gw); }
        saveState();
      }
      return true;
    }

    const count = Math.min(gw.winnerCount, entrantIds.length);
    for (let i = entrantIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entrantIds[i], entrantIds[j]] = [entrantIds[j], entrantIds[i]];
    }
    const winnerIds = entrantIds.slice(0, count);
    const winnerMentions = winnerIds.map(id => `<@${id}>`).join(", ");
    const verb = reroll ? "rerolled" : "won";
    await channel.send({ content: `Congratulations ${winnerMentions}! You ${verb} **${gw.prize}**!`, reply: { messageReference: gw.messageId } });

    if (!reroll) {
      const gMsg = await channel.messages.fetch(gw.messageId).catch(() => null);
      if (gMsg) {
        await gMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle("Giveaway Ended")
              .setDescription(`**${gw.prize}**\n\nWinner(s): ${winnerMentions}`)
              .setFooter({ text: `Hosted by ${gw.hostTag}` })
              .setTimestamp(),
          ],
        }).catch(() => {});
      }
      const gs = getGS(gw.guildId);
      const stored = gs.giveaways.get(gw.messageId);
      if (stored) stored.ended = true;
      else { gw.ended = true; gs.giveaways.set(gw.messageId, gw); }
      saveState();
    }
    console.log(`[giveaway] ${reroll ? "Rerolled" : "Ended"}: "${gw.prize}" — winner(s): ${winnerMentions}`);
    return true;
  } catch (err) {
    console.error("[giveaway] resolveGiveaway error:", err);
    return false;
  }
}

export function scheduleGiveaway(gw: GiveawayData): void {
  import("./state.js").then(({ activeGiveawayTimers }) => {
    const existing = activeGiveawayTimers.get(gw.messageId);
    if (existing) clearTimeout(existing);
    const delay = Math.max(0, gw.endsAt - Date.now());
    const timer = setTimeout(async () => {
      activeGiveawayTimers.delete(gw.messageId);
      await resolveGiveaway(gw);
    }, delay);
    activeGiveawayTimers.set(gw.messageId, timer);
  });
}

export function scheduleTempRoleRemoval(
  guild: Guild,
  userId: string,
  roleId: string,
  expiresAt: number,
): void {
  const run = async () => {
    try {
      const gs = getGS(guild.id);
      const entries = gs.tempRoles.get(userId);
      if (entries) {
        const updated = entries.filter((e) => !(e.roleId === roleId && e.expiresAt === expiresAt));
        if (updated.length === 0) gs.tempRoles.delete(userId);
        else gs.tempRoles.set(userId, updated);
        saveState();
      }
      const member = await fetchMember(guild, userId).catch(() => null);
      if (!member) return;
      if (!member.roles.cache.has(roleId)) return;
      await member.roles.remove(roleId, "Temp role expired").catch(() => {});
    } catch {}
  };
  const delay = expiresAt - Date.now();
  if (delay <= 0) {
    run();
  } else {
    setTimeout(run, delay);
  }
}
