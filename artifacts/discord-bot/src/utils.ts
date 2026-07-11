import {
  Guild,
  GuildMember,
  Role,
  TextChannel,
  VoiceChannel,
  CategoryChannel,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import type { Message } from "discord.js";
import { autoresponderCooldowns } from "./state.js";
import client from "./client.js";
import { COLORS } from "./colors.js";
import { isOwner } from "./constants.js";

// ─── Channel helper ───────────────────────────────────────────────────────────
export function gch(guild: Guild, id: string | null): TextChannel | null {
  if (!id) return null;
  return (guild.channels.cache.get(id) as TextChannel | undefined) ?? null;
}

// ─── Member cache helper ───────────────────────────────────────────────────────
export async function ensureMembersCache(guild: Guild): Promise<void> {
  const cached = guild.members.cache.size;
  const total = guild.memberCount ?? 0;
  if (total > 0 && cached >= total * 0.9) return;
  await guild.members.fetch().catch(() => {});
}

// ─── XP helpers ───────────────────────────────────────────────────────────────
export function xpForLevel(level: number): number { return level * level * 100; }
export function levelFromXp(xp: number): number { return Math.floor(Math.sqrt(xp / 100)); }

// ─── Cache-first fetch helpers ────────────────────────────────────────────────
export async function fetchMember(guild: Guild, userId: string): Promise<GuildMember> {
  return guild.members.cache.get(userId) ?? await guild.members.fetch(userId);
}

export async function fetchRole(guild: Guild, roleId: string): Promise<Role | null> {
  return guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
}

export function resolveRole(guild: Guild, raw: string): Role | null {
  if (!raw) return null;
  const id    = raw.replace(/[<@&>]/g, "").trim();
  const lower = raw.trim().toLowerCase();
  return (
    guild.roles.cache.get(id) ??
    guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ??
    guild.roles.cache.find((r) => r.name.toLowerCase().includes(lower)) ??
    null
  );
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
export async function fetchGuildChannel(guild: Guild, channelId: string) {
  return guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
}

// ─── Rate-limited queue ───────────────────────────────────────────────────────
export async function rQueue<T>(items: T[], fn: (item: T) => Promise<void>, delayMs = 100): Promise<void> {
  for (const item of items) {
    let attempts = 0;
    while (attempts < 4) {
      try {
        await fn(item);
        break;
      } catch (err: any) {
        if (err?.status === 429 || err?.httpStatus === 429) {
          const waitMs = ((err?.rawError?.retry_after ?? err?.retryAfter ?? 1)) * 1000;
          await new Promise<void>((r) => setTimeout(r, waitMs + 50));
          attempts++;
        } else {
          break;
        }
      }
    }
    if (delayMs > 0) await new Promise<void>((r) => setTimeout(r, delayMs));
  }
}

// ─── Concurrent batch processor ───────────────────────────────────────────────
export async function rBatch<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 5,
  delayMs = 150,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.allSettled(chunk.map(fn));
    if (i + concurrency < items.length && delayMs > 0) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
}

// ─── Duration parser ──────────────────────────────────────────────────────────
export function parseDuration(s: string): number | null {
  const m = s.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 3600 * 1000;
  if (unit === "d") return n * 86400 * 1000;
  return null;
}

// ─── Cooldown ─────────────────────────────────────────────────────────────────
export function checkCooldown(key: string, cooldownMs: number): boolean {
  const now = Date.now();
  const last = autoresponderCooldowns.get(key) ?? 0;
  if (now - last < cooldownMs) return false;
  autoresponderCooldowns.set(key, now);
  return true;
}

// ─── Quick embed helper ───────────────────────────────────────────────────────
const _RE_ERROR_PREFIX = /^(couldn't|can't|failed|error|invalid|you don't|you can't|no permission|missing|not found|doesn't|does not|i can't|check my|check role|double.check|wrong|only .* can|they may not|that user is not|that user is already|no active|no banned|no current|no mod|no custom|no sticky|no reaction|no booster|no ticket|no warn|no note|this isn't|not on the|not in this|not set up|not a|cannot be|must be|provide|please|too old|too long|already exists|already in)/;

export function re(desc: string, severity?: "error" | "success" | "warning" | "muted" | number) {
  const text = desc.trimStart();
  let color: number;
  if (typeof severity === "number") {
    color = severity;
  } else if (severity === "error") {
    color = COLORS.error;
  } else if (severity === "success") {
    color = COLORS.success;
  } else if (severity === "warning") {
    color = COLORS.warning;
  } else if (severity === "muted") {
    color = COLORS.muted;
  } else {
    color = _RE_ERROR_PREFIX.test(text.toLowerCase()) ? COLORS.error : COLORS.primary;
  }
  return { embeds: [new EmbedBuilder().setColor(color).setDescription(text).setTimestamp()] };
}

// ─── Inline embed helper for slash commands ───────────────────────────────────
export function ri(text: string, color: number = COLORS.primary) {
  return new EmbedBuilder().setColor(color).setDescription(text);
}

// ─── Safe reply helper ────────────────────────────────────────────────────────
export async function safeReply(
  message: Message,
  payload: Parameters<Message["reply"]>[0],
): Promise<Message> {
  try {
    return await message.reply(payload);
  } catch (err: any) {
    if (err?.code === 50035 || err?.code === 10008) {
      return await (message.channel as TextChannel).send(payload as any);
    }
    throw err;
  }
}

// ─── Hierarchy check ──────────────────────────────────────────────────────────
export function checkHierarchy(guild: Guild, actorId: string, target: GuildMember): string | null {
  if (guild.ownerId === actorId) return null;
  if (isOwner(actorId)) return null;
  const actor = guild.members.cache.get(actorId);
  if (!actor) return " Couldn't verify your role position — please try again in a moment.";
  if (actor.roles.highest.position <= target.roles.highest.position) {
    return ` You can't do that — **${target.user.tag}**'s highest role is equal to or above yours in the server hierarchy.`;
  }
  return null;
}

// ─── Moderation action embed ──────────────────────────────────────────────────
export function modActionEmbed(opts: {
  action: string; emoji?: string; color?: number;
  targetTag: string; targetId: string; targetAvatar?: string | null;
  moderatorTag: string; moderatorId: string;
  reason?: string; duration?: string; note?: string;
}) {
  const color = opts.color ?? COLORS.error;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${opts.emoji ? opts.emoji + "  " : ""}${opts.action}`)
    .setThumbnail(opts.targetAvatar ?? null)
    .addFields(
      { name: "User", value: `<@${opts.targetId}> \`${opts.targetTag}\``, inline: true },
      { name: "User ID", value: `\`${opts.targetId}\``, inline: true },
    );
  if (opts.duration) embed.addFields({ name: "Duration", value: opts.duration, inline: true });
  embed.addFields(
    { name: "Reason", value: opts.reason || "No reason provided", inline: false },
    { name: "Moderator", value: `<@${opts.moderatorId}> \`${opts.moderatorTag}\``, inline: true },
  );
  if (opts.note) embed.addFields({ name: "Note", value: opts.note, inline: false });
  embed.setFooter({ text: `Case ID: ${opts.targetId} • Moderation Action` }).setTimestamp();
  return { embeds: [embed] };
}

