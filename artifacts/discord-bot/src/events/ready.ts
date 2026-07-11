import { Events, EmbedBuilder } from "discord.js";
import client from "../client.js";
import { COLORS } from "../colors.js";
import { guildStates, getGS, saveState } from "../state.js";
import { gch, fetchMember, scheduleGiveaway, resolveGiveaway, syncRepRoles, refreshAntinukeRestoreSnapshot, scheduleTempRoleRemoval, recordModAction } from "../utils.js";
import { cleanupVoiceMasterState } from "./voice-state.js";
import { restoreBumpReminders } from "../commands/prefix/extras.js";
import { startFeedPollers } from "../commands/prefix/feeds.js";
import { registerSlashCommandsGlobal, registerSlashCommands } from "../commands/slash/register.js";
import { handleSlashCommand } from "../commands/slash/handler.js";
import { ensureYtDlp } from "../commands/prefix/music.js";
import ffmpegStatic from "ffmpeg-static";

client.once(Events.ClientReady, async () => {
  (globalThis as any).__ffmpegPath = ffmpegStatic;
  console.log("[bot] ffmpeg path:", ffmpegStatic);
  ensureYtDlp().catch((e) => console.error("[music] yt-dlp prefetch failed:", e?.message));

  console.log(`[bot] Ready as ${client.user!.tag} — registering slash commands globally...`);
  try {
    await registerSlashCommandsGlobal();
    console.log(`[bot] Global slash command registration complete.`);
  } catch (err: any) {
    console.error(`[bot] Global slash command registration failed:`, err?.message ?? err);
    // Fallback: try per-guild registration for all known guilds
    const allGuilds = await client.guilds.fetch().catch(() => client.guilds.cache);
    const guildIds = [...allGuilds.keys()];
    let ok = 0;
    for (let i = 0; i < guildIds.length; i++) {
      try { await registerSlashCommands(guildIds[i]); ok++; } catch {}
      if (i < guildIds.length - 1) await new Promise(r => setTimeout(r, 400));
    }
    console.log(`[bot] Fallback guild registration: ${ok}/${guildIds.length} guild(s).`);
  }

  let voiceMasterCleaned = 0;
  for (const guild of client.guilds.cache.values()) {
    voiceMasterCleaned += await cleanupVoiceMasterState(guild, getGS(guild.id), true).catch((err) => {
      console.error(`[voicemaster] Startup cleanup failed for ${guild.id}:`, err);
      return 0;
    });
  }
  console.log(`[bot] VoiceMaster cleanup complete (${voiceMasterCleaned} stale channel(s) removed).`);

  restoreBumpReminders();
  console.log("[bot] Bump reminder timers restored.");

  let gwRestored = 0;
  for (const gs of guildStates.values()) {
    for (const gw of gs.giveaways.values()) {
      if (!gw.ended) {
        if (gw.endsAt <= Date.now()) {
          resolveGiveaway(gw).catch(() => {});
        } else {
          scheduleGiveaway(gw);
        }
        gwRestored++;
      }
    }
  }
  console.log(`[bot] Giveaway timers restored (${gwRestored} active).`);

  for (const guild of client.guilds.cache.values()) {
    syncRepRoles(guild).catch(() => {});
  }
  console.log("[bot] Rep role sync started.");

  // Stagger antinuke snapshots — sequential with a delay to avoid
  // hammering guild.roles.fetch() + guild.channels.fetch() for all guilds at once.
  const antinukeGuilds = [...client.guilds.cache.values()].filter(g => getGS(g.id).antinukeRestoreEnabled);
  let antinukeSnapshots = 0;
  for (let i = 0; i < antinukeGuilds.length; i++) {
    try {
      await refreshAntinukeRestoreSnapshot(antinukeGuilds[i]);
      antinukeSnapshots++;
    } catch (err) {
      console.error(`[antinuke-restore] Snapshot failed for ${antinukeGuilds[i].name}:`, err);
    }
    if (i < antinukeGuilds.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  console.log(`[bot] Antinuke restore snapshots refreshed (${antinukeSnapshots} guilds).`);

  let tempBanRestored = 0;
  let tempBanExpiredCleaned = 0;
  for (const [guildId, gs] of guildStates) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    for (const [userId, { unbanAt }] of gs.tempBans) {
      const delay = unbanAt - Date.now();
      if (delay <= 0) {
        guild.bans.remove(userId, "Tempban expired (recovered after restart)").catch(() => {});
        gs.tempBans.delete(userId);
        tempBanExpiredCleaned++;
      } else {
        setTimeout(async () => {
          await guild.bans.remove(userId, "Tempban expired").catch(() => {});
          gs.tempBans.delete(userId);
          saveState();
          console.log(`[tempban] Auto-unbanned ${userId} in ${guild.name} (rescheduled after restart)`);
        }, delay);
        tempBanRestored++;
      }
    }
  }
  if (tempBanRestored > 0 || tempBanExpiredCleaned > 0) saveState();
  console.log(`[bot] Tempban timers rescheduled (${tempBanRestored} active).`);

  let jailRestored = 0;
  for (const [guildId, gs] of guildStates) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    for (const [userId, expiresAt] of gs.jailExpiry) {
      const delay = expiresAt - Date.now();
      const doUnjail = async () => {
        try {
          const g = client.guilds.cache.get(guildId);
          if (!g) return;
          const gsT = getGS(guildId);
          if (!gsT.jailedMembers.has(userId)) { gsT.jailExpiry.delete(userId); saveState(); return; }
          const m = await fetchMember(g, userId).catch(() => null);
          if (!m) { gsT.jailedMembers.delete(userId); gsT.jailExpiry.delete(userId); saveState(); return; }
          const liveJailRoleId = gsT.jailRoleId;
          if (liveJailRoleId && !m.roles.cache.has(liveJailRoleId)) { gsT.jailedMembers.delete(userId); gsT.jailExpiry.delete(userId); saveState(); return; }
          const saved = gsT.jailedMembers.get(userId) ?? [];
          gsT.jailedMembers.delete(userId);
          gsT.jailExpiry.delete(userId);
          const valid = saved.filter((id) => g.roles.cache.has(id));
          const currentRoleIds = [...m.roles.cache.keys()].filter((id) => id !== liveJailRoleId);
          const combined = [...new Set([...currentRoleIds, ...valid])];
          await m.roles.set(combined).catch(() => {});
          const jch = gsT.jailChannelId ? gch(g, gsT.jailChannelId) : null;
          if (jch) await (jch as import("discord.js").TextChannel).send({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(` ${m} — your temporary jail has expired. Welcome back.`)] }).catch(() => {});
          await recordModAction(g, userId, "unjail", "Auto-unjail after restart (timer recovered)", "AutoMod");
          saveState();
        } catch {}
      };
      if (delay <= 0) {
        doUnjail();
        gs.jailExpiry.delete(userId);
      } else {
        setTimeout(doUnjail, delay);
        jailRestored++;
      }
    }
  }
  console.log(`[bot] Jail timers rescheduled (${jailRestored} active).`);

  let tempRoleRestored = 0;
  for (const [guildId, gs] of guildStates) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    for (const [userId, entries] of gs.tempRoles) {
      for (const { roleId, expiresAt } of entries) {
        scheduleTempRoleRemoval(guild, userId, roleId, expiresAt);
        if (expiresAt > Date.now()) tempRoleRestored++;
      }
    }
  }
  console.log(`[bot] Temp-role timers rescheduled (${tempRoleRestored} active).`);

  startFeedPollers();
  console.log("[bot] Social feed pollers started.");

  // ─── Birthday Scheduler ──────────────────────────────────────────────────
  {
    const birthdayAnnounced = new Set<string>();
    let lastBirthdayDate = "";

    const runBirthdayCheck = async () => {
      const now = new Date();
      const todayKey = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (todayKey !== lastBirthdayDate) {
        birthdayAnnounced.clear();
        lastBirthdayDate = todayKey;
      }
      for (const guild of client.guilds.cache.values()) {
        const gs = getGS(guild.id);
        for (const [userId, bday] of gs.birthdays) {
          if (bday !== todayKey) continue;
          const key = `${guild.id}:${userId}:${todayKey}`;
          if (birthdayAnnounced.has(key)) continue;
          birthdayAnnounced.add(key);
          if (gs.birthdayChannelId) {
            const ch = gch(guild, gs.birthdayChannelId) as import("discord.js").TextChannel | null;
            if (ch) {
              ch.send({ embeds: [
                new EmbedBuilder().setColor(COLORS.error)
                  .setTitle("🎂 Happy Birthday!")
                  .setDescription(`<@${userId}> is celebrating their birthday today! 🎉 Wishing you an amazing day!`)
                  .setTimestamp(),
              ]}).catch(() => {});
            }
          }
          client.users.fetch(userId).then(user =>
            user.send(`🎂 Happy Birthday, **${user.username}**! Everyone in **${guild.name}** wishes you a wonderful day! 🎉`).catch(() => {})
          ).catch(() => {});
        }
      }
    };

    setInterval(runBirthdayCheck, 10 * 60 * 1000).unref();
    runBirthdayCheck().catch(() => {});
    console.log("[bot] Birthday scheduler started.");
  }
});

// Register slash commands when the bot joins a new guild
client.on(Events.GuildCreate, (guild) => {
  registerSlashCommands(guild.id).catch(() => {});
});

// ─── Slash Command Interaction Handler ───────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await handleSlashCommand(interaction).catch((err) =>
    console.error('[slash] Unhandled error:', err),
  );
});
