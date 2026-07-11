import { Events, EmbedBuilder, TextChannel, ChannelType, AuditLogEvent, PermissionFlagsBits } from "discord.js";
import type { Guild } from "discord.js";
import client from "../client.js";
import { getGS, saveState, inviteCache } from "../state.js";
import { gch, fetchMember, getAntinukeActions, countRecent, punishAntinuke, rQueue, restoreAntinukeDeletedItems, refreshAntinukeRestoreSnapshot } from "../utils.js";
import { COLORS } from "../colors.js";

// ─── Audit log result cache ───────────────────────────────────────────────────
// Reuses the last fetched result per guild+type within a short window so rapid
// events (bans, kicks, channel deletes during a raid) don't each fire a fresh
// API request and hit the audit log rate limit.
const auditLogCache = new Map<string, { ts: number; logs: any }>();
const AUDIT_LOG_CACHE_TTL_MS = 1500;

async function fetchAuditLogsCached(guild: Guild, type: AuditLogEvent, limit: number): Promise<any> {
  const key = `${guild.id}:${type}`;
  const cached = auditLogCache.get(key);
  if (cached && Date.now() - cached.ts < AUDIT_LOG_CACHE_TTL_MS) return cached.logs;
  const logs = await guild.fetchAuditLogs({ type, limit });
  auditLogCache.set(key, { ts: Date.now(), logs });
  return logs;
}

// Prune the audit log cache every 30 seconds to avoid unbounded growth.
setInterval(() => {
  const cutoff = Date.now() - AUDIT_LOG_CACHE_TTL_MS * 4;
  for (const [key, entry] of auditLogCache) {
    if (entry.ts < cutoff) auditLogCache.delete(key);
  }
}, 30_000).unref();

const antinukeDeletedChannels = new Map<string, { id: string; ts: number }[]>();
const antinukeDeletedRoles = new Map<string, { id: string; ts: number }[]>();

export { antinukeDeletedChannels, antinukeDeletedRoles };

// Prune stale entries from antinuke tracking maps every 10 minutes.
const ANTINUKE_MAP_TTL = 10 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - ANTINUKE_MAP_TTL;
  for (const [key, entries] of antinukeDeletedChannels) {
    const fresh = entries.filter(e => e.ts > cutoff);
    if (fresh.length === 0) antinukeDeletedChannels.delete(key);
    else antinukeDeletedChannels.set(key, fresh);
  }
  for (const [key, entries] of antinukeDeletedRoles) {
    const fresh = entries.filter(e => e.ts > cutoff);
    if (fresh.length === 0) antinukeDeletedRoles.delete(key);
    else antinukeDeletedRoles.set(key, fresh);
  }
}, ANTINUKE_MAP_TTL).unref();

function trackAntinukeDeleted(map: Map<string, { id: string; ts: number }[]>, key: string, id: string, windowMs: number): string[] {
  const now = Date.now();
  const fresh = (map.get(key) ?? []).filter((entry) => now - entry.ts <= windowMs);
  fresh.push({ id, ts: now });
  map.set(key, fresh);
  return [...new Set(fresh.map((entry) => entry.id))];
}

async function logAntinukeRestore(guild: import("discord.js").Guild, executorId: string, type: "channels" | "roles", result: { roles: number; channels: number; missing: number }) {
  const gs = getGS(guild.id);
  const logCh = gch(guild, gs.antinukeLogChannelId);
  if (!logCh) return;
  await logCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(result.missing ? 0xfee75c : 0x57f287)
        .setTitle("Antinuke Restore Complete")
        .addFields(
          { name: "Trigger", value: `Mass ${type} deletion by <@${executorId}>`, inline: false },
          { name: "Roles Restored", value: `${result.roles}`, inline: true },
          { name: "Channels Restored", value: `${result.channels}`, inline: true },
          { name: "Not Found in Snapshot", value: `${result.missing}`, inline: true },
        )
        .setTimestamp(),
    ],
  }).catch(() => {});
}

