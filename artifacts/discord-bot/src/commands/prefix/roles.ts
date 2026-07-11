import {
  EmbedBuilder, TextChannel, VoiceChannel, PermissionFlagsBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, ChannelType, Guild, GuildMember,
  CategoryChannel, Role, Collection,
} from "discord.js";
import type { Message } from "discord.js";
import { OWNER_ID } from "../../constants.js";
import {
  getGS, saveState, afkUsers, maintenanceMode, globalBannedUsers, blacklistedServers,
  snipeCache, editSnipeCache, reactionSnipeCache, msgStore, jailTimers, activeGiveawayTimers,
  floodTracker, antiSpamTracker, spamOffenses, joinTracker, raidModeActive,
  xpCooldowns, pendingConfirms, paginatedSessions, autoresponderCooldowns,
} from "../../state.js";
import { dmOwner } from "../../state.js";
import client from "../../client.js";
import {
  re, ri, gch, fetchMember, fetchRole, resolveRole, rQueue, parseDuration,
  checkAutostaffPromotion, recordModAction, checkCooldown, sendConfirm,
  sendPaginated, sendPaginatedI, isRepping, getStatusText, canPing,
  checkHierarchy, modActionEmbed, findOrCreateTextChannel, findOrCreateVoiceChannel,
  scheduleStatsUpdate, updateStats, handleSlowmode, getAntinukeActions, countRecent,
  setupJailSystem, punishAntinuke, runSetup, snapshotInvites, resolveGiveaway,
  scheduleGiveaway, xpForLevel, levelFromXp, fetchGuildChannel, EVERYONE_HIDDEN,
  buildPageEmbed, buildPageRow,
  ensureMembersCache,
  safeReply,
  scheduleTempRoleRemoval,
} from "../../utils.js";
import { BLOCKED_TERMS, BLOCKED_PATTERNS } from "../../wordlist.js";
import {
  blackteaGames, wordValidCache,
} from "../../state.js";
import { COLORS } from "../../colors.js";

