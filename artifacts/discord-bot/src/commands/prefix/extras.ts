import {
  EmbedBuilder, TextChannel, PermissionFlagsBits, ChannelType,
} from "discord.js";
import type { Message, Webhook } from "discord.js";
import { getGS, saveState, bumpReminderTimers } from "../../state.js";
import client from "../../client.js";
import { re, gch, fetchMember, resolveRole, sendPaginated, safeReply, checkHierarchy, rQueue } from "../../utils.js";
import { COLORS } from "../../colors.js";

const DISBOARD_BOT_ID = "302050872383242240";
const BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000;

function scheduleBumpReminder(guildId: string) {
  const existing = bumpReminderTimers.get(guildId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    bumpReminderTimers.delete(guildId);
    const gs = getGS(guildId);
    if (!gs.bumpReminderEnabled || !gs.bumpReminderChannelId) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const ch = gch(guild, gs.bumpReminderChannelId);
    if (!ch) return;
    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("⏰ Time to Bump!")
          .setDescription("2 hours have passed — run `/bump\` on **Disboard** to bump the server!")
          .setTimestamp(),
      ],
    }).catch(() => {});
  }, BUMP_COOLDOWN_MS);
  bumpReminderTimers.set(guildId, timer);
}

export function handleBumpDetection(message: Message) {
  if (!message.guild) return;
  if (message.author.id !== DISBOARD_BOT_ID) return;
  const embed = message.embeds[0];
  if (!embed?.description?.includes("Bump done!") && !embed?.description?.toLowerCase().includes("bump")) return;
  const gs = getGS(message.guild.id);
  if (!gs.bumpReminderEnabled) return;
  gs.bumpReminderLastBump = Date.now();
  saveState();
  scheduleBumpReminder(message.guild.id);
}

export function restoreBumpReminders() {
  for (const [guildId, gs] of (client as any).guilds?.cache ?? []) {
    const state = getGS(guildId as string);
    if (!state.bumpReminderEnabled || !state.bumpReminderChannelId) continue;
    const elapsed = Date.now() - state.bumpReminderLastBump;
    if (elapsed < BUMP_COOLDOWN_MS) {
      const remaining = BUMP_COOLDOWN_MS - elapsed;
      const existing = bumpReminderTimers.get(guildId as string);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(async () => {
        bumpReminderTimers.delete(guildId as string);
        const guild = client.guilds.cache.get(guildId as string);
        if (!guild) return;
        const ch = gch(guild, state.bumpReminderChannelId!);
        if (!ch) return;
        await ch.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.primary)
              .setTitle("⏰ Time to Bump!")
              .setDescription("2 hours have passed — run `/bump\` on **Disboard** to bump the server!")
              .setTimestamp(),
          ],
        }).catch(() => {});
      }, remaining);
      bumpReminderTimers.set(guildId as string, timer);
    }
  }
}

