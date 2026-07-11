import {
  Guild,
  GuildChannel,
  ChannelType,
  TextChannel,
  VoiceChannel,
  EmbedBuilder,
  Message,
} from "discord.js";
import type { BackupChannel, BackupOverwrite, BackupRole, ServerBackup } from "./types.js";
import { ANTINUKE_WINDOW_MS } from "./constants.js";
import { getGS, saveState } from "./state.js";
import { gch, fetchMember, rQueue } from "./utils.js";
import { COLORS } from "./colors.js";

export const ANTINUKE_RESTORE_BACKUP_ID = "__ANTINUKE_AUTO__";

function backupOverwrites(ch: GuildChannel): BackupOverwrite[] {
  return [...ch.permissionOverwrites.cache.values()].map((ow) => ({
    id: ow.id,
    type: ow.type as 0 | 1,
    allow: ow.allow.bitfield.toString(),
    deny: ow.deny.bitfield.toString(),
  }));
}

export async function createServerSnapshot(guild: Guild, createdBy: string, id?: string): Promise<ServerBackup> {
  await guild.roles.fetch();
  await guild.channels.fetch();

  const roles: BackupRole[] = guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed)
    .sort((a, b) => a.position - b.position)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      permissions: role.permissions.bitfield.toString(),
      position: role.position,
      hoist: role.hoist,
      mentionable: role.mentionable,
    }));

  const categories: BackupChannel[] = guild.channels.cache
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: channel.position,
      topic: null,
      nsfw: false,
      rateLimitPerUser: 0,
      parentId: null,
      overwrites: backupOverwrites(channel as GuildChannel),
    }));

  const channels: BackupChannel[] = guild.channels.cache
    .filter((channel) =>
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildVoice ||
      channel.type === ChannelType.GuildAnnouncement ||
      channel.type === ChannelType.GuildStageVoice ||
      channel.type === ChannelType.GuildForum
    )
    .sort((a, b) => a.position - b.position)
    .map((channel) => {
      const ch = channel as TextChannel & VoiceChannel & { topic?: string | null; nsfw?: boolean; rateLimitPerUser?: number; parentId?: string | null };
      return {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        position: channel.position,
        topic: ch.topic ?? null,
        nsfw: ch.nsfw ?? false,
        rateLimitPerUser: ch.rateLimitPerUser ?? 0,
        parentId: ch.parentId ?? null,
        overwrites: backupOverwrites(channel as GuildChannel),
        bitrate: ch.bitrate,
        userLimit: ch.userLimit,
      };
    });

  return {
    id: id ?? Math.random().toString(16).slice(2, 10).toUpperCase(),
    createdAt: Date.now(),
    createdBy,
    guildName: guild.name,
    memberCount: guild.memberCount,
    roles,
    categories,
    channels,
  };
}

export async function refreshAntinukeRestoreSnapshot(guild: Guild, createdBy = "system"): Promise<ServerBackup> {
  const backup = await createServerSnapshot(guild, createdBy, ANTINUKE_RESTORE_BACKUP_ID);
  getGS(guild.id).backups.set(ANTINUKE_RESTORE_BACKUP_ID, backup);
  saveState();
  return backup;
}

function resolveOverwriteRoleId(guild: Guild, backup: ServerBackup, roleMap: Map<string, string>, oldId: string): string | null {
  if (oldId === guild.id) return guild.id;
  if (guild.roles.cache.has(oldId)) return oldId;
  const mapped = roleMap.get(oldId);
  if (mapped && guild.roles.cache.has(mapped)) return mapped;
  const backupRole = backup.roles.find((role) => role.id === oldId);
  if (!backupRole) return null;
  const current = guild.roles.cache.find((role) => role.name === backupRole.name && !role.managed);
  return current?.id ?? null;
}

function mapBackupOverwrites(guild: Guild, backup: ServerBackup, roleMap: Map<string, string>, overwrites: BackupOverwrite[]) {
  return overwrites
    .map((ow) => {
      const id = ow.type === 0 ? resolveOverwriteRoleId(guild, backup, roleMap, ow.id) : ow.id;
      if (!id) return null;
      return {
        id,
        type: ow.type,
        allow: BigInt(ow.allow),
        deny: BigInt(ow.deny),
      };
    })
    .filter(Boolean);
}