// ─── Audit log reason formatter ───────────────────────────────────────────────
export function auditReason(reason: string, actorTag: string): string {
  return `${reason} | Performed by ${actorTag}`;
}

// ─── Channel creation helpers ─────────────────────────────────────────────────
export const EVERYONE_HIDDEN = (guild: Guild) => ({
  id: guild.roles.everyone.id,
  deny: [PermissionFlagsBits.ViewChannel],
});

export async function findOrCreateTextChannel(
  category: CategoryChannel,
  name: string,
  hidden = false,
): Promise<TextChannel> {
  const existing = category.children.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === name,
  ) as TextChannel | undefined;
  if (existing) {
    if (hidden) {
      await existing.permissionOverwrites.edit(category.guild.roles.everyone, { ViewChannel: false }).catch(() => {});
    }
    return existing;
  }
  const opts: Parameters<Guild["channels"]["create"]>[0] = {
    name,
    type: ChannelType.GuildText,
    parent: category.id,
  };
  if (hidden) opts.permissionOverwrites = [EVERYONE_HIDDEN(category.guild)];
  return category.guild.channels.create(opts) as Promise<TextChannel>;
}

export async function findOrCreateVoiceChannel(
  category: CategoryChannel,
  name: string,
): Promise<VoiceChannel> {
  const prefix = name.split(":")[0];
  const existing = category.children.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name.startsWith(prefix),
  ) as VoiceChannel | undefined;
  if (existing) return existing;
  return category.guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: [
      { id: category.guild.roles.everyone, deny: ["Connect"] },
    ],
  }) as Promise<VoiceChannel>;
}

// ─── Re-exports from sub-modules ──────────────────────────────────────────────
export { COLORS, type ColorKey } from "./colors.js";
// Pagination & confirm UI
export {
  sendConfirm, buildPageEmbed, buildPageRow, sendPaginated, sendPaginatedI,
} from "./pagination.js";

// Antinuke backup/restore helpers
export {
  ANTINUKE_RESTORE_BACKUP_ID,
  createServerSnapshot, refreshAntinukeRestoreSnapshot,
  restoreAntinukeDeletedItems, restoreAllFromSnapshot,
  getAntinukeActions, countRecent, punishAntinuke,
} from "./antinuke-utils.js";

// Guild management & scheduling helpers
export {
  checkAutostaffPromotion, recordModAction,
  isRepping, getStatusText, syncRepRoles, canPing,
  scheduleStatsUpdate, updateStats, handleSlowmode,
  setupJailSystem, runSetup, snapshotInvites,
  resolveGiveaway, scheduleGiveaway, scheduleTempRoleRemoval,
} from "./guild-utils.js";

// Counter helpers (from extras)
export { updateAllCounters } from "./commands/prefix/extras.js";
