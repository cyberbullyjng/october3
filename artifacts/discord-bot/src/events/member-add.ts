import { Events, EmbedBuilder, AuditLogEvent, PermissionFlagsBits } from "discord.js";
import client from "../client.js";
import { getGS, saveState, inviteCache, joinTracker, raidModeActive } from "../state.js";
import { gch, fetchMember, getAntinukeActions, countRecent, punishAntinuke, updateAllCounters, scheduleStatsUpdate } from "../utils.js";
import { DEHOIST_RE } from "../constants.js";
import { COLORS } from "../colors.js";

client.on(Events.GuildMemberAdd, async (member) => {
  const gsGA = getGS(member.guild.id);
  const joinLeaveChannel = gch(member.guild, gsGA.joinLeaveChannelId);

  // ── Antinuke: Bot-add detection ───────────────────────────────────────────
  if (member.user.bot && gsGA.antinukeEnabled) {
    try {
      const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 3 });
      const entry = logs.entries.find(
        (e) => (e.target as any)?.id === member.id && Date.now() - e.createdTimestamp < 10_000
      );
      if (entry?.executor) {
        const executorId = entry.executor.id;
        if (executorId !== client.user?.id && !gsGA.antinukeWhitelist.has(executorId) && !gsGA.botWhitelist.has(member.id)) {
          const actions = getAntinukeActions(member.guild.id, executorId);
          actions.botAdds.push(Date.now());
          const recentBotAdds = countRecent(actions.botAdds, gsGA.antinukeWindowMs);
          if (recentBotAdds >= (gsGA.antinukeThresholds.botAdds ?? 1)) {
            await punishAntinuke(
              member.guild, executorId,
              `Unauthorized bot add detected (${member.user.tag}) — added by <@${executorId}>`
            );
          }
        }
      }
    } catch (err) {
      console.error("[antinuke] bot-add check error:", err);
    }
    return;
  }

  // ── Join raid protection ──────────────────────────────────────────────────
  if (!member.user.bot && gsGA.joinRaidProtectionEnabled) {
    const now = Date.now();
    const times = joinTracker.get(member.guild.id) ?? [];
    times.push(now);
    const recent = times.filter((t) => now - t < gsGA.joinRaidWindowMs);
    joinTracker.set(member.guild.id, recent);
    if (recent.length >= gsGA.joinRaidThreshold && !raidModeActive.has(member.guild.id)) {
      raidModeActive.add(member.guild.id);
      const logCh = gch(member.guild, gsGA.automodLogChannelId ?? gsGA.modLogChannelId);
      if (logCh) {
        await logCh.send({ embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle("⚠️ Raid Mode Activated")
          .setDescription(`**${recent.length}** users joined in the last ${gsGA.joinRaidWindowMs / 1000}s — action: **${gsGA.raidAction}**.\nRun \`raidprotect clearraid\` to deactivate.`)
          .setTimestamp()
        ]}).catch(() => {});
      }
    }
    if (raidModeActive.has(member.guild.id)) {
      if (gsGA.raidAction === "ban") {
        await member.ban({ reason: "Raid protection: join rate exceeded" }).catch(() => {});
      } else if (gsGA.raidAction === "timeout") {
        await member.timeout(10 * 60 * 1000, "Raid protection: join rate exceeded").catch(async () => {
          await member.kick("Raid protection: join rate exceeded (timeout failed)").catch(() => {});
        });
      } else if (gsGA.raidAction === "jail") {
        const jailRoleId = gsGA.jailRoleId;
        if (jailRoleId && member.guild.roles.cache.has(jailRoleId)) {
          const savedRoles = member.roles.cache.filter(r => r.id !== member.guild.roles.everyone.id).map(r => r.id);
          gsGA.jailedMembers.set(member.id, savedRoles);
          const managedRoleIds = member.roles.cache.filter(r => r.managed).map(r => r.id);
          await member.roles.set([jailRoleId, ...managedRoleIds]).catch(async () => {
            await member.kick("Raid protection: join rate exceeded (jail failed)").catch(() => {});
          });
        } else {
          await member.kick("Raid protection: join rate exceeded (jail not set up)").catch(() => {});
        }
      } else {
        await member.kick("Raid protection: join rate exceeded").catch(() => {});
      }
      return;
    }
  }

  // ── Account age gate ──────────────────────────────────────────────────────
  if (!member.user.bot && gsGA.joinAgeGateEnabled) {
    const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
    if (ageDays < gsGA.joinAgeGateDays) {
      await member.kick(`Age gate: account younger than ${gsGA.joinAgeGateDays} days (age: ${Math.floor(ageDays)}d)`).catch(() => {});
      const logCh = gch(member.guild, gsGA.automodLogChannelId ?? gsGA.modLogChannelId);
      if (logCh) {
        await logCh.send({ embeds: [new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle("Age Gate Kick")
          .setThumbnail(member.user.displayAvatarURL())
          .addFields(
            { name: "User", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Account Age", value: `${Math.floor(ageDays)} day(s)`, inline: true },
            { name: "Threshold", value: `${gsGA.joinAgeGateDays} day(s)`, inline: true },
          )
          .setFooter({ text: "Kicked by Age Gate" })
          .setTimestamp()
        ]}).catch(() => {});
      }
      return;
    }
  }

  // ── Anti-alt account gate ────────────────────────────────────────────────
  if (!member.user.bot && gsGA.antiAltEnabled) {
    const ageMs = Date.now() - member.user.createdTimestamp;
    const ageDays = ageMs / 86_400_000;
    if (ageDays < gsGA.antiAltDays) {
      await member.kick(`Anti-alt: account younger than ${gsGA.antiAltDays} days (age: ${Math.floor(ageDays)}d)`).catch(() => {});
      const logCh = gch(member.guild, gsGA.automodLogChannelId ?? gsGA.modLogChannelId);
      if (logCh) {
        await logCh.send({ embeds: [new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle("Anti-Alt Kick")
          .setThumbnail(member.user.displayAvatarURL())
          .addFields(
            { name: "User", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Account Age", value: `${Math.floor(ageDays)} day(s)`, inline: true },
            { name: "Threshold", value: `${gsGA.antiAltDays} day(s)`, inline: true },
          )
          .setFooter({ text: "Kicked by Anti-Alt system" })
          .setTimestamp()
        ] }).catch(() => {});
      }
      return;
    }
  }

  // ── Antiraid: default profile picture ────────────────────────────────────
  if (!member.user.bot && gsGA.antiraidDefaultPfpEnabled && !member.user.avatar) {
    try {
      if (gsGA.antiraidDefaultPfpAction === "ban") {
        await member.ban({ reason: "Antiraid: no profile picture" });
      } else {
        await member.kick("Antiraid: no profile picture");
      }
      const logCh = gch(member.guild, gsGA.automodLogChannelId ?? gsGA.modLogChannelId);
      if (logCh) {
        await logCh.send({ embeds: [new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle(`Antiraid: Default PFP ${gsGA.antiraidDefaultPfpAction === "ban" ? "Ban" : "Kick"}`)
          .addFields(
            { name: "User", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Action", value: gsGA.antiraidDefaultPfpAction, inline: true },
          )
          .setTimestamp()
        ]}).catch(() => {});
      }
    } catch {}
    return;
  }

  // ── Antiraid: new accounts ────────────────────────────────────────────────
  if (!member.user.bot && gsGA.antiraidNewAccountsEnabled) {
    const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
    if (ageDays < gsGA.antiraidNewAccountsAge) {
      try {
        if (gsGA.antiraidNewAccountsAction === "ban") {
          await member.ban({ reason: `Antiraid: account younger than ${gsGA.antiraidNewAccountsAge} days` });
        } else {
          await member.kick(`Antiraid: account younger than ${gsGA.antiraidNewAccountsAge} days`);
        }
        const logCh = gch(member.guild, gsGA.automodLogChannelId ?? gsGA.modLogChannelId);
        if (logCh) {
          await logCh.send({ embeds: [new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle(`Antiraid: New Account ${gsGA.antiraidNewAccountsAction === "ban" ? "Ban" : "Kick"}`)
            .addFields(
              { name: "User", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Account Age", value: `${Math.floor(ageDays)} day(s)`, inline: true },
              { name: "Threshold", value: `${gsGA.antiraidNewAccountsAge} day(s)`, inline: true },
            )
            .setTimestamp()
          ]}).catch(() => {});
        }
      } catch {}
      return;
    }
  }

  // ── Auto-dehoist ──────────────────────────────────────────────────────────
  if (!member.user.bot && DEHOIST_RE.test(member.displayName)) {
    const cleaned = member.displayName.replace(/^[!-/:-@[-`{-~]+/, "").trim() || "dehoisted";
    await member.setNickname(cleaned, "Auto-dehoist on join").catch(() => {});
  }

  // ── Invite tracking ───────────────────────────────────────────────────────
  let usedInvite: string | null = null;
  if (joinLeaveChannel && !gsGA.disabledEvents.has("joinlog")) {
    try {
      const currentInvites = await member.guild.invites.fetch();
      const cached = inviteCache.get(member.guild.id) ?? new Map<string, number>();
      for (const [code, inv] of currentInvites) {
        const prevUses = cached.get(code) ?? 0;
        if ((inv.uses ?? 0) > prevUses) {
          usedInvite = `${inv.code} (created by ${inv.inviter?.tag ?? "unknown"})`;
          break;
        }
      }
      const newSnapshot = new Map<string, number>();
      currentInvites.forEach((inv) => newSnapshot.set(inv.code, inv.uses ?? 0));
      inviteCache.set(member.guild.id, newSnapshot);
    } catch {}
  }

  // Welcome message
  if (gsGA.welcomeChannelId && !gsGA.disabledEvents.has("welcome")) {
    const wch = gch(member.guild, gsGA.welcomeChannelId);
    if (wch) {
      const sentWelcome = await wch.send(
        gsGA.welcomeMessage
          .replace("{user}", `${member}`)
          .replace("{server}", member.guild.name)
          .replace("{count}", String(member.guild.memberCount))
      ).catch(() => null);
      if (sentWelcome && gsGA.welcomeSelfDestruct) {
        setTimeout(() => sentWelcome.delete().catch(() => {}), gsGA.welcomeSelfDestruct * 1000);
      }
    }
  }
  // Ping on join
  if (gsGA.pingOnJoinEnabled && gsGA.pingOnJoinChannelIds.length > 0) {
    await Promise.allSettled(
      gsGA.pingOnJoinChannelIds.map(async (chId) => {
        const pch = gch(member.guild, chId);
        if (!pch) return;
        const pingMsg = await pch.send(`${member}`).catch(() => null);
        if (pingMsg) await pingMsg.delete().catch(() => {});
      })
    );
  }
  // Auto-role
  if (gsGA.autoRoleId) {
    await member.roles.add(gsGA.autoRoleId).catch((err) =>
      console.error(`[error] autorole: couldn't assign to ${member.user.tag}:`, err)
    );
  }
  // Role restore
  if (gsGA.roleRestoreEnabled && gsGA.roleBackup.has(member.id)) {
    const savedRoles = gsGA.roleBackup.get(member.id)!;
    const MOD_PERMS =
      PermissionFlagsBits.Administrator |
      PermissionFlagsBits.BanMembers |
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.ManageGuild |
      PermissionFlagsBits.ManageChannels |
      PermissionFlagsBits.ManageRoles |
      PermissionFlagsBits.ManageMessages |
      PermissionFlagsBits.ModerateMembers |
      PermissionFlagsBits.MuteMembers |
      PermissionFlagsBits.DeafenMembers |
      PermissionFlagsBits.MoveMembers |
      PermissionFlagsBits.ManageNicknames |
      PermissionFlagsBits.ViewAuditLog;
    const validRoles = savedRoles.filter((id) => {
      const role = member.guild.roles.cache.get(id);
      if (!role) return false;
      if (role.permissions.any(MOD_PERMS)) return false;
      return true;
    });
    if (validRoles.length > 0) {
      await member.roles.add(validRoles, "Role restore on rejoin").catch(() => {});
    }
    gsGA.roleBackup.delete(member.id);
    saveState();
    if (joinLeaveChannel) {
      await joinLeaveChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle("Roles Restored")
            .setDescription(`${member}'s roles have been restored (${validRoles.length} role${validRoles.length === 1 ? "" : "s"}).`)
            .setFooter({ text: `ID: ${member.id}` })
            .setTimestamp(),
        ],
      }).catch(() => {});
    }
  }
  if (!joinLeaveChannel) return;
  if (!gsGA.disabledEvents.has("joinlog")) {
    try {
      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle("Member Joined")
        .setThumbnail(member.user.displayAvatarURL())
        .setDescription(`${member} (${member.user.tag})`)
        .addFields(
          { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: "Member #", value: `${member.guild.memberCount}`, inline: true },
        )
        .setFooter({ text: `ID: ${member.id}` })
        .setTimestamp();
      if (usedInvite) embed.addFields({ name: "Joined via Invite", value: usedInvite, inline: false });
      await joinLeaveChannel.send({ embeds: [embed] });
      scheduleStatsUpdate();
    } catch (err) {
      console.error("[error] member add:", err);
    }
  }
  // Update counter channels on member join
  updateAllCounters(member.guild.id);
});