// ─── Webhook Protection ───────────────────────────────────────────────────────
client.on(Events.WebhooksUpdate, async (channel) => {
  const gsWH = getGS(channel.guildId);
  if (!gsWH.antinukeEnabled) return;
  try {
    const webhooks = await (channel as TextChannel).fetchWebhooks();
    const guild = channel.guild ?? await client.guilds.fetch(channel.guildId);
    const auditLogs = await fetchAuditLogsCached(guild, AuditLogEvent.WebhookCreate, 5);

    for (const entry of auditLogs.entries.values()) {
      const executor = entry.executor;
      if (!executor) continue;
      if (gsWH.antinukeWhitelist.has(executor.id)) continue;
      if (Date.now() - entry.createdTimestamp > 10_000) continue;

      const webhook = webhooks.find((wh) => wh.id === (entry.target as any)?.id);
      if (webhook) {
        if (webhook.name === "oct-uwu") continue;
        await webhook.delete("Unauthorized webhook — TOS protection").catch(() => {});
        console.log(`[webhook-protection] Deleted unauthorized webhook by ${executor.tag}`);
        const webhookAutomodLog = gch(guild, gsWH.automodLogChannelId);
        if (webhookAutomodLog) {
          await webhookAutomodLog.send({ embeds: [
            new EmbedBuilder().setColor(COLORS.error).setTitle("Unauthorized Webhook Deleted")
              .addFields(
                { name: "Creator", value: `${executor.tag} (${executor.id})`, inline: true },
                { name: "Channel", value: `<#${channel.id}>`, inline: true },
                { name: "Webhook Name", value: webhook.name || "Unknown", inline: true },
              ).setFooter({ text: "Webhook was automatically removed." }).setTimestamp()
          ]}).catch(() => {});
        }
        try {
          const member = await fetchMember(guild, executor.id);
          await member.kick("Created unauthorized webhook");
        } catch {}
      }
    }
  } catch (err) {
    console.error("[webhook-protection] error:", err);
  }
});

// ─── Invite Cache Maintenance ─────────────────────────────────────────────────
client.on(Events.InviteCreate, (invite) => {
  const cache = inviteCache.get(invite.guild?.id ?? "") ?? new Map<string, number>();
  cache.set(invite.code, invite.uses ?? 0);
  if (invite.guild) inviteCache.set(invite.guild.id, cache);
});

client.on(Events.InviteDelete, (invite) => {
  const cache = inviteCache.get(invite.guild?.id ?? "");
  if (cache) cache.delete(invite.code);
});

// ─── Antinuke: Permission Guard ──────────────────────────────────────────────
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const guild = newMember.guild;
  const gs = getGS(guild.id);
  if (!gs.antinukeEnabled || !gs.permGuardEnabled) return;
  if (gs.permGuardWhitelist.has(newMember.id)) return;
  if (newMember.id === client.user?.id) return;

  const oldRoleIds = new Set(oldMember.roles.cache.keys());
  const addedRoles = newMember.roles.cache.filter((r) => !oldRoleIds.has(r.id));
  if (addedRoles.size === 0) return;

  const dangerousRoles = addedRoles.filter(
    (r) => !r.managed && r.id !== guild.roles.everyone.id && r.permissions.has(PermissionFlagsBits.Administrator)
  );
  if (dangerousRoles.size === 0) return;

  const stripped: string[] = [];
  await rQueue([...dangerousRoles.values()], async (role) => {
    const removed = await newMember.roles.remove(role, "Permission Guard: dangerous perm on non-whitelisted member").catch(() => null);
    if (removed !== null) stripped.push(role.id);
  }, 300);
  if (stripped.length === 0) return;

  try {
    const executor = await fetchAuditLogsCached(guild, AuditLogEvent.MemberRoleUpdate, 1)
      .then((logs: any) => logs.entries.first()?.executor ?? null)
      .catch(() => null);

    const logCh = gch(guild, gs.antinukeLogChannelId);
    const dangerNames = stripped.map((id) => `<@&${id}>`).join(", ");
    const embed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setTitle("Permission Guard — Dangerous Role Stripped")
      .addFields(
        { name: "Member", value: `${newMember.user.tag} (<@${newMember.id}>)`, inline: true },
        { name: "Roles Stripped", value: dangerNames, inline: false },
        { name: "Assigned By", value: executor ? `${executor.tag} (<@${executor.id}>)` : "Unknown", inline: true },
        { name: "Status", value: "Non-whitelisted — roles removed instantly", inline: true },
      )
      .setFooter({ text: "Add this user to the permguard whitelist with !permguardwhitelist add @user to allow them to hold these roles." })
      .setTimestamp();

    if (logCh) await logCh.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("[permguard] log error:", err);
  }
});