async function restoreRoleFromBackup(guild: Guild, backup: ServerBackup, oldRoleId: string, roleMap: Map<string, string>) {
  const backupRole = backup.roles.find((role) => role.id === oldRoleId);
  if (!backupRole) return null;
  const existing = guild.roles.cache.get(oldRoleId)
    ?? guild.roles.cache.find((role) => role.name === backupRole.name && !role.managed);
  if (existing) {
    roleMap.set(oldRoleId, existing.id);
    return existing;
  }

  const role = await guild.roles.create({
    name: backupRole.name,
    color: backupRole.color,
    permissions: BigInt(backupRole.permissions),
    hoist: backupRole.hoist,
    mentionable: backupRole.mentionable,
    reason: "Antinuke restore: role deleted during raid",
  }).catch((err) => {
    console.error(`[antinuke-restore] Failed to recreate role ${backupRole.name}:`, err);
    return null;
  });
  if (!role) return null;
  roleMap.set(oldRoleId, role.id);
  await role.setPosition(backupRole.position, "Antinuke restore: restoring role position").catch(() => {});
  return role;
}

async function restoreChannelFromBackup(guild: Guild, backup: ServerBackup, oldChannelId: string, roleMap: Map<string, string>): Promise<GuildChannel | null> {
  const backupChannel = backup.categories.find((channel) => channel.id === oldChannelId)
    ?? backup.channels.find((channel) => channel.id === oldChannelId);
  if (!backupChannel) return null;
  const existing = guild.channels.cache.get(oldChannelId)
    ?? guild.channels.cache.find((channel) => channel.name === backupChannel.name && channel.type === backupChannel.type);
  if (existing && "guild" in existing) return existing as GuildChannel;

  let parent: string | undefined;
  if (backupChannel.parentId) {
    let parentChannel = guild.channels.cache.get(backupChannel.parentId) as GuildChannel | undefined;
    if (!parentChannel) parentChannel = await restoreChannelFromBackup(guild, backup, backupChannel.parentId, roleMap) ?? undefined;
    parent = parentChannel?.id;
  }

  const options: any = {
    name: backupChannel.name,
    type: backupChannel.type,
    position: backupChannel.position,
    permissionOverwrites: mapBackupOverwrites(guild, backup, roleMap, backupChannel.overwrites),
    reason: "Antinuke restore: channel deleted during raid",
    ...(parent ? { parent } : {}),
  };
  if (backupChannel.type === ChannelType.GuildText || backupChannel.type === ChannelType.GuildAnnouncement || backupChannel.type === ChannelType.GuildForum) {
    if (backupChannel.topic) options.topic = backupChannel.topic;
    options.nsfw = backupChannel.nsfw;
    options.rateLimitPerUser = backupChannel.rateLimitPerUser;
  }
  if (backupChannel.type === ChannelType.GuildVoice || backupChannel.type === ChannelType.GuildStageVoice) {
    if (backupChannel.bitrate) options.bitrate = backupChannel.bitrate;
    if (backupChannel.userLimit !== undefined) options.userLimit = backupChannel.userLimit;
  }

  const restored = await guild.channels.create(options).catch((err) => {
    console.error(`[antinuke-restore] Failed to recreate channel ${backupChannel.name}:`, err);
    return null;
  });
  if (!restored) return null;
  await restored.setPosition(backupChannel.position, { reason: "Antinuke restore: restoring channel position" }).catch(() => {});
  return restored as GuildChannel;
}

