import { Events, EmbedBuilder, Guild, VoiceChannel, ChannelType, CategoryChannel } from "discord.js";
import client from "../client.js";
import { getGS, saveState } from "../state.js";
import { gch } from "../utils.js";
import type { GuildState } from "../types.js";
import { COLORS } from "../colors.js";

const voiceMasterCreateLocks = new Set<string>();
const voiceMasterCreateCooldowns = new Map<string, number>();
const voiceMasterCleanupCooldowns = new Map<string, number>();

function normalizedChannelName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function looksLikeVoiceMasterJoinChannel(channel: VoiceChannel): boolean {
  const channelName = normalizedChannelName(channel.name);
  if (channelName !== "j2c" && channelName !== "jointocreate" && channelName !== "join2create") return false;
  const parentName = channel.parent ? normalizedChannelName(channel.parent.name) : "";
  return !parentName || parentName === "vc" || parentName.includes("voicemaster") || parentName.includes("voice");
}

function voiceMasterHumanCount(channel: VoiceChannel): number {
  return channel.members.filter((m) => !m.user.bot).size;
}

function isDiscordMissingResourceError(err: unknown): boolean {
  const code = (err as { code?: number; rawError?: { code?: number } })?.code
    ?? (err as { rawError?: { code?: number } })?.rawError?.code;
  return code === 10003 || code === 10004;
}

function forgetVoiceMasterChannel(gs: GuildState, channelId: string): void {
  gs.vcChannelOwners.delete(channelId);
  gs.vcAllowList.delete(channelId);
}

async function fetchVoiceMasterChannel(guild: Guild, channelId: string): Promise<VoiceChannel | null | undefined> {
  try {
    const fetched = await guild.channels.fetch(channelId, { force: true });
    return fetched?.type === ChannelType.GuildVoice ? fetched as VoiceChannel : null;
  } catch (err) {
    if (isDiscordMissingResourceError(err)) return null;
    console.error(`[voicemaster] Failed to fetch tracked VC ${channelId}:`, err);
    return undefined;
  }
}

async function deleteTrackedVoiceMasterChannel(
  guild: Guild,
  gs: GuildState,
  channelId: string,
  reason: string,
  errorLabel: string,
): Promise<boolean> {
  const channel = await fetchVoiceMasterChannel(guild, channelId);
  if (channel === undefined) return false;
  if (!channel) {
    forgetVoiceMasterChannel(gs, channelId);
    saveState();
    return true;
  }
  try {
    await channel.delete(reason);
    forgetVoiceMasterChannel(gs, channelId);
    saveState();
    return true;
  } catch (err) {
    if (isDiscordMissingResourceError(err)) {
      forgetVoiceMasterChannel(gs, channelId);
      saveState();
      return true;
    }
    console.error(errorLabel, err);
    return false;
  }
}

export async function cleanupVoiceMasterState(guild: Guild, gs: GuildState, deleteEmptyChannels = false): Promise<number> {
  let cleaned = 0;
  for (const [channelId] of [...gs.vcChannelOwners]) {
    const channel = await fetchVoiceMasterChannel(guild, channelId);
    await new Promise((r) => setTimeout(r, 200));
    if (channel === undefined) continue;
    if (!channel) {
      forgetVoiceMasterChannel(gs, channelId);
      cleaned++;
      continue;
    }
    if (deleteEmptyChannels && voiceMasterHumanCount(channel) === 0) {
      const removed = await deleteTrackedVoiceMasterChannel(
        guild,
        gs,
        channelId,
        "VoiceMaster: removing stale empty temp VC",
        "[voicemaster] Failed to delete stale empty VC:",
      );
      if (removed) {
        cleaned++;
      }
    }
  }
  if (cleaned > 0) saveState();
  return cleaned;
}

async function getExistingVoiceMasterChannel(guild: Guild, ownerId: string, gs: GuildState): Promise<VoiceChannel | null> {
  for (const [channelId, channelOwnerId] of gs.vcChannelOwners) {
    if (channelOwnerId !== ownerId) continue;
    const channel = await fetchVoiceMasterChannel(guild, channelId);
    if (channel === undefined) continue;
    if (channel) {
      if (voiceMasterHumanCount(channel) > 0) return channel;
      await deleteTrackedVoiceMasterChannel(
        guild,
        gs,
        channelId,
        "VoiceMaster: removing stale empty temp VC before creating a new one",
        "[voicemaster] Failed to delete stale owner VC:",
      );
      continue;
    }
    forgetVoiceMasterChannel(gs, channelId);
    saveState();
  }
  return null;
}