// ─── Antinuke: Mass Ban Detection ────────────────────────────────────────────
client.on(Events.GuildBanAdd, async (ban) => {
  const guild = ban.guild;
  const gsB = getGS(guild.id);
  if (!gsB.antinukeEnabled) return;
  try {
    const logs = await fetchAuditLogsCached(guild, AuditLogEvent.MemberBanAdd, 5);
    const entry = logs.entries.find(
      (e: any) => (e.target as any)?.id === ban.user?.id && Date.now() - e.createdTimestamp < 5000
    );
    if (!entry?.executor) return;
    const executorId = entry.executor.id;
    if (executorId === client.user?.id) return;
    if (gsB.antinukeWhitelist.has(executorId)) return;
    const actions = getAntinukeActions(guild.id, executorId);
    actions.bans.push(Date.now());
    const recentBans = countRecent(actions.bans, gsB.antinukeWindowMs);
    if (recentBans >= (gsB.antinukeThresholds.bans ?? 3)) {
      await punishAntinuke(guild, executorId, `Mass ban detected (${recentBans} bans in ${gsB.antinukeWindowMs / 1000}s)`);
    }
  } catch (err) {
    console.error("[antinuke] ban check error:", err);
  }
});

// ─── Antinuke: Mass Kick Detection ───────────────────────────────────────────
client.on(Events.GuildMemberRemove, async (member) => {
  const guild = member.guild;
  const gsK = getGS(guild.id);
  if (!gsK.antinukeEnabled) return;
  try {
    const logs = await fetchAuditLogsCached(guild, AuditLogEvent.MemberKick, 5);
    const entry = logs.entries.find(
      (e: any) => (e.target as any)?.id === member.id && Date.now() - e.createdTimestamp < 5000
    );
    if (!entry?.executor) return;
    const executorId = entry.executor.id;
    if (executorId === client.user?.id) return;
    if (gsK.antinukeWhitelist.has(executorId)) return;
    const actions = getAntinukeActions(guild.id, executorId);
    actions.kicks.push(Date.now());
    const recentKicks = countRecent(actions.kicks, gsK.antinukeWindowMs);
    if (recentKicks >= (gsK.antinukeThresholds.kicks ?? 3)) {
      await punishAntinuke(guild, executorId, `Mass kick detected (${recentKicks} kicks in ${gsK.antinukeWindowMs / 1000}s)`);
    }
  } catch (err) {
    console.error("[antinuke] kick check error:", err);
  }
});