export async function restoreAntinukeDeletedItems(guild: Guild, roleIds: string[], channelIds: string[]): Promise<{ roles: number; channels: number; missing: number }> {
  const gs = getGS(guild.id);
  const backup = gs.backups.get(ANTINUKE_RESTORE_BACKUP_ID);
  if (!backup) return { roles: 0, channels: 0, missing: roleIds.length + channelIds.length };
  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});
  const roleMap = new Map<string, string>();
  let roles = 0;
  let channels = 0;
  let missing = 0;

  for (const roleId of [...new Set(roleIds)]) {
    const restored = await restoreRoleFromBackup(guild, backup, roleId, roleMap);
    if (restored) roles++;
    else missing++;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  const sortedChannels = [...new Set(channelIds)].sort((a, b) => {
    const aIsCategory = backup.categories.some((channel) => channel.id === a);
    const bIsCategory = backup.categories.some((channel) => channel.id === b);
    return Number(bIsCategory) - Number(aIsCategory);
  });
  for (const channelId of sortedChannels) {
    const restored = await restoreChannelFromBackup(guild, backup, channelId, roleMap);
    if (restored) channels++;
    else missing++;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  return { roles, channels, missing };
}

export async function restoreAllFromSnapshot(guild: Guild): Promise<{ roles: number; channels: number; missing: number; skipped: number }> {
  const gs = getGS(guild.id);
  const backup = gs.backups.get(ANTINUKE_RESTORE_BACKUP_ID);
  if (!backup) return { roles: 0, channels: 0, missing: 0, skipped: 0 };

  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});

  const roleMap = new Map<string, string>();
  let roles = 0;
  let channels = 0;
  let missing = 0;
  let skipped = 0;

  const missingRoleIds = backup.roles
    .filter((br) => {
      if (guild.roles.cache.get(br.id)) return false;
      if (guild.roles.cache.find((r) => r.name === br.name && !r.managed)) return false;
      return true;
    })
    .map((br) => br.id);

  for (const roleId of missingRoleIds) {
    const restored = await restoreRoleFromBackup(guild, backup, roleId, roleMap);
    if (restored) roles++;
    else missing++;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  const allBackupChannels = [
    ...backup.categories.map((c) => ({ ...c, isCategory: true })),
    ...backup.channels.map((c) => ({ ...c, isCategory: false })),
  ];

  const missingChannelIds = allBackupChannels
    .filter((bc) => {
      if (guild.channels.cache.get(bc.id)) return false;
      if (guild.channels.cache.find((c) => c.name === bc.name && c.type === bc.type)) return false;
      return true;
    })
    .sort((a, b) => Number(b.isCategory) - Number(a.isCategory))
    .map((bc) => bc.id);

  for (const channelId of missingChannelIds) {
    const restored = await restoreChannelFromBackup(guild, backup, channelId, roleMap);
    if (restored) channels++;
    else missing++;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  skipped = backup.roles.length + backup.categories.length + backup.channels.length
    - missingRoleIds.length - missingChannelIds.length;

  return { roles, channels, missing, skipped };
}

export function getAntinukeActions(guildId: string, userId: string) {
  const gs = getGS(guildId);
  if (!gs.antinukeActions.has(userId)) {
    gs.antinukeActions.set(userId, { bans: [], kicks: [], channelDeletes: [], roleDeletes: [], botAdds: [] });
  }
  return gs.antinukeActions.get(userId)!;
}

export function countRecent(timestamps: number[], windowMs: number = ANTINUKE_WINDOW_MS): number {
  const now = Date.now();
  const recent = timestamps.filter((t) => now - t < windowMs);
  timestamps.splice(0, timestamps.length, ...recent);
  return recent.length;
}

// Tracks guilds+users currently being punished to prevent simultaneous duplicate punishments
const punishLock = new Set<string>();

export async function punishAntinuke(guild: Guild, userId: string, reason: string) {
  const lockKey = `${guild.id}:${userId}`;
  if (punishLock.has(lockKey)) return;
  punishLock.add(lockKey);
  const gs = getGS(guild.id);
  if (gs.antinukeWhitelist.has(userId)) { punishLock.delete(lockKey); return; }
  console.warn(`[antinuke] Triggering on ${userId}: ${reason}`);
  try {
    const member = await fetchMember(guild, userId).catch(() => null);
    if (member) await member.roles.set([]).catch(() => {});

    let antinukeDeletedCount = 0;
    for (const [, ch] of guild.channels.cache) {
      if (antinukeDeletedCount >= 10) break;
      if (!ch.isTextBased()) continue;
      try {
        const fetched = await (ch as TextChannel).messages.fetch({ limit: 100 }).catch(() => null);
        if (!fetched) continue;
        const need = 10 - antinukeDeletedCount;
        const userMsgs = fetched.filter((m: Message) => m.author.id === userId).first(need);
        await Promise.all(userMsgs.map((m: Message) => m.delete().catch(() => {})));
        antinukeDeletedCount += userMsgs.length;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }

    await guild.bans.create(userId, { reason: `[Antinuke] ${reason}` }).catch(() => {});
    const antinukeLogChannel = gch(guild, gs.antinukeLogChannelId);
    if (antinukeLogChannel) {
      await antinukeLogChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle("Antinuke Triggered")
            .addFields(
              { name: "User", value: `<@${userId}> (${userId})`, inline: true },
              { name: "Reason", value: reason },
              { name: "Action Taken", value: `All roles stripped + Banned + ${antinukeDeletedCount} message${antinukeDeletedCount !== 1 ? "s" : ""} deleted` },
            )
            .setTimestamp(),
        ],
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[antinuke] punish error:", err);
  } finally {
    punishLock.delete(lockKey);
  }
}