export async function handleExtrasCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {

    // ── Goodbye messages ──────────────────────────────────────────────────────
    case "goodbye": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "status") {
        const sdInfo = gs.goodbyeSelfDestruct ? ` Auto-deletes after **${gs.goodbyeSelfDestruct}s**.` : "";
        await safeReply(message, re(
          gs.goodbyeChannelId
            ? `Goodbye messages are enabled in <#${gs.goodbyeChannelId}>.\nMessage: \`${gs.goodbyeMessage}\`${sdInfo}\nVariables: \`{user}\`, \`{server}\`, \`{count}\``
            : `Goodbye messages are **disabled**. Set a channel with \`${p}goodbye channel #channel\`.`,
        ));
        return true;
      }
      if (sub === "channel") {
        const chMention = args[1];
        if (!chMention) {
          await safeReply(message, re(`Usage: \`${p}goodbye channel #channel\` — set the goodbye channel.`));
          return true;
        }
        if (chMention.toLowerCase() === "off") {
          gs.goodbyeChannelId = null;
          saveState();
          await safeReply(message, re("Goodbye messages disabled."));
          return true;
        }
        const chId = chMention.replace(/[<#>]/g, "");
        const ch = guild.channels.cache.get(chId) as TextChannel | null;
        if (!ch) { await safeReply(message, re("Channel not found.")); return true; }
        gs.goodbyeChannelId = ch.id;
        saveState();
        await safeReply(message, re(`Goodbye messages will be sent in ${ch}.`));
        return true;
      }
      if (sub === "message") {
        const msg = args.slice(1).join(" ");
        if (!msg) {
          await safeReply(message, re(`Usage: \`${p}goodbye message <text>\` — supports \`{user}\`, \`{server}\`, \`{count}\`.`));
          return true;
        }
        gs.goodbyeMessage = msg;
        saveState();
        await safeReply(message, re(`Goodbye message set to: \`${msg}\``));
        return true;
      }
      if (sub === "self_destruct") {
        const val = args[1]?.toLowerCase();
        if (!val || val === "off") {
          gs.goodbyeSelfDestruct = null;
          saveState();
          await safeReply(message, re("Goodbye message self-destruct disabled."));
          return true;
        }
        const secs = parseInt(val, 10);
        if (isNaN(secs) || secs < 1) {
          await safeReply(message, re(`Usage: \`${p}goodbye self_destruct <seconds>\` or \`${p}goodbye self_destruct off\``));
          return true;
        }
        gs.goodbyeSelfDestruct = secs;
        saveState();
        await safeReply(message, re(`Goodbye messages will now auto-delete after **${secs}s**.`));
        return true;
      }
      await safeReply(message, re("Subcommands: `channel #channel`, `channel off`, `message <text>`, `self_destruct <seconds>`, `status`"));
      return true;
    }

    // ── Boost messages ────────────────────────────────────────────────────────
    case "boostmsg": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "status") {
        const sdInfo = gs.boostSelfDestruct ? ` Auto-deletes after **${gs.boostSelfDestruct}s**.` : "";
        await safeReply(message, re(
          gs.boostChannelId
            ? `Boost messages are enabled in <#${gs.boostChannelId}>.\nMessage: \`${gs.boostMessage}\`${sdInfo}\nVariables: \`{user}\`, \`{server}\``
            : `Boost messages are **disabled**. Set a channel with \`${p}boostmsg channel #channel\`.`,
        ));
        return true;
      }
      if (sub === "channel") {
        const chMention = args[1];
        if (!chMention) {
          await safeReply(message, re(`Usage: \`${p}boostmsg channel #channel\` — set the boost message channel.`));
          return true;
        }
        if (chMention.toLowerCase() === "off") {
          gs.boostChannelId = null;
          saveState();
          await safeReply(message, re("Boost messages disabled."));
          return true;
        }
        const chId = chMention.replace(/[<#>]/g, "");
        const ch = guild.channels.cache.get(chId) as TextChannel | null;
        if (!ch) { await safeReply(message, re("Channel not found.")); return true; }
        gs.boostChannelId = ch.id;
        saveState();
        await safeReply(message, re(`Boost messages will be sent in ${ch}.`));
        return true;
      }
      if (sub === "message") {
        const msg = args.slice(1).join(" ");
        if (!msg) {
          await safeReply(message, re(`Usage: \`${p}boostmsg message <text>\` — supports \`{user}\`, \`{server}\`.`));
          return true;
        }
        gs.boostMessage = msg;
        saveState();
        await safeReply(message, re(`Boost message set to: \`${msg}\``));
        return true;
      }
      if (sub === "self_destruct") {
        const val = args[1]?.toLowerCase();
        if (!val || val === "off") {
          gs.boostSelfDestruct = null;
          saveState();
          await safeReply(message, re("Boost message self-destruct disabled."));
          return true;
        }
        const secs = parseInt(val, 10);
        if (isNaN(secs) || secs < 1) {
          await safeReply(message, re(`Usage: \`${p}boostmsg self_destruct <seconds>\` or \`${p}boostmsg self_destruct off\``));
          return true;
        }
        gs.boostSelfDestruct = secs;
        saveState();
        await safeReply(message, re(`Boost messages will now auto-delete after **${secs}s**.`));
        return true;
      }
      await safeReply(message, re("Subcommands: `channel #channel`, `channel off`, `message <text>`, `self_destruct <seconds>`, `status`"));
      return true;
    }

    // ── Clownboard ────────────────────────────────────────────────────────────
    case "clownboard": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "status") {
        await safeReply(message, re(
          gs.clownboardChannelId
            ? `Clownboard is enabled in <#${gs.clownboardChannelId}>. Threshold: **${gs.clownboardThreshold}** 🤡`
            : `Clownboard is **disabled**. Set it up with \`${p}clownboard set #channel\`.`,
        ));
        return true;
      }
      if (sub === "set") {
        const chMention = args[1];
        if (!chMention) { await safeReply(message, re(`Usage: \`${p}clownboard set #channel\``)); return true; }
        const chId = chMention.replace(/[<#>]/g, "");
        const ch = guild.channels.cache.get(chId);
        if (!ch) { await safeReply(message, re("Channel not found.")); return true; }
        gs.clownboardChannelId = ch.id;
        saveState();
        await safeReply(message, re(`Clownboard channel set to ${ch}. Threshold: **${gs.clownboardThreshold}** 🤡`));
        return true;
      }
      if (sub === "disable" || sub === "off") {
        gs.clownboardChannelId = null;
        saveState();
        await safeReply(message, re("Clownboard disabled."));
        return true;
      }
      if (sub === "threshold") {
        const n = parseInt(args[1]);
        if (isNaN(n) || n < 1 || n > 100) { await safeReply(message, re("Threshold must be between 1 and 100.")); return true; }
        gs.clownboardThreshold = n;
        saveState();
        await safeReply(message, re(`Clownboard threshold set to **${n}** 🤡`));
        return true;
      }
      await safeReply(message, re("Subcommands: `set #channel`, `disable`, `threshold <number>`, `status`"));
      return true;
    }

    // ── Tags ──────────────────────────────────────────────────────────────────
    case "tag": {
      const sub = args[0]?.toLowerCase();
      if (!sub) {
        await safeReply(message, re(`Usage: \`${p}tag <name>\` to use, \`${p}tag add <name> <content>\`, \`${p}tag remove <name>\`, \`${p}tag edit <name> <content>\`, \`${p}tags\``));
        return true;
      }
      if (sub === "add" || sub === "create") {
        const name = args[1]?.toLowerCase();
        const content = args.slice(2).join(" ");
        if (!name || !content) { await safeReply(message, re(`Usage: \`${p}tag add <name> <content>\``)); return true; }
        if (gs.tags.has(name)) { await safeReply(message, re(`A tag named **${name}** already exists. Use \`${p}tag edit\` to update it.`)); return true; }
        gs.tags.set(name, { content, createdBy: message.author.id, createdAt: Date.now() });
        saveState();
        await safeReply(message, re(`Tag **${name}** created.`));
        return true;
      }
      if (sub === "remove" || sub === "delete") {
        const name = args[1]?.toLowerCase();
        if (!name) { await safeReply(message, re(`Usage: \`${p}tag remove <name>\``)); return true; }
        if (!gs.tags.has(name)) { await safeReply(message, re(`No tag named **${name}** found.`)); return true; }
        gs.tags.delete(name);
        saveState();
        await safeReply(message, re(`Tag **${name}** deleted.`));
        return true;
      }
      if (sub === "edit") {
        const name = args[1]?.toLowerCase();
        const content = args.slice(2).join(" ");
        if (!name || !content) { await safeReply(message, re(`Usage: \`${p}tag edit <name> <new content>\``)); return true; }
        if (!gs.tags.has(name)) { await safeReply(message, re(`No tag named **${name}** found.`)); return true; }
        const existing = gs.tags.get(name)!;
        gs.tags.set(name, { ...existing, content });
        saveState();
        await safeReply(message, re(`Tag **${name}** updated.`));
        return true;
      }
      if (sub === "info") {
        const name = args[1]?.toLowerCase();
        if (!name) { await safeReply(message, re(`Usage: \`${p}tag info <name>\``)); return true; }
        const tag = gs.tags.get(name);
        if (!tag) { await safeReply(message, re(`No tag named **${name}** found.`)); return true; }
        const embed = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`Tag: ${name}`)
          .addFields(
            { name: "Content", value: tag.content.slice(0, 1024), inline: false },
            { name: "Created By", value: `<@${tag.createdBy}>`, inline: true },
            { name: "Created", value: `<t:${Math.floor(tag.createdAt / 1000)}:R>`, inline: true },
          );
        await safeReply(message, { embeds: [embed] });
        return true;
      }
      const tagName = sub;
      const tag = gs.tags.get(tagName);
      if (!tag) { return false; }
      await message.channel.send(tag.content);
      return true;
    }

    case "tags": {
      if (gs.tags.size === 0) {
        await safeReply(message, re(`No tags have been created yet. Use \`${p}tag add <name> <content>\`.`));
        return true;
      }
      const lines = [...gs.tags.entries()].map(([name]) => `• \`${name}\``);
      await sendPaginated(message, `Tags (${gs.tags.size} total)`, lines, { color: 0x5865f2 });
      return true;
    }

    // ── Webhook management ────────────────────────────────────────────────────
    case "webhook": {
      const sub = args[0]?.toLowerCase();
      if (!sub) {
        await safeReply(message, re("Subcommands: `list`, `create <#channel> <name>`, `delete <id>`, `edit <id> <new-name>`"));
        return true;
      }
      if (sub === "list") {
        const webhooks = await guild.fetchWebhooks().catch(() => null);
        if (!webhooks || webhooks.size === 0) {
          await safeReply(message, re("No webhooks found in this server."));
          return true;
        }
        const lines = webhooks.map((wh) => `• **${wh.name}** — ${wh.channel ? `<#${wh.channelId}>` : "unknown channel"} (ID: \`${wh.id}\`)`);
        await sendPaginated(message, `Webhooks (${webhooks.size})`, [...lines.values()], { color: 0x5865f2, perPage: 10 });
        return true;
      }
      if (sub === "create") {
        const chMention = args[1];
        const whName = args.slice(2).join(" ") || "New Webhook";
        const chId = chMention?.replace(/[<#>]/g, "");
        const ch = chId ? guild.channels.cache.get(chId) as TextChannel | null : message.channel as TextChannel;
        if (!ch || !ch.isTextBased()) { await safeReply(message, re("Channel not found or is not a text channel.")); return true; }
        try {
          const wh = await ch.createWebhook({ name: whName, reason: `Created by ${message.author.tag}` });
          await safeReply(message, re(`Webhook **${wh.name}** created in ${ch}. ID: \`${wh.id}\``));
        } catch {
          await safeReply(message, re("Couldn't create the webhook — check my permissions."));
        }
        return true;
      }
      if (sub === "delete") {
        const id = args[1];
        if (!id) { await safeReply(message, re(`Usage: \`${p}webhook delete <id>\``)); return true; }
        try {
          const webhooks = await guild.fetchWebhooks();
          const wh = webhooks.get(id);
          if (!wh) { await safeReply(message, re("Webhook not found.")); return true; }
          await wh.delete(`Deleted by ${message.author.tag}`);
          await safeReply(message, re(`Webhook **${wh.name}** deleted.`));
        } catch {
          await safeReply(message, re("Couldn't delete the webhook."));
        }
        return true;
      }
      if (sub === "edit") {
        const id = args[1];
        const newName = args.slice(2).join(" ");
        if (!id || !newName) { await safeReply(message, re(`Usage: \`${p}webhook edit <id> <new-name>\``)); return true; }
        try {
          const webhooks = await guild.fetchWebhooks();
          const wh = webhooks.get(id);
          if (!wh) { await safeReply(message, re("Webhook not found.")); return true; }
          await wh.edit({ name: newName, reason: `Edited by ${message.author.tag}` });
          await safeReply(message, re(`Webhook renamed to **${newName}**.`));
        } catch {
          await safeReply(message, re("Couldn't edit the webhook."));
        }
        return true;
      }
      await safeReply(message, re("Subcommands: `list`, `create <#channel> <name>`, `delete <id>`, `edit <id> <new-name>`"));
      return true;
    }

    // ── Bump reminder ─────────────────────────────────────────────────────────
    case "bumpreminder": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "status") {
        await safeReply(message, re(
          gs.bumpReminderEnabled && gs.bumpReminderChannelId
            ? `Bump reminder is **enabled** in <#${gs.bumpReminderChannelId}>. I'll ping when 2 hours have passed since the last \`/bump\`.`
            : `Bump reminder is **disabled**. Use \`${p}bumpreminder set #channel\` to enable.`,
        ));
        return true;
      }
      if (sub === "set") {
        const chMention = args[1];
        if (!chMention) { await safeReply(message, re(`Usage: \`${p}bumpreminder set #channel\``)); return true; }
        const chId = chMention.replace(/[<#>]/g, "");
        const ch = guild.channels.cache.get(chId);
        if (!ch) { await safeReply(message, re("Channel not found.")); return true; }
        gs.bumpReminderChannelId = ch.id;
        gs.bumpReminderEnabled = true;
        saveState();
        await safeReply(message, re(`Bump reminder enabled in ${ch}. I'll remind you 2 hours after each \`/bump\`.`));
        return true;
      }
      if (sub === "disable" || sub === "off") {
        gs.bumpReminderEnabled = false;
        const existing = bumpReminderTimers.get(guild.id);
        if (existing) clearTimeout(existing);
        bumpReminderTimers.delete(guild.id);
        saveState();
        await safeReply(message, re("Bump reminder disabled."));
        return true;
      }
      await safeReply(message, re("Subcommands: `set #channel`, `disable`, `status`"));
      return true;
    }

    // ── Disable/enable commands ───────────────────────────────────────────────
    case "disablecommand":
    case "dcmd": {
      const cmdName = args[0]?.toLowerCase();
      const chArg = args[1];
      if (!cmdName) {
        await safeReply(message, re(`Usage: \`${p}disablecommand <command> [#channel|all]\`\nUse \`all\` to disable globally, or specify a channel.`));
        return true;
      }
      const scope = chArg?.toLowerCase() === "all" ? "__global__" : chArg?.replace(/[<#>]/g, "") ?? message.channel.id;
      if (!gs.disabledCommands.has(scope)) gs.disabledCommands.set(scope, new Set());
      gs.disabledCommands.get(scope)!.add(cmdName);
      saveState();
      const scopeLabel = scope === "__global__" ? "**globally**" : `in <#${scope}>`;
      await safeReply(message, re(`Command \`${cmdName}\` disabled ${scopeLabel}.`));
      return true;
    }

    case "enablecommand":
    case "ecmd": {
      const cmdName = args[0]?.toLowerCase();
      const chArg = args[1];
      if (!cmdName) {
        await safeReply(message, re(`Usage: \`${p}enablecommand <command> [#channel|all]\``));
        return true;
      }
      const scope = chArg?.toLowerCase() === "all" ? "__global__" : chArg?.replace(/[<#>]/g, "") ?? message.channel.id;
      const set = gs.disabledCommands.get(scope);
      if (!set || !set.has(cmdName)) {
        await safeReply(message, re(`Command \`${cmdName}\` is not disabled in that scope.`));
        return true;
      }
      set.delete(cmdName);
      if (set.size === 0) gs.disabledCommands.delete(scope);
      saveState();
      const scopeLabel = scope === "__global__" ? "**globally**" : `in <#${scope}>`;
      await safeReply(message, re(`Command \`${cmdName}\` re-enabled ${scopeLabel}.`));
      return true;
    }

    case "disabledcommands": {
      if (gs.disabledCommands.size === 0) {
        await safeReply(message, re("No commands are disabled."));
        return true;
      }
      const lines: string[] = [];
      for (const [scope, cmds] of gs.disabledCommands) {
        const scopeLabel = scope === "__global__" ? "**Global**" : `<#${scope}>`;
        lines.push(`${scopeLabel}: ${[...cmds].map((c) => `\`${c}\``).join(", ")}`);
      }
      await sendPaginated(message, "Disabled Commands", lines, { color: 0xed4245 });
      return true;
    }

    // ── Autoresponder ─────────────────────────────────────────────────────────
    case "autoresponder":
    case "ar": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "list") {
        if (gs.autoresponders.size === 0) {
          await safeReply(message, re(`No autoresponders set. Use \`${p}autoresponder add <trigger> <response>\`.`));
          return true;
        }
        const lines = [...gs.autoresponders.entries()].map(([trigger, data]) => {
          const badges = [
            data.strict && "strict", data.exact && "exact", data.regex && "regex",
            data.dm && "DM", data.reply && "reply", data.deleteMsg && "delete",
            data.selfDestruct && `💣${data.selfDestruct}s`,
          ].filter(Boolean).join(", ");
          return `• \`${trigger}\` → ${data.response.slice(0, 60)}${data.response.length > 60 ? "..." : ""}${badges ? ` *(${badges})*` : ""}`;
        });
        await sendPaginated(message, `Autoresponders (${gs.autoresponders.size})`, lines, { color: 0x5865f2, perPage: 10 });
        return true;
      }
      if (sub === "add") {
        const flags: string[] = [];
        let selfDestructSecs: number | undefined;
        const rawArgs = args.slice(1);
        const filteredArgs: string[] = [];
        for (let i = 0; i < rawArgs.length; i++) {
          const a = rawArgs[i];
          if (a === "--exact" || a === "--dm" || a === "--regex" || a === "--strict" || a === "--reply" || a === "--delete") {
            flags.push(a);
          } else if (a === "--self_destruct") {
            const secs = parseInt(rawArgs[i + 1] ?? "", 10);
            if (!isNaN(secs) && secs > 0) { selfDestructSecs = secs; i++; }
          } else {
            filteredArgs.push(a);
          }
        }
        const isRegex = flags.includes("--regex");
        const isStrict = flags.includes("--strict");
        const trigger = isRegex || isStrict ? filteredArgs[0] : filteredArgs[0]?.toLowerCase();
        const response = filteredArgs.slice(1).join(" ");
        if (!trigger || !response) {
          await safeReply(message, re(
            `Usage: \`${p}autoresponder add <trigger> <response> [flags]\`\n` +
            `**Flags:**\n` +
            `\`--strict\` — Match trigger exactly (case-sensitive)\n` +
            `\`--reply\` — Reply to the triggering message\n` +
            `\`--delete\` — Delete the triggering message\n` +
            `\`--self_destruct <seconds>\` — Auto-delete response after X seconds\n` +
            `\`--exact\` — Match exact message (case-insensitive)\n` +
            `\`--dm\` — Send response via DM\n` +
            `\`--regex\` — Treat trigger as a regex pattern`
          ));
          return true;
        }
        if (isRegex) {
          try { new RegExp(trigger); } catch {
            await safeReply(message, re("Invalid regex pattern. Please check your syntax."));
            return true;
          }
        }
        gs.autoresponders.set(trigger, {
          response,
          exact: flags.includes("--exact"),
          dm: flags.includes("--dm"),
          regex: isRegex,
          strict: isStrict,
          reply: flags.includes("--reply"),
          deleteMsg: flags.includes("--delete"),
          selfDestruct: selfDestructSecs,
        });
        saveState();
        const flagSummary = [
          isRegex && "regex", isStrict && "strict", flags.includes("--reply") && "reply",
          flags.includes("--delete") && "delete", selfDestructSecs && `self-destructs in ${selfDestructSecs}s`,
          flags.includes("--exact") && "exact", flags.includes("--dm") && "DM",
        ].filter(Boolean).join(", ");
        await safeReply(message, re(`Autoresponder added for trigger \`${trigger}\`${flagSummary ? ` *(${flagSummary})*` : ""}.`));
        return true;
      }
      if (sub === "remove" || sub === "delete") {
        const triggerRaw = args[1];
        if (!triggerRaw) { await safeReply(message, re(`Usage: \`${p}autoresponder remove <trigger>\``)); return true; }
        const triggerKey = gs.autoresponders.has(triggerRaw) ? triggerRaw
          : gs.autoresponders.has(triggerRaw.toLowerCase()) ? triggerRaw.toLowerCase()
          : null;
        if (!triggerKey) { await safeReply(message, re(`No autoresponder found for \`${triggerRaw}\`.`)); return true; }
        gs.autoresponders.delete(triggerKey);
        saveState();
        await safeReply(message, re(`Autoresponder for \`${triggerKey}\` removed.`));
        return true;
      }
      if (sub === "clear") {
        gs.autoresponders.clear();
        saveState();
        await safeReply(message, re("All autoresponders cleared."));
        return true;
      }
      if (sub === "trigger") {
        const trigger = args.slice(1).join(" ").toLowerCase();
        if (!trigger) {
          await safeReply(message, re(`Usage: \`${p}autoresponder trigger <trigger>\``));
          return true;
        }
        const ar = gs.autoresponders.get(trigger);
        if (!ar) {
          await safeReply(message, re(`No autoresponder found for \`${trigger}\`.`));
          return true;
        }
        const response = ar.response
          .replace("{user}", message.author.toString())
          .replace("{username}", message.author.username)
          .replace("{server}", guild.name);
        if (ar.dm) {
          await message.author.send(response).catch(() => {});
          await safeReply(message, re(`Sent autoresponder \`${trigger}\` to your DMs.`));
        } else {
          await message.channel.send(response).catch(() => {});
        }
        return true;
      }
      await safeReply(message, re(`Subcommands: \`add <trigger> <response> [--strict] [--reply] [--delete] [--self_destruct <secs>] [--exact] [--dm] [--regex]\`, \`remove <trigger>\`, \`trigger <trigger>\`, \`list\`, \`clear\``));
      return true;
    }

    // ── Counter channels ──────────────────────────────────────────────────────
    case "counter": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "list") {
        if (gs.counterChannels.size === 0) {
          await safeReply(message, re(`No counter channels set. Use \`${p}counter add #channel <type>\`.\nTypes: \`members\`, \`bots\`, \`boosts\`, \`online\`, \`channels\``));
          return true;
        }
        const lines = [...gs.counterChannels.entries()].map(([chId, c]) =>
          `• <#${chId}> → **${c.type}** (label: \`${c.label}\`)`
        );
        await safeReply(message, re(lines.join("\n")));
        return true;
      }
      if (sub === "add") {
        const chMention = args[1];
        const type = args[2]?.toLowerCase() as "members" | "bots" | "boosts" | "online" | "channels" | undefined;
        const validTypes = ["members", "bots", "boosts", "online", "channels"];
        if (!chMention || !type || !validTypes.includes(type)) {
          await safeReply(message, re(`Usage: \`${p}counter add #channel <type>\`\nTypes: ${validTypes.map((t) => `\`${t}\``).join(", ")}`));
          return true;
        }
        const chId = chMention.replace(/[<#>]/g, "");
        const ch = guild.channels.cache.get(chId);
        if (!ch) { await safeReply(message, re("Channel not found.")); return true; }
        const label = args.slice(3).join(" ") || type.charAt(0).toUpperCase() + type.slice(1);
        gs.counterChannels.set(chId, { type, label });
        saveState();
        await updateCounterChannel(guild.id, chId, type, label);
        await safeReply(message, re(`Counter channel set for **${type}** in <#${chId}>.`));
        return true;
      }
      if (sub === "remove") {
        const chMention = args[1];
        if (!chMention) { await safeReply(message, re(`Usage: \`${p}counter remove #channel\``)); return true; }
        const chId = chMention.replace(/[<#>]/g, "");
        if (!gs.counterChannels.has(chId)) { await safeReply(message, re("No counter channel set for that channel.")); return true; }
        gs.counterChannels.delete(chId);
        saveState();
        await safeReply(message, re(`Counter removed from <#${chId}>.`));
        return true;
      }
      if (sub === "update") {
        updateAllCounters(guild.id);
        await safeReply(message, re("Counter channels updated."));
        return true;
      }
      await safeReply(message, re("Subcommands: `add #channel <type>`, `remove #channel`, `list`, `update\`\nTypes: `members`, `bots`, `boosts`, `online`, `channels`"));
      return true;
    }

    // ── Strip ─────────────────────────────────────────────────────────────────
    case "strip": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}strip @user\` — removes all non-managed roles from a member.`));
        return true;
      }
      try {
        const member = await fetchMember(guild, userId);
        const hierr = checkHierarchy(guild, message.author.id, member);
        if (hierr) {
          await safeReply(message, re(hierr));
          return true;
        }
        const roles = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed);
        if (roles.size === 0) {
          await safeReply(message, re("That member has no removable roles."));
          return true;
        }
        gs.stripRoles.set(userId, [...roles.keys()]);
        saveState();
        await rQueue([...roles.values()], async (role) => {
          await member.roles.remove(role).catch(() => {});
        }, 300);
        await safeReply(message, re(` Stripped **${roles.size}** role(s) from **${member.user.tag}**.`));
      } catch {
        await safeReply(message, re("Couldn't find or strip roles from that member."));
      }
      return true;
    }

    case "unstrip": {
      const mention = args[0];
      const userId = mention?.replace(/[<@!>]/g, "");
      if (!userId) {
        await safeReply(message, re(`Usage: \`${p}unstrip @user\` — restores roles stripped with \`${p}strip\`.`));
        return true;
      }
      const savedRoles = gs.stripRoles.get(userId);
      if (!savedRoles || savedRoles.length === 0) {
        await safeReply(message, re(`No saved roles found for that member (they must have been stripped using \`${p}strip\`).`));
        return true;
      }
      try {
        const member = await fetchMember(guild, userId);
        let restored = 0;
        await rQueue(savedRoles, async (roleId) => {
          const role = guild.roles.cache.get(roleId);
          if (role) { await member.roles.add(role).catch(() => {}); restored++; }
        }, 300);
        gs.stripRoles.delete(userId);
        saveState();
        await safeReply(message, re(` Restored **${restored}** role(s) to **${member.user.tag}**.`));
      } catch {
        await safeReply(message, re("Couldn't restore roles — member may have left."));
      }
      return true;
    }

    // ── Fakepermissions ───────────────────────────────────────────────────────
    case "fakepermissions":
    case "fakeperm":
    case "fp": {
      const dangerousPerms = [
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.ManageWebhooks,
        PermissionFlagsBits.ManageNicknames,
        PermissionFlagsBits.MentionEveryone,
      ];
      const sub = args[0]?.toLowerCase();
      const roleArg = args[1];
      if (!sub || sub === "check") {
        const dangerRoles = guild.roles.cache.filter((r) =>
          !r.managed && r.id !== guild.id && dangerousPerms.some((p) => r.permissions.has(p))
        );
        if (dangerRoles.size === 0) {
          await safeReply(message, re("No roles with dangerous permissions found."));
          return true;
        }
        const lines = dangerRoles.map((r) => {
          const risky = dangerousPerms.filter((p) => r.permissions.has(p)).map((p) => {
            const names: Record<string, string> = {
              [String(PermissionFlagsBits.Administrator)]: "Administrator",
              [String(PermissionFlagsBits.ManageGuild)]: "Manage Server",
              [String(PermissionFlagsBits.ManageRoles)]: "Manage Roles",
              [String(PermissionFlagsBits.ManageChannels)]: "Manage Channels",
              [String(PermissionFlagsBits.BanMembers)]: "Ban Members",
              [String(PermissionFlagsBits.KickMembers)]: "Kick Members",
              [String(PermissionFlagsBits.ManageWebhooks)]: "Manage Webhooks",
              [String(PermissionFlagsBits.ManageNicknames)]: "Manage Nicknames",
              [String(PermissionFlagsBits.MentionEveryone)]: "Mention Everyone",
            };
            return names[String(p)] ?? "Unknown";
          });
          return `• **${r.name}** — ${risky.join(", ")}`;
        });
        await sendPaginated(message, `Roles with Dangerous Permissions (${dangerRoles.size})`, lines, { color: 0xfee75c, perPage: 10 });
        return true;
      }
      if (sub === "strip") {
        if (roleArg) {
          const role = guild.roles.cache.find((r) => r.id === roleArg.replace(/[<@&>]/g, "") || r.name.toLowerCase() === roleArg.toLowerCase());
          if (!role) { await safeReply(message, re("Role not found.")); return true; }
          const newPerms = dangerousPerms.reduce((acc, p) => acc & ~p, role.permissions.bitfield);
          try {
            await role.setPermissions(BigInt(newPerms), `Fakepermissions strip by ${message.author.tag}`);
            await safeReply(message, re(`Dangerous permissions removed from **${role.name}**.`));
          } catch {
            await safeReply(message, re("Couldn't modify that role — check hierarchy."));
          }
          return true;
        }
        const dangerRoles = guild.roles.cache.filter((r) =>
          !r.managed && r.id !== guild.id && dangerousPerms.some((p) => r.permissions.has(p))
        );
        if (dangerRoles.size === 0) {
          await safeReply(message, re("No roles with dangerous permissions found."));
          return true;
        }
        let done = 0;
        await rQueue([...dangerRoles.values()], async (role) => {
          try {
            const newPerms = dangerousPerms.reduce((acc, p) => acc & ~p, role.permissions.bitfield);
            await role.setPermissions(BigInt(newPerms), `Fakepermissions strip by ${message.author.tag}`);
            done++;
          } catch {}
        }, 300);
        await safeReply(message, re(` Stripped dangerous permissions from **${done}** role(s).`));
        return true;
      }
      await safeReply(message, re(`Subcommands:\n\`${p}fakepermissions check\` — list roles with dangerous permissions\n\`${p}fakepermissions strip\` — remove dangerous perms from all roles\n\`${p}fakepermissions strip @role\` — remove from a specific role`));
      return true;
    }

    // ── Booster DM ────────────────────────────────────────────────────────────
    case "boosterdm": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "status") {
        await safeReply(message, re(
          gs.boosterDmEnabled
            ? `Booster DM is **enabled**.\nMessage: \`${gs.boosterDmMessage}\`\nVariables: \`{user}\`, \`{server}\``
            : `Booster DM is **disabled**. Use \`${p}boosterdm on\` to enable.`,
        ));
        return true;
      }
      if (sub === "on") {
        gs.boosterDmEnabled = true;
        saveState();
        await safeReply(message, re("Booster DM enabled. Boosters will receive a DM when they boost."));
        return true;
      }
      if (sub === "off") {
        gs.boosterDmEnabled = false;
        saveState();
        await safeReply(message, re("Booster DM disabled."));
        return true;
      }
      if (sub === "message") {
        const msg = args.slice(1).join(" ");
        if (!msg) {
          await safeReply(message, re(`Usage: \`${p}boosterdm message <text>\` — supports \`{user}\`, \`{server}\`.`));
          return true;
        }
        gs.boosterDmMessage = msg;
        saveState();
        await safeReply(message, re(`Booster DM message set to: \`${msg}\``));
        return true;
      }
      await safeReply(message, re(`Subcommands: \`${p}boosterdm on\`, \`${p}boosterdm off\`, \`${p}boosterdm message <text>\`, \`${p}boosterdm status\``));
      return true;
    }

    // ── Ping on join ──────────────────────────────────────────────────────────
    case "pingonjoin": {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "status" || sub === "list") {
        if (gs.pingOnJoinEnabled && gs.pingOnJoinChannelIds.length > 0) {
          const list = gs.pingOnJoinChannelIds.map(id => `<#${id}>`).join(", ");
          await safeReply(message, re(`Ping on join is **enabled** in ${list}. New members will be pinged (then deleted) in each channel.`));
        } else {
          await safeReply(message, re(`Ping on join is **disabled**. Use \`${p}pingonjoin add #channel\` to enable.`));
        }
        return true;
      }
      if (sub === "add" || sub === "set") {
        const chMention = args[1];
        if (!chMention) {
          await safeReply(message, re(`Usage: \`${p}pingonjoin add #channel\``));
          return true;
        }
        const chId = chMention.replace(/[<#>]/g, "");
        const ch = guild.channels.cache.get(chId) as TextChannel | null;
        if (!ch) { await safeReply(message, re("Channel not found.")); return true; }
        if (gs.pingOnJoinChannelIds.includes(ch.id)) {
          await safeReply(message, re(`${ch} is already in the ping-on-join list.`));
          return true;
        }
        if (sub === "set") gs.pingOnJoinChannelIds = [];
        gs.pingOnJoinChannelIds.push(ch.id);
        gs.pingOnJoinEnabled = true;
        saveState();
        const verb = sub === "set" ? "set to" : "added";
        await safeReply(message, re(`Ping on join ${verb} ${ch}. New members will be pinged (then the message deleted) in all configured channels.`));
        return true;
      }
      if (sub === "remove" || sub === "rm") {
        const chMention = args[1];
        if (!chMention) {
          await safeReply(message, re(`Usage: \`${p}pingonjoin remove #channel\``));
          return true;
        }
        const chId = chMention.replace(/[<#>]/g, "");
        if (!gs.pingOnJoinChannelIds.includes(chId)) {
          await safeReply(message, re("That channel isn't in the ping-on-join list."));
          return true;
        }
        gs.pingOnJoinChannelIds = gs.pingOnJoinChannelIds.filter(id => id !== chId);
        if (gs.pingOnJoinChannelIds.length === 0) gs.pingOnJoinEnabled = false;
        saveState();
        await safeReply(message, re(`<#${chId}> removed from ping-on-join.${gs.pingOnJoinChannelIds.length === 0 ? " Ping on join is now disabled." : ""}`));
        return true;
      }
      if (sub === "off") {
        gs.pingOnJoinEnabled = false;
        gs.pingOnJoinChannelIds = [];
        saveState();
        await safeReply(message, re("Ping on join disabled and all channels cleared."));
        return true;
      }
      await safeReply(message, re(`Subcommands: \`${p}pingonjoin add #channel\`, \`${p}pingonjoin remove #channel\`, \`${p}pingonjoin list\`, \`${p}pingonjoin off\``));
      return true;
    }

    // ── UwU Lock ──────────────────────────────────────────────────────────────
    case "uwulock": {
      const target = message.mentions.users.first();
      if (!target) { await safeReply(message, re(`Usage: \`${p}uwulock @user\``)); return true; }
      if (target.bot) { await safeReply(message, re("You can't UwU lock a bot.")); return true; }
      gs.uwuLockedUsers.add(target.id);
      saveState();
      await safeReply(message, re(`${target} is now UwU locked. Every message they send will be converted to UwU speak uwu`));
      return true;
    }

    case "uwuunlock": {
      const target = message.mentions.users.first();
      if (!target) { await safeReply(message, re(`Usage: \`${p}uwuunlock @user\``)); return true; }
      if (!gs.uwuLockedUsers.has(target.id)) {
        await safeReply(message, re(`${target} is not UwU locked.`));
        return true;
      }
      gs.uwuLockedUsers.delete(target.id);
      saveState();
      await safeReply(message, re(`${target} has been released from UwU lock.`));
      return true;
    }

    case "uwulist": {
      if (gs.uwuLockedUsers.size === 0) {
        await safeReply(message, re("No users are currently UwU locked."));
        return true;
      }
      const lines = [...gs.uwuLockedUsers].map(id => `• <@${id}>`);
      await safeReply(message, re(`**UwU Locked Users (${gs.uwuLockedUsers.size}):**\n${lines.join("\n")}`));
      return true;
    }

    default:
      return false;
  }
}

// ── UwU webhook cache (channelId → Webhook) ───────────────────────────────────
const uwuWebhookCache = new Map<string, Webhook>();

export async function getUwuWebhook(channel: TextChannel): Promise<Webhook | null> {
  const cached = uwuWebhookCache.get(channel.id);
  if (cached) return cached;
  try {
    const webhooks = await channel.fetchWebhooks();
    let wh = webhooks.find(w => w.name === "oct-uwu" && w.isIncoming()) ?? null;
    if (!wh) wh = await channel.createWebhook({ name: "oct-uwu", reason: "UwU lock" });
    uwuWebhookCache.set(channel.id, wh);
    return wh;
  } catch {
    return null;
  }
}

export function clearUwuWebhookCache(channelId: string) {
  uwuWebhookCache.delete(channelId);
}

export function uwuify(text: string): string {
  const ENDINGS = ["uwu", "owo", ">w<", "~ OwO", "UwU", "(*^ω^)"];
  let out = text;

  out = out.replace(/(?<=[a-zA-Z])\b(no)\b/gi, (m) => m[0] === m[0].toUpperCase() ? "Nu" : "nu");
  out = out.replace(/\blove\b/gi, (m) => m[0] === m[0].toUpperCase() ? "Wuv" : "wuv");
  out = out.replace(/\byou\b/gi, (m) => m[0] === m[0].toUpperCase() ? "Yuw" : "yuw");
  out = out.replace(/\bthe\b/gi, (m) => m[0] === m[0].toUpperCase() ? "Da" : "da");
  out = out.replace(/(?<!\bhttp\S*)(?<![`*_~])[rl]/g, "w");
  out = out.replace(/(?<!\bhttp\S*)(?<![`*_~])[RL]/g, "W");

  out = out.replace(/\b([a-zA-Z])\1*/g, (m, ch) => {
    if (Math.random() < 0.5) return `${ch}-${m}`;
    return m;
  });

  if (Math.random() < 0.85) {
    const ending = ENDINGS[Math.floor(Math.random() * ENDINGS.length)];
    out = out.trimEnd() + " " + ending;
  }

  return out;
}

export async function updateCounterChannel(guildId: string, channelId: string, type: string, label: string) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return;
  let value = 0;
  switch (type) {
    case "members": value = guild.memberCount; break;
    case "bots": value = guild.members.cache.filter((m) => m.user.bot).size; break;
    case "boosts": value = guild.premiumSubscriptionCount ?? 0; break;
    case "online": value = guild.members.cache.filter((m) => m.presence?.status !== "offline" && !!m.presence).size; break;
    case "channels": value = guild.channels.cache.size; break;
  }
  const newName = `${label}: ${value}`;
  await ch.setName(newName).catch(() => {});
}

const _counterDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function updateAllCounters(guildId: string): void {
  const existing = _counterDebounceTimers.get(guildId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(async () => {
    _counterDebounceTimers.delete(guildId);
    const gs = getGS(guildId);
    await Promise.all(
      [...gs.counterChannels.entries()].map(([chId, counter]) =>
        updateCounterChannel(guildId, chId, counter.type, counter.label)
      )
    );
  }, 5_000);
  t.unref();
  _counterDebounceTimers.set(guildId, t);
}