// ─── Voice Log ────────────────────────────────────────────────────────────────

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const gsVS = getGS(newState.guild.id);
  const guild = newState.guild;

  // ─── VoiceMaster: J2C auto-create ────────────────────────────────────────
  const joinedVoiceChannel = newState.channel?.type === ChannelType.GuildVoice ? newState.channel as VoiceChannel : null;
  let joinChannelId = gsVS.vcJoinChannelId;
  const configuredJoinChannelExists = joinChannelId ? guild.channels.cache.has(joinChannelId) : false;
  if (
    joinedVoiceChannel &&
    (!joinChannelId || !configuredJoinChannelExists) &&
    looksLikeVoiceMasterJoinChannel(joinedVoiceChannel)
  ) {
    gsVS.vcJoinChannelId = joinedVoiceChannel.id;
    gsVS.vcSetupCategoryId = joinedVoiceChannel.parentId ?? gsVS.vcSetupCategoryId;
    joinChannelId = joinedVoiceChannel.id;
    saveState();
    console.log(`[voicemaster] Recovered setup in ${guild.id}: join=${joinedVoiceChannel.id} category=${joinedVoiceChannel.parentId ?? "none"}`);
  }

  if (newState.channelId && newState.channelId === joinChannelId) {
    const member = newState.member;
    if (member && !member.user.bot) {
      const lockKey = `${guild.id}:${member.id}`;
      const lastCleanup = voiceMasterCleanupCooldowns.get(guild.id) ?? 0;
      if (Date.now() - lastCleanup > 30_000) {
        voiceMasterCleanupCooldowns.set(guild.id, Date.now());
        await cleanupVoiceMasterState(guild, gsVS);
      }
      const existingOwnedChannel = await getExistingVoiceMasterChannel(guild, member.id, gsVS);
      if (existingOwnedChannel) {
        await member.voice.setChannel(existingOwnedChannel).catch((err) => {
          console.error("[voicemaster] Failed to move member to existing VC:", err);
        });
        return;
      }
      const lastCreatedAt = voiceMasterCreateCooldowns.get(lockKey) ?? 0;
      if (voiceMasterCreateLocks.has(lockKey) || Date.now() - lastCreatedAt < 5_000) return;
      voiceMasterCreateLocks.add(lockKey);
      try {
        const category = gsVS.vcSetupCategoryId
          ? guild.channels.cache.get(gsVS.vcSetupCategoryId) as CategoryChannel | undefined
          : undefined;
        const newVC = await guild.channels.create({
          name: `${member.displayName}'s VC`,
          type: ChannelType.GuildVoice,
          parent: category?.id ?? joinedVoiceChannel?.parentId ?? undefined,
        }) as VoiceChannel;
        gsVS.vcChannelOwners.set(newVC.id, member.id);
        gsVS.vcAllowList.set(newVC.id, new Set());
        saveState();
        await member.voice.setChannel(newVC).catch((err) => {
          console.error("[voicemaster] Created VC but failed to move member:", err);
        });
        console.log(`[voicemaster] Created VC ${newVC.id} for ${member.id} in ${guild.id}`);
      } catch (err) {
        console.error("[voicemaster] Failed to create VC:", err);
      } finally {
        voiceMasterCreateCooldowns.set(lockKey, Date.now());
        voiceMasterCreateLocks.delete(lockKey);
      }
    }
  }

  // ─── VoiceMaster: auto-delete empty VC ───────────────────────────────────
  if (oldState.channelId && gsVS.vcChannelOwners.has(oldState.channelId)) {
    const channelId = oldState.channelId;
    const cachedCh = guild.channels.cache.get(channelId);
    const oldCh: VoiceChannel | null | undefined = cachedCh !== undefined
      ? (cachedCh.type === ChannelType.GuildVoice ? cachedCh as VoiceChannel : null)
      : await fetchVoiceMasterChannel(guild, channelId);
    const ownerId = gsVS.vcChannelOwners.get(oldState.channelId)!;
    const ownerStillInChannel = guild.voiceStates.cache.get(ownerId)?.channelId === oldState.channelId;
    if (oldCh === null) {
      forgetVoiceMasterChannel(gsVS, channelId);
      saveState();
    }
    if (oldCh && !ownerStillInChannel && voiceMasterHumanCount(oldCh) === 0) {
      await deleteTrackedVoiceMasterChannel(
        guild,
        gsVS,
        channelId,
        "VoiceMaster: channel is empty",
        "[voicemaster] Failed to auto-delete empty VC:",
      );
    }
  }

  // ─── Stream/camera ban enforcement ───────────────────────────────────────
  const vsMember = newState.member ?? oldState.member;
  if (vsMember && !vsMember.user.bot && gsVS.streamBlacklist.has(vsMember.id)) {
    const wasStreaming = !oldState.streaming && newState.streaming;
    const wasCamera = !oldState.selfVideo && newState.selfVideo;
    if ((wasStreaming || wasCamera) && newState.channel) {
      await vsMember.voice.disconnect("Stream/camera banned").catch(() => null);
      await vsMember.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription("You are banned from streaming or using camera in this server.")] }).catch(() => null);
    }
  }

  const voiceLogChannel = gch(newState.guild, gsVS.voiceLogChannelId);
  if (!voiceLogChannel) return;
  if (newState.member?.user.bot) return;

  const member = newState.member ?? oldState.member;
  if (!member) return;

  let description: string | null = null;

  if (!oldState.channelId && newState.channelId) {
    description = `${member} joined **${newState.channel?.name}**`;
  } else if (oldState.channelId && !newState.channelId) {
    description = `${member} left **${oldState.channel?.name}**`;
  } else if (
    oldState.channelId &&
    newState.channelId &&
    oldState.channelId !== newState.channelId
  ) {
    description = `${member} moved from **${oldState.channel?.name}** → **${newState.channel?.name}**`;
  }

  if (!description) return;

  try {
    if (voiceLogChannel) await voiceLogChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle("Voice Activity")
          .setDescription(description)
          .setFooter({ text: `ID: ${member.id}` })
          .setTimestamp(),
      ],
    });
  } catch (err) {
    console.error("[error] voice log:", err);
  }
});
