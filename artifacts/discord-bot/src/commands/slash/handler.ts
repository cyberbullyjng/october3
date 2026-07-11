import {
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
  ChannelType,
  AuditLogEvent,
  CategoryChannel,
  TextChannel,
  VoiceChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import client from "../../client.js";
import { find as geoFind } from "geo-tz";
import {
  getGS, saveState, loadState, globalBannedUsers, blacklistedServers,
  maintenanceMode, setMaintenanceMode, guildStates, afkUsers,
  raidModeActive, dmOwner, activeGiveawayTimers, jailTimers,
} from "../../state.js";
import {
  gch, fetchMember, checkHierarchy, modActionEmbed, recordModAction, auditReason,
  re, sendPaginatedI, rQueue, parseDuration, ensureMembersCache,
  resolveRole, fetchRole, xpForLevel, levelFromXp, setupJailSystem,
  findOrCreateTextChannel, findOrCreateVoiceChannel, runSetup,
  scheduleGiveaway, resolveGiveaway, snapshotInvites,
  checkAutostaffPromotion, fetchGuildChannel, syncRepRoles,
  isRepping, getStatusText,
} from "../../utils.js";
import { OWNER_ID, ELEVATED_PERMS, DEHOIST_RE, isOwner } from "../../constants.js";
import { COLORS } from "../../colors.js";

export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "These commands only work in servers.", ephemeral: true });
    return;
  }

  const guild = interaction.guild;
  const gs = getGS(guild.id);
  const actor = interaction.user;
  const actorMember = interaction.member as GuildMember | null;
  const cmdName = interaction.commandName;
  const dmLogChannel = gch(guild, gs.dmLogChannelId);

  // Simple embed helper (intentionally shadows the imported `re`)
  const ri = (text: string, color = 0x5865f2) =>
    new EmbedBuilder().setColor(color).setDescription(text);

  try {
    await interaction.deferReply();

    switch (cmdName) {

      // ── /warn ──────────────────────────────────────────────────────────────
      case "warn": {
        const targetUser = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found in this server.")] }); return; }
        const hierr = checkHierarchy(guild, actor.id, member);
        if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        const userWarns = gs.warnings.get(targetUser.id) ?? [];
        userWarns.push({ reason, timestamp: Date.now() });
        gs.warnings.set(targetUser.id, userWarns);
        const kickAt = gs.warnKickThreshold > 0 ? gs.warnKickThreshold : null;
        const banAt  = gs.warnBanThreshold  > 0 ? gs.warnBanThreshold  : null;
        const noteStr = kickAt || banAt
          ? `Warning **${userWarns.length}**${kickAt ? ` — auto-kick at **${kickAt}**` : ""}${banAt ? `, auto-ban at **${banAt}**` : ""}`
          : `Warning **${userWarns.length}**`;
        await interaction.editReply(modActionEmbed({
          action: "Member Warned", emoji: "", color: 0xfee75c,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          reason, note: noteStr,
        }));
        await recordModAction(guild, targetUser.id, "warn", reason, actor.tag, actor.id);
        targetUser.send(
          `⚠️ You have been warned in **${guild.name}**.\n**Reason:** ${reason}`
        ).catch(() => {});
        if (banAt && userWarns.length >= banAt) {
          await member.ban({ reason: `Auto-ban: reached ${banAt} warnings` }).catch(() => {});
          await recordModAction(guild, targetUser.id, "ban", `Auto-ban: ${banAt} warnings`, "AutoMod");
        } else if (kickAt && userWarns.length >= kickAt) {
          await member.kick(`Auto-kick: reached ${kickAt} warnings`).catch(() => {});
          await recordModAction(guild, targetUser.id, "kick", `Auto-kick: ${kickAt} warnings`, "AutoMod");
        }
        saveState();
        break;
      }

      // ── /warnings ──────────────────────────────────────────────────────────
      case "warnings": {
        const targetUser = interaction.options.getUser("user", true);
        const userWarns = gs.warnings.get(targetUser.id) ?? [];
        if (userWarns.length === 0) {
          await interaction.editReply({ embeds: [ri(` **${targetUser.tag}** has no warnings.`)] });
          return;
        }
        const items = userWarns.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(w.timestamp / 1000)}:R>`);
        await sendPaginatedI(interaction, ` Warnings for ${targetUser.tag} (${userWarns.length})`, items, { perPage: 10, color: 0xfee75c });
        break;
      }

      // ── /clearwarns ────────────────────────────────────────────────────────
      case "clearwarns": {
        const targetUser = interaction.options.getUser("user", true);
        const count = gs.warnings.get(targetUser.id)?.length ?? 0;
        gs.warnings.delete(targetUser.id);
        saveState();
        await interaction.editReply({ embeds: [ri(` Cleared **${count}** warning(s) for **${targetUser.tag}**.`, 0x57f287)] });
        break;
      }

      // ── /mute ──────────────────────────────────────────────────────────────
      case "mute":
      case "timeout": {
        const targetUser = interaction.options.getUser("user", true);
        const durStr = interaction.options.getString("duration", true);
        const reason = interaction.options.getString("reason") ?? "No reason given";
        const match = durStr.match(/^(\d+)(s|m|h|d)$/i);
        if (!match) { await interaction.editReply({ embeds: [ri(" Invalid duration. Use `30s`, `10m`, `2h`, `1d`.")] }); return; }
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const ms = unit === "s" ? amount * 1000 : unit === "m" ? amount * 60_000 : unit === "h" ? amount * 3_600_000 : amount * 86_400_000;
        if (ms > 2_419_200_000) { await interaction.editReply({ embeds: [ri(" Timeouts can only last up to 28 days.")] }); return; }
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found in this server.")] }); return; }
        const hierr = checkHierarchy(guild, actor.id, member);
        if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        await member.timeout(ms, auditReason(reason, actor.tag));
        const muteCaseId = await recordModAction(guild, targetUser.id, "mute", `${durStr} — ${reason}`, actor.tag, actor.id);
        await interaction.editReply(modActionEmbed({
          action: "Member Muted", emoji: "", color: 0xfee75c,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          duration: durStr, reason,
          note: `Case #${muteCaseId}`,
        }));
        break;
      }

      // ── /unmute ────────────────────────────────────────────────────────────
      case "unmute":
      case "untimeout": {
        const targetUser = interaction.options.getUser("user", true);
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found.")] }); return; }
        const hierr = checkHierarchy(guild, actor.id, member);
        if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        await member.timeout(null);
        const unmuteCaseId = await recordModAction(guild, targetUser.id, "unmute", "Timeout removed", actor.tag, actor.id);
        await interaction.editReply(modActionEmbed({
          action: "Member Unmuted", emoji: "", color: 0x57f287,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          reason: "Timeout removed",
          note: `Case #${unmuteCaseId}`,
        }));
        break;
      }

      // ── /kick ──────────────────────────────────────────────────────────────
      case "kick": {
        const targetUser = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found in this server.")] }); return; }
        const hierr = checkHierarchy(guild, actor.id, member);
        if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        await member.kick(auditReason(reason, actor.tag));
        await interaction.editReply(modActionEmbed({
          action: "Member Kicked", emoji: "", color: 0xed4245,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          reason,
        }));
        recordModAction(guild, targetUser.id, "kick", reason, actor.tag, actor.id).catch(() => {});
        dmOwner(` **Kick** in **${guild.name}**\nUser: ${targetUser.tag}\nMod: ${actor.tag}\nReason: ${reason}`).catch(() => {});
        break;
      }

      // ── /ban ───────────────────────────────────────────────────────────────
      case "ban": {
        const targetUser = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        const days = interaction.options.getInteger("days") ?? 0;
        const targetMember = guild.members.cache.get(targetUser.id) ?? await fetchMember(guild, targetUser.id).catch(() => null);
        if (targetMember) {
          const hierr = checkHierarchy(guild, actor.id, targetMember);
          if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        }
        await guild.members.ban(targetUser.id, { reason: auditReason(reason, actor.tag), deleteMessageSeconds: days * 86_400 });
        await interaction.editReply(modActionEmbed({
          action: "Member Banned", emoji: "", color: 0xed4245,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          reason,
        }));
        recordModAction(guild, targetUser.id, "ban", reason, actor.tag, actor.id).catch(() => {});
        dmOwner(` **Ban** in **${guild.name}**\nUser: ${targetUser.tag}\nMod: ${actor.tag}\nReason: ${reason}`).catch(() => {});
        break;
      }

      // ── /unban ─────────────────────────────────────────────────────────────
      case "unban": {
        const userId = interaction.options.getString("user_id", true).trim();
        if (gs.hardbannedUsers.has(userId)) {
          await interaction.editReply({ embeds: [ri(` That user was hardbanned and cannot be unbanned with \`/unban\`. Use \`!hardban remove ${userId}\` (Administrator only).`)] });
          return;
        }
        const bannedUser = await client.users.fetch(userId).catch(() => null);
        await guild.bans.remove(userId);
        await interaction.editReply(modActionEmbed({
          action: "Member Unbanned", emoji: "", color: 0x57f287,
          targetTag: bannedUser?.tag ?? userId, targetId: userId,
          targetAvatar: bannedUser?.displayAvatarURL() ?? null,
          moderatorTag: actor.tag, moderatorId: actor.id,
          reason: interaction.options.getString("reason") ?? "Ban lifted",
        }));
        break;
      }

      // ── /softban ───────────────────────────────────────────────────────────
      case "softban": {
        const targetUser = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "No reason given";
        const targetMember = guild.members.cache.get(targetUser.id) ?? await fetchMember(guild, targetUser.id).catch(() => null);
        if (targetMember) {
          const hierr = checkHierarchy(guild, actor.id, targetMember);
          if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        }
        await guild.members.ban(targetUser.id, { reason: auditReason(`[Softban] ${reason}`, actor.tag), deleteMessageSeconds: 604800 });
        const sbUnbanOk = await guild.bans.remove(targetUser.id, "Softban — immediate unban").then(() => true).catch(() => false);
        if (!sbUnbanOk) {
          await interaction.editReply({ embeds: [ri(`⚠️ Messages wiped but the **immediate unban failed** — \`${targetUser.id}\` may still be banned. Run \`!unban ${targetUser.id}\` to lift it manually.`, 0xfee75c)] });
          recordModAction(guild, targetUser.id, "softban", reason, actor.tag, actor.id).catch(() => {});
          break;
        }
        await interaction.editReply(modActionEmbed({
          action: "Member Softbanned", emoji: "", color: 0xfee75c,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          reason, note: "Messages wiped — user is **not** permanently banned.",
        }));
        recordModAction(guild, targetUser.id, "softban", reason, actor.tag, actor.id).catch(() => {});
        break;
      }

      // ── /hardban ───────────────────────────────────────────────────────────
      case "hardban": {
        const targetUser = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        const targetMember = guild.members.cache.get(targetUser.id) ?? await fetchMember(guild, targetUser.id).catch(() => null);
        if (targetMember) {
          const hierr = checkHierarchy(guild, actor.id, targetMember);
          if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        }
        gs.hardbannedUsers.add(targetUser.id);
        saveState();
        await guild.members.ban(targetUser.id, { reason: auditReason(`[Hardban] ${reason}`, actor.tag), deleteMessageSeconds: 604800 });
        await interaction.editReply(modActionEmbed({
          action: "Member Hardbanned", emoji: "", color: 0xed4245,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          reason, note: "This user is permanently banned. Only `!hardban remove <id>` can lift it.",
        }));
        recordModAction(guild, targetUser.id, "hardban", reason, actor.tag, actor.id).catch(() => {});
        dmOwner(` **Hardban** in **${guild.name}**\nUser: ${targetUser.tag}\nMod: ${actor.tag}\nReason: ${reason}`).catch(() => {});
        break;
      }

      case "jailsetup": {
        if (!actorMember?.permissions.has(PermissionFlagsBits.ManageChannels) || !actorMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
          await interaction.editReply({ embeds: [ri(" You need **Manage Channels** and **Manage Roles** to set up jail.")] });
          return;
        }
        await setupJailSystem(guild);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.success)
              .setTitle("Jail Setup Complete")
              .setDescription("The jail system is ready.")
              .addFields(
                { name: "Jailed Role", value: gs.jailRoleId ? `<@&${gs.jailRoleId}>` : "Created", inline: true },
                { name: "Jail Channel", value: gs.jailChannelId ? `<#${gs.jailChannelId}>` : "Created", inline: true },
                { name: "Use", value: "`/jail user:@member duration:1h reason:...`\n`/unjail user:@member`", inline: false },
              )
              .setTimestamp(),
          ],
        });
        break;
      }

      // ── /jail ──────────────────────────────────────────────────────────────
      case "jail": {
        const targetUser = interaction.options.getUser("user", true);
        const durStr = interaction.options.getString("duration") ?? null;
        const reason = interaction.options.getString("reason") ?? "Jailed";
        const jailRoleId = gs.jailRoleId;
        const jailChannelId = gs.jailChannelId;
        if (!jailRoleId || !jailChannelId) {
          await interaction.editReply({ embeds: [ri(" Jail system isn't set up yet. Run `!setup` first.")] });
          return;
        }
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found.")] }); return; }
        const hierr = checkHierarchy(guild, actor.id, member);
        if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        const jailedRole = guild.roles.cache.get(jailRoleId);
        if (!jailedRole) { await interaction.editReply({ embeds: [ri(" Jailed role not found.")] }); return; }
        if (member.roles.cache.has(jailRoleId)) {
          await interaction.editReply({ embeds: [ri(" That member is already jailed.")] });
          return;
        }
        const jailDurationMs = durStr ? parseDuration(durStr) : null;
        if (durStr && !jailDurationMs) { await interaction.editReply({ embeds: [ri(" Invalid duration. Use `30s`, `10m`, `2h`, `1d`.")] }); return; }
        const savedRoles = member.roles.cache.filter(r => r.id !== guild.roles.everyone.id).map(r => r.id);
        gs.jailedMembers.set(targetUser.id, savedRoles);
        const managedRoleIds = member.roles.cache.filter((r) => r.managed).map((r) => r.id);
        await member.roles.set([jailRoleId, ...managedRoleIds]);
        const jailCh = gch(guild, jailChannelId) as TextChannel | null;
        if (jailCh) await jailCh.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(` ${member} — you have been jailed${durStr ? ` for ${durStr}` : ""}. A moderator will review your case shortly.`)] }).catch(() => {});
        const displayReason = jailDurationMs ? `${reason} (${durStr})` : reason;
        await interaction.editReply(modActionEmbed({
          action: "Member Jailed", emoji: "", color: 0xed4245,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          reason: displayReason,
        }));
        await recordModAction(guild, targetUser.id, "jail", displayReason, actor.tag, actor.id);
        saveState();
        if (jailDurationMs) {
          const guildTimers = jailTimers.get(guild.id) ?? new Map();
          const existing = guildTimers.get(targetUser.id);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(async () => {
            try {
              const g = client.guilds.cache.get(guild.id);
              if (!g) return;
              const gsT = getGS(g.id);
              const m = await fetchMember(g, targetUser.id).catch(() => null);
              if (!m || !m.roles.cache.has(jailRoleId)) return;
              const saved = gsT.jailedMembers.get(targetUser.id) ?? [];
              gsT.jailedMembers.delete(targetUser.id);
              gsT.jailExpiry.delete(targetUser.id);
              const valid = saved.filter(id => g.roles.cache.has(id));
              const currentRoleIds = [...m.roles.cache.keys()].filter(id => id !== jailRoleId);
              const combined = [...new Set([...currentRoleIds, ...valid])];
              await m.roles.set(combined.length ? combined : []).catch(() => {});
              const jch2 = gch(g, gsT.jailChannelId);
              if (jch2) await (jch2 as TextChannel).send({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(` ${m} — your temporary jail has expired. Welcome back.`)] }).catch(() => {});
              await recordModAction(g, targetUser.id, "unjail", `Auto-unjail after ${durStr}`, "AutoMod");
              saveState();
            } catch {}
            guildTimers.delete(targetUser.id);
          }, jailDurationMs);
          guildTimers.set(targetUser.id, timer);
          jailTimers.set(guild.id, guildTimers);
        }
        break;
      }

      // ── /unjail ────────────────────────────────────────────────────────────
      case "unjail": {
        const targetUser = interaction.options.getUser("user", true);
        const jailRoleId = gs.jailRoleId;
        if (!jailRoleId) { await interaction.editReply({ embeds: [ri(" Jail system isn't set up yet.")] }); return; }
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found.")] }); return; }
        const hierr = checkHierarchy(guild, actor.id, member);
        if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        if (!member.roles.cache.has(jailRoleId)) {
          await interaction.editReply({ embeds: [ri(" That member is not jailed.")] });
          return;
        }
        const savedRoles = gs.jailedMembers.get(targetUser.id) ?? [];
        gs.jailedMembers.delete(targetUser.id);
        gs.jailExpiry.delete(targetUser.id);
        saveState();
        const validRoles = savedRoles.filter(id => guild.roles.cache.has(id));
        const currentRoleIds = [...member.roles.cache.keys()].filter(id => id !== jailRoleId);
        const combined = [...new Set([...currentRoleIds, ...validRoles])];
        await member.roles.set(combined.length ? combined : []);
        const jailCh = gch(guild, gs.jailChannelId) as TextChannel | null;
        if (jailCh) await jailCh.send({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(` ${member} — you have been released from jail. Welcome back.`)] }).catch(() => {});
        await interaction.editReply(modActionEmbed({
          action: "Member Unjailed", emoji: "", color: 0x57f287,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          reason: "Released from jail — roles restored",
        }));
        await recordModAction(guild, targetUser.id, "unjail", "Released from jail", actor.tag, actor.id);
        break;
      }

      // ── /history ───────────────────────────────────────────────────────────
      case "history": {
        const targetUser = interaction.options.getUser("user", true);
        const history = gs.modHistory.get(targetUser.id) ?? [];
        if (history.length === 0) {
          await interaction.editReply({ embeds: [ri(` No mod history for **${targetUser.tag}**.`)] });
          return;
        }
        const items = history.map(a => {
          const caseStr = a.caseId ? `[#${a.caseId}] ` : "";
          return `${caseStr}\`${a.type.toUpperCase()}\` — ${a.reason} by **${a.moderator}** <t:${Math.floor(a.timestamp / 1000)}:R>`;
        });
        await sendPaginatedI(interaction, ` Mod History for ${targetUser.tag} (${history.length})`, items, { perPage: 10, color: 0xed4245 });
        break;
      }

      // ── /modstats ──────────────────────────────────────────────────────────
      case "modstats": {
        const targetUser = interaction.options.getUser("user") ?? actor;
        const counts: Record<string, number> = {};
        let total = 0;
        for (const actions of gs.modHistory.values()) {
          for (const a of actions) {
            if (a.moderator === targetUser.tag || (a as any).moderatorId === targetUser.id) {
              counts[a.type] = (counts[a.type] ?? 0) + 1;
              total++;
            }
          }
        }
        if (total === 0) {
          await interaction.editReply({ embeds: [ri(`No recorded mod actions for **${targetUser.tag}** in this server.`)] });
          return;
        }
        const lines = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, n]) => `**${type}**: ${n}`);
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`Mod Stats — ${targetUser.tag}`)
          .setThumbnail(targetUser.displayAvatarURL())
          .setDescription(lines.join("\n"))
          .setFooter({ text: `Total actions: ${total}` })
          .setTimestamp()] });
        break;
      }

      // ── /warnlb ────────────────────────────────────────────────────────────
      case "warnlb": {
        if (!gs.warnings.size) {
          await interaction.editReply({ embeds: [ri("No warnings recorded in this server.")] });
          return;
        }
        const entries = [...gs.warnings.entries()]
          .map(([uid, warns]) => ({ uid, count: warns.length }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 25);
        const lines: string[] = [];
        for (let i = 0; i < entries.length; i++) {
          const { uid, count } = entries[i];
          const u = await client.users.fetch(uid).catch(() => null);
          lines.push(`**${i + 1}.** ${u?.tag ?? `Unknown (${uid})`} — **${count}** warning${count === 1 ? "" : "s"}`);
        }
        await sendPaginatedI(interaction, " Most Warned Members", lines, { color: 0xfee75c });
        break;
      }

      // ── /mutelist ──────────────────────────────────────────────────────────
      case "mutelist": {
        await ensureMembersCache(guild);
        const now = Date.now();
        const muted = guild.members.cache.filter(m => !!m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > now);
        if (muted.size === 0) {
          await interaction.editReply({ embeds: [ri("Nobody is currently timed out.")] });
          return;
        }
        const items = muted.map(m => `${m} \`${m.user.tag}\` — expires <t:${Math.floor(m.communicationDisabledUntilTimestamp! / 1000)}:R>`);
        await sendPaginatedI(interaction, ` Currently Timed Out (${muted.size})`, [...items], { perPage: 10, color: 0xffa500 });
        break;
      }

      // ── /banlist ───────────────────────────────────────────────────────────
      case "banlist": {
        const bans = await guild.bans.fetch();
        if (bans.size === 0) {
          await interaction.editReply({ embeds: [ri("No banned users.")] });
          return;
        }
        const items = [...bans.values()].map((ban, i) =>
          `\`${i + 1}.\` **${ban.user.tag}** (\`${ban.user.id}\`)${ban.reason ? `\n↳ ${ban.reason}` : ""}`
        );
        await sendPaginatedI(interaction, ` Ban List (${bans.size})`, items, { perPage: 10, color: 0xed4245 });
        break;
      }

      // ── /note ──────────────────────────────────────────────────────────────
      case "note": {
        const targetUser = interaction.options.getUser("user", true);
        const text = interaction.options.getString("text", true);
        const notes = gs.modNotes.get(targetUser.id) ?? [];
        notes.push({ text, timestamp: Date.now() });
        gs.modNotes.set(targetUser.id, notes);
        saveState();
        await interaction.editReply({ embeds: [ri(` Note added for **${targetUser.tag}** (note #${notes.length}).`, 0x57f287)] });
        break;
      }

      // ── /notes ─────────────────────────────────────────────────────────────
      case "notes": {
        const targetUser = interaction.options.getUser("user", true);
        const notes = gs.modNotes.get(targetUser.id) ?? [];
        if (notes.length === 0) {
          await interaction.editReply({ embeds: [ri(`No notes for **${targetUser.tag}**.`)] });
          return;
        }
        const items = notes.map((n, i) => `**${i + 1}.** ${n.text} — <t:${Math.floor(n.timestamp / 1000)}:R>`);
        await sendPaginatedI(interaction, ` Mod Notes for ${targetUser.tag} (${notes.length})`, items, { perPage: 10, color: 0xfee75c });
        break;
      }

      // ── /lock ──────────────────────────────────────────────────────────────
      case "lock": {
        const ch = interaction.channel as TextChannel;
        if (!ch) { await interaction.editReply({ embeds: [ri(" Cannot lock this channel.")] }); return; }
        try {
          await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
            .setTitle("Channel Locked")
            .setDescription("This channel has been locked. Only staff can send messages.")
            .setFooter({ text: `Locked by ${actor.tag}` })
            .setTimestamp()] });
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't lock the channel — check my permissions.")] });
        }
        break;
      }

      // ── /unlock ────────────────────────────────────────────────────────────
      case "unlock": {
        const ch = interaction.channel as TextChannel;
        if (!ch) { await interaction.editReply({ embeds: [ri(" Cannot unlock this channel.")] }); return; }
        try {
          await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success)
            .setTitle("Channel Unlocked")
            .setDescription("This channel has been unlocked. Everyone can send messages again.")
            .setFooter({ text: `Unlocked by ${actor.tag}` })
            .setTimestamp()] });
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't unlock the channel — check my permissions.")] });
        }
        break;
      }

      // ── /lockdown ──────────────────────────────────────────────────────────
      case "lockdown": {
        const textChannels = [...guild.channels.cache.values()].filter(c => c.isTextBased() && !c.isDMBased());
        let count = 0;
        await rQueue(textChannels, async (channel) => {
          await (channel as TextChannel).permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
          count++;
        }, 300);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
          .setTitle("Server Lockdown Active")
          .setDescription(`${count} channels locked. No one can send messages.`)
          .setFooter({ text: `Initiated by ${actor.tag}` })
          .setTimestamp()] });
        break;
      }

      // ── /unlockdown ────────────────────────────────────────────────────────
      case "unlockdown": {
        const textChannels = [...guild.channels.cache.values()].filter(c => c.isTextBased() && !c.isDMBased());
        let count = 0;
        await rQueue(textChannels, async (channel) => {
          await (channel as TextChannel).permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {});
          count++;
        }, 300);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success)
          .setTitle("Lockdown Lifted")
          .setDescription(`${count} channels unlocked. Everyone can send messages again.`)
          .setFooter({ text: `Lifted by ${actor.tag}` })
          .setTimestamp()] });
        break;
      }

      // ── /stripstaff ────────────────────────────────────────────────────────
      case "stripstaff": {
        const targetUser = interaction.options.getUser("user", true);
        if (isOwner(targetUser.id)) {
          await interaction.editReply({ embeds: [ri(" Cannot strip the owner.")] }); return;
        }
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found.")] }); return; }
        const hierr = checkHierarchy(guild, actor.id, member);
        if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        const botHighestPos = guild.members.me!.roles.highest.position;
        const rolesToStrip = member.roles.cache.filter(r =>
          r.id !== guild.roles.everyone.id && !r.managed && r.position < botHighestPos
        );
        if (rolesToStrip.size === 0) {
          await interaction.editReply({ embeds: [ri(" No strippable roles found (all roles may be above the bot, managed, or protected).")] }); return;
        }
        gs.strippedStaff.set(targetUser.id, rolesToStrip.map(r => r.id));
        let stripped = 0, failed = 0;
        await rQueue([...rolesToStrip.values()], async (role) => {
          try { await member.roles.remove(role, auditReason("Staff stripped", actor.tag)); stripped++; }
          catch { failed++; }
        }, 300);
        saveState();
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
          .setTitle("Staff Stripped")
          .addFields(
            { name: "User", value: targetUser.tag, inline: true },
            { name: "Roles Removed", value: rolesToStrip.map(r => `<@&${r.id}>`).join(", ").slice(0, 1024) || "None" },
            ...(failed > 0 ? [{ name: " Failed", value: `${failed} role(s) could not be removed (hierarchy).` }] : []),
          )
          .setFooter({ text: "Use /restorestaff to give roles back" })
          .setTimestamp()] });
        await recordModAction(guild, targetUser.id, "stripstaff", `${stripped} role(s) removed`, actor.tag, actor.id);
        break;
      }

      // ── /restorestaff ──────────────────────────────────────────────────────
      case "restorestaff": {
        const targetUser = interaction.options.getUser("user", true);
        const saved = gs.strippedStaff.get(targetUser.id);
        if (!saved?.length) {
          await interaction.editReply({ embeds: [ri(" No saved roles for that user. Either they were never stripped or roles were already restored.")] }); return;
        }
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) {
          await interaction.editReply({ embeds: [ri(" That user is no longer in this server. Their role list is still saved — run this command again once they rejoin.")] }); return;
        }
        const isBlacklisted = gs.staffBlacklist.has(targetUser.id);
        const rolesToRestore = saved.filter(roleId => {
          if (!isBlacklisted) return true;
          const role = guild.roles.cache.get(roleId);
          return role ? (role.permissions.bitfield & ELEVATED_PERMS) === 0n : false;
        });
        const blockedCount = saved.length - rolesToRestore.length;
        let restored = 0, failed = 0;
        await rQueue(rolesToRestore, async (roleId) => {
          try { await member.roles.add(roleId, auditReason("Staff restored", actor.tag)); restored++; }
          catch { failed++; }
        }, 300);
        // Only clear saved roles if at least some were restored successfully
        if (restored > 0 || blockedCount === saved.length) {
          gs.strippedStaff.delete(targetUser.id);
          saveState();
        }
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(restored > 0 ? 0x57f287 : 0xed4245)
          .setTitle("Staff Restored")
          .addFields(
            { name: "User", value: targetUser.tag, inline: true },
            { name: "Roles Restored", value: `${restored}`, inline: true },
            ...(failed > 0 ? [{ name: "Failed", value: `${failed} role(s) couldn't be applied — the bot's role may be too low in hierarchy. Move the bot's role higher and try again.`, inline: false }] : []),
            ...(blockedCount > 0 ? [{ name: "Sblacklist Blocked", value: `${blockedCount} elevated role(s) skipped — user is on the staff blacklist. Use \`/sblacklist remove\` first to restore those.` }] : []),
          )
          .setTimestamp()] });
        break;
      }

      // ── /strip ─────────────────────────────────────────────────────────────
      case "strip": {
        const targetUser = interaction.options.getUser("user", true);
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found.")] }); return; }
        const hierr = checkHierarchy(guild, actor.id, member);
        if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        const roles = member.roles.cache.filter(r => r.id !== guild.id && !r.managed);
        if (roles.size === 0) {
          await interaction.editReply({ embeds: [ri(" That member has no removable roles.")] }); return;
        }
        gs.stripRoles.set(targetUser.id, [...roles.keys()]);
        saveState();
        await rQueue([...roles.values()], async (role) => {
          await member.roles.remove(role, auditReason("Roles stripped", actor.tag)).catch(() => {});
        }, 300);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
          .setTitle("Roles Stripped")
          .addFields(
            { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: "Roles Removed", value: roles.map(r => `<@&${r.id}>`).join(", ").slice(0, 1024) || "None" },
          )
          .setFooter({ text: "Use /unstrip to restore these roles" })
          .setTimestamp()] });
        await recordModAction(guild, targetUser.id, "strip", `${roles.size} role(s) removed`, actor.tag, actor.id);
        break;
      }

      // ── /unstrip ───────────────────────────────────────────────────────────
      case "unstrip": {
        const targetUser = interaction.options.getUser("user", true);
        const savedRoles = gs.stripRoles.get(targetUser.id);
        if (!savedRoles || savedRoles.length === 0) {
          await interaction.editReply({ embeds: [ri(" No saved roles found for that member. They must first be stripped using `/strip`.")] }); return;
        }
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) {
          await interaction.editReply({ embeds: [ri(" That user is no longer in this server. Their role list is still saved — run this command again once they rejoin.")] }); return;
        }
        let restored = 0, failed = 0;
        await rQueue(savedRoles, async (roleId) => {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            try { await member.roles.add(role); restored++; } catch { failed++; }
          }
        }, 300);
        gs.stripRoles.delete(targetUser.id);
        saveState();
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(restored > 0 ? 0x57f287 : 0xed4245)
          .setTitle("Roles Restored")
          .addFields(
            { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: "Roles Restored", value: `${restored}`, inline: true },
            ...(failed > 0 ? [{ name: "Failed", value: `${failed} role(s) could not be applied — the bot's role may be too low in the hierarchy.` }] : []),
          )
          .setTimestamp()] });
        await recordModAction(guild, targetUser.id, "unstrip", `${restored} role(s) restored`, actor.tag, actor.id);
        break;
      }

      // ── /disablecommand ────────────────────────────────────────────────────
      case "disablecommand": {
        const sub = interaction.options.getSubcommand();

        if (sub === "disable") {
          const cmdName = interaction.options.getString("command", true).toLowerCase();
          const channel = interaction.options.getChannel("channel");
          const scope = channel ? channel.id : "__global__";
          if (!gs.disabledCommands.has(scope)) gs.disabledCommands.set(scope, new Set());
          gs.disabledCommands.get(scope)!.add(cmdName);
          saveState();
          const scopeLabel = scope === "__global__" ? "**globally**" : `in <#${scope}>`;
          await interaction.editReply({ embeds: [ri(` Command \`${cmdName}\` disabled ${scopeLabel}.`, 0xed4245)] });
          break;
        }

        if (sub === "enable") {
          const cmdName = interaction.options.getString("command", true).toLowerCase();
          const channel = interaction.options.getChannel("channel");
          const scope = channel ? channel.id : "__global__";
          const set = gs.disabledCommands.get(scope);
          if (!set || !set.has(cmdName)) {
            await interaction.editReply({ embeds: [ri(` Command \`${cmdName}\` is not disabled in that scope.`)] }); return;
          }
          set.delete(cmdName);
          if (set.size === 0) gs.disabledCommands.delete(scope);
          saveState();
          const scopeLabel = scope === "__global__" ? "**globally**" : `in <#${scope}>`;
          await interaction.editReply({ embeds: [ri(` Command \`${cmdName}\` re-enabled ${scopeLabel}.`, 0x57f287)] });
          break;
        }

        if (sub === "list") {
          if (gs.disabledCommands.size === 0) {
            await interaction.editReply({ embeds: [ri(" No commands are currently disabled.")] }); return;
          }
          const lines: string[] = [];
          for (const [scope, cmds] of gs.disabledCommands) {
            const scopeLabel = scope === "__global__" ? "**Global**" : `<#${scope}>`;
            lines.push(`${scopeLabel}: ${[...cmds].map(c => `\`${c}\``).join(", ")}`);
          }
          await sendPaginatedI(interaction, " Disabled Commands", lines, { color: 0xed4245 });
          break;
        }

        break;
      }

      // ── /purge ─────────────────────────────────────────────────────────────
      case "purge": {
        const amount = interaction.options.getInteger("count", true);
        const ch = interaction.channel as TextChannel;
        if (!ch) { await interaction.editReply({ embeds: [ri(" Cannot purge in this channel.")] }); return; }
        try {
          const deleted = await ch.bulkDelete(amount, true);
          await interaction.editReply({ embeds: [ri(` Deleted **${deleted.size}** message${deleted.size === 1 ? "" : "s"}.`, 0x57f287)] });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 4000);
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't delete messages (they may be too old).")] });
        }
        break;
      }

      // ── /clear ─────────────────────────────────────────────────────────────
      case "clear": {
        const targetUser = interaction.options.getUser("user", true);
        const count = interaction.options.getInteger("count") ?? 100;
        const ch = interaction.channel as TextChannel;
        if (!ch) { await interaction.editReply({ embeds: [ri(" Cannot clear in this channel.")] }); return; }
        try {
          const fetched = await ch.messages.fetch({ limit: 100 });
          const toDelete = fetched.filter(m => m.author.id === targetUser.id).first(count);
          await ch.bulkDelete(toDelete, true);
          await interaction.editReply({ embeds: [ri(` Deleted **${toDelete.length}** message${toDelete.length === 1 ? "" : "s"} from ${targetUser}.`, 0x57f287)] });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 4000);
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't clear messages.")] });
        }
        break;
      }

      // ── /cleanup ───────────────────────────────────────────────────────────
      case "cleanup": {
        const limit = interaction.options.getInteger("limit") ?? 50;
        const ch = interaction.channel as TextChannel;
        if (!ch) { await interaction.editReply({ embeds: [ri(" Cannot clean up in this channel.")] }); return; }
        try {
          const fetched = await ch.messages.fetch({ limit: 100 });
          const botMessages = fetched.filter(m => m.author.bot).first(limit);
          await ch.bulkDelete(botMessages, true);
          await interaction.editReply({ embeds: [ri(` Deleted **${botMessages.length}** bot message${botMessages.length === 1 ? "" : "s"}.`, 0x57f287)] });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 4000);
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't clean up messages.")] });
        }
        break;
      }

      // ── /nuke ──────────────────────────────────────────────────────────────
      case "nuke": {
        const confirmed = interaction.options.getBoolean("confirm", true);
        if (!confirmed) {
          await interaction.editReply({ embeds: [ri(" You must set `confirm: True` to nuke the channel.")] }); return;
        }
        const nukeChannel = interaction.channel as TextChannel;
        if (!nukeChannel) { await interaction.editReply({ embeds: [ri(" Cannot nuke this channel.")] }); return; }
        try {
          await interaction.editReply({ embeds: [ri(" Nuking channel...", 0xed4245)] });
          const newChannel = await nukeChannel.clone({ reason: `Nuked by ${actor.tag}` });
          await newChannel.setPosition(nukeChannel.position);
          await nukeChannel.delete();
          await newChannel.send(" Channel nuked.");
        } catch {
          // Channel may already be gone
        }
        break;
      }

      // ── /schedulenuke ──────────────────────────────────────────────────────
      case "schedulenuke": {
        const confirmed = interaction.options.getBoolean("confirm", true);
        if (!confirmed) {
          await interaction.editReply({ embeds: [ri(" You must set `confirm: True` to schedule a nuke.")] }); return;
        }
        const delayStr = interaction.options.getString("delay", true);
        const ms = parseDuration(delayStr);
        if (!ms) {
          await interaction.editReply({ embeds: [ri(" Invalid delay format. Use `30s`, `5m`, `2h`, `1d`.")] }); return;
        }
        const nukeChannel = interaction.channel as TextChannel;
        if (!nukeChannel) { await interaction.editReply({ embeds: [ri(" Cannot schedule a nuke for this channel.")] }); return; }
        const endsAt = Math.floor((Date.now() + ms) / 1000);
        await interaction.editReply({ embeds: [ri(` Nuke scheduled — fires <t:${endsAt}:R>.`, 0xed4245)] });
        setTimeout(async () => {
          try {
            const newChannel = await nukeChannel.clone({ reason: `Scheduled nuke by ${actor.tag}` });
            await newChannel.setPosition(nukeChannel.position);
            await nukeChannel.delete();
            await newChannel.send(`Channel nuked (scheduled by <@${actor.id}>).`);
          } catch {}
        }, ms);
        break;
      }

      // ── /grantaccess ───────────────────────────────────────────────────────
      case "grantaccess": {
        if (!isOwner(actor.id)) {
          await interaction.editReply({ embeds: [ri(" Only the bot owner can use this command.")] }); return;
        }
        const targetUser = interaction.options.getUser("user", true);
        if (gs.botAccessUsers.has(targetUser.id)) {
          await interaction.editReply({ embeds: [ri("That user already has bot access.")] }); return;
        }
        gs.botAccessUsers.add(targetUser.id);
        saveState();
        await interaction.editReply({ embeds: [ri(` **${targetUser.tag}** can now use all bot commands.`, 0x57f287)] });
        break;
      }

      // ── /revokeaccess ──────────────────────────────────────────────────────
      case "revokeaccess": {
        if (!isOwner(actor.id)) {
          await interaction.editReply({ embeds: [ri(" Only the bot owner can use this command.")] }); return;
        }
        const targetUser = interaction.options.getUser("user", true);
        if (!gs.botAccessUsers.has(targetUser.id)) {
          await interaction.editReply({ embeds: [ri("That user doesn't have bot access.")] }); return;
        }
        gs.botAccessUsers.delete(targetUser.id);
        saveState();
        await interaction.editReply({ embeds: [ri(` **${targetUser.tag}**'s bot access has been revoked.`, 0x57f287)] });
        break;
      }

      // ── /listaccess ────────────────────────────────────────────────────────
      case "listaccess": {
        if (!isOwner(actor.id)) {
          await interaction.editReply({ embeds: [ri(" Only the bot owner can use this command.")] }); return;
        }
        if (gs.botAccessUsers.size === 0) {
          await interaction.editReply({ embeds: [ri("No users have been granted bot access.")] }); return;
        }
        const lines = [...gs.botAccessUsers].map(id => `<@${id}> (\`${id}\`)`);
        await sendPaginatedI(interaction, ` Bot Access Users (${lines.length})`, lines, { perPage: 20, color: 0x5865f2 });
        break;
      }

      // ── /raidprotect ───────────────────────────────────────────────────────
      case "raidprotect": {
        const sub = interaction.options.getSubcommand();
        if (sub === "on" || sub === "off") {
          gs.joinRaidProtectionEnabled = sub === "on";
          if (sub === "off") raidModeActive.delete(guild.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` Raid protection **${sub === "on" ? "enabled" : "disabled"}**.`, 0x57f287)] });
        } else if (sub === "clear") {
          raidModeActive.delete(guild.id);
          joinTracker.delete(guild.id);
          saveState();
          await interaction.editReply({ embeds: [ri(" Raid mode manually cleared.", 0x57f287)] });
        } else if (sub === "threshold") {
          const n = interaction.options.getInteger("count", true);
          gs.joinRaidThreshold = n;
          saveState();
          await interaction.editReply({ embeds: [ri(` Raid threshold set to **${n}** joins.`, 0x57f287)] });
        } else if (sub === "window") {
          const n = interaction.options.getInteger("seconds", true);
          gs.joinRaidWindowMs = n * 1000;
          saveState();
          await interaction.editReply({ embeds: [ri(` Raid window set to **${n}s**.`, 0x57f287)] });
        } else if (sub === "action") {
          const act = interaction.options.getString("type", true) as "kick" | "jail" | "ban" | "timeout";
          gs.raidAction = act;
          saveState();
          await interaction.editReply({ embeds: [ri(` Raid action set to **${act}**.`, 0x57f287)] });
        } else {
          // status
          const active = raidModeActive.has(guild.id);
          const actionEmoji: Record<string, string> = { kick: "", jail: "", ban: "", timeout: "" };
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(active ? 0xff0000 : gs.joinRaidProtectionEnabled ? 0xffa500 : 0x5865f2)
            .setTitle(`Raid Protection${active ? " —  ACTIVE" : ""}`)
            .addFields(
              { name: "Status", value: gs.joinRaidProtectionEnabled ? " Enabled" : " Disabled", inline: true },
              { name: "Action", value: `${actionEmoji[gs.raidAction] ?? ""} ${gs.raidAction}`, inline: true },
              { name: "Threshold", value: `**${gs.joinRaidThreshold}** joins`, inline: true },
              { name: "Window", value: `**${gs.joinRaidWindowMs / 1000}s**`, inline: true },
            )
            .setTimestamp()] });
        }
        break;
      }

      // ── /agegate ───────────────────────────────────────────────────────────
      case "agegate": {
        const sub = interaction.options.getSubcommand();
        if (sub === "on" || sub === "off") {
          gs.joinAgeGateEnabled = sub === "on";
          saveState();
          await interaction.editReply({ embeds: [ri(` Account age gate **${sub === "on" ? "enabled" : "disabled"}**.`, 0x57f287)] });
        } else if (sub === "days") {
          const n = interaction.options.getInteger("count", true);
          gs.joinAgeGateDays = n;
          saveState();
          await interaction.editReply({ embeds: [ri(` Minimum account age set to **${n} day(s)**.`, 0x57f287)] });
        } else {
          // status
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(gs.joinAgeGateEnabled ? 0x57f287 : 0x5865f2)
            .setTitle("Account Age Gate")
            .addFields(
              { name: "Status", value: gs.joinAgeGateEnabled ? " Enabled" : " Disabled", inline: true },
              { name: "Minimum Age", value: `**${gs.joinAgeGateDays} day(s)**`, inline: true },
            )
            .setTimestamp()] });
        }
        break;
      }

      // ── /banraiders ────────────────────────────────────────────────────────
      case "banraiders": {
        const confirmed = interaction.options.getBoolean("confirm", true);
        if (!confirmed) {
          await interaction.editReply({ embeds: [ri(" You must set `confirm: True` to ban raiders.")] }); return;
        }
        const reason = interaction.options.getString("reason") ?? "Ban raiders — manual cleanup";
        const RAIDER_SCAN_WINDOW = 5 * 60 * 1000; // 5 minutes — wide enough to catch raiders after detection window closes
        const now = Date.now();
        await ensureMembersCache(guild);
        const raiders = [...guild.members.cache.values()].filter(
          m => !m.user.bot && m.joinedTimestamp !== null && (now - m.joinedTimestamp!) < RAIDER_SCAN_WINDOW
        );
        if (raiders.length === 0) {
          await interaction.editReply({ embeds: [ri(` No members joined within the last **5 minutes**.`)] }); return;
        }
        await interaction.editReply({ embeds: [ri(` Banning **${raiders.length}** raider(s)…`, 0xed4245)] });
        let success = 0, failed = 0;
        await rQueue(raiders, async (m) => {
          try { await m.ban({ reason: `[Ban Raiders] ${reason} — by ${actor.tag}` }); success++; }
          catch { failed++; }
        }, 600);
        raidModeActive.delete(guild.id);
        joinTracker.delete(guild.id);
        await interaction.editReply({ embeds: [ri(` Banned **${success}** raider(s)${failed ? `, failed on **${failed}**` : ""}. Raid mode cleared.`, 0x57f287)] });
        break;
      }

      // ── /lockserver ────────────────────────────────────────────────────────
      case "lockserver": {
        try {
          gs.savedVerificationLevel = guild.verificationLevel;
          saveState();
          await guild.setVerificationLevel(4, `Server locked by ${actor.tag}`);
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle("Server Locked")
            .setDescription("Verification level raised to **Highest** — members must have a verified phone number.\nUse `/unlockserver` to restore.")
            .setFooter({ text: `Locked by ${actor.tag}` })
            .setTimestamp()] });
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't change verification level — check bot permissions.")] });
        }
        break;
      }

      // ── /unlockserver ──────────────────────────────────────────────────────
      case "unlockserver": {
        try {
          if (gs.savedVerificationLevel === null) {
            await interaction.editReply({ embeds: [ri(" No saved verification level — run `/lockserver` first.")] }); return;
          }
          const restoreTo = gs.savedVerificationLevel;
          await guild.setVerificationLevel(restoreTo as any, `Server unlocked by ${actor.tag}`);
          gs.savedVerificationLevel = null;
          saveState();
          const levelNames = ["None", "Low", "Medium", "High", "Highest"];
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle("Server Unlocked")
            .setDescription(`Verification level restored to **${levelNames[restoreTo] ?? "None"}**.`)
            .setFooter({ text: `Unlocked by ${actor.tag}` })
            .setTimestamp()] });
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't change verification level — check bot permissions.")] });
        }
        break;
      }

      // ── /antinuke ──────────────────────────────────────────────────────────
      case "antinuke": {
        const sub = interaction.options.getSubcommand();
        if (sub === "on" || sub === "off") {
          gs.antinukeEnabled = sub === "on";
          saveState();
          await interaction.editReply({ embeds: [ri(` Antinuke **${sub === "on" ? "enabled" : "disabled"}**.`, 0x57f287)] });
        } else if (sub === "bans" || sub === "kicks" || sub === "channels" || sub === "roles" || sub === "bots") {
          const n = interaction.options.getInteger("count", true);
          if (sub === "bans") gs.antinukeThresholds.bans = n;
          else if (sub === "kicks") gs.antinukeThresholds.kicks = n;
          else if (sub === "channels") gs.antinukeThresholds.channelDeletes = n;
          else if (sub === "roles") gs.antinukeThresholds.roleDeletes = n;
          else gs.antinukeThresholds.botAdds = n;
          saveState();
          await interaction.editReply({ embeds: [ri(` Antinuke threshold for **${sub}** set to **${n}**.`, 0x57f287)] });
        } else {
          // status
          const t = gs.antinukeThresholds;
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(gs.antinukeEnabled ? 0x57f287 : 0x5865f2)
            .setTitle("Antinuke")
            .addFields(
              { name: "Status", value: gs.antinukeEnabled ? " Enabled" : " Disabled", inline: true },
              { name: "Window", value: `**${gs.antinukeWindowMs / 1000}s**`, inline: true },
              { name: "Bans threshold", value: `**${t.bans}**`, inline: true },
              { name: "Kicks threshold", value: `**${t.kicks}**`, inline: true },
              { name: "Channel deletes", value: `**${t.channelDeletes}**`, inline: true },
              { name: "Role deletes", value: `**${t.roleDeletes}**`, inline: true },
              { name: "Bot adds", value: `**${t.botAdds}**`, inline: true },
            )
            .setFooter({ text: "Thresholds = actions within the window to trigger" })
            .setTimestamp()] });
        }
        break;
      }

      // ── /whitelist ─────────────────────────────────────────────────────────
      case "whitelist": {
        if (guild.ownerId !== actor.id && !isOwner(actor.id)) {
          await interaction.editReply({ embeds: [ri("Only the **server owner** can use this command.")] }); return;
        }
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const targetUser = interaction.options.getUser("user", true);
          gs.antinukeWhitelist.add(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} added to the antinuke whitelist.`, 0x57f287)] });
        } else if (sub === "remove") {
          const targetUser = interaction.options.getUser("user", true);
          if (isOwner(targetUser.id)) {
            await interaction.editReply({ embeds: [ri(" Cannot remove the bot owner from the whitelist.")] }); return;
          }
          gs.antinukeWhitelist.delete(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} removed from the antinuke whitelist.`, 0x57f287)] });
        } else {
          // list
          if (gs.antinukeWhitelist.size === 0) {
            await interaction.editReply({ embeds: [ri("Antinuke whitelist is empty.")] }); return;
          }
          const items = [...gs.antinukeWhitelist].map(id => `<@${id}> (\`${id}\`)`);
          await sendPaginatedI(interaction, ` Antinuke Whitelist (${items.length})`, items, { perPage: 20, color: 0x57f287 });
        }
        break;
      }

      // ── /antinukeadmin ─────────────────────────────────────────────────────
      case "antinukeadmin": {
        const sub = interaction.options.getSubcommand();
        if (sub === "grant") {
          const targetUser = interaction.options.getUser("user", true);
          gs.antinukeAdmins.add(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} granted **Antinuke Admin** — they can now configure antinuke settings and the whitelist.`, 0x57f287)] });
        } else if (sub === "revoke") {
          const targetUser = interaction.options.getUser("user", true);
          if (isOwner(targetUser.id)) {
            await interaction.editReply({ embeds: [ri(" Cannot revoke from the bot owner.")] }); return;
          }
          gs.antinukeAdmins.delete(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` Revoked Antinuke Admin from ${targetUser}.`, 0x57f287)] });
        } else {
          // list
          if (gs.antinukeAdmins.size === 0) {
            await interaction.editReply({ embeds: [ri("No antinuke admins set.")] }); return;
          }
          const items = [...gs.antinukeAdmins].map(id => `<@${id}> (\`${id}\`)`);
          await sendPaginatedI(interaction, ` Antinuke Admins (${items.length})`, items, { perPage: 20, color: 0xfee75c });
        }
        break;
      }

      // ── /permguard ─────────────────────────────────────────────────────────
      case "permguard": {
        const sub = interaction.options.getSubcommand();
        if (sub === "on" || sub === "off") {
          gs.permGuardEnabled = sub === "on";
          saveState();
          await interaction.editReply({ embeds: [ri(
            `Permission Guard **${sub === "on" ? "enabled" : "disabled"}**.` +
            (sub === "on" ? " Non-whitelisted members who receive dangerous roles will have them instantly stripped." : ""),
            sub === "on" ? 0x57f287 : 0xed4245
          )] });
        } else {
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(gs.permGuardEnabled ? 0x57f287 : 0xed4245)
            .setTitle("Permission Guard")
            .addFields(
              { name: "Status", value: gs.permGuardEnabled ? " Enabled" : " Disabled", inline: true },
              { name: "How it works", value: "Any non-whitelisted member who receives a role with the **Administrator** permission will have that role instantly removed and a warning will be sent to the antinuke log channel. All other permissions can be granted normally.", inline: false },
              { name: "Bypass", value: "Use `/permguardwhitelist add` to allow trusted users to hold powerful roles.", inline: false },
            )
            .setTimestamp()] });
        }
        break;
      }

      // ── /permguardwhitelist ────────────────────────────────────────────────
      case "permguardwhitelist": {
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const targetUser = interaction.options.getUser("user", true);
          gs.permGuardWhitelist.add(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} added to the permguard whitelist — they can hold admin roles.`, 0x57f287)] });
        } else if (sub === "remove") {
          const targetUser = interaction.options.getUser("user", true);
          if (isOwner(targetUser.id)) {
            await interaction.editReply({ embeds: [ri(" Cannot remove the bot owner.")] }); return;
          }
          gs.permGuardWhitelist.delete(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} removed from the permguard whitelist.`, 0x57f287)] });
        } else {
          if (gs.permGuardWhitelist.size === 0) {
            await interaction.editReply({ embeds: [ri("Permguard whitelist is empty.")] }); return;
          }
          const items = [...gs.permGuardWhitelist].map(id => `<@${id}> (\`${id}\`)`);
          await sendPaginatedI(interaction, " Permguard Whitelist", items, { perPage: 20, color: 0x57f287 });
        }
        break;
      }

      // ── /jaillist ──────────────────────────────────────────────────────────
      case "jaillist": {
        if (gs.jailedMembers.size === 0) {
          await interaction.editReply({ embeds: [ri("Nobody is currently jailed.")] }); return;
        }
        await ensureMembersCache(guild);
        const jailItems: string[] = [];
        for (const [userId] of gs.jailedMembers) {
          const m = guild.members.cache.get(userId);
          jailItems.push(m ? `${m} \`${m.user.tag}\`` : `Unknown user (\`${userId}\`)`);
        }
        await sendPaginatedI(interaction, ` Currently Jailed (${jailItems.length})`, jailItems, { perPage: 15, color: 0xcc2222 });
        break;
      }

      // ── /filter ────────────────────────────────────────────────────────────
      case "filter": {
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const word = interaction.options.getString("word", true).toLowerCase().trim();
          gs.customFilterWords.add(word);
          saveState();
          await interaction.editReply({ embeds: [ri(` **${word}** added to this server's word filter.`, 0x57f287)] });
        } else if (sub === "remove") {
          const word = interaction.options.getString("word", true).toLowerCase().trim();
          if (!gs.customFilterWords.has(word)) {
            await interaction.editReply({ embeds: [ri(` **${word}** is not in the filter list.`)] }); return;
          }
          gs.customFilterWords.delete(word);
          saveState();
          await interaction.editReply({ embeds: [ri(` **${word}** removed from the word filter.`, 0x57f287)] });
        } else {
          if (gs.customFilterWords.size === 0) {
            await interaction.editReply({ embeds: [ri("No custom filter words set for this server.")] }); return;
          }
          const items = [...gs.customFilterWords].map(w => `\`${w}\``);
          await sendPaginatedI(interaction, ` Custom Filter Words (${items.length})`, items, { perPage: 20, color: 0xed4245 });
        }
        break;
      }

      // ── /antiinvite ────────────────────────────────────────────────────────
      case "antiinvite": {
        const sub = interaction.options.getSubcommand();
        if (sub === "on" || sub === "off") {
          gs.inviteFilterEnabled = sub === "on";
          saveState();
          await interaction.editReply({ embeds: [ri(` Invite link filter **${sub === "on" ? "enabled" : "disabled"}**.`, 0x57f287)] });
        } else {
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(gs.inviteFilterEnabled ? 0x57f287 : 0x5865f2)
            .setTitle("Anti-Invite Filter")
            .addFields({ name: "Status", value: gs.inviteFilterEnabled ? " Enabled" : " Disabled", inline: true })
            .setTimestamp()] });
        }
        break;
      }

      // ── /filterbypass ──────────────────────────────────────────────────────
      case "filterbypass": {
        if (!gs.antinukeWhitelist.has(actor.id)) {
          await interaction.editReply({ embeds: [ri("Only antinuke-whitelisted members can use this command.")] }); return;
        }
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const targetUser = interaction.options.getUser("user", true);
          if (gs.filterBypassUsers.has(targetUser.id)) {
            await interaction.editReply({ embeds: [ri("That user already has a filter bypass.")] }); return;
          }
          gs.filterBypassUsers.add(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} now has full filter immunity.`, 0x57f287)] });
        } else if (sub === "remove") {
          const targetUser = interaction.options.getUser("user", true);
          if (!gs.filterBypassUsers.has(targetUser.id)) {
            await interaction.editReply({ embeds: [ri("That user doesn't have a filter bypass.")] }); return;
          }
          gs.filterBypassUsers.delete(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser}'s filter bypass removed.`, 0x57f287)] });
        } else {
          if (gs.filterBypassUsers.size === 0) {
            await interaction.editReply({ embeds: [ri("No users have a filter bypass.")] }); return;
          }
          const items = [...gs.filterBypassUsers].map(id => `<@${id}> (\`${id}\`)`);
          await sendPaginatedI(interaction, ` Filter Bypass Users (${items.length})`, items, { perPage: 20, color: 0x5865f2 });
        }
        break;
      }

      // ── /spambypass ────────────────────────────────────────────────────────
      case "spambypass": {
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const targetUser = interaction.options.getUser("user", true);
          if (gs.spamBypass.has(targetUser.id)) {
            await interaction.editReply({ embeds: [ri("That user already has a spam bypass.")] }); return;
          }
          gs.spamBypass.add(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} is now exempt from anti-spam detection.`, 0x57f287)] });
        } else if (sub === "remove") {
          const targetUser = interaction.options.getUser("user", true);
          if (!gs.spamBypass.has(targetUser.id)) {
            await interaction.editReply({ embeds: [ri("That user doesn't have a spam bypass.")] }); return;
          }
          gs.spamBypass.delete(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser}'s spam bypass removed.`, 0x57f287)] });
        } else {
          if (gs.spamBypass.size === 0) {
            await interaction.editReply({ embeds: [ri("No users have a spam bypass.")] }); return;
          }
          const items = [...gs.spamBypass].map(id => `<@${id}> (\`${id}\`)`);
          await sendPaginatedI(interaction, ` Spam Bypass Users (${items.length})`, items, { perPage: 20, color: 0x5865f2 });
        }
        break;
      }

      // ── /linkbypass ────────────────────────────────────────────────────────
      case "linkbypass": {
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const targetUser = interaction.options.getUser("user", true);
          if (gs.linkFilterBypass.has(targetUser.id)) {
            await interaction.editReply({ embeds: [ri("That user already has a link bypass.")] }); return;
          }
          gs.linkFilterBypass.add(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} can now post links without being filtered.`, 0x57f287)] });
        } else if (sub === "remove") {
          const targetUser = interaction.options.getUser("user", true);
          if (!gs.linkFilterBypass.has(targetUser.id)) {
            await interaction.editReply({ embeds: [ri("That user doesn't have a link bypass.")] }); return;
          }
          gs.linkFilterBypass.delete(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser}'s link bypass removed.`, 0x57f287)] });
        } else {
          if (gs.linkFilterBypass.size === 0) {
            await interaction.editReply({ embeds: [ri("No users have a link bypass.")] }); return;
          }
          const items = [...gs.linkFilterBypass].map(id => `<@${id}> (\`${id}\`)`);
          await sendPaginatedI(interaction, ` Link Bypass Users (${items.length})`, items, { perPage: 20, color: 0x5865f2 });
        }
        break;
      }

      // ── /imageban ──────────────────────────────────────────────────────────
      case "imageban": {
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const targetUser = interaction.options.getUser("user", true);
          gs.imageBlacklist.add(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} can no longer post images or videos.`, 0xed4245)] });
        } else if (sub === "remove") {
          const targetUser = interaction.options.getUser("user", true);
          gs.imageBlacklist.delete(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} can post images again.`, 0x57f287)] });
        } else {
          if (gs.imageBlacklist.size === 0) {
            await interaction.editReply({ embeds: [ri("No users are image-banned.")] }); return;
          }
          const items = [...gs.imageBlacklist].map(id => `<@${id}> (\`${id}\`)`);
          await sendPaginatedI(interaction, ` Image-Banned Users (${items.length})`, items, { perPage: 20, color: 0xed4245 });
        }
        break;
      }

      // ── /streamban ─────────────────────────────────────────────────────────
      case "streamban": {
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const targetUser = interaction.options.getUser("user", true);
          gs.streamBlacklist.add(targetUser.id);
          saveState();
          const streamMember = guild.members.cache.get(targetUser.id);
          if (streamMember?.voice.channel && (streamMember.voice.streaming || streamMember.voice.selfVideo)) {
            await streamMember.voice.disconnect("Stream/camera banned").catch(() => {});
          }
          await interaction.editReply({ embeds: [ri(` ${targetUser} can no longer stream or use camera.`, 0xed4245)] });
        } else if (sub === "remove") {
          const targetUser = interaction.options.getUser("user", true);
          gs.streamBlacklist.delete(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` ${targetUser} can stream and use camera again.`, 0x57f287)] });
        } else {
          if (gs.streamBlacklist.size === 0) {
            await interaction.editReply({ embeds: [ri("No users are stream-banned.")] }); return;
          }
          const items = [...gs.streamBlacklist].map(id => `<@${id}> (\`${id}\`)`);
          await sendPaginatedI(interaction, ` Stream/Camera-Banned Users (${items.length})`, items, { perPage: 20, color: 0xed4245 });
        }
        break;
      }

      // ── /sblacklist ────────────────────────────────────────────────────────
      case "sblacklist": {
        const sub = interaction.options.getSubcommand();
        if (sub === "setrole") {
          const role = interaction.options.getRole("role", true);
          gs.staffBlacklistRoleId = role.id;
          saveState();
          await interaction.editReply({ embeds: [ri(` Staff blacklist role set to ${role}. Blacklisted members will receive this role and lose elevated-permission roles.`, 0x57f287)] });
        } else if (sub === "add") {
          const targetUser = interaction.options.getUser("user", true);
          if (isOwner(targetUser.id)) {
            await interaction.editReply({ embeds: [ri(" Cannot blacklist the owner.")] }); return;
          }
          if (gs.staffBlacklist.has(targetUser.id)) {
            await interaction.editReply({ embeds: [ri(` ${targetUser.tag} is already blacklisted.`)] }); return;
          }
          const reason = interaction.options.getString("reason") ?? "No reason provided";
          const member = await fetchMember(guild, targetUser.id).catch(() => null);
          if (!member) { await interaction.editReply({ embeds: [ri(" Member not found.")] }); return; }
          const elevated = member.roles.cache.filter(r => r.id !== guild.roles.everyone.id && !r.managed && (r.permissions.bitfield & ELEVATED_PERMS) !== 0n);
          const strippedIds = elevated.map(r => r.id);
          for (const [, role] of elevated) await member.roles.remove(role, auditReason("Staff blacklisted", actor.tag)).catch(() => {});
          if (gs.staffBlacklistRoleId) {
            const blRole = guild.roles.cache.get(gs.staffBlacklistRoleId);
            if (blRole) await member.roles.add(blRole, auditReason("Staff blacklisted", actor.tag)).catch(() => {});
          }
          gs.staffBlacklist.set(targetUser.id, { reason, addedBy: actor.tag, timestamp: Date.now(), strippedRoles: strippedIds });
          saveState();
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
            .setTitle("Staff Blacklisted")
            .addFields(
              { name: "Member", value: `${targetUser.tag} (${targetUser})`, inline: true },
              { name: "Reason", value: reason, inline: true },
              { name: "Roles Stripped", value: strippedIds.length ? strippedIds.map(r => `<@&${r}>`).join(" ") : "none", inline: false },
            ).setTimestamp()] });
          await recordModAction(guild, targetUser.id, "sblacklist", reason, actor.tag, actor.id);
        } else if (sub === "remove") {
          const targetUser = interaction.options.getUser("user", true);
          const entry = gs.staffBlacklist.get(targetUser.id);
          if (!entry) { await interaction.editReply({ embeds: [ri(` ${targetUser.tag} is not blacklisted.`)] }); return; }
          const member = await fetchMember(guild, targetUser.id).catch(() => null);
          if (member && gs.staffBlacklistRoleId) {
            const blRole = guild.roles.cache.get(gs.staffBlacklistRoleId);
            if (blRole) await member.roles.remove(blRole, auditReason("Staff blacklist removed", actor.tag)).catch(() => {});
          }
          gs.staffBlacklist.delete(targetUser.id);
          saveState();
          await interaction.editReply({ embeds: [ri(` **${targetUser.tag}** removed from the staff blacklist. Use /restorestaff to restore their roles if needed.`, 0x57f287)] });
        } else if (sub === "check") {
          const targetUser = interaction.options.getUser("user", true);
          const entry = gs.staffBlacklist.get(targetUser.id);
          if (!entry) {
            await interaction.editReply({ embeds: [ri(` ${targetUser.tag} is **not** staff-blacklisted.`, 0x57f287)] }); return;
          }
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
            .setTitle("Staff Blacklisted")
            .addFields(
              { name: "User", value: `${targetUser}`, inline: true },
              { name: "Reason", value: entry.reason || "none", inline: true },
              { name: "Added By", value: entry.addedBy, inline: true },
              { name: "Since", value: `<t:${Math.floor(entry.timestamp / 1000)}:F>`, inline: true },
              { name: "Stripped Roles", value: entry.strippedRoles.length ? entry.strippedRoles.map(r => `<@&${r}>`).join(" ") : "none" },
            ).setTimestamp()] });
        } else {
          // list
          if (gs.staffBlacklist.size === 0) {
            await interaction.editReply({ embeds: [ri("No members are currently staff-blacklisted.")] }); return;
          }
          const lines = [...gs.staffBlacklist.entries()].map(([uid, data]) =>
            `<@${uid}> — ${data.reason || "no reason"} · by **${data.addedBy}** <t:${Math.floor(data.timestamp / 1000)}:R>`
          );
          await sendPaginatedI(interaction, ` Staff Blacklist (${lines.length})`, lines, { perPage: 10, color: 0xed4245 });
        }
        break;
      }

      // ── /tempban ───────────────────────────────────────────────────────────
      case "tempban": {
        const targetUser = interaction.options.getUser("user", true);
        const durStr = interaction.options.getString("duration", true);
        const reason = interaction.options.getString("reason") ?? "No reason given";
        const match = durStr.match(/^(\d+)(s|m|h|d|w)$/i);
        if (!match) { await interaction.editReply({ embeds: [ri(" Invalid duration. Use `30m`, `2h`, `1d`, `1w`.")] }); return; }
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const ms = unit === "s" ? amount * 1000 : unit === "m" ? amount * 60_000 : unit === "h" ? amount * 3_600_000 : unit === "d" ? amount * 86_400_000 : amount * 604_800_000;
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (member) {
          const hierr = checkHierarchy(guild, actor.id, member);
          if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
        }
        await guild.members.ban(targetUser.id, { reason: auditReason(`[Tempban ${durStr}] ${reason}`, actor.tag) });
        await interaction.editReply(modActionEmbed({
          action: "Temporary Ban", emoji: "", color: 0xed4245,
          targetTag: targetUser.tag, targetId: targetUser.id,
          targetAvatar: targetUser.displayAvatarURL(),
          moderatorTag: actor.tag, moderatorId: actor.id,
          duration: durStr, reason,
        }));
        await recordModAction(guild, targetUser.id, "tempban", `${reason} (${durStr})`, actor.tag, actor.id);
        gs.tempBans.set(targetUser.id, { unbanAt: Date.now() + ms, moderatorTag: actor.tag });
        saveState();
        const guildId = guild.id;
        setTimeout(async () => {
          const g = client.guilds.cache.get(guildId);
          if (!g) return;
          await g.bans.remove(targetUser.id, "Tempban expired").catch(() => {});
          const gsT = getGS(guildId);
          gsT.tempBans.delete(targetUser.id);
          saveState();
        }, ms);
        break;
      }

      // ── /unbanall ──────────────────────────────────────────────────────────
      case "unbanall": {
        const confirmed = interaction.options.getBoolean("confirm", true);
        if (!confirmed) { await interaction.editReply({ embeds: [ri(" Set `confirm: True` to proceed.")] }); return; }
        const bans = await guild.bans.fetch().catch(() => null);
        if (!bans || bans.size === 0) { await interaction.editReply({ embeds: [ri("No banned users to unban.")] }); return; }
        await interaction.editReply({ embeds: [ri(` Unbanning **${bans.size}** user(s)… (hardbanned users will be skipped)`, 0xffa500)] });
        let success = 0, skipped = 0;
        await rQueue([...bans.keys()], async (userId) => {
          if (gs.hardbannedUsers.has(userId)) { skipped++; return; }
          await guild.bans.remove(userId, `Mass unban by ${actor.tag}`).then(() => success++).catch(() => skipped++);
        }, 600);
        await interaction.editReply({ embeds: [ri(` Unban complete — **${success}** unbanned${skipped > 0 ? `, **${skipped}** skipped (hardbanned or error)` : ""}.`, 0x57f287)] });
        break;
      }

      // ── /massban ───────────────────────────────────────────────────────────
      case "massban": {
        const rawIds = interaction.options.getString("user_ids", true);
        const reason = interaction.options.getString("reason") ?? "Mass ban";
        const ids = rawIds.split(/[\s,]+/).map(s => s.trim()).filter(s => /^\d{15,20}$/.test(s));
        if (ids.length === 0) { await interaction.editReply({ embeds: [ri(" No valid user IDs found. Enter comma-separated IDs (e.g. `12345,67890`).")] }); return; }
        await interaction.editReply({ embeds: [ri(` Banning **${ids.length}** user(s)…`, 0xed4245)] });
        let success = 0, failed = 0;
        await rQueue(ids, async (id) => {
          try { await guild.bans.create(id, { reason: `[Mass Ban] ${reason} — by ${actor.tag}`, deleteMessageSeconds: 0 }); success++; }
          catch { failed++; }
        }, 600);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
          .setTitle("Mass Ban Complete")
          .setDescription(` Banned: **${success}**${failed ? `\n Failed: **${failed}**` : ""}`)
          .addFields({ name: "Reason", value: reason })
          .setTimestamp()] });
        break;
      }

      // ── /hackban ───────────────────────────────────────────────────────────
      case "hackban": {
        const userId = interaction.options.getString("user_id", true).trim();
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        if (!/^\d{15,20}$/.test(userId)) { await interaction.editReply({ embeds: [ri(" Invalid user ID.")] }); return; }
        try {
          const user = await client.users.fetch(userId).catch(() => null);
          const targetMember = guild.members.cache.get(userId) ?? await fetchMember(guild, userId).catch(() => null);
          if (targetMember) {
            const hierr = checkHierarchy(guild, actor.id, targetMember);
            if (hierr) { await interaction.editReply({ embeds: [ri(hierr)] }); return; }
          }
          await guild.members.ban(userId, { reason: auditReason(reason, actor.tag) });
          await interaction.editReply(modActionEmbed({
            action: "Member Hackbanned", emoji: "", color: 0xed4245,
            targetTag: user?.tag ?? userId, targetId: userId,
            targetAvatar: user?.displayAvatarURL() ?? null,
            moderatorTag: actor.tag, moderatorId: actor.id,
            reason, note: "Banned by user ID — may not have been in the server.",
          }));
          await recordModAction(guild, userId, "ban", `[hackban] ${reason}`, actor.tag, actor.id);
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't ban that user ID — they may already be banned or the ID is invalid.")] });
        }
        break;
      }

      // ── /hardbanremove ─────────────────────────────────────────────────────
      case "hardbanremove": {
        const userId = interaction.options.getString("user_id", true).trim();
        gs.hardbannedUsers.delete(userId);
        saveState();
        try {
          const bannedUser = await client.users.fetch(userId).catch(() => null);
          await guild.bans.remove(userId, `Hardban lifted by ${actor.tag}`);
          await interaction.editReply(modActionEmbed({
            action: "Hardban Removed", emoji: "", color: 0x57f287,
            targetTag: bannedUser?.tag ?? userId, targetId: userId,
            targetAvatar: bannedUser?.displayAvatarURL() ?? null,
            moderatorTag: actor.tag, moderatorId: actor.id,
            reason: "Hardban flag removed and ban lifted",
          }));
        } catch {
          await interaction.editReply({ embeds: [ri(" Hardban flag removed. (User was not in the ban list or already unbanned.)", 0x57f287)] });
        }
        break;
      }

      // ── /hardbans ──────────────────────────────────────────────────────────
      case "hardbans": {
        if (!gs.hardbannedUsers.size) {
          await interaction.editReply({ embeds: [ri("No hard-banned users in this server.")] }); return;
        }
        const hbLines: string[] = [];
        for (const uid of gs.hardbannedUsers) {
          const u = await client.users.fetch(uid).catch(() => null);
          hbLines.push(`**${u?.tag ?? "Unknown User"}** (\`${uid}\`)`);
        }
        await sendPaginatedI(interaction, ` Hard-Banned Users (${hbLines.length})`, hbLines, { color: 0xed4245 });
        break;
      }

      // ── /dehoist ───────────────────────────────────────────────────────────
      case "dehoist": {
        await ensureMembersCache(guild);
        const toRename = guild.members.cache.filter(m => !m.user.bot && DEHOIST_RE.test(m.displayName));
        if (toRename.size === 0) {
          await interaction.editReply({ embeds: [ri("No hoisted members found.")] }); return;
        }
        await interaction.editReply({ embeds: [ri(` Dehoisting **${toRename.size}** members…`, 0xffa500)] });
        let done = 0;
        for (const [, m] of toRename) {
          const cleaned = m.displayName.replace(/^[!-/:-@[-`{-~]+/, "").trim() || "dehoisted";
          await m.setNickname(cleaned).catch(() => {});
          done++;
          await new Promise(r => setTimeout(r, 300));
        }
        await interaction.editReply({ embeds: [ri(` Dehoisted **${done}** member${done === 1 ? "" : "s"}.`, 0x57f287)] });
        break;
      }

      // ── /clearhistory ──────────────────────────────────────────────────────
      case "clearhistory": {
        const targetUser = interaction.options.getUser("user", true);
        gs.modHistory.delete(targetUser.id);
        gs.caseIndex.forEach((uid, caseId) => { if (uid === targetUser.id) gs.caseIndex.delete(caseId); });
        saveState();
        await interaction.editReply({ embeds: [ri(` Mod history cleared for **${targetUser.tag}**.`, 0x57f287)] });
        break;
      }

      // ── /modlog ────────────────────────────────────────────────────────────
      case "modlog": {
        const channel = interaction.options.getChannel("channel");
        const disable = interaction.options.getBoolean("disable") ?? false;
        if (disable) {
          gs.modLogChannelId = null;
          saveState();
          await interaction.editReply({ embeds: [ri(" Mod log disabled.", 0x57f287)] });
        } else if (channel) {
          gs.modLogChannelId = channel.id;
          saveState();
          await interaction.editReply({ embeds: [ri(` Mod log set to ${channel}. All moderation actions will be logged there.`, 0x57f287)] });
        } else {
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle("Mod Log")
            .addFields({ name: "Current Channel", value: gs.modLogChannelId ? `<#${gs.modLogChannelId}>` : "Not set", inline: true })
            .setFooter({ text: "Use /modlog channel:#channel to set, or disable:True to remove" })
            .setTimestamp()] });
        }
        break;
      }

      // ── /warnthreshold ─────────────────────────────────────────────────────
      case "warnthreshold": {
        const sub = interaction.options.getSubcommand();
        if (sub === "status") {
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle("Warn Thresholds")
            .addFields(
              { name: "Auto-kick at", value: gs.warnKickThreshold > 0 ? `**${gs.warnKickThreshold}** warnings` : "Disabled", inline: true },
              { name: "Auto-ban at", value: gs.warnBanThreshold > 0 ? `**${gs.warnBanThreshold}** warnings` : "Disabled", inline: true },
            )
            .setTimestamp()] });
        } else {
          const valStr = interaction.options.getString("value", true).toLowerCase();
          const val = valStr === "off" ? 0 : parseInt(valStr);
          if (isNaN(val) || val < 0 || val > 20) {
            await interaction.editReply({ embeds: [ri(" Provide a number 1–20 or `off`.")] }); return;
          }
          if (sub === "kick") {
            gs.warnKickThreshold = val;
            saveState();
            await interaction.editReply({ embeds: [ri(val === 0 ? " Auto-kick on warns **disabled**." : ` Members will be auto-kicked at **${val}** warnings.`, 0x57f287)] });
          } else {
            gs.warnBanThreshold = val;
            saveState();
            await interaction.editReply({ embeds: [ri(val === 0 ? " Auto-ban on warns **disabled**." : ` Members will be auto-banned at **${val}** warnings.`, 0x57f287)] });
          }
        }
        break;
      }

      // ── /avatar ────────────────────────────────────────────────────────────
      case "avatar": {
        const target = interaction.options.getUser("user") ?? actor;
        const user = await client.users.fetch(target.id, { force: true }).catch(() => target);
        const url = user.displayAvatarURL({ size: 4096, extension: "png" });
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary)
          .setTitle(`${user.tag}'s Avatar`).setImage(url)
          .setDescription(`[Open in browser](${url})`)] });
        break;
      }

      // ── /say ───────────────────────────────────────────────────────────────
      case "say": {
        const channel = interaction.options.getChannel("channel", true);
        const text = interaction.options.getString("message", true);
        const target = guild.channels.cache.get(channel.id);
        if (!target?.isTextBased()) {
          await interaction.editReply({ embeds: [ri(" That channel isn't a text channel.")] }); return;
        }
        try {
          await (target as TextChannel).send(text);
          await interaction.deleteReply().catch(() => {});
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't send to that channel.")] });
        }
        break;
      }

      // ── /dm ────────────────────────────────────────────────────────────────
      case "dm": {
        const targetUser = interaction.options.getUser("user", true);
        const text = interaction.options.getString("message", true);
        try {
          await targetUser.send(text);
          await interaction.editReply({ embeds: [ri(` DM sent to **${targetUser.tag}**.`, 0x57f287)] });
          if (dmLogChannel) {
            await dmLogChannel.send({ embeds: [new EmbedBuilder().setColor(COLORS.primary)
              .setTitle("DM Sent")
              .addFields(
                { name: "To", value: `${targetUser} (${targetUser.tag})`, inline: true },
                { name: "From Server", value: guild.name, inline: true },
                { name: "Sent By", value: `${actor} (${actor.tag})`, inline: true },
                { name: "Message", value: text },
              ).setTimestamp()] }).catch(() => {});
          }
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't DM that user (they may have DMs closed).")] });
        }
        break;
      }

      // ── /dmall ─────────────────────────────────────────────────────────────
      case "dmall": {
        const text = interaction.options.getString("message", true);
        await ensureMembersCache(guild);
        const humans = guild.members.cache.filter(m => !m.user.bot);
        await interaction.editReply({ embeds: [ri(` Sending DMs to **${humans.size}** members…`, 0xffa500)] });
        let sent = 0, failed = 0;
        for (const [, member] of humans) {
          let attempts = 0, delivered = false;
          while (attempts < 4) {
            try { await member.send(text); delivered = true; break; }
            catch (err: any) {
              if (err?.status === 429 || err?.httpStatus === 429) {
                const waitMs = ((err?.rawError?.retry_after ?? err?.retryAfter ?? 2)) * 1000;
                await new Promise(r => setTimeout(r, waitMs + 100));
                attempts++;
              } else { break; }
            }
          }
          if (delivered) sent++; else failed++;
          await new Promise(r => setTimeout(r, 1000));
        }
        const dmallEmbed = new EmbedBuilder().setColor(COLORS.primary)
          .setTitle("Mass DM Complete")
          .addFields(
            { name: " Delivered", value: `${sent}`, inline: true },
            { name: " Failed", value: `${failed}`, inline: true },
            { name: "Sent By", value: `${actor.tag}`, inline: true },
            { name: "Message", value: text.length > 1024 ? text.slice(0, 1021) + "…" : text },
          ).setTimestamp();
        await interaction.editReply({ embeds: [dmallEmbed] });
        if (dmLogChannel) await dmLogChannel.send({ embeds: [dmallEmbed] }).catch(() => {});
        break;
      }

      // ── /setrole ───────────────────────────────────────────────────────────
      case "setrole": {
        const sub = interaction.options.getSubcommand();
        if (sub === "rep") {
          const role = interaction.options.getRole("role", true);
          gs.repRoleId = role.id;
          saveState();
          await interaction.editReply({ embeds: [ri(` Rep role set to ${role}.`, 0x57f287)] });
        } else if (sub === "keyword") {
          const word = interaction.options.getString("word", true).toLowerCase().trim();
          if (word === "off" || word === "clear" || word === "none") {
            gs.repKeyword = "";
            saveState();
            await interaction.editReply({ embeds: [ri(`Rep status keyword cleared — the rep role will not be auto-assigned until a new keyword is set.`, 0x57f287)] });
          } else {
            gs.repKeyword = word;
            saveState();
            await interaction.editReply({ embeds: [ri(` Rep status keyword set to **${word}** — members whose custom status contains this word will receive the rep role.`, 0x57f287)] });
          }
        } else {
          const channel = interaction.options.getChannel("channel", true);
          gs.pingChannelId = channel.id;
          saveState();
          await interaction.editReply({ embeds: [ri(` Ping channel set to ${channel}.`, 0x57f287)] });
        }
        break;
      }

      // ── /repping ───────────────────────────────────────────────────────────
      case "repping": {
        if (!gs.repEnabled) {
          await interaction.editReply({ embeds: [ri("Repping is currently **disabled** on this server.")] }); return;
        }
        await guild.members.fetch({ withPresences: true } as any).catch(() => {});
        const repping = guild.members.cache.filter(m => !m.user.bot && isRepping(m.presence, gs.repKeyword));
        if (repping.size === 0) {
          await interaction.editReply({ embeds: [ri("Nobody is currently repping.")] }); return;
        }
        const STATUS_DOT: Record<string, string> = { online: "", idle: "", dnd: "" };
        const STATUS_ORDER: Record<string, number> = { online: 0, idle: 1, dnd: 2 };
        const sortedRep = [...repping.values()].sort((a, b) => {
          const ao = STATUS_ORDER[a.presence?.status ?? ""] ?? 3;
          const bo = STATUS_ORDER[b.presence?.status ?? ""] ?? 3;
          return ao - bo;
        });
        const onlineCount = sortedRep.filter(m => m.presence?.status === "online").length;
        const idleCount = sortedRep.filter(m => m.presence?.status === "idle").length;
        const dndCount = sortedRep.filter(m => m.presence?.status === "dnd").length;
        const statsParts: string[] = [];
        if (onlineCount) statsParts.push(` Online: **${onlineCount}**`);
        if (idleCount) statsParts.push(` Idle: **${idleCount}**`);
        if (dndCount) statsParts.push(` DND: **${dndCount}**`);
        const items = sortedRep.map((m, i) => {
          const dot = STATUS_DOT[m.presence?.status ?? ""] ?? "";
          const statusTxt = getStatusText(m.presence);
          return `\`${String(i + 1).padStart(2, " ")}.\` ${dot} **${m.displayName}** — *${statusTxt || "no status text"}*`;
        });
        await sendPaginatedI(interaction, ` Currently Repping (${repping.size})`, items, {
          perPage: 10, color: 0x57f287, header: statsParts.join("  ·  "),
        });
        break;
      }

      // ── /togglerep ─────────────────────────────────────────────────────────
      case "togglerep": {
        gs.repEnabled = !gs.repEnabled;
        saveState();
        await interaction.editReply({ embeds: [ri(
          `Repping is now **${gs.repEnabled ? "enabled " : "disabled "}**. ${gs.repEnabled ? "The rep role will be assigned automatically again." : "No rep roles will be assigned or pinged until re-enabled."}`,
          gs.repEnabled ? 0x57f287 : 0xed4245,
        )] });
        if (gs.repEnabled && interaction.guild) syncRepRoles(interaction.guild).catch(() => {});
        break;
      }

      // ── /snipe ─────────────────────────────────────────────────────────────
      case "snipe": {
        const snipes = snipeCache.get(interaction.channelId);
        if (!snipes?.length) {
          await interaction.editReply({ embeds: [ri(" Nothing to snipe in this channel.")] }); return;
        }
        const idxArg = (interaction.options.getInteger("index") ?? 1) - 1;
        if (idxArg >= snipes.length) {
          await interaction.editReply({ embeds: [ri(` Only **${snipes.length}** deleted message(s) cached (use index 1–${snipes.length}).`)] }); return;
        }
        const snipe = snipes[idxArg];
        const snipeEmbed = new EmbedBuilder()
          .setColor(COLORS.error)
          .setAuthor({ name: snipe.authorTag, iconURL: snipe.authorAvatar ?? undefined })
          .setFooter({ text: ` Deleted · #${idxArg + 1} of ${snipes.length} · ID: ${snipe.authorId}` })
          .setTimestamp(snipe.timestamp);
        if (snipe.content) snipeEmbed.setDescription(snipe.content.slice(0, 4000));
        const imageUrl = snipe.attachments.find(u => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u));
        if (imageUrl) snipeEmbed.setImage(imageUrl);
        const extraAttachments = snipe.attachments.filter(u => u !== imageUrl);
        if (extraAttachments.length) snipeEmbed.addFields({ name: "Attachments", value: extraAttachments.map((u, i) => `[File ${i + 1}](${u})`).join("\n") });
        await interaction.editReply({ embeds: [snipeEmbed] });
        break;
      }

      // ── /esnipe ────────────────────────────────────────────────────────────
      case "esnipe": {
        const esnipe = editSnipeCache.get(interaction.channelId);
        if (!esnipe) {
          await interaction.editReply({ embeds: [ri(" Nothing to edit-snipe in this channel.")] }); return;
        }
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setAuthor({ name: esnipe.authorTag, iconURL: esnipe.authorAvatar ?? undefined, url: esnipe.messageUrl })
          .addFields(
            { name: "Before", value: esnipe.before.slice(0, 1000) },
            { name: "After",  value: esnipe.after.slice(0, 1000) },
          )
          .setFooter({ text: ` Edited · ID: ${esnipe.authorId}` })
          .setTimestamp(esnipe.timestamp)] });
        break;
      }

      // ── /rsnipe ────────────────────────────────────────────────────────────
      case "rsnipe": {
        const rsnipe = reactionSnipeCache.get(interaction.channelId);
        if (!rsnipe) {
          await interaction.editReply({ embeds: [ri(" Nothing to reaction-snipe in this channel.")] }); return;
        }
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.warning)
          .setAuthor({ name: rsnipe.authorTag, iconURL: rsnipe.authorAvatar ?? undefined })
          .setDescription(`Removed reaction **${rsnipe.emoji}** from [message](https://discord.com/channels/${guild.id}/${interaction.channelId}/${rsnipe.messageId})`)
          .setFooter({ text: ` Reaction removed · ID: ${rsnipe.authorId}` })
          .setTimestamp(rsnipe.timestamp)] });
        break;
      }

      // ── /clearsnipe ────────────────────────────────────────────────────────
      case "clearsnipe": {
        snipeCache.delete(interaction.channelId);
        editSnipeCache.delete(interaction.channelId);
        reactionSnipeCache.delete(interaction.channelId);
        await interaction.editReply({ embeds: [ri(" Snipe cache cleared for this channel.", 0x57f287)] });
        break;
      }

      // ── /serverinfo ────────────────────────────────────────────────────────
      case "serverinfo": {
        await guild.fetch();
        const siMembers = guild.memberCount;
        const siBots = guild.members.cache.filter(m => m.user.bot).size;
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(guild.name)
          .setThumbnail(guild.iconURL())
          .addFields(
            { name: "Owner",        value: `<@${guild.ownerId}>`,                                  inline: true },
            { name: "Members",      value: `${siMembers - siBots} humans, ${siBots} bots`,         inline: true },
            { name: "Channels",     value: `${guild.channels.cache.size}`,                         inline: true },
            { name: "Roles",        value: `${guild.roles.cache.size}`,                            inline: true },
            { name: "Created",      value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,   inline: true },
            { name: "Boost Level",  value: `Level ${guild.premiumTier}`,                           inline: true },
          )
          .setFooter({ text: `ID: ${guild.id}` })
          .setTimestamp()] });
        break;
      }

      // ── /membercount ───────────────────────────────────────────────────────
      case "membercount": {
        await ensureMembersCache(guild);
        const mcTotal  = guild.memberCount;
        const mcBots   = guild.members.cache.filter(m => m.user.bot).size;
        const mcHumans = mcTotal - mcBots;
        const mcOnline = guild.members.cache.filter(m => !m.user.bot && m.presence?.status !== "offline" && m.presence?.status !== undefined).size;
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`${guild.name} — Member Count`)
          .setThumbnail(guild.iconURL())
          .addFields(
            { name: "Total",            value: `**${mcTotal}**`,   inline: true },
            { name: "Humans",           value: `**${mcHumans}**`,  inline: true },
            { name: "Bots",             value: `**${mcBots}**`,    inline: true },
            { name: "Online (approx.)", value: `**${mcOnline}**`,  inline: true },
          )
          .setTimestamp()] });
        break;
      }

      // ── /channelinfo ───────────────────────────────────────────────────────
      case "channelinfo": {
        const ciOpt = interaction.options.getChannel("channel");
        const ciId  = ciOpt?.id ?? interaction.channelId;
        const ch    = guild.channels.cache.get(ciId) as TextChannel | null;
        if (!ch) { await interaction.editReply({ embeds: [ri(" Channel not found.")] }); return; }
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`Channel: #${ch.name}`)
          .addFields(
            { name: "ID",       value: ch.id,                                                    inline: true },
            { name: "Type",     value: String(ch.type),                                          inline: true },
            { name: "Category", value: ch.parent?.name ?? "None",                               inline: true },
            { name: "Topic",    value: (ch as TextChannel).topic || "No topic",                  inline: false },
            { name: "Slowmode", value: `${(ch as TextChannel).rateLimitPerUser ?? 0}s`,          inline: true },
            { name: "NSFW",     value: (ch as TextChannel).nsfw ? "Yes" : "No",                 inline: true },
            { name: "Created",  value: `<t:${Math.floor(ch.createdTimestamp! / 1000)}:R>`,       inline: true },
          )] });
        break;
      }

      // ── /roleinfo ──────────────────────────────────────────────────────────
      case "roleinfo": {
        const role = interaction.options.getRole("role", true);
        const gRole = guild.roles.cache.get(role.id);
        if (!gRole) { await interaction.editReply({ embeds: [ri("Role not found.")] }); return; }
        await ensureMembersCache(guild);
        const riMembers = guild.members.cache.filter(m => m.roles.cache.has(gRole.id));
        const riPerms = gRole.permissions.toArray()
          .map(p => p.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()))
          .join(", ") || "None";
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(gRole.color || 0x5865f2)
          .setTitle(`Role: ${gRole.name}`)
          .addFields(
            { name: "ID",          value: gRole.id,                                             inline: true },
            { name: "Color",       value: gRole.hexColor,                                       inline: true },
            { name: "Position",    value: `${gRole.position}`,                                  inline: true },
            { name: "Members",     value: `${riMembers.size}`,                                  inline: true },
            { name: "Mentionable", value: gRole.mentionable ? "Yes" : "No",                    inline: true },
            { name: "Hoisted",     value: gRole.hoist ? "Yes" : "No",                          inline: true },
            { name: "Created",     value: `<t:${Math.floor(gRole.createdTimestamp / 1000)}:R>`, inline: true },
            { name: "Permissions", value: riPerms.slice(0, 1024) },
          )] });
        break;
      }

      // ── /userinfo ──────────────────────────────────────────────────────────
      case "userinfo": {
        const targetUser = interaction.options.getUser("user") ?? actor;
        try {
          const member = await fetchMember(guild, targetUser.id);
          const uiRoles = member.roles.cache
            .filter(r => r.id !== guild.id)
            .sort((a, b) => b.position - a.position)
            .map(r => `${r}`).join(", ") || "None";
          await ensureMembersCache(guild);
          const allSorted = [...guild.members.cache.values()]
            .filter(m => m.joinedTimestamp)
            .sort((a, b) => a.joinedTimestamp! - b.joinedTimestamp!);
          const joinPos = allSorted.findIndex(m => m.id === targetUser.id) + 1;
          const accountAgeMs = Date.now() - targetUser.createdTimestamp;
          const isNew = accountAgeMs < 7 * 24 * 60 * 60 * 1000;
          const presence = member.presence;
          const statusMap: Record<string, string> = { online: " Online", idle: " Idle", dnd: " DND", offline: " Offline" };
          const statusStr = statusMap[presence?.status ?? "offline"] ?? " Offline";
          const activity = presence?.activities[0];
          const activityStr = activity ? `${activity.type === 0 ? "Playing" : activity.type === 1 ? "Streaming" : activity.type === 2 ? "Listening to" : "Doing"} ${activity.name}` : "None";
          const embed = new EmbedBuilder()
            .setColor(isNew ? 0xed4245 : 0x5865f2)
            .setTitle(`${targetUser.tag}${isNew ? "  New Account" : ""}`)
            .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
            .addFields(
              { name: "ID",             value: targetUser.id,                                                                             inline: true },
              { name: "Nickname",       value: member.nickname ?? "None",                                                                 inline: true },
              { name: "Status",         value: statusStr,                                                                                 inline: true },
              { name: "Account Created",value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>\n(<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>)`, inline: true },
              { name: "Joined Server",  value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n(<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)` : "Unknown", inline: true },
              { name: "Join Position",  value: `#${joinPos} / ${guild.memberCount}`,                                                     inline: true },
              { name: "Activity",       value: activityStr,                                                                               inline: true },
              { name: "Warnings",       value: `${gs.warnings.get(targetUser.id)?.length ?? 0}`,                                         inline: true },
              { name: "XP / Level",     value: (() => { const d = gs.xpData.get(targetUser.id); return d ? `Level ${d.level} · ${d.xp} XP` : "No XP"; })(), inline: true },
              { name: `Roles (${member.roles.cache.size - 1})`, value: uiRoles.slice(0, 1024) },
            )
            .setFooter({ text: `Bot: ${targetUser.bot ? "Yes" : "No"} · Boosting: ${member.premiumSince ? "Yes" : "No"}` })
            .setTimestamp();
          if (isNew) embed.setDescription("**This account was created less than 7 days ago.**");
          await interaction.editReply({ embeds: [embed] });
        } catch {
          await interaction.editReply({ embeds: [ri(" Couldn't find that member in this server.")] });
        }
        break;
      }

      // ── /permissions ───────────────────────────────────────────────────────
      case "permissions": {
        const targetUser = interaction.options.getUser("user", true);
        const chOpt = interaction.options.getChannel("channel");
        const target = guild.members.cache.get(targetUser.id) ?? await fetchMember(guild, targetUser.id).catch(() => null);
        if (!target) { await interaction.editReply({ embeds: [ri(" Member not found.")] }); return; }
        const ch = chOpt ? guild.channels.cache.get(chOpt.id) : null;
        const perms = ch ? target.permissionsIn(ch) : target.permissions;
        const PERM_PAIRS: [string, bigint][] = [
          ["Administrator",     PermissionFlagsBits.Administrator],
          ["Manage Server",     PermissionFlagsBits.ManageGuild],
          ["Manage Channels",   PermissionFlagsBits.ManageChannels],
          ["Manage Roles",      PermissionFlagsBits.ManageRoles],
          ["Manage Messages",   PermissionFlagsBits.ManageMessages],
          ["Manage Nicknames",  PermissionFlagsBits.ManageNicknames],
          ["Manage Emojis",     PermissionFlagsBits.ManageEmojisAndStickers],
          ["Kick Members",      PermissionFlagsBits.KickMembers],
          ["Ban Members",       PermissionFlagsBits.BanMembers],
          ["Moderate Members",  PermissionFlagsBits.ModerateMembers],
          ["Mention @everyone", PermissionFlagsBits.MentionEveryone],
          ["View Channels",     PermissionFlagsBits.ViewChannel],
          ["Send Messages",     PermissionFlagsBits.SendMessages],
          ["Attach Files",      PermissionFlagsBits.AttachFiles],
          ["Embed Links",       PermissionFlagsBits.EmbedLinks],
          ["Add Reactions",     PermissionFlagsBits.AddReactions],
          ["Ext. Emojis",       PermissionFlagsBits.UseExternalEmojis],
          ["Connect (Voice)",   PermissionFlagsBits.Connect],
          ["Speak (Voice)",     PermissionFlagsBits.Speak],
          ["Move Members",      PermissionFlagsBits.MoveMembers],
          ["Mute Members",      PermissionFlagsBits.MuteMembers],
          ["Deafen Members",    PermissionFlagsBits.DeafenMembers],
        ];
        const granted = PERM_PAIRS.filter(([, f]) => perms.has(f)).map(([n]) => ` ${n}`);
        const denied  = PERM_PAIRS.filter(([, f]) => !perms.has(f)).map(([n]) => ` ${n}`);
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`Permissions — ${targetUser.tag}`)
          .setDescription(ch ? `In <#${ch.id}>` : "Server-wide permissions")
          .addFields(
            { name: "Granted", value: granted.join("\n") || "*None*", inline: true },
            { name: "Denied",  value: denied.join("\n")  || "*None*", inline: true },
          )
          .setFooter({ text: `ID: ${targetUser.id}` })] });
        break;
      }

      // ── /roleperms ─────────────────────────────────────────────────────────
      case "roleperms": {
        const roleOpt = interaction.options.getRole("role", true);
        const gRole = guild.roles.cache.get(roleOpt.id);
        if (!gRole) { await interaction.editReply({ embeds: [ri("Role not found.")] }); return; }
        const rPerms = gRole.permissions;
        const ROLE_PERM_PAIRS: [string, bigint][] = [
          ["Administrator",     PermissionFlagsBits.Administrator],
          ["Manage Server",     PermissionFlagsBits.ManageGuild],
          ["Manage Channels",   PermissionFlagsBits.ManageChannels],
          ["Manage Roles",      PermissionFlagsBits.ManageRoles],
          ["Manage Messages",   PermissionFlagsBits.ManageMessages],
          ["Manage Nicknames",  PermissionFlagsBits.ManageNicknames],
          ["Manage Emojis",     PermissionFlagsBits.ManageEmojisAndStickers],
          ["Manage Webhooks",   PermissionFlagsBits.ManageWebhooks],
          ["Kick Members",      PermissionFlagsBits.KickMembers],
          ["Ban Members",       PermissionFlagsBits.BanMembers],
          ["Moderate Members",  PermissionFlagsBits.ModerateMembers],
          ["Mention @everyone", PermissionFlagsBits.MentionEveryone],
          ["View Channels",     PermissionFlagsBits.ViewChannel],
          ["Send Messages",     PermissionFlagsBits.SendMessages],
          ["Embed Links",       PermissionFlagsBits.EmbedLinks],
          ["Attach Files",      PermissionFlagsBits.AttachFiles],
          ["Add Reactions",     PermissionFlagsBits.AddReactions],
          ["Ext. Emojis",       PermissionFlagsBits.UseExternalEmojis],
          ["Read History",      PermissionFlagsBits.ReadMessageHistory],
          ["Connect (Voice)",   PermissionFlagsBits.Connect],
          ["Speak (Voice)",     PermissionFlagsBits.Speak],
          ["Move Members",      PermissionFlagsBits.MoveMembers],
          ["Mute Members",      PermissionFlagsBits.MuteMembers],
          ["Deafen Members",    PermissionFlagsBits.DeafenMembers],
          ["Priority Speaker",  PermissionFlagsBits.PrioritySpeaker],
          ["Stream/Camera",     PermissionFlagsBits.Stream],
        ];
        const rpGranted = ROLE_PERM_PAIRS.filter(([, f]) => rPerms.has(f)).map(([n]) => ` ${n}`);
        const rpDenied  = ROLE_PERM_PAIRS.filter(([, f]) => !rPerms.has(f)).map(([n]) => ` ${n}`);
        const rpCount   = guild.members.cache.filter(m => m.roles.cache.has(gRole.id)).size;
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(gRole.color || 0x5865f2)
          .setTitle(`Role Permissions — @${gRole.name}`)
          .addFields(
            { name: "Granted",     value: rpGranted.join("\n") || "*None*", inline: true },
            { name: "Not Granted", value: rpDenied.join("\n")  || "*None*", inline: true },
          )
          .setFooter({ text: `ID: ${gRole.id} · ${rpCount} member${rpCount !== 1 ? "s" : ""}` })] });
        break;
      }

      // ── /help ──────────────────────────────────────────────────────────────
      case "help": {
        type HelpCat = { emoji: string; title: string; desc: string; color: number; aliases: string[]; fields: { name: string; value: string }[] };
        const HELP_CATS: HelpCat[] = [
          {
            emoji: "", title: "Moderation", color: 0xed4245,
            desc: "Warn, ban, mute, jail, and clean up your server.",
            aliases: ["mod", "moderation"],
            fields: [
              { name: " Warns & Bans", value: "`!warn @u reason`\n`!warnings @u` · `!clearwarns @u`\n`!warnthreshold kick <N|off>` · `!warnthreshold ban <N|off>`\n`!warnlb` — leaderboard\n\n`!kick @u` · `!ban @u` · `!softban @u` · `!tempban @u 1d`\n`!unban ID` · `!unbanall confirm` · `!massban ID1 ID2`\n`!hackban ID` · `!hardban @u` · `!banlist` · `!hardbans`\n`!voicekick @u` · `!case <ID>` — look up a mod case" },
              { name: " Mutes & Voice", value: "`!mute @u 10m reason`\n`!unmute @u` · `!mutelist`\n`!imute @u` · `!iunmute @u` — image mute\n`!rmute @u` · `!runmute @u` — reaction mute\n`!voicemute @u` · `!voiceunmute @u`\n`!voicedeaf @u` · `!voiceundeaf @u`\n`!uto all` · `!untimeoutall` · `!massunmute`" },
              { name: " Jail / Lock / Channels", value: "`!jail @u [dur]` · `!unjail @u` · `!jaillist` · `!jailsetup`\n\n`!lock` · `!unlock` · `!lockdown` · `!unlockdown`\n`!imagelock #ch on/off` · `!imageunlock #ch`\n\n`!purge 10` · `!clear @u 10` · `!cleanup` · `!nuke` · `!schedulenuke 30m`\n`!pin` · `!unpin` · `!clearpins` · `!clearreacts`" },
              { name: " Members, Logs & Reports", value: "`!dehoist` · `!stripstaff @u` · `!restorestaff @u` · `!striphumans`\n`!forcenick @u name` · `!unforcenick @u` · `!forcenicks`\n\n`!modlog #ch/off` · `!history @u` · `!clearhistory @u`\n`!note @u text` · `!notes @u` · `!clearnotes @u`\n`!report @u reason` · `!reportchannel #ch`" },
            ],
          },
          {
            emoji: "", title: "Management", color: 0xfee75c,
            desc: "Roles, channels, messaging, booster roles, and autostaff.",
            aliases: ["manage", "management", "booster", "boost", "br", "autostaff", "as"],
            fields: [
              { name: " Roles", value: "`!setup`\n`!role @u @role` · `!role create <name>`\n`!massrole @role` · `!autorole @role/off`\n`!editrole @role color #hex` · `!editrole @role name New Name`\n`!rolemention @role` · `!resetnick @u` · `!setnick @u name`" },
              { name: " Server & Channels", value: "`!nick @u name` · `!massnick <text|reset>`\n`!slowmode 5` · `!slowmodelist` · `!slowall <dur|off>`\n`!topic text` · `!hide [#ch]` · `!unhide [#ch]`\n`!autopublish on/off`\n`!uwulock [#ch]` · `!uwuunlock [#ch]` · `!uwulist`\n`!pingonjoin add/remove #ch`\n`!thread create <name>` · `!listthreads` · `!archivethreads`" },
              { name: " Messaging & Events", value: "`!say #ch msg` · `!announce #ch Title | Body` · `!embed Title | Body`\n`!dm @u msg` · `!dmall msg` · `!welcome #ch msg/off`\n`!goodbye #ch msg/off` · `!boostmsg #ch msg/off`\n`!giveaway 10m Prize` · `!gend <ID>` · `!greroll <ID>`\n`!reminder 10m msg` · `!poll Q | A | B`" },
              { name: " Vanity / Aliases / Tickets", value: "`!vanity role @role` · `!vanity set <kw>` · `!vanity ping #ch` · `!vanity off`\n`!repping` · `!togglerep`\n`!alias add s cmd` · `!alias remove s` · `!alias list`\n`!ticketsetup` · `!ticket reason` · `!closeticket`" },
              { name: " Booster Roles", value: "Admin: `!boosterrole set @role` · `!boosterrole give/remove/list @u`\n`!boosterdm <text>` — DM sent to the member who just boosted\n\nBoosters: `!br create Name #hex` · `!br color #hex` · `!br gradient #hex1 #hex2`\n`!br name New Name` · `!br info` · `!br delete`\n*Auto-assigned on boost, auto-deleted when boost ends.*" },
              { name: " Extras & Server Tools", value: "`!tag create <name> <text>` · `!tag <name>` · `!tags`\n`!autoresponder add <trigger> <response>` (`!ar`) · `!ar remove` · `!ar list`\n`!webhook create #ch Name` · `!webhook list` · `!webhook delete <ID>`\n`!bumpreminder set #ch`\n`!clownboard #ch N` — star-board for cringe messages\n`!emoji add name url` · `!emoji list` · `!stealemoji`\n`!counter members/bots/online/channels/boosts #ch`" },
              { name: " Autostaff", value: "`!autostaff on/off` · `!autostaff setlog #ch` · `!autostaff baserole @role/clear`\n`!autostaff addtier @role \"Label\" <minMods> <minMsgs>`\n`!autostaff removetier @role` · `!autostaff tiers`\n`!autostaff progress [@u]` · `!autostaff stats` · `!autostaff reset @u`" },
            ],
          },
          {
            emoji: "", title: "Security", color: 0xf0b132,
            desc: "Antinuke, filters, raid protection, and blacklists.",
            aliases: ["security", "antinuke", "nuke", "blacklist", "bl", "bans", "sblacklist"],
            fields: [
              { name: " Antinuke, Whitelist & Access", value: "`!antinuke on/off` · `!antinuke bans/kicks/channels/roles <N>`\n`!whitelist add/remove/list @u` · `!unwhitelist @u`\n`!botwl add/remove/list @bot` — bot whitelist\n`!antinukeadmin grant/revoke/list @u`\n`!permguard on/off` · `!permguardwhitelist add/remove/list @u`\n\n`!grantaccess @u` · `!revokeaccess @u` · `!listaccess`" },
              { name: " Filters & Invite Control", value: "`!filter add/remove/list <word>`\n`!filterbypass @u` · `!unfilterbypass @u` · `!listbypasses`\n`!linkbypass @u` · `!unlinkbypass @u` · `!linkbypasses`\n`!spambypass @u` · `!unspambypass @u` · `!spambypasses`\n`!antiinvite on/off`\n`!capslockfilter on/off` · `!capslockfilter threshold N`" },
              { name: " Raid Protection & Anti-Spam", value: "`!raidprotect on/off` · `!raidprotect threshold <N>` · `!raidprotect window <s>`\n`!raidprotect action <kick|jail|ban|timeout>`\n`!banraiders [reason]` · `!lockserver` · `!unlockserver`\n`!agegate on/off` · `!agegate days <N>`\n`!antialt on/off` · `!antialt days <N>` — kick accounts newer than N days\n\n`!antispam enable/disable` · `!antispam threshold N` · `!antispam window N`" },
              { name: " Blacklists", value: "`!imageban @u` · `!imageunban @u` · `!imagebans`\n`!streamban @u` · `!streamunban @u` · `!streambans`\n\n`!hardban @u reason` · `!hardban remove <ID>` · `!hardbans`\n`!sblacklist setrole @role` · `!sblacklist add/remove/list/check @u`" },
            ],
          },
          {
            emoji: "✨", title: "Server Features", color: 0xeb459e,
            desc: "XP, VoiceMaster, starboard, counting, and engagement tools.",
            aliases: ["features", "server", "sf", "engage", "xp", "level", "vc", "voicemaster", "voice"],
            fields: [
              { name: " XP & Leveling", value: "`!xp [@u]` · `!xp leaderboard`\n`!xp enable/disable` · `!xp reset @u`\n`!xp setrole <minLevel> @role` · `!xp channel #ch/off`\n`!rank [@u]` · `!level [@u]`\n\nAdmin: `!setxp @u N` · `!removexp @u N` · `!setlevel @u N`" },
              { name: " Starboard, Counting & Engagement", value: "`!starboard channel #ch` · `!starboard threshold N` · `!starboard off`\n`!counting set #ch` · `!counting off/reset [N]`\n`!suggest <text>`\n`!antispam enable/disable` · `!antispam threshold N`\n`!imageonly #ch on/off` · `!imageonly list`" },
              { name: " VoiceMaster", value: "Admin: `!vc setup` — creates the VoiceMaster category and join-to-create channel\n`!vclock #vc on/off` · `!move @u #vc` · `!moveall #vc`\n\nVC owner: `!vc lock` · `!vc unlock` · `!vc hide` · `!vc unhide`\n`!vc kick @user` · `!vc allow @user` · `!vc reject @user`\n`!vc rename <name>` · `!vc limit N` · `!vc claim` · `!vc info`" },
            ],
          },
          {
            emoji: "", title: "Utility", color: 0x57f287,
            desc: "Snipe, AFK, sticky messages, custom commands, and info lookups.",
            aliases: ["util", "utility"],
            fields: [
              { name: " Snipe / AFK / Sticky", value: "`!snipe [1–10]` · `!esnipe` · `!rsnipe` · `!clearsnipe`\n`!imagesnipe` · `!videosnipe`\n`!afk [reason]` · `!afklist`\n`!sticky msg` · `!unsticky` · `!stickylist`" },
              { name: " Commands & Roles", value: "`!delcmd trigger` · `!listcmds`\n`!reactionrole #ch msgID emoji @role`\n`!removereactionrole #ch msgID emoji`\n`!disablecommand/dcmd <cmd>` · `!enablecommand/ecmd <cmd>` · `!disabledcommands`" },
              { name: " Info Lookups", value: "`!serverinfo` · `!membercount` · `!channelinfo` · `!roleinfo @role`\n`!userinfo @u` · `!invites` · `!ping` · `!uptime`\n`!roles` · `!inrole @role` · `!search <name>` · `!oldest/newest [N]`\n`!bots` · `!emojis` · `!stickers` · `!randomuser`\n`!modstats [@u]` · `!permissions @u [#ch]` · `!roleperms @role` · `!id @u|@role|#ch`\n`!audit [action]` · `!lookup <name>`" },
              { name: " Profile & Media", value: "`!avatar [@u]` · `!banner [@u]` · `!serveravatar` · `!serverbanner`\n`!botinvite` · `!copyembed`" },
              { name: " Tools & Web", value: "`!timestamp [1h | 2025-12-25]` · `!color #rrggbb` · `!calc <expr>`\n`!firstmsg [#ch]` · `!weather <city>` · `!define <word>` · `!urban <word>`\n`!qr <text>` · `!shortlink <url>` · `!tz <city>`\n`!reminder 10m msg` · `!remindme 10m msg`" },
            ],
          },
          {
            emoji: "", title: "Fun", color: 0xff6b6b,
            desc: "Games, roleplay GIFs, social commands, and more.",
            aliases: ["fun", "games"],
            fields: [
              { name: " Games & Stats", value: "`!blacktea` · `!8ball <q>` · `!flip` · `!roll [sides]` · `!rps rock|paper|scissors`\n`!trivia` · `!wordle` · `!ttt @u` · `!truth` · `!dare`\n`!pp [@u]` · `!iq [@u]` · `!rizz [@u]` · `!sus [@u]`\n`!google <q>` · `!roblox <user>`" },
              { name: " Social GIFs", value: "`!hug` `!kiss` `!pat` `!cuddle` `!wave` `!highfive` `!poke` `!slap` `!bite` `!bonk`\n`!handhold` `!lick` `!punch` `!yeet` `!kill` `!glomp` `!nom` `!bully` `!smug`\n`!wink` `!cringe` `!awoo` `!tickle` `!baka` `!stare` `!feed` `!peck` `!nuzzle`\n`!cry` `!blush` `!smile` `!dance` `!run` *(add `@u` to target someone)*" },
              { name: " Social & Text", value: "`!steal` · `!ratio @u` · `!ship @u1 @u2` · `!roast` · `!compliment`\n`!mock <text>` · `!reverse <text>` · `!fact` · `!joke` · `!quote`\n`!pick A | B` · `!would <question>` · `!translate <lang> <text>`\n`!dog` · `!cat` · `!birthday set MM-DD`" },
            ],
          },
          {
            emoji: "", title: "Tools", color: 0x5865f2,
            desc: "Temp roles, button roles, backups, and owner-only controls.",
            aliases: ["tools", "extra"],
            fields: [
              { name: " Temp & Button Roles", value: "`!temprole @u @role 1h` · `!temproles @u`\n`!buttonrole create #ch Title | Label @role | ...`\n`!buttonrole delete <msgId>`\n`!togglerolerestore` · `!restoreuser @u` · `!clearrolebackup @u`" },
              { name: " Backup & Misc", value: "`!backup create` · `!backup list` · `!backup load/info/delete <ID>`\n`!leavedm enable/disable` · `!leavedm message <text>`\n`!prefix <new>` · `!settings` · `!serversetup` · `!setuprules`" },
              { name: " Permissions & Cleanup", value: "`!setupmute` — create Muted, Image Muted & Reaction Muted roles\n`!strip @u` · `!unstrip @u` · `!stripall` · `!restoreperms`\n`!fakepermissions list/strip/restore`\n`!enableevent <event>` · `!disableevent <event>`\n`!antieveryoneping on/off`" },
              { name: " Owner — Bot & System", value: "`!setstatus playing|watching|listening <text>`\n`!rename <name>` · `!setavatar <url>` · `!botstats` · `!maintenance on/off`\n`!eval <code>` · `!save` · `!reload` · `!shutdown` · `!reloadslash`\n`!servers` · `!leave <ID>` · `!spyguild <ID>` · `!broadcast <msg>` · `!resetguild`\n`!globalban <ID>` · `!globalunban <ID>` · `!globalbans` · `!clearglobalbans`\n`!blacklistserver <ID>` · `!unblacklistserver <ID>` · `!blacklistedservers`" },
            ],
          },
        ];

        const TOTAL = HELP_CATS.length + 1;

        const buildHelpEmbed = (page: number, fieldIdx: number): EmbedBuilder => {
          if (page === 0) {
            const avatarUrl = client.user?.displayAvatarURL({ size: 256 }) ?? null;
            const half = Math.ceil(HELP_CATS.length / 2);
            const col1 = HELP_CATS.slice(0, half).map(c => `${c.emoji} **${c.title}**\n╰ *${c.desc}*`).join("\n\n");
            const col2 = HELP_CATS.slice(half).map(c => `${c.emoji} **${c.title}**\n╰ *${c.desc}*`).join("\n\n");
            return new EmbedBuilder()
              .setColor(COLORS.primary)
              .setAuthor({ name: "october — Command Reference", iconURL: avatarUrl ?? undefined })
              .addFields(
                { name: "\u200b", value: col1, inline: true },
                { name: "\u200b", value: col2, inline: true },
              )
              .setFooter({ text: `${TOTAL - 1} categories  •  Pick from the menu or use /help category: to jump directly` })
              .setTimestamp();
          }
          const cat = HELP_CATS[page - 1];
          if (fieldIdx >= 0 && fieldIdx < cat.fields.length) {
            const f = cat.fields[fieldIdx];
            return new EmbedBuilder()
              .setAuthor({ name: `${cat.emoji} ${cat.title}`, iconURL: client.user?.displayAvatarURL() ?? undefined })
              .setColor(cat.color)
              .setDescription(`**${f.name.replace(/^\S+\s/, "")}**\n\n${f.value}`)
              .setFooter({ text: `Pick another group from the menu below` })
              .setTimestamp();
          }
          return new EmbedBuilder()
            .setAuthor({ name: `${cat.emoji} ${cat.title}`, iconURL: client.user?.displayAvatarURL() ?? undefined })
            .setDescription(`*${cat.desc}*`)
            .addFields(cat.fields.map(f => ({ name: f.name.replace(/^\S+\s/, ""), value: f.value.split("\n").slice(0, 3).join("\n") + (f.value.split("\n").length > 3 ? "\n…" : ""), inline: false })))
            .setColor(cat.color)
            .setFooter({ text: `Select a command group below to see full details` })
            .setTimestamp();
        };

        const buildHelpCategoryMenu = () =>
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("shelp_category_select")
              .setPlaceholder("Jump to a category…")
              .addOptions(
                HELP_CATS.map((c, idx) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(c.title)
                    .setDescription(c.desc.slice(0, 100))
                    .setValue(String(idx + 1))
                )
              )
          );

        const buildHelpFieldMenu = (page: number) => {
          const cat = HELP_CATS[page - 1];
          return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("shelp_field_select")
              .setPlaceholder("Pick a command group…")
              .addOptions(
                cat.fields.map((f, idx) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(f.name.replace(/^\S+\s/, "").slice(0, 100))
                    .setValue(String(idx))
                )
              )
          );
        };

        const buildHelpRow = (page: number) =>
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("shelp_prev").setLabel("← Back").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId("shelp_home").setLabel(" Home").setStyle(ButtonStyle.Primary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId("shelp_indicator").setLabel(`${page + 1} / ${TOTAL}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId("shelp_next").setLabel("Next →").setStyle(ButtonStyle.Secondary).setDisabled(page === TOTAL - 1),
          );

        const buildHelpComponents = (page: number) =>
          page === 0 ? [buildHelpCategoryMenu(), buildHelpRow(page)] : [buildHelpFieldMenu(page), buildHelpRow(page)];

        const catArg = interaction.options.getString("category");
        let helpPage = 0;
        let helpFieldIdx = -1;
        if (catArg) {
          const idx = HELP_CATS.findIndex(c => c.aliases.includes(catArg));
          if (idx !== -1) helpPage = idx + 1;
        }

        await interaction.editReply({ embeds: [buildHelpEmbed(helpPage, helpFieldIdx)], components: buildHelpComponents(helpPage) });
        const sent = await interaction.fetchReply();

        const helpCollector = sent.createMessageComponentCollector({
          filter: (i) => i.user.id === actor.id,
          time: 3 * 60 * 1000,
        });

        helpCollector.on("collect", async (i) => {
          if (i.isStringSelectMenu() && i.customId === "shelp_category_select") {
            helpPage = parseInt(i.values[0], 10);
            helpFieldIdx = -1;
          } else if (i.isStringSelectMenu() && i.customId === "shelp_field_select") {
            helpFieldIdx = parseInt(i.values[0], 10);
          } else if (i.isButton()) {
            if (i.customId === "shelp_prev") { helpPage = Math.max(0, helpPage - 1); helpFieldIdx = -1; }
            else if (i.customId === "shelp_next") { helpPage = Math.min(TOTAL - 1, helpPage + 1); helpFieldIdx = -1; }
            else if (i.customId === "shelp_home") { helpPage = 0; helpFieldIdx = -1; }
          }
          await i.update({ embeds: [buildHelpEmbed(helpPage, helpFieldIdx)], components: buildHelpComponents(helpPage) });
        });

        helpCollector.on("end", () => {
          interaction.editReply({ components: [] }).catch(() => {});
        });
        break;
      }

      // ── /antispam ──────────────────────────────────────────────────────────
      case "antispam": {
        const sub = interaction.options.getSubcommand();
        if (sub === "enable" || sub === "disable") {
          gs.antiSpamEnabled = sub === "enable";
          saveState();
          await interaction.editReply({ embeds: [ri(` Anti-spam **${sub}d**.`, 0x57f287)] });
        } else if (sub === "threshold") {
          const n = interaction.options.getInteger("count", true);
          gs.antiSpamThreshold = n;
          saveState();
          await interaction.editReply({ embeds: [ri(` Anti-spam threshold set to **${n}** messages.`, 0x57f287)] });
        } else if (sub === "window") {
          const n = interaction.options.getInteger("seconds", true);
          gs.antiSpamWindowMs = n * 1000;
          saveState();
          await interaction.editReply({ embeds: [ri(` Anti-spam window set to **${n}s**.`, 0x57f287)] });
        } else {
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(gs.antiSpamEnabled ? 0x57f287 : 0xed4245)
            .setTitle("Anti-Spam")
            .addFields(
              { name: "Status",    value: gs.antiSpamEnabled ? " Enabled" : " Disabled", inline: true },
              { name: "Threshold", value: `${gs.antiSpamThreshold} messages`,               inline: true },
              { name: "Window",    value: `${gs.antiSpamWindowMs / 1000}s`,                 inline: true },
            )
            .setTimestamp()] });
        }
        break;
      }

      // ── /temproles ────────────────────────────────────────────────────────────
      case "temproles": {
        const targetUser = interaction.options.getUser("user") ?? actor;
        const entries = gs.tempRoles.get(targetUser.id);
        if (!entries?.length) { await interaction.editReply({ embeds: [ri(`No active temp roles for **${targetUser.tag}**.`)] }); return; }
        const lines = entries.map((e) => {
          const r = guild.roles.cache.get(e.roleId);
          return `<@&${e.roleId}>${r ? ` (${r.name})` : ""} — expires <t:${Math.floor(e.expiresAt / 1000)}:R>`;
        });
        await sendPaginatedI(interaction, ` Temp Roles — ${targetUser.tag} (${lines.length})`, lines, { perPage: 15, color: 0x5865f2 });
        break;
      }

      // ── /buttonrole ───────────────────────────────────────────────────────────
      case "buttonrole": {
        const sub = interaction.options.getSubcommand();
        if (sub === "create") {
          const ch = interaction.options.getChannel("channel", true) as TextChannel;
          const title = interaction.options.getString("title", true);
          const buttonsStr = interaction.options.getString("buttons", true);
          const parts = buttonsStr.split("|").map(p => p.trim()).filter(Boolean);
          const buttons: { label: string; roleId: string }[] = [];
          for (const part of parts) {
            const roleMatch = part.match(/<@&(\d+)>/);
            if (!roleMatch) continue;
            const roleId = roleMatch[1];
            const label = part.replace(/<@&\d+>/, "").trim() || "Role";
            buttons.push({ label, roleId });
          }
          if (buttons.length === 0) { await interaction.editReply({ embeds: [ri(" No valid role mentions found. Format: `Label @Role | Label2 @Role2`")] }); return; }
          const rows: ActionRowBuilder<ButtonBuilder>[] = [];
          for (let i = 0; i < Math.min(buttons.length, 25); i += 5) {
            rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
              buttons.slice(i, i + 5).map(b =>
                new ButtonBuilder().setCustomId(`br:${guild.id}:${b.roleId}`).setLabel(b.label.slice(0, 80)).setStyle(ButtonStyle.Secondary)
              )
            ));
          }
          const posted = await ch.send({
            embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(title).setDescription(buttons.map(b => `<@&${b.roleId}>`).join("  "))],
            components: rows,
          });
          gs.buttonRoleMessages.set(posted.id, { channelId: ch.id, buttons });
          saveState();
          await interaction.editReply({ embeds: [ri(` Button role message posted in <#${ch.id}>.`)] });
        } else {
          const msgId = interaction.options.getString("message_id", true);
          if (!gs.buttonRoleMessages.has(msgId)) { await interaction.editReply({ embeds: [ri(" Message ID not found in button role list.")] }); return; }
          const data = gs.buttonRoleMessages.get(msgId)!;
          const ch2 = guild.channels.cache.get(data.channelId) as TextChannel | undefined;
          if (ch2) { const m = await ch2.messages.fetch(msgId).catch(() => null); if (m) await m.delete().catch(() => {}); }
          gs.buttonRoleMessages.delete(msgId);
          saveState();
          await interaction.editReply({ embeds: [ri(" Button role message deleted.")] });
        }
        break;
      }

      // ── /togglerolerestore ────────────────────────────────────────────────────
      case "togglerolerestore": {
        gs.roleRestoreEnabled = !gs.roleRestoreEnabled;
        saveState();
        const status = gs.roleRestoreEnabled ? "**enabled **" : "**disabled **";
        await interaction.editReply({ embeds: [ri(`Role restore is now ${status}. Members' roles will ${gs.roleRestoreEnabled ? "be saved when they leave and restored when they rejoin." : "no longer be saved or restored."}`)] });
        break;
      }

      // ── /restoreuser ──────────────────────────────────────────────────────────
      case "restoreuser": {
        const targetUser = interaction.options.getUser("user", true);
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found in this server.")] }); return; }
        const savedRoles = gs.roleBackup.get(targetUser.id);
        if (!savedRoles?.length) { await interaction.editReply({ embeds: [ri(` No saved roles found for **${targetUser.tag}**.`)] }); return; }
        const validRoles = savedRoles.filter(id => guild.roles.cache.has(id));
        if (!validRoles.length) {
          gs.roleBackup.delete(targetUser.id); saveState();
          await interaction.editReply({ embeds: [ri(` All saved roles for **${targetUser.tag}** no longer exist.`)] }); return;
        }
        await member.roles.add(validRoles, `Role restore by ${actor.tag}`).catch(() => {});
        gs.roleBackup.delete(targetUser.id); saveState();
        await interaction.editReply({ embeds: [ri(` Restored **${validRoles.length}** role${validRoles.length === 1 ? "" : "s"} for **${targetUser.tag}**: ${validRoles.map(id => `<@&${id}>`).join(", ")}`)] });
        break;
      }

      // ── /clearrolebackup ──────────────────────────────────────────────────────
      case "clearrolebackup": {
        const targetUser = interaction.options.getUser("user", true);
        if (!gs.roleBackup.has(targetUser.id)) { await interaction.editReply({ embeds: [ri(` No saved role backup found for **${targetUser.tag}**.`)] }); return; }
        gs.roleBackup.delete(targetUser.id); saveState();
        await interaction.editReply({ embeds: [ri(` Role backup cleared for **${targetUser.tag}**.`)] });
        break;
      }

      // ── /backup ───────────────────────────────────────────────────────────────
      case "backup": {
        const sub = interaction.options.getSubcommand();
        if (sub === "create") {
          await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
          const mapOverwrites = (ch: import("discord.js").GuildChannel): BackupOverwrite[] =>
            [...ch.permissionOverwrites.cache.values()].map(ow => ({ id: ow.id, type: ow.type as 0 | 1, allow: ow.allow.bitfield.toString(), deny: ow.deny.bitfield.toString() }));
          const roles: BackupRole[] = guild.roles.cache.filter(r => r.id !== guild.id && !r.managed).sort((a, b) => a.position - b.position)
            .map(r => ({ id: r.id, name: r.name, color: r.color, permissions: r.permissions.bitfield.toString(), position: r.position, hoist: r.hoist, mentionable: r.mentionable }));
          const categories: BackupChannel[] = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => (a as any).position - (b as any).position)
            .map(c => ({ id: c.id, name: c.name, type: c.type, position: (c as any).position, topic: null, nsfw: false, rateLimitPerUser: 0, parentId: null, overwrites: mapOverwrites(c as import("discord.js").GuildChannel) }));
          const channels: BackupChannel[] = guild.channels.cache.filter(c => [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildForum].includes(c.type)).sort((a, b) => (a as any).position - (b as any).position)
            .map(c => { const tc = c as any; return { id: c.id, name: c.name, type: c.type, position: tc.position, topic: tc.topic ?? null, nsfw: tc.nsfw ?? false, rateLimitPerUser: tc.rateLimitPerUser ?? 0, parentId: tc.parentId ?? null, overwrites: mapOverwrites(c as import("discord.js").GuildChannel), bitrate: tc.bitrate, userLimit: tc.userLimit }; });
          const backupId = Math.random().toString(16).slice(2, 10).toUpperCase();
          gs.backups.set(backupId, { id: backupId, createdAt: Date.now(), createdBy: actor.id, guildName: guild.name, memberCount: guild.memberCount, roles, categories, channels });
          saveState();
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle("Backup Created")
            .addFields({ name: "Backup ID", value: `\`${backupId}\``, inline: true }, { name: "Roles", value: `${roles.length}`, inline: true }, { name: "Channels", value: `${categories.length + channels.length}`, inline: true })
            .setFooter({ text: `Use /backup load id:${backupId} to restore` }).setTimestamp()] });
        } else if (sub === "list") {
          const backups = [...gs.backups.values()];
          if (!backups.length) { await interaction.editReply({ embeds: [ri("No backups found for this server.")] }); return; }
          const lines = backups.map(b => `\`${b.id}\` — ${b.guildName} · <t:${Math.floor(b.createdAt / 1000)}:R>`);
          await sendPaginatedI(interaction, ` Backups (${lines.length})`, lines, { perPage: 10, color: 0x5865f2 });
        } else if (sub === "info") {
          const id = interaction.options.getString("id", true).toUpperCase();
          const bk = gs.backups.get(id);
          if (!bk) { await interaction.editReply({ embeds: [ri(` No backup found with ID \`${id}\`.`)] }); return; }
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(`Backup \`${id}\``)
            .addFields({ name: "Server", value: bk.guildName, inline: true }, { name: "Members", value: `${bk.memberCount}`, inline: true }, { name: "Created", value: `<t:${Math.floor(bk.createdAt / 1000)}:F>`, inline: true }, { name: "Roles", value: `${bk.roles.length}`, inline: true }, { name: "Categories", value: `${bk.categories.length}`, inline: true }, { name: "Channels", value: `${bk.channels.length}`, inline: true })] });
        } else if (sub === "load") {
          const id = interaction.options.getString("id", true).toUpperCase();
          const bk = gs.backups.get(id);
          if (!bk) { await interaction.editReply({ embeds: [ri(` No backup found with ID \`${id}\`.`)] }); return; }
          await interaction.editReply({ embeds: [ri(` Loading backup \`${id}\`... This will overwrite all roles and channels. Please wait.`, 0xfee75c)] });
          const protectedChannelId = interaction.channelId;
          const channelsToDelete = [...guild.channels.cache.values()].filter(c => c.id !== protectedChannelId && c.type !== ChannelType.GuildCategory);
          const categoriesToDelete = [...guild.channels.cache.values()].filter(c => c.type === ChannelType.GuildCategory);
          for (const ch of channelsToDelete) { await (ch as import("discord.js").GuildChannel).delete("Backup load").catch(() => {}); await new Promise(r => setTimeout(r, 300)); }
          for (const cat of categoriesToDelete) { await (cat as import("discord.js").GuildChannel).delete("Backup load").catch(() => {}); await new Promise(r => setTimeout(r, 300)); }
          const rolesToDelete = [...guild.roles.cache.values()].filter(r => r.id !== guild.id && !r.managed && r.id !== guild.roles.botRoleFor(client.user!)?.id).sort((a, b) => b.position - a.position);
          for (const role of rolesToDelete) { await role.delete("Backup load").catch(() => {}); await new Promise(r => setTimeout(r, 300)); }
          const roleMap = new Map<string, string>();
          for (const br of bk.roles) { try { const nr = await guild.roles.create({ name: br.name, color: br.color, permissions: BigInt(br.permissions), hoist: br.hoist, mentionable: br.mentionable, reason: `Backup ${id} load` }); roleMap.set(br.id, nr.id); } catch {} await new Promise(r => setTimeout(r, 300)); }
          const mapOw = (ows: BackupOverwrite[]) => ows.map(ow => ({ id: ow.type === 0 ? (roleMap.get(ow.id) ?? guild.id) : ow.id, type: ow.type, allow: BigInt(ow.allow), deny: BigInt(ow.deny) }));
          const catMap = new Map<string, string>();
          for (const bc of bk.categories) { try { const nc = await guild.channels.create({ name: bc.name, type: ChannelType.GuildCategory, position: bc.position, permissionOverwrites: mapOw(bc.overwrites), reason: `Backup ${id}` } as any); catMap.set(bc.id, nc.id); } catch {} await new Promise(r => setTimeout(r, 300)); }
          for (const bc of bk.channels) { try { await guild.channels.create({ name: bc.name, type: bc.type as any, position: bc.position, topic: bc.topic ?? undefined, nsfw: bc.nsfw, rateLimitPerUser: bc.rateLimitPerUser, parent: bc.parentId ? catMap.get(bc.parentId) ?? undefined : undefined, permissionOverwrites: mapOw(bc.overwrites), bitrate: bc.bitrate, userLimit: bc.userLimit, reason: `Backup ${id}` } as any); } catch {} await new Promise(r => setTimeout(r, 300)); }
          await interaction.followUp({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle("Backup Loaded").setDescription(`Restored backup \`${id}\` from ${bk.guildName}.`).setTimestamp()], ephemeral: true }).catch(() => {});
        } else {
          const id = interaction.options.getString("id", true).toUpperCase();
          if (!gs.backups.has(id)) { await interaction.editReply({ embeds: [ri(` No backup found with ID \`${id}\`.`)] }); return; }
          gs.backups.delete(id); saveState();
          await interaction.editReply({ embeds: [ri(` Backup \`${id}\` deleted.`)] });
        }
        break;
      }

      // ── /leavedm ──────────────────────────────────────────────────────────────
      case "leavedm": {
        const sub = interaction.options.getSubcommand();
        if (sub === "enable") {
          gs.leaveDmEnabled = true; saveState();
          await interaction.editReply({ embeds: [ri(" Leave DMs **enabled**.")] });
        } else if (sub === "disable") {
          gs.leaveDmEnabled = false; saveState();
          await interaction.editReply({ embeds: [ri(" Leave DMs **disabled**.")] });
        } else if (sub === "message") {
          gs.leaveDmMessage = interaction.options.getString("text", true); saveState();
          await interaction.editReply({ embeds: [ri(` Leave DM message updated.`)] });
        } else {
          const preview = gs.leaveDmMessage.replace("{user}", actor.tag).replace("{server}", guild.name);
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("Leave DM Preview").setDescription(preview)] });
        }
        break;
      }

      // ── /pingonjoin ──────────────────────────────────────────────────────────
      case "pingonjoin": {
        const sub = interaction.options.getSubcommand();
        if (sub === "list") {
          if (gs.pingOnJoinEnabled && gs.pingOnJoinChannelIds.length > 0) {
            const list = gs.pingOnJoinChannelIds.map(id => `<#${id}>`).join(", ");
            await interaction.editReply({ embeds: [ri(`Ping on join is **enabled** in ${list}.`)] });
          } else {
            await interaction.editReply({ embeds: [ri("Ping on join is **disabled**. Use `/pingonjoin add` to enable.")] });
          }
          break;
        }
        if (sub === "add") {
          const ch = interaction.options.getChannel("channel", true);
          if (gs.pingOnJoinChannelIds.includes(ch.id)) {
            await interaction.editReply({ embeds: [ri(`<#${ch.id}> is already in the ping-on-join list.`)] });
            break;
          }
          gs.pingOnJoinChannelIds.push(ch.id);
          gs.pingOnJoinEnabled = true;
          saveState();
          await interaction.editReply({ embeds: [ri(`<#${ch.id}> added to ping-on-join. New members will be pinged (then deleted) in all configured channels.`)] });
          break;
        }
        if (sub === "remove") {
          const ch = interaction.options.getChannel("channel", true);
          if (!gs.pingOnJoinChannelIds.includes(ch.id)) {
            await interaction.editReply({ embeds: [ri("That channel isn't in the ping-on-join list.")] });
            break;
          }
          gs.pingOnJoinChannelIds = gs.pingOnJoinChannelIds.filter(id => id !== ch.id);
          if (gs.pingOnJoinChannelIds.length === 0) gs.pingOnJoinEnabled = false;
          saveState();
          await interaction.editReply({ embeds: [ri(`<#${ch.id}> removed from ping-on-join.${gs.pingOnJoinChannelIds.length === 0 ? " Ping on join is now disabled." : ""}`)] });
          break;
        }
        if (sub === "off") {
          gs.pingOnJoinEnabled = false;
          gs.pingOnJoinChannelIds = [];
          saveState();
          await interaction.editReply({ embeds: [ri("Ping on join disabled and all channels cleared.")] });
          break;
        }
        break;
      }

      // ── /prefix ───────────────────────────────────────────────────────────────
      case "prefix": {
        const newPfx = interaction.options.getString("new", true);
        if (newPfx.length > 5) { await interaction.editReply({ embeds: [ri(" Prefix must be 5 characters or fewer.")] }); return; }
        const old = gs.prefix;
        gs.prefix = newPfx; saveState();
        await interaction.editReply({ embeds: [ri(` Prefix changed from \`${old}\` to \`${newPfx}\` — all commands now use \`${newPfx}\`.`)] });
        break;
      }

      // ── /setstatus ────────────────────────────────────────────────────────────
      case "setstatus": {
        if (!isOwner(actor.id)) { await interaction.editReply({ embeds: [ri(" Owner only.")] }); return; }
        const typeArg = interaction.options.getString("type", true);
        const text = interaction.options.getString("text") ?? "";
        if (typeArg === "clear") {
          client.user!.setPresence({ activities: [] });
          await interaction.editReply({ embeds: [ri(" Bot status cleared.")] });
        } else {
          const typeMap: Record<string, ActivityType> = {
            playing: ActivityType.Playing, watching: ActivityType.Watching,
            listening: ActivityType.Listening, competing: ActivityType.Competing, streaming: ActivityType.Streaming,
          };
          if (!text) { await interaction.editReply({ embeds: [ri(" Provide text for the status.")] }); return; }
          client.user!.setActivity(text, { type: typeMap[typeArg] });
          await interaction.editReply({ embeds: [ri(` Status set to **${typeArg}** ${text}`)] });
        }
        break;
      }

      // ── /maintenance ──────────────────────────────────────────────────────────
      case "maintenance": {
        if (!isOwner(actor.id)) { await interaction.editReply({ embeds: [ri(" Owner only.")] }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "on") {
          setMaintenanceMode(true);
          await interaction.editReply({ embeds: [ri(" Maintenance mode **enabled**. Only you can use the bot.")] });
        } else if (sub === "off") {
          setMaintenanceMode(false);
          await interaction.editReply({ embeds: [ri(" Maintenance mode **disabled**. Bot is open to all users.")] });
        } else {
          await interaction.editReply({ embeds: [ri(`Maintenance mode is currently **${maintenanceMode ? " ON" : " OFF"}**.`)] });
        }
        break;
      }

      // ── /owner ────────────────────────────────────────────────────────────────
      case "owner": {
        if (!isOwner(actor.id)) { await interaction.editReply({ embeds: [ri(" Owner only.")] }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "rename") {
          const name = interaction.options.getString("name", true);
          try { await client.user!.setUsername(name); await interaction.editReply({ embeds: [ri(` Bot username changed to **${name}**.`)] }); }
          catch (err: any) { await interaction.editReply({ embeds: [ri(` Failed to rename: ${err.message ?? err}`)] }); }
        } else if (sub === "avatar") {
          const url = interaction.options.getString("url", true);
          try { await client.user!.setAvatar(url); await interaction.editReply({ embeds: [ri(" Bot avatar updated.")] }); }
          catch (err: any) { await interaction.editReply({ embeds: [ri(` Failed to set avatar: ${err.message ?? err}`)] }); }
        } else if (sub === "stats") {
          const mem = process.memoryUsage();
          const toMB = (n: number) => (n / 1024 / 1024).toFixed(1);
          const totalUsers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
          const sec = Math.floor(process.uptime());
          const uptimeStr = `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m ${sec % 60}s`;
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("Bot Stats")
            .addFields(
              { name: "Uptime", value: uptimeStr, inline: true }, { name: "Ping", value: `${client.ws.ping}ms`, inline: true }, { name: "Servers", value: String(client.guilds.cache.size), inline: true },
              { name: "Total Users", value: String(totalUsers), inline: true }, { name: "RAM (RSS)", value: `${toMB(mem.rss)} MB`, inline: true }, { name: "RAM (Heap)", value: `${toMB(mem.heapUsed)} MB`, inline: true },
              { name: "Global Bans", value: String(globalBannedUsers.size), inline: true }, { name: "Maintenance", value: maintenanceMode ? " On" : " Off", inline: true }
            ).setTimestamp()] });
        } else if (sub === "invite") {
          const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user!.id}&permissions=8&scope=bot%20applications.commands`;
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("Bot Invite Link")
            .setDescription(`[Click here to add **${client.user!.username}** to a server](${inviteUrl})\n\`\`\`${inviteUrl}\`\`\``).setTimestamp()] });
        } else if (sub === "eval") {
          const code = interaction.options.getString("code", true);
          try {
            // eslint-disable-next-line no-eval
            let result = eval(code);
            if (result instanceof Promise) result = await result;
            const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
            const truncated = output && output.length > 1900 ? output.slice(0, 1900) + "\n…(truncated)" : output ?? "undefined";
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle("Eval").setDescription(`\`\`\`js\n${truncated}\n\`\`\``).setTimestamp()] });
          } catch (err: any) {
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle("Eval Error").setDescription(`\`\`\`\n${err?.message ?? err}\n\`\`\``).setTimestamp()] });
          }
        } else if (sub === "save") {
          saveState();
          await interaction.editReply({ embeds: [ri(" State saved to disk.")] });
        } else if (sub === "reload") {
          try { loadState(); await interaction.editReply({ embeds: [ri(" State reloaded from disk.")] }); }
          catch (err) { await interaction.editReply({ embeds: [ri(` Failed to reload: ${err}`)] }); }
        } else if (sub === "shutdown") {
          await interaction.editReply({ embeds: [ri(" Shutting down. Goodbye.")] });
          saveState();
          setTimeout(() => process.exit(0), 1000);
        }
        break;
      }

      // ── /guildmgr ─────────────────────────────────────────────────────────────
      case "guildmgr": {
        if (!isOwner(actor.id)) { await interaction.editReply({ embeds: [ri(" Owner only.")] }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "servers") {
          const guilds = [...client.guilds.cache.values()];
          if (!guilds.length) { await interaction.editReply({ embeds: [ri("Bot is not in any servers.")] }); return; }
          const lines = guilds.map((g, i) => `**${i + 1}.** ${g.name} (\`${g.id}\`) — ${g.memberCount} members`);
          await sendPaginatedI(interaction, ` Servers (${guilds.length})`, lines, { perPage: 15, color: 0x5865f2 });
        } else if (sub === "leave") {
          const guildId = interaction.options.getString("guild_id", true);
          const target = client.guilds.cache.get(guildId);
          if (!target) { await interaction.editReply({ embeds: [ri(` Not in a guild with ID \`${guildId}\`.`)] }); return; }
          const name = target.name;
          await target.leave();
          await interaction.editReply({ embeds: [ri(` Left **${name}** (\`${guildId}\`).`)] });
        } else if (sub === "broadcast") {
          const text = interaction.options.getString("message", true);
          await interaction.editReply({ embeds: [ri(` Broadcasting to ${client.guilds.cache.size} servers...`)] });
          let sent = 0; let failed = 0;
          for (const g of client.guilds.cache.values()) {
            const chan = g.systemChannel ?? g.channels.cache.filter(c => c.isTextBased() && c.type === 0).sort((a, b) => (a as any).rawPosition - (b as any).rawPosition).first();
            if (!chan?.isTextBased()) { failed++; continue; }
            try { await (chan as any).send({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("Announcement from Bot Owner").setDescription(text).setTimestamp()] }); sent++; }
            catch { failed++; }
            await new Promise(r => setTimeout(r, 300));
          }
          await interaction.editReply({ embeds: [ri(` Broadcast complete — **${sent}** delivered, **${failed}** failed.`)] });
        } else if (sub === "spyguild") {
          const guildId = interaction.options.getString("guild_id", true);
          const target = client.guilds.cache.get(guildId);
          if (!target) { await interaction.editReply({ embeds: [ri(` Not in a guild with ID \`${guildId}\`.`)] }); return; }
          let invite = "N/A";
          try {
            const invChan = target.systemChannel ?? target.channels.cache.filter(c => c.isTextBased() && c.type === 0).first();
            if (invChan?.isTextBased()) { const inv = await (invChan as any).createInvite({ maxAge: 300, maxUses: 1, reason: "Owner spyguild" }); invite = inv.url; }
          } catch { invite = "Couldn't create invite"; }
          const owner = await client.users.fetch(target.ownerId).catch(() => null);
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(`Guild Info — ${target.name}`).setThumbnail(target.iconURL() ?? null)
            .addFields(
              { name: "Guild ID", value: target.id, inline: true }, { name: "Owner", value: owner ? `${owner.tag} (${owner.id})` : target.ownerId, inline: true }, { name: "Members", value: String(target.memberCount), inline: true },
              { name: "Channels", value: String(target.channels.cache.size), inline: true }, { name: "Roles", value: String(target.roles.cache.size), inline: true }, { name: "Created", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
              { name: "Invite (5m)", value: invite }
            ).setTimestamp()] });
        } else if (sub === "resetguild") {
          guildStates.delete(guild.id); saveState();
          await interaction.editReply({ embeds: [ri(` All bot data for **${guild.name}** has been reset to defaults.`)] });
        }
        break;
      }

      // ── /serverblacklist ──────────────────────────────────────────────────────
      case "serverblacklist": {
        if (!isOwner(actor.id)) { await interaction.editReply({ embeds: [ri(" Owner only.")] }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const guildId = interaction.options.getString("guild_id", true);
          if (blacklistedServers.has(guildId)) { await interaction.editReply({ embeds: [ri("That server is already blacklisted.")] }); return; }
          blacklistedServers.add(guildId); saveState();
          const name = client.guilds.cache.get(guildId)?.name ?? guildId;
          await interaction.editReply({ embeds: [ri(` **${name}** is now blacklisted.`)] });
        } else if (sub === "remove") {
          const guildId = interaction.options.getString("guild_id", true);
          if (!blacklistedServers.has(guildId)) { await interaction.editReply({ embeds: [ri("That server is not blacklisted.")] }); return; }
          blacklistedServers.delete(guildId); saveState();
          const name = client.guilds.cache.get(guildId)?.name ?? guildId;
          await interaction.editReply({ embeds: [ri(` **${name}** removed from the blacklist.`)] });
        } else {
          if (!blacklistedServers.size) { await interaction.editReply({ embeds: [ri("No servers are currently blacklisted.")] }); return; }
          const lines = [...blacklistedServers].map(id => { const n = client.guilds.cache.get(id)?.name; return n ? `${n} (\`${id}\`)` : `\`${id}\``; });
          await sendPaginatedI(interaction, ` Blacklisted Servers (${lines.length})`, lines, { perPage: 15, color: 0xed4245 });
        }
        break;
      }

      // ── /globalban ────────────────────────────────────────────────────────────
      case "globalban": {
        if (!isOwner(actor.id)) { await interaction.editReply({ embeds: [ri(" Owner only.")] }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const userId = interaction.options.getString("user_id", true);
          const reason = interaction.options.getString("reason") ?? "No reason provided";
          if (isOwner(userId)) { await interaction.editReply({ embeds: [ri("You can't globally ban yourself.")] }); return; }
          const user = await client.users.fetch(userId).catch(() => null);
          globalBannedUsers.set(userId, { reason, timestamp: Date.now() });
          saveState();
          await interaction.editReply({ embeds: [ri(` **${user?.tag ?? userId}** has been globally banned. Reason: ${reason}`)] });
        } else if (sub === "remove") {
          const userId = interaction.options.getString("user_id", true);
          if (!globalBannedUsers.has(userId)) { await interaction.editReply({ embeds: [ri("That user is not globally banned.")] }); return; }
          globalBannedUsers.delete(userId);
          saveState();
          const user = await client.users.fetch(userId).catch(() => null);
          await interaction.editReply({ embeds: [ri(` **${user?.tag ?? userId}** has been globally unbanned.`)] });
        } else if (sub === "list") {
          if (!globalBannedUsers.size) { await interaction.editReply({ embeds: [ri("No users are globally banned.")] }); return; }
          const items = [...globalBannedUsers.entries()].map(([id, d]) => `<@${id}> — ${d.reason} <t:${Math.floor(d.timestamp / 1000)}:R>`);
          await sendPaginatedI(interaction, ` Globally Banned Users (${items.length})`, items, { perPage: 15, color: 0xcc2222 });
        } else {
          if (!globalBannedUsers.size) { await interaction.editReply({ embeds: [ri("No users are currently globally banned.")] }); return; }
          const count = globalBannedUsers.size;
          globalBannedUsers.clear(); saveState();
          await interaction.editReply({ embeds: [ri(` Cleared **${count}** global ban(s).`)] });
        }
        break;
      }

      // ── /massrole ────────────────────────────────────────────────────────────
      case "massrole": {
        const action = interaction.options.getString("action", true) as "add" | "remove";
        const role = interaction.options.getRole("role", true);
        const filterRole = interaction.options.getRole("filter");
        if (role.managed) { await interaction.editReply({ embeds: [ri(" That role is managed by an integration.")] }); return; }
        const botHighest = guild.members.me!.roles.highest.position;
        if (role.position >= botHighest) { await interaction.editReply({ embeds: [ri(" That role is above the bot's highest role.")] }); return; }
        await interaction.editReply({ embeds: [ri(` Mass-${action}ing **${role.name}** — this may take a while…`)] });
        await ensureMembersCache(guild);
        let count = 0;
        const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
        for (const [, member] of guild.members.cache) {
          if (member.user.bot) continue;
          if (filterRole && !member.roles.cache.has(filterRole.id)) continue;
          const hasRole = member.roles.cache.has(role.id);
          if (action === "add" && !hasRole) { await member.roles.add(role.id).catch(() => {}); count++; await delay(500); }
          else if (action === "remove" && hasRole) { await member.roles.remove(role.id).catch(() => {}); count++; await delay(500); }
        }
        await interaction.editReply({ embeds: [ri(` ${action === "add" ? "Added" : "Removed"} **${role.name}** ${action === "add" ? "to" : "from"} **${count}** member(s).`, 0x57f287)] });
        break;
      }

      // ── /temprole ────────────────────────────────────────────────────────────
      case "temprole": {
        const targetUser = interaction.options.getUser("user", true);
        const role = interaction.options.getRole("role", true);
        const durStr = interaction.options.getString("duration", true);
        const ms = parseDuration(durStr);
        if (!ms) { await interaction.editReply({ embeds: [ri(" Invalid duration. Use `10m`, `2h`, `1d`.")] }); return; }
        if (role.managed) { await interaction.editReply({ embeds: [ri(" That role is managed by an integration.")] }); return; }
        const botHighest = guild.members.me!.roles.highest.position;
        if (role.position >= botHighest) { await interaction.editReply({ embeds: [ri(" That role is above the bot's highest role.")] }); return; }
        const actorHighest = actorMember?.roles.highest.position ?? 0;
        if (role.position >= actorHighest && guild.ownerId !== actor.id && !isOwner(actor.id)) { await interaction.editReply({ embeds: [ri(" You can only assign roles below your highest role.")] }); return; }
        const member = await fetchMember(guild, targetUser.id).catch(() => null);
        if (!member) { await interaction.editReply({ embeds: [ri(" Member not found.")] }); return; }
        await member.roles.add(role.id, auditReason("Temp role assigned", actor.tag));
        const expiresAt = Date.now() + ms;
        const existing = gs.tempRoles.get(targetUser.id) ?? [];
        existing.push({ roleId: role.id, expiresAt });
        gs.tempRoles.set(targetUser.id, existing);
        saveState();
        await interaction.editReply({ embeds: [ri(` Gave **${role.name}** to **${targetUser.tag}** for **${durStr}** (expires <t:${Math.floor(expiresAt / 1000)}:R>).`, 0x57f287)] });
        break;
      }

      // ── /vc ──────────────────────────────────────────────────────────────────
      case "vc": {
        const sub = interaction.options.getSubcommand();
        const memberVC = (interaction.member as GuildMember).voice.channel as VoiceChannel | null;
        if (!memberVC) { await interaction.editReply({ embeds: [ri(" You need to be in a voice channel to use this.")] }); return; }
        const vcOwnerId = gs.vcChannelOwners.get(memberVC.id);
        const isVcOwner = vcOwnerId === actor.id;
        const ownerOnly = ["lock","unlock","hide","unhide","kick","allow","reject","rename","limit"];
        if (ownerOnly.includes(sub) && !isVcOwner) { await interaction.editReply({ embeds: [ri(" Only the owner of this voice channel can do that.")] }); return; }
        switch (sub) {
          case "lock": {
            await memberVC.permissionOverwrites.edit(guild.roles.everyone, { Connect: false }).catch(() => {});
            const lockAllowList = [...(gs.vcAllowList.get(memberVC.id) ?? [])];
            for (let li = 0; li < lockAllowList.length; li++) {
              const m = await fetchMember(guild, lockAllowList[li]).catch(() => null);
              if (m) await memberVC.permissionOverwrites.edit(m, { Connect: true, ViewChannel: true }).catch(() => {});
              if (li < lockAllowList.length - 1) await new Promise(r => setTimeout(r, 300));
            }
            await interaction.editReply({ embeds: [ri(" Your voice channel has been **locked**.", 0x5865f2)] });
            break;
          }
          case "unlock":
            await memberVC.permissionOverwrites.edit(guild.roles.everyone, { Connect: null }).catch(() => {});
            await interaction.editReply({ embeds: [ri(" Your voice channel has been **unlocked**.", 0x57f287)] });
            break;
          case "hide": {
            await memberVC.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => {});
            const hideAllowList = [...(gs.vcAllowList.get(memberVC.id) ?? [])];
            for (let li = 0; li < hideAllowList.length; li++) {
              const m = await fetchMember(guild, hideAllowList[li]).catch(() => null);
              if (m) await memberVC.permissionOverwrites.edit(m, { Connect: true, ViewChannel: true }).catch(() => {});
              if (li < hideAllowList.length - 1) await new Promise(r => setTimeout(r, 300));
            }
            await interaction.editReply({ embeds: [ri(" Your voice channel is now **hidden**.", 0x5865f2)] });
            break;
          }
          case "unhide":
            await memberVC.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null }).catch(() => {});
            await interaction.editReply({ embeds: [ri(" Your voice channel is now **visible**.", 0x57f287)] });
            break;
          case "rename": {
            const newName = interaction.options.getString("name", true);
            if (newName.length > 100) { await interaction.editReply({ embeds: [ri(" Name must be under 100 characters.")] }); break; }
            await memberVC.setName(newName, `Renamed by ${actor.tag}`).catch(() => {});
            await interaction.editReply({ embeds: [ri(` Renamed to **${newName}**.`, 0x57f287)] });
            break;
          }
          case "limit": {
            const limit = interaction.options.getInteger("limit", true);
            await memberVC.setUserLimit(limit).catch(() => {});
            await interaction.editReply({ embeds: [ri(limit === 0 ? " User limit removed." : ` User limit set to **${limit}**.`, 0x57f287)] });
            break;
          }
          case "kick": {
            const target = await fetchMember(guild, interaction.options.getUser("user", true).id).catch(() => null);
            if (!target || target.voice.channelId !== memberVC.id) { await interaction.editReply({ embeds: [ri(" That user isn't in your voice channel.")] }); break; }
            if (target.id === actor.id) { await interaction.editReply({ embeds: [ri(" You can't kick yourself.")] }); break; }
            await target.voice.disconnect("Kicked from VC by owner").catch(() => {});
            await interaction.editReply({ embeds: [ri(` **${target.user.tag}** removed from your voice channel.`, 0x57f287)] });
            break;
          }
          case "allow": {
            const target = await fetchMember(guild, interaction.options.getUser("user", true).id).catch(() => null);
            if (!target) { await interaction.editReply({ embeds: [ri(" User not found.")] }); break; }
            if (!gs.vcAllowList.has(memberVC.id)) gs.vcAllowList.set(memberVC.id, new Set());
            gs.vcAllowList.get(memberVC.id)!.add(target.id);
            await memberVC.permissionOverwrites.edit(target, { Connect: true, ViewChannel: true }).catch(() => {});
            await interaction.editReply({ embeds: [ri(` **${target.user.tag}** can now join your voice channel.`, 0x57f287)] });
            break;
          }
          case "reject": {
            const target = await fetchMember(guild, interaction.options.getUser("user", true).id).catch(() => null);
            if (!target) { await interaction.editReply({ embeds: [ri(" User not found.")] }); break; }
            gs.vcAllowList.get(memberVC.id)?.delete(target.id);
            await memberVC.permissionOverwrites.edit(target, { Connect: false }).catch(() => {});
            if (target.voice.channelId === memberVC.id) await target.voice.disconnect("Removed by VC owner").catch(() => {});
            await interaction.editReply({ embeds: [ri(` **${target.user.tag}** blocked from your voice channel.`, 0xed4245)] });
            break;
          }
          case "claim": {
            if (isVcOwner) { await interaction.editReply({ embeds: [ri(" You already own this voice channel.")] }); break; }
            const prevOwner = vcOwnerId ? memberVC.members.get(vcOwnerId) : null;
            if (prevOwner) { await interaction.editReply({ embeds: [ri(" The current owner is still in the channel.")] }); break; }
            gs.vcChannelOwners.set(memberVC.id, actor.id);
            saveState();
            await interaction.editReply({ embeds: [ri(` You've claimed ownership of **${memberVC.name}**.`, 0x57f287)] });
            break;
          }
          case "info": {
            const ownerId2 = gs.vcChannelOwners.get(memberVC.id);
            const allowList2 = gs.vcAllowList.get(memberVC.id);
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(`VC: ${memberVC.name}`)
              .addFields(
                { name: "Owner", value: ownerId2 ? `<@${ownerId2}>` : "None", inline: true },
                { name: "Members", value: `${memberVC.members.size}${memberVC.userLimit ? `/${memberVC.userLimit}` : ""}`, inline: true },
                { name: "Bitrate", value: `${memberVC.bitrate / 1000}kbps`, inline: true },
                { name: "Allow List", value: allowList2?.size ? [...allowList2].map(id => `<@${id}>`).join(", ") : "None" },
              ).setFooter({ text: `Channel ID: ${memberVC.id}` })] });
            break;
          }
        }
        break;
      }

      // ── /moveall ──────────────────────────────────────────────────────────────
      case "moveall": {
        const fromCh = interaction.options.getChannel("from", true);
        const toCh = interaction.options.getChannel("to", true);
        if (fromCh.type !== ChannelType.GuildVoice || toCh.type !== ChannelType.GuildVoice) {
          await interaction.editReply({ embeds: [ri(" Both channels must be voice channels.")] }); return;
        }
        const fromVc = await guild.channels.fetch(fromCh.id).catch(() => null) as VoiceChannel | null;
        const toVc = await guild.channels.fetch(toCh.id).catch(() => null) as VoiceChannel | null;
        if (!fromVc || !toVc) { await interaction.editReply({ embeds: [ri(" Could not fetch channels.")] }); return; }
        if (fromVc.members.size === 0) { await interaction.editReply({ embeds: [ri(" The source voice channel is empty.")] }); return; }
        let moved = 0;
        for (const [, m] of fromVc.members) {
          await m.voice.setChannel(toVc).catch(() => {});
          moved++;
          await new Promise<void>(r => setTimeout(r, 300));
        }
        await interaction.editReply({ embeds: [ri(` Moved **${moved}** member(s) from **${fromVc.name}** → **${toVc.name}**.`, 0x57f287)] });
        break;
      }

      // ── /vclock ───────────────────────────────────────────────────────────────
      case "vclock": {
        const action = interaction.options.getString("action", true) as "lock" | "unlock";
        const channelOpt = interaction.options.getChannel("channel");
        let targetVC: VoiceChannel | null = null;
        if (channelOpt) {
          if (channelOpt.type !== ChannelType.GuildVoice) { await interaction.editReply({ embeds: [ri(" That's not a voice channel.")] }); return; }
          targetVC = await guild.channels.fetch(channelOpt.id).catch(() => null) as VoiceChannel | null;
        } else {
          targetVC = (interaction.member as GuildMember).voice.channel as VoiceChannel | null;
        }
        if (!targetVC) { await interaction.editReply({ embeds: [ri(" No voice channel found. Specify one or join a VC.")] }); return; }
        if (action === "lock") {
          await targetVC.permissionOverwrites.edit(guild.roles.everyone, { Connect: false }).catch(() => {});
          await interaction.editReply({ embeds: [ri(` **${targetVC.name}** has been **locked**. No new members can join.`, 0x5865f2)] });
        } else {
          await targetVC.permissionOverwrites.edit(guild.roles.everyone, { Connect: null }).catch(() => {});
          await interaction.editReply({ embeds: [ri(` **${targetVC.name}** has been **unlocked**.`, 0x57f287)] });
        }
        break;
      }

      case "antieveryoneping": {
        const choice = interaction.options.getString("action", true);
        if (choice === "on") {
          gs.antiEveryonePingEnabled = true; saveState();
          await interaction.editReply({ embeds: [ri("🛡️ Anti @everyone ping raid protection **enabled**. Anyone sending 3+ pings in 10s will be actioned.", 0x57f287)] });
        } else if (choice === "off") {
          gs.antiEveryonePingEnabled = false; saveState();
          await interaction.editReply({ embeds: [ri("Anti @everyone ping raid protection **disabled**.", 0xfee75c)] });
        } else if (choice === "status") {
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("Anti @everyone Ping Raid Protection")
            .addFields(
              { name: "Status", value: gs.antiEveryonePingEnabled ? "✅ Enabled" : "❌ Disabled", inline: true },
              { name: "Action", value: gs.antiEveryonePingAction, inline: true },
              { name: "Limit", value: "3 pings / 10 seconds", inline: true },
            )] });
        } else if (choice === "action_delete") {
          gs.antiEveryonePingAction = "delete"; saveState();
          await interaction.editReply({ embeds: [ri("Action set to **delete** — offending messages will be removed only.", 0x57f287)] });
        } else if (choice === "action_mute") {
          gs.antiEveryonePingAction = "mute"; saveState();
          await interaction.editReply({ embeds: [ri("Action set to **mute** — offender gets deleted + 10 min timeout.", 0x57f287)] });
        } else {
          gs.antiEveryonePingAction = "ban"; saveState();
          await interaction.editReply({ embeds: [ri("Action set to **ban** — offender gets deleted + banned.", 0xe74c3c)] });
        }
        break;
      }

      case "stripall": {
        if (gs.rolePermBackup.size > 0) {
          await interaction.editReply({ embeds: [ri("⚠️ A permission backup already exists. Run `/restoreperms` first, then try again.", 0xfee75c)] });
          break;
        }
        const stripRoles = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id);
        if (stripRoles.size === 0) {
          await interaction.editReply({ embeds: [ri("No non-managed roles found to strip.", 0xfee75c)] });
          break;
        }
        await interaction.editReply({ embeds: [ri(`⏳ Stripping permissions from **${stripRoles.size}** roles...`, 0x5865f2)] });
        let sOk = 0, sFail = 0;
        for (const [id, role] of stripRoles) {
          gs.rolePermBackup.set(id, role.permissions.bitfield.toString());
          try { await role.setPermissions(0n, `/stripall by ${interaction.user.tag}`); sOk++; }
          catch { sFail++; }
          await new Promise(r => setTimeout(r, 300));
        }
        saveState();
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle("🔒 Permissions Stripped")
          .setDescription(`Stripped permissions from **${sOk}** role(s)${sFail ? ` (${sFail} failed)` : ""}.\nUse \`/restoreperms\` to restore.`).setTimestamp()] });
        break;
      }

      case "restoreperms": {
        if (gs.rolePermBackup.size === 0) {
          await interaction.editReply({ embeds: [ri("No permission backup found. Run `/stripall` first.", 0xfee75c)] });
          break;
        }
        await interaction.editReply({ embeds: [ri(`⏳ Restoring permissions for **${gs.rolePermBackup.size}** roles...`, 0x5865f2)] });
        let rOk = 0, rFail = 0;
        for (const [id, permStr] of gs.rolePermBackup) {
          const role = guild.roles.cache.get(id);
          if (!role) { rFail++; continue; }
          try { await role.setPermissions(BigInt(permStr), `/restoreperms by ${interaction.user.tag}`); rOk++; }
          catch { rFail++; }
          await new Promise(r => setTimeout(r, 300));
        }
        gs.rolePermBackup.clear(); saveState();
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle("🔓 Permissions Restored")
          .setDescription(`Restored permissions for **${rOk}** role(s)${rFail ? ` (${rFail} couldn't be restored)` : ""}.`).setTimestamp()] });
        break;
      }

      case "forcenick": {
        const fnTarget = interaction.options.getMember("user") as GuildMember | null;
        const fnNick = interaction.options.getString("nickname", true);
        if (!fnTarget) { await interaction.editReply({ embeds: [ri("Member not found.", 0xed4245)] }); break; }
        if (fnNick.length > 32) { await interaction.editReply({ embeds: [ri("Nickname must be 32 characters or fewer.", 0xed4245)] }); break; }
        const hierr2 = checkHierarchy(guild, interaction.user.id, fnTarget);
        if (hierr2) { await interaction.editReply({ embeds: [ri(hierr2, 0xed4245)] }); break; }
        await fnTarget.setNickname(fnNick, `Force nickname by ${interaction.user.tag}`);
        gs.forcedNicknames.set(fnTarget.id, fnNick);
        saveState();
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("📛 Nickname Forced")
          .setDescription(`**${fnTarget.user.tag}**'s nickname is now locked to \`${fnNick}\`. They cannot change it while this is active.`)
          .setTimestamp()] });
        break;
      }

      case "unforcenick": {
        const ufnTarget = interaction.options.getMember("user") as GuildMember | null;
        if (!ufnTarget) { await interaction.editReply({ embeds: [ri("Member not found.", 0xed4245)] }); break; }
        if (!gs.forcedNicknames.has(ufnTarget.id)) {
          await interaction.editReply({ embeds: [ri("That member doesn't have a forced nickname.", 0xfee75c)] }); break;
        }
        const oldFN = gs.forcedNicknames.get(ufnTarget.id)!;
        gs.forcedNicknames.delete(ufnTarget.id);
        saveState();
        await ufnTarget.setNickname(null, `Force nickname removed by ${interaction.user.tag}`).catch(() => {});
        await interaction.editReply({ embeds: [ri(`Forced nickname \`${oldFN}\` removed from **${ufnTarget.user.tag}**. They can now change their nickname freely.`, 0x57f287)] });
        break;
      }

      case "forcenicks": {
        if (gs.forcedNicknames.size === 0) {
          await interaction.editReply({ embeds: [ri("No forced nicknames active in this server.", 0xfee75c)] }); break;
        }
        const fnLines = [...gs.forcedNicknames.entries()].map(([id, nick]) => `<@${id}> → \`${nick}\``);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.primary)
          .setTitle(`📛 Forced Nicknames (${fnLines.length})`)
          .setDescription(fnLines.join("\n").slice(0, 4000))
          .setTimestamp()] });
        break;
      }

      // ── /timezone + /tz ───────────────────────────────────────────────────
      case "tz":
      case "timezone": {
        const sub = interaction.options.getSubcommand();
        if (sub === "set") {
          const query = interaction.options.getString("location", true).trim();
          try {
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
              { headers: { "User-Agent": "october-discord-bot/1.0" } }
            );
            const geoData = await geoRes.json() as { lat: string; lon: string; display_name: string }[];
            if (!geoData.length) {
              await interaction.editReply({ embeds: [ri(`Couldn't find a location matching **${query}**. Try a more specific city or country name.`)] }); break;
            }
            const { lat, lon, display_name } = geoData[0];
            const zones = geoFind(parseFloat(lat), parseFloat(lon));
            if (!zones.length) {
              await interaction.editReply({ embeds: [ri("Found the location but couldn't determine its timezone. Try a different city.")] }); break;
            }
            const tz = zones[0];
            gs.userTimezones.set(interaction.user.id, tz);
            saveState();
            const now = new Intl.DateTimeFormat("en-US", {
              timeZone: tz,
              hour: "numeric", minute: "2-digit", hour12: true,
              weekday: "short", month: "short", day: "numeric",
            }).format(new Date());
            await interaction.editReply({ embeds: [new EmbedBuilder()
              .setColor(COLORS.primary)
              .setDescription(`✅ Timezone set to **${tz}**\n📍 Location: ${display_name.split(",").slice(0, 2).join(",").trim()}\n🕐 Current time: **${now}**`)] });
          } catch {
            await interaction.editReply({ embeds: [ri("Failed to look up that location. Try again later.")] });
          }
        } else if (sub === "clear") {
          gs.userTimezones.delete(interaction.user.id);
          saveState();
          await interaction.editReply({ embeds: [ri("Your timezone has been cleared.")] });
        } else {
          const target = interaction.options.getUser("user") ?? interaction.user;
          const tz = gs.userTimezones.get(target.id);
          if (!tz) {
            const isSelf = target.id === interaction.user.id;
            await interaction.editReply({ embeds: [ri(isSelf
              ? "You haven't set a timezone yet. Use `/timezone set` to set one."
              : `${target.username} hasn't set a timezone.`)] });
            break;
          }
          const now = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
            weekday: "long", month: "long", day: "numeric", year: "numeric",
          }).format(new Date());
          await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle(`🕐 ${target.username}'s Time`)
            .setDescription(`**${now}**\n\`${tz}\``)
            .setThumbnail(target.displayAvatarURL())] });
        }
        break;
      }

      // ── /striphumans ────────────────────────────────────────────────────────
      case "striphumans": {
        await ensureMembersCache(guild);
        const botHighestPos = guild.members.me!.roles.highest.position;
        const humans = guild.members.cache.filter(m =>
          !m.user.bot && !isOwner(m.id) && m.id !== actor.id &&
          m.roles.highest.position < botHighestPos
        );
        const victims: { member: GuildMember; roles: import("discord.js").Role[] }[] = [];
        for (const [, m] of humans) {
          const elevated = m.roles.cache.filter(r =>
            r.id !== guild.roles.everyone.id &&
            !r.managed &&
            r.position < botHighestPos &&
            (r.permissions.bitfield & ELEVATED_PERMS) !== 0n
          );
          if (elevated.size > 0) victims.push({ member: m, roles: [...elevated.values()] });
        }
        if (victims.length === 0) {
          await interaction.editReply({ embeds: [ri(" No human members below the bot have roles with moderation permissions.")] });
          break;
        }
        const totalRoles = victims.reduce((n, v) => n + v.roles.length, 0);
        const preview = victims.slice(0, 10).map(v => `<@${v.member.id}>`).join(", ");
        const overflow = victims.length > 10 ? ` + ${victims.length - 10} more` : "";

        // Show confirmation via follow-up buttons
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("sh_confirm").setLabel("Confirm — Strip Roles").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("sh_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
        );
        await interaction.editReply({
          embeds: [
            new EmbedBuilder().setColor(COLORS.error)
              .setTitle("⚠️ Confirm striphumans")
              .setDescription(`This will strip **${totalRoles}** moderation-permission role(s) from **${victims.length}** member(s).\n\n**Affected:** ${preview}${overflow}\n\nThis is **not** automatically reversible.`)
              .setFooter({ text: "You have 30 seconds to confirm." }),
          ],
          components: [row],
        });

        const collector = interaction.channel!.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: i => (i.customId === "sh_confirm" || i.customId === "sh_cancel") && i.user.id === actor.id,
          time: 30_000,
          max: 1,
        });
        collector.on("collect", async btn => {
          await btn.deferUpdate();
          if (btn.customId === "sh_cancel") {
            await interaction.editReply({ embeds: [ri(" Cancelled.")], components: [] });
            return;
          }
          let stripped = 0, failed = 0;
          const affectedMemberIds = new Set<string>();
          for (const { member, roles } of victims) {
            await rQueue(roles, async (role) => {
              try {
                await member.roles.remove(role, `striphumans by ${actor.tag}`);
                stripped++;
                affectedMemberIds.add(member.id);
              } catch { failed++; }
            }, 300);
          }
          const membersAffected = affectedMemberIds.size;
          await interaction.editReply({
            embeds: [
              new EmbedBuilder().setColor(COLORS.error).setTitle("Strip Humans Complete")
                .addFields(
                  { name: "Members Affected", value: `${membersAffected}`, inline: true },
                  { name: "Roles Stripped", value: `${stripped}`, inline: true },
                  ...(failed > 0 ? [{ name: "Failed", value: `${failed}`, inline: true }] : []),
                )
                .setFooter({ text: `Requested by ${actor.tag}` }).setTimestamp(),
            ],
            components: [],
          });
        });
        collector.on("end", async (_, reason) => {
          if (reason === "time") {
            await interaction.editReply({ embeds: [ri(" Confirmation timed out.")], components: [] }).catch(() => {});
          }
        });
        break;
      }

      default:
        await interaction.editReply({ embeds: [ri(" Unknown command.")] });
    }
  } catch (err: any) {
    if (err?.code === 10062) return;
    console.error(`[slash:${cmdName}] Error:`, err);
    const errMsg = ` Something went wrong: ${err?.message ?? "Unknown error"}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [ri(errMsg, 0xed4245)] }).catch(() => {});
    }
  }
}
