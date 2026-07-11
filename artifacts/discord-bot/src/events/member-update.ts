import { Events, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import client from "../client.js";
import { getGS, saveState } from "../state.js";
import { gch, checkCooldown, rQueue, updateAllCounters } from "../utils.js";
import { ELEVATED_PERMS } from "../constants.js";
import { COLORS } from "../colors.js";

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const gsNK = getGS(newMember.guild.id);

  // ── Forced nickname enforcement ───────────────────────────────────────────
  if (oldMember.nickname !== newMember.nickname) {
    const forcedNick = gsNK.forcedNicknames.get(newMember.id);
    if (forcedNick && newMember.nickname !== forcedNick) {
      await newMember.setNickname(forcedNick, "Forced nickname enforcement").catch(() => {});
      return;
    }
  }

  // ── Nickname log ──────────────────────────────────────────────────────────
  if (oldMember.nickname !== newMember.nickname) {
    const nicknameLogChannel = gch(newMember.guild, gsNK.nicknameLogChannelId);
    if (nicknameLogChannel) {
      try {
        await nicknameLogChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.warning)
              .setTitle("Nickname Changed")
              .addFields(
                { name: "User", value: `${newMember} (${newMember.user.tag})`, inline: true },
                { name: "Before", value: oldMember.nickname ?? "*none*", inline: true },
                { name: "After", value: newMember.nickname ?? "*none*", inline: true },
              )
              .setFooter({ text: `ID: ${newMember.id}` })
              .setTimestamp(),
          ],
        });
      } catch (err) {
        console.error("[error] nickname log:", err);
      }
    }
  }

  // ── Staff blacklist enforcement ───────────────────────────────────────────
  if (gsNK.staffBlacklist.has(newMember.id)) {
    const addedRoles = newMember.roles.cache.filter(
      (r) => !oldMember.roles.cache.has(r.id) && !r.managed && (r.permissions.bitfield & ELEVATED_PERMS) !== 0n
    );
    if (addedRoles.size > 0) {
      await rQueue([...addedRoles.values()], async (role) => {
        await newMember.roles.remove(role, "Staff blacklist — elevated role blocked").catch(() => {});
      }, 300);
      console.log(`[sblacklist] Blocked ${newMember.user.tag} from receiving elevated role(s): ${addedRoles.map((r) => r.name).join(", ")}`);
      const logCh = gch(newMember.guild, gsNK.modLogChannelId);
      if (logCh) {
        await logCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle("Staff Blacklist Enforcement")
              .setDescription(`Blocked **${newMember.user.tag}** from receiving elevated role(s): ${addedRoles.map((r) => `${r}`).join(", ")}`)
              .setFooter({ text: `ID: ${newMember.id}` })
              .setTimestamp(),
          ],
        }).catch(() => {});
      }
    }
  }

  // ── Boost detection ───────────────────────────────────────────────────────
  const wasBooster = !!oldMember.premiumSince;
  const isBooster = !!newMember.premiumSince;
  if (wasBooster === isBooster) return;

  if (!wasBooster && isBooster) {
    const boostAge = Date.now() - (newMember.premiumSince?.getTime() ?? 0);
    if (boostAge > 5 * 60 * 1000) return;
  }

  if (!checkCooldown(`boost:${newMember.guild.id}:${newMember.id}`, 60_000)) return;

  if (!wasBooster && isBooster) {
    console.log(`[boost] ${newMember.user.tag} started boosting`);
    if (gsNK.boosterRoleId) {
      const bRole = newMember.guild.roles.cache.get(gsNK.boosterRoleId);
      if (bRole) {
        await newMember.roles.add(bRole).catch((err) =>
          console.error("[boost] Failed to add booster role:", err?.message ?? err)
        );
      }
    }
    const logCh = gch(newMember.guild, gsNK.modLogChannelId);
    if (logCh) {
      await logCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.special)
            .setTitle("New Server Boost!")
            .setDescription(`${newMember} has boosted the server!`)
            .setFooter({ text: `ID: ${newMember.id}` })
            .setTimestamp(),
        ],
      }).catch(() => {});
    }
    if (gsNK.boostChannelId && !gsNK.disabledEvents.has("boost")) {
      const boostCh = gch(newMember.guild, gsNK.boostChannelId);
      if (boostCh) {
        const boostText = gsNK.boostMessage
          .replace("{user}", newMember.toString())
          .replace("{server}", newMember.guild.name);
        const sentBoost = await boostCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.special)
              .setTitle("🎉 Server Boosted!")
              .setDescription(boostText)
              .setThumbnail(newMember.user.displayAvatarURL())
              .setFooter({ text: `Boost Count: ${newMember.guild.premiumSubscriptionCount ?? 0}` })
              .setTimestamp(),
          ],
        }).catch(() => null);
        if (sentBoost && gsNK.boostSelfDestruct) {
          setTimeout(() => sentBoost.delete().catch(() => {}), gsNK.boostSelfDestruct * 1000);
        }
      }
    }
    if (gsNK.boosterDmEnabled) {
      const dmText = gsNK.boosterDmMessage
        .replace("{user}", newMember.user.tag)
        .replace("{server}", newMember.guild.name);
      await newMember.user.send(dmText).catch(() => {});
    }
    updateAllCounters(newMember.guild.id);
  } else {
    console.log(`[boost] ${newMember.user.tag} stopped boosting`);
    if (gsNK.boosterRoleId) {
      const bRole = newMember.guild.roles.cache.get(gsNK.boosterRoleId);
      if (bRole) {
        await newMember.roles.remove(bRole).catch(() => {});
      }
    }
    const customRoleId = gsNK.boosterCustomRoles.get(newMember.id);
    if (customRoleId) {
      const customRole = newMember.guild.roles.cache.get(customRoleId);
      if (customRole) {
        await customRole.delete("Member stopped boosting").catch(() => {});
      }
      gsNK.boosterCustomRoles.delete(newMember.id);
      saveState();
    }
  }
});