export async function handleRolesCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "massrole": {
      const roleInput = args.join(" ").trim();
      if (!roleInput) {
        await safeReply(message, re(`Usage: \`${p}massrole @role\` or \`${p}massrole role name\``));
        return true;
      }
      try {
        const role = resolveRole(message.guild!, roleInput);
        if (!role) {
          await safeReply(message, re("Role not found. Try mentioning it, its ID, or typing its name."));
          return true;
        }
        if (role.managed) {
          await safeReply(message, re("That role is managed by an integration and cannot be assigned manually."));
          return true;
        }
        const botHighest = message.guild!.members.me!.roles.highest.position;
        if (role.position >= botHighest) {
          await safeReply(message, re("That role is at or above the bot's highest role — move the bot's role above it first."));
          return true;
        }
        const actor = await fetchMember(message.guild!, message.author.id).catch(() => null);
        const actorHighest = actor?.roles.highest.position ?? 0;
        if (role.position >= actorHighest && message.guild!.ownerId !== message.author.id) {
          await safeReply(message, re("You can only mass-assign roles that are below your highest role."));
          return true;
        }
        await ensureMembersCache(message.guild!);
        const humans = [...message.guild!.members.cache.filter(
          (m) => !m.user.bot && !m.roles.cache.has(role.id),
        ).values()];
        const status = await safeReply(message, re(`Giving **${role.name}** to ${humans.length} members…`));
        let done = 0;
        await rQueue(humans, async (m) => {
          await m.roles.add(role.id);
          done++;
          if (done % 10 === 0) {
            await status.edit(re(`${done}/${humans.length} — **${role.name}**…`)).catch(() => {});
          }
        }, 350); // 350 ms between each add to stay under rate limits
        await status.edit(re(`Gave **${role.name}** to ${done} members.`));
      } catch {
        await safeReply(message, re("Couldn't assign that role."));
      }
      return true;
    }
    case "role": {
      const sub = args[0]?.toLowerCase();

      // ── !role create <name> [#color] ──────────────────────────────────────
      if (sub === "create") {
        const rest = args.slice(1).join(" ").trim();
        if (!rest) {
          await safeReply(message, re(`Usage: \`${p}role create <name> [#hexcolor]\`\nExample: \`${p}role create Moderator #3498db\``));
          return true;
        }
        // pull trailing hex color if present
        const colorMatch = rest.match(/#([0-9a-fA-F]{6})\s*$/);
        const name = colorMatch ? rest.slice(0, rest.lastIndexOf(colorMatch[0])).trim() : rest;
        const color = colorMatch ? parseInt(colorMatch[1], 16) : undefined;
        if (!name) {
          await safeReply(message, re("Please provide a role name."));
          return true;
        }
        try {
          const role = await message.guild!.roles.create({
            name,
            permissions: 0n,
            ...(color !== undefined ? { color } : {}),
            reason: `Created by ${message.author.tag} via !role create`,
          });
          await safeReply(message, {
            embeds: [
              new EmbedBuilder()
                .setColor(role.color || 0x57f287)
                .setTitle("Role Created")
                .addFields(
                  { name: "Name", value: role.name, inline: true },
                  { name: "Color", value: color !== undefined ? `#${colorMatch![1].toUpperCase()}` : "Default", inline: true },
                  { name: "ID", value: role.id, inline: true },
                )
                .setTimestamp(),
            ],
          });
        } catch (err) {
          await safeReply(message, re("Couldn't create the role — check my permissions."));
          console.error("[role create]", err);
        }
        return true;
      }

      // ── !role icon @role <emoji | url | clear> ───────────────────────────
      if (sub === "icon") {
        const roleMentionArg = args[1];
        const iconArg = args.slice(2).join(" ").trim();
        if (!roleMentionArg || !iconArg) {
          await safeReply(message, re(`Usage: \`${p}role icon @role <emoji | imageURL | clear>\`\nExamples:\n\`${p}role icon @Mod \`\n\`${p}role icon @Mod https://i.imgur.com/example.png\`\n\`${p}role icon @Mod clear\``));
          return true;
        }
        try {
          const role = resolveRole(message.guild!, roleMentionArg);
          if (!role) { await safeReply(message, re("Role not found. Try mentioning it, its ID, or typing its name.")); return true; }

          if (iconArg === "clear" || iconArg === "remove" || iconArg === "none") {
            await role.setIcon(null);
            await safeReply(message, re(`Cleared icon for **${role.name}**.`));
            return true;
          }

          // Custom Discord emoji  <:name:id> or <a:name:id>
          const customEmojiMatch = iconArg.match(/^<a?:[\w]+:(\d+)>$/);
          if (customEmojiMatch) {
            const emojiId = customEmojiMatch[1];
            const isAnimated = iconArg.startsWith("<a:");
            const ext = isAnimated ? "gif" : "png";
            const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
            const buf = await fetch(emojiUrl).then((r) => r.arrayBuffer()).then((ab) => Buffer.from(ab));
            await role.setIcon(buf);
            await safeReply(message, re(`Set icon for **${role.name}** to the custom emoji.`));
            return true;
          }

          // Unicode emoji — single grapheme cluster (covers multi-codepoint emoji)
          const unicodeEmojiRx = /^\p{Emoji_Presentation}(\u200d\p{Emoji_Presentation})*\uFE0F?$/u;
          const singleEmoji = [...iconArg][0] ?? "";
          if (unicodeEmojiRx.test(singleEmoji) && [...iconArg].length <= 2) {
            await role.setUnicodeEmoji(singleEmoji);
            await safeReply(message, re(`Set icon for **${role.name}** to ${singleEmoji}`));
            return true;
          }

          // URL or attachment
          let imageUrl = iconArg;
          if (!/^https?:\/\//.test(imageUrl)) {
            const att = message.attachments.first();
            if (att) imageUrl = att.url;
            else { await safeReply(message, re("Provide a valid image URL, a Unicode emoji, or a custom emoji.")); return true; }
          }
          const buf = await fetch(imageUrl).then((r) => r.arrayBuffer()).then((ab) => Buffer.from(ab));
          await role.setIcon(buf);
          await safeReply(message, re(`Set icon for **${role.name}** from image.`));
        } catch (err) {
          await safeReply(message, re("Couldn't set the role icon — the server may not meet the required boost level (level 2+), or the image is invalid."));
          console.error("[role icon]", err);
        }
        return true;
      }

      // ── !role delete @role ───────────────────────────────────────────────────
      if (sub === "delete") {
        const input = args.slice(1).join(" ").trim();
        if (!input) {
          await safeReply(message, re(`Usage: \`${p}role delete @role\` or \`${p}role delete role name\``));
          return true;
        }
        const role = resolveRole(message.guild!, input);
        if (!role) {
          await safeReply(message, re("Role not found. Try mentioning it, its ID, or typing its name."));
          return true;
        }
        if (role.managed) {
          await safeReply(message, re("That role is managed by an integration and cannot be deleted."));
          return true;
        }
        if (role.id === message.guild!.id) {
          await safeReply(message, re("The @everyone role cannot be deleted."));
          return true;
        }
        const botHighest = message.guild!.members.me!.roles.highest.position;
        if (role.position >= botHighest) {
          await safeReply(message, re("That role is at or above the bot's highest role — move the bot's role above it first."));
          return true;
        }
        const actor = await fetchMember(message.guild!, message.author.id).catch(() => null);
        const actorHighest = actor?.roles.highest.position ?? 0;
        if (role.position >= actorHighest && message.guild!.ownerId !== message.author.id) {
          await safeReply(message, re("You can only delete roles that are below your highest role."));
          return true;
        }
        const roleName = role.name;
        const roleRef = role;
        await sendConfirm(
          message,
          `Delete role **${roleName}**? This cannot be undone.`,
          async () => {
            try {
              await roleRef.delete(`Deleted by ${message.author.tag}`);
              await safeReply(message, re(`Deleted role **${roleName}**.`));
            } catch {
              await safeReply(message, re("Couldn't delete that role — check my permissions."));
            }
          },
        );
        return true;
      }

      // ── !role bots [@role] ───────────────────────────────────────────────────
      if (sub === "bots") {
        const roleInput = args.slice(1).join(" ").trim();

        // If a role is provided, assign it to all bots
        if (roleInput) {
          const role = resolveRole(message.guild!, roleInput);
          if (!role) {
            await safeReply(message, re("Role not found. Try mentioning it, its ID, or typing its name."));
            return true;
          }
          if (role.managed) {
            await safeReply(message, re("That role is managed by an integration and cannot be assigned manually."));
            return true;
          }
          const botHighest = message.guild!.members.me!.roles.highest.position;
          if (role.position >= botHighest) {
            await safeReply(message, re("That role is at or above my highest role — move my role above it first."));
            return true;
          }
          const actor = await fetchMember(message.guild!, message.author.id).catch(() => null);
          const actorHighest = actor?.roles.highest.position ?? 0;
          if (role.position >= actorHighest && message.guild!.ownerId !== message.author.id) {
            await safeReply(message, re("You can only assign roles that are below your highest role."));
            return true;
          }
          await ensureMembersCache(message.guild!);
          const bots = [...message.guild!.members.cache
            .filter(m => m.user.bot && !m.roles.cache.has(role.id))
            .values()];
          if (bots.length === 0) {
            await safeReply(message, re(`All bots already have **${role.name}**.`));
            return true;
          }
          const status = await safeReply(message, re(`Giving **${role.name}** to ${bots.length} bot${bots.length === 1 ? "" : "s"}…`));
          let done = 0;
          await rQueue(bots, async (m) => {
            await m.roles.add(role.id);
            done++;
            if (done % 5 === 0) {
              await status.edit(re(`${done}/${bots.length} — **${role.name}**…`)).catch(() => {});
            }
          }, 350);
          await status.edit(re(`Gave **${role.name}** to ${done} bot${done === 1 ? "" : "s"}.`));
          return true;
        }

        // No role provided — list all bots
        await ensureMembersCache(message.guild!);
        const bots = message.guild!.members.cache
          .filter(m => m.user.bot)
          .sort((a, b) => a.user.username.localeCompare(b.user.username));

        if (bots.size === 0) {
          await safeReply(message, re("No bots found in this server."));
          return true;
        }

        const botItems = bots.map(m => {
          const topRole = m.roles.cache
            .filter(r => r.id !== message.guild!.id)
            .sort((a, b) => b.position - a.position)
            .first();
          return `**${m.user.username}** (\`${m.user.id}\`)${topRole ? ` — ${topRole}` : ""}`;
        });

        await sendPaginated(message, `🤖 Bots in ${message.guild!.name}`, botItems, { perPage: 15, footer: `${bots.size} bot${bots.size === 1 ? "" : "s"} total` });
        return true;
      }

      // ── !role humans [@role] ─────────────────────────────────────────────────
      if (sub === "humans") {
        const roleInput = args.slice(1).join(" ").trim();

        // If a role is provided, assign it to all non-bot members
        if (roleInput) {
          const role = resolveRole(message.guild!, roleInput);
          if (!role) {
            await safeReply(message, re("Role not found. Try mentioning it, its ID, or typing its name."));
            return true;
          }
          if (role.managed) {
            await safeReply(message, re("That role is managed by an integration and cannot be assigned manually."));
            return true;
          }
          const botHighest = message.guild!.members.me!.roles.highest.position;
          if (role.position >= botHighest) {
            await safeReply(message, re("That role is at or above my highest role — move my role above it first."));
            return true;
          }
          const actor = await fetchMember(message.guild!, message.author.id).catch(() => null);
          const actorHighest = actor?.roles.highest.position ?? 0;
          if (role.position >= actorHighest && message.guild!.ownerId !== message.author.id) {
            await safeReply(message, re("You can only assign roles that are below your highest role."));
            return true;
          }
          await ensureMembersCache(message.guild!);
          const humans = [...message.guild!.members.cache
            .filter(m => !m.user.bot && !m.roles.cache.has(role.id))
            .values()];
          if (humans.length === 0) {
            await safeReply(message, re(`All human members already have **${role.name}**.`));
            return true;
          }
          const status = await safeReply(message, re(`Giving **${role.name}** to ${humans.length} human${humans.length === 1 ? "" : "s"}…`));
          let done = 0;
          await rQueue(humans, async (m) => {
            await m.roles.add(role.id);
            done++;
            if (done % 10 === 0) {
              await status.edit(re(`${done}/${humans.length} — **${role.name}**…`)).catch(() => {});
            }
          }, 350);
          await status.edit(re(`Gave **${role.name}** to ${done} human${done === 1 ? "" : "s"}.`));
          return true;
        }

        // No role provided — show usage
        await safeReply(message, re(`Usage: \`${p}role humans @role\` — give a role to all human members`));
        return true;
      }

      // ── !role @user @role1,@role2,... (toggle, comma-separated) ─────────────
      const userMention = args[0];
      const roleStr = args.slice(1).join(" ").trim();
      const userId = userMention?.replace(/[<@!>]/g, "");
      if (!userId || !roleStr) {
        await safeReply(message, re(`Usage:\n\`${p}role @user @role\` — toggle a role\n\`${p}role @user owner,mod,staff\` — toggle multiple roles at once\n\`${p}role create <name> [#color]\` — create a role\n\`${p}role delete @role\` — delete a role\n\`${p}role icon @role <emoji | url | clear>\` — set a role icon\n\`${p}role bots\` — list all bots\n\`${p}role humans @role\` — give a role to all humans`));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const actor = await fetchMember(message.guild!, message.author.id).catch(() => null);
        const botMember = message.guild!.members.me!;
        const botHighest = botMember.roles.highest.position;
        const actorHighest = actor?.roles.highest.position ?? 0;
        const roleTokens = roleStr.split(",").map((r) => r.trim()).filter(Boolean);
        const added: string[] = [];
        const removed: string[] = [];
        const notFound: string[] = [];
        const skipped: string[] = [];
        for (const token of roleTokens) {
          const role = resolveRole(message.guild!, token);
          if (!role) { notFound.push(token); continue; }
          // Cannot assign managed (integration) roles
          if (role.managed) { skipped.push(`${role.name} (managed)`); continue; }
          // Role must be below the bot's highest role
          if (role.position >= botHighest) { skipped.push(`${role.name} (above bot)`); continue; }
          // Role must be below the actor's highest role
          if (role.position >= actorHighest && message.guild!.ownerId !== message.author.id) {
            skipped.push(`${role.name} (above you)`); continue;
          }
          if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role.id).catch(() => {});
            removed.push(role.name);
          } else {
            await member.roles.add(role.id).catch(() => {});
            added.push(role.name);
          }
          await new Promise((r) => setTimeout(r, 300));
        }
        const parts: string[] = [];
        if (added.length)    parts.push(` Added: ${added.map((r) => `**${r}**`).join(", ")}`);
        if (removed.length)  parts.push(` Removed: ${removed.map((r) => `**${r}**`).join(", ")}`);
        if (notFound.length) parts.push(` Not found: ${notFound.map((r) => `\`${r}\``).join(", ")}`);
        if (skipped.length)  parts.push(` Skipped: ${skipped.map((r) => `\`${r}\``).join(", ")}`);
        await safeReply(message, re(`${member.user.tag}\n${parts.join("\n") || "No changes made."}`));
      } catch {
        await safeReply(message, re("Couldn't update that user's roles."));
      }
      return true;
    }
    case "nick": {
      const mention = args[0];
      const nick = args.slice(1).join(" ") || null;
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}nick @user new nickname\` (leave blank to clear)`));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        await member.setNickname(nick);
        await safeReply(message, re(nick
            ? ` Nickname set to **${nick}**.`
            : ` Nickname cleared for **${member.user.tag}**.`));
      } catch {
        await safeReply(message, re("Couldn't change that user's nickname."));
      }
      return true;
    }
    case "resetnick": {
      const userId = args[0]?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}resetnick @user\` — clears their nickname back to their username.`));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        if (!member.nickname) {
          await safeReply(message, re("That user doesn't have a nickname set."));
          return true;
        }
        const old = member.nickname;
        await member.setNickname(null, `Nickname reset by ${message.author.tag}`);
        await safeReply(message, re(`Nickname reset for **${member.user.tag}** *(was: ${old})*.`));
      } catch {
        await safeReply(message, re("Couldn't reset that user's nickname."));
      }
      return true;
    }
    case "massnick": {
      const input = args.join(" ").trim();
      if (!input) {
        await safeReply(message, re(`Usage: \`${p}massnick <text>\` — set a nickname for all members.\n\`${p}massnick reset\` — clear all nicknames.`));
        return true;
      }
      const isReset = input.toLowerCase() === "reset";
      await ensureMembersCache(guild);
      const humans = [...guild.members.cache.filter((m) => !m.user.bot).values()];
      const status = await safeReply(message, re(`${isReset ? "Clearing" : `Setting nicknames to **${input}**`} for **${humans.length}** members...`));
      await rQueue(humans, async (m) => {
        try { await m.setNickname(isReset ? null : input, `Mass nick by ${message.author.tag}`); }
        catch { /* skip members we can't edit */ }
      }, 1000);
      const done = humans.length;
      await status.edit(re(`${isReset ? "Cleared nicknames for" : `Set nickname to **${input}** for`} **${done}** member${done !== 1 ? "s" : ""}.`));
      return true;
    }
    case "temprole": {
      const mention = args[0]; const roleMention = args[1]; const durStr = args[2];
      const userId = mention?.replace(/[<@!>]/g, "");
      const roleId = roleMention?.replace(/[<@&>]/g, "");
      const ms = durStr ? parseDuration(durStr) : null;
      if (!userId || !roleId || !ms) {
        await safeReply(message, re(`Usage: \`${p}temprole @user @role <duration> [reason]\`\nDuration: \`30s\`, \`10m\`, \`2h\`, \`1d\``));
        return true;
      }
      try {
        const member = await fetchMember(message.guild!, userId);
        const role = await fetchRole(message.guild!, roleId);
        if (!role) { await safeReply(message, re("Role not found.")); return true; }
        if (role.managed) { await safeReply(message, re("That role is managed by an integration and cannot be assigned manually.")); return true; }
        const botHighest = message.guild!.members.me!.roles.highest.position;
        if (role.position >= botHighest) { await safeReply(message, re("That role is at or above the bot's highest role — move the bot's role above it first.")); return true; }
        const actorMember = await fetchMember(message.guild!, message.author.id).catch(() => null);
        const actorHighest = actorMember?.roles.highest.position ?? 0;
        if (role.position >= actorHighest && message.guild!.ownerId !== message.author.id) { await safeReply(message, re("You can only assign roles that are below your highest role.")); return true; }
        await member.roles.add(roleId);
        const expiresAt = Date.now() + ms;
        const existing = gs.tempRoles.get(userId) ?? [];
        existing.push({ roleId, expiresAt });
        gs.tempRoles.set(userId, existing);
        saveState();
        scheduleTempRoleRemoval(message.guild!, userId, roleId, expiresAt);
        await safeReply(message, re(`Gave **${role.name}** to **${member.user.tag}** for ${durStr}.`));
      } catch { await safeReply(message, re("Couldn't assign temp role.")); }
      return true;
    }
    case "temproles": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "") ?? message.author.id;
      const entries = gs.tempRoles.get(userId);
      if (!entries?.length) { await safeReply(message, re("No active temp roles for that user.")); return true; }
      const lines = entries.map((e) => {
        const role = message.guild!.roles.cache.get(e.roleId);
        return `<@&${e.roleId}>${role ? ` (${role.name})` : ""} — expires <t:${Math.floor(e.expiresAt / 1000)}:R>`;
      });
      await sendPaginated(message, ` Temp Roles (${lines.length})`, lines, { perPage: 15, color: 0x5865f2 });
      return true;
    }
    case "rolemention": {
      if (!message.member?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await safeReply(message, re("You need **Manage Roles** to use this."));
        return true;
      }
      const roleId = args[0]?.replace(/[<@&>]/g, "");
      const text = args.slice(1).join(" ");
      if (!roleId || !text) {
        await safeReply(message, re(`Usage: \`${p}rolemention @role <message>\``));
        return true;
      }
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        await safeReply(message, re("Role not found."));
        return true;
      }
      const wasMentionable = role.mentionable;
      try {
        if (!wasMentionable) await role.setMentionable(true, "rolemention command");
        await message.channel.send(`<@&${role.id}> ${text}`);
        if (!wasMentionable) await role.setMentionable(false, "rolemention command cleanup");
        await message.delete().catch(() => {});
      } catch {
        await safeReply(message, re("Couldn't send role mention — check my role hierarchy."));
      }
      return true;
    }

    default:
      return false;
  }
}