// ─── Antinuke: Mass Channel Delete Detection ─────────────────────────────────
client.on(Events.ChannelDelete, async (channel) => {
  if (!("guild" in channel) || !channel.guild) return;
  const guild = channel.guild;
  const gsC = getGS(guild.id);

  // ── Welcome channel recovery ─────────────────────────────────────────────
  if (gsC.welcomeChannelId && channel.id === gsC.welcomeChannelId) {
    const oldName = (channel as { name?: string }).name ?? "welcome";
    const oldParentId = (channel as { parentId?: string | null }).parentId ?? null;
    setTimeout(async () => {
      try {
        const existing = guild.channels.cache.find(
          c => c.type === ChannelType.GuildText && c.name === oldName && (c as TextChannel).parentId === oldParentId
        ) as TextChannel | undefined;
        if (existing) {
          gsC.welcomeChannelId = existing.id;
          saveState();
          console.log(`[welcome] Repointed welcome channel to existing #${existing.name} in ${guild.name}`);
        } else {
          const newCh = await guild.channels.create({
            name: oldName,
            type: ChannelType.GuildText,
            ...(oldParentId ? { parent: oldParentId } : {}),
            reason: "Welcome channel was deleted — auto-recreated by bot",
          }) as TextChannel;
          gsC.welcomeChannelId = newCh.id;
          saveState();
          console.log(`[welcome] Recreated welcome channel #${newCh.name} in ${guild.name}`);
        }
      } catch (err) {
        console.error("[welcome] Failed to recover welcome channel:", err);
      }
    }, 1500);
  }

  if (!gsC.antinukeEnabled) return;
  try {
    const logs = await fetchAuditLogsCached(guild, AuditLogEvent.ChannelDelete, 5);
    const entry = logs.entries.find(
      (e: any) => (e.target as any)?.id === channel.id && Date.now() - e.createdTimestamp < 5000
    );
    if (!entry?.executor) return;
    const executorId = entry.executor.id;
    if (executorId === client.user?.id) return;
    if (gsC.antinukeWhitelist.has(executorId)) return;
    const restoreKey = `${guild.id}:${executorId}`;
    const deletedChannelIds = trackAntinukeDeleted(antinukeDeletedChannels, restoreKey, channel.id, gsC.antinukeWindowMs);
    const actions = getAntinukeActions(guild.id, executorId);
    actions.channelDeletes.push(Date.now());
    const recentDeletes = countRecent(actions.channelDeletes, gsC.antinukeWindowMs);
    if (recentDeletes >= (gsC.antinukeThresholds.channelDeletes ?? 2)) {
      await punishAntinuke(guild, executorId, `Mass channel deletion detected (${recentDeletes} deletions in ${gsC.antinukeWindowMs / 1000}s)`);
      if (gsC.antinukeRestoreEnabled) {
        const result = await restoreAntinukeDeletedItems(guild, [], deletedChannelIds);
        await logAntinukeRestore(guild, executorId, "channels", result);
      }
    }
  } catch (err) {
    console.error("[antinuke] channel delete check error:", err);
  }
});

// ─── Antinuke: Mass Role Delete Detection ────────────────────────────────────
client.on(Events.GuildRoleDelete, async (role) => {
  const guild = role.guild;
  const gsR = getGS(guild.id);
  if (!gsR.antinukeEnabled) return;
  try {
    const logs = await fetchAuditLogsCached(guild, AuditLogEvent.RoleDelete, 5);
    const entry = logs.entries.find(
      (e: any) => (e.target as any)?.id === role.id && Date.now() - e.createdTimestamp < 5000
    );
    if (!entry?.executor) return;
    const executorId = entry.executor.id;
    if (executorId === client.user?.id) return;
    if (gsR.antinukeWhitelist.has(executorId)) return;
    const restoreKey = `${guild.id}:${executorId}`;
    const deletedRoleIds = trackAntinukeDeleted(antinukeDeletedRoles, restoreKey, role.id, gsR.antinukeWindowMs);
    const actions = getAntinukeActions(guild.id, executorId);
    actions.roleDeletes.push(Date.now());
    const recentRoleDeletes = countRecent(actions.roleDeletes, gsR.antinukeWindowMs);
    if (recentRoleDeletes >= (gsR.antinukeThresholds.roleDeletes ?? 2)) {
      await punishAntinuke(guild, executorId, `Mass role deletion detected (${recentRoleDeletes} deletions in ${gsR.antinukeWindowMs / 1000}s)`);
      if (gsR.antinukeRestoreEnabled) {
        const result = await restoreAntinukeDeletedItems(guild, deletedRoleIds, []);
        await logAntinukeRestore(guild, executorId, "roles", result);
      }
    }
  } catch (err) {
    console.error("[antinuke] role delete check error:", err);
  }
});
