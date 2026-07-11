import {
  EmbedBuilder, TextChannel, VoiceChannel, PermissionFlagsBits, ActionRowBuilder, User,
  ButtonBuilder, ButtonStyle, ComponentType, ChannelType, Guild, GuildMember,
  CategoryChannel, Role, Collection, MessageComponentInteraction, AttachmentBuilder,
} from "discord.js";
import https from "https";
import type { Message } from "discord.js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { OWNER_ID, isOwner } from "../../constants.js";
import type { GiveawayData, BlackteaGame, WordleGame } from "../../types.js";
import { wordleGames, tttGames } from "../../state.js";
import {
  getGS, saveState, afkUsers, maintenanceMode, globalBannedUsers, blacklistedServers,
  snipeCache, editSnipeCache, reactionSnipeCache, msgStore, jailTimers, activeGiveawayTimers,
  floodTracker, antiSpamTracker, spamOffenses, joinTracker, raidModeActive,
  xpCooldowns, pendingConfirms, paginatedSessions, autoresponderCooldowns,
} from "../../state.js";
import { dmOwner } from "../../state.js";
import client from "../../client.js";
import { btBegin, BT_JOIN_EMOJI, BT_LOBBY_MS } from "../../blacktea.js";
import {
  re, ri, gch, fetchMember, fetchRole, resolveRole, rQueue, parseDuration,
  checkAutostaffPromotion, recordModAction, checkCooldown, sendConfirm,
  sendPaginated, sendPaginatedI, isRepping, getStatusText, canPing, syncRepRoles,
  checkHierarchy, modActionEmbed, findOrCreateTextChannel, findOrCreateVoiceChannel,
  scheduleStatsUpdate, updateStats, handleSlowmode, getAntinukeActions, countRecent,
  setupJailSystem, punishAntinuke, runSetup, snapshotInvites, resolveGiveaway,
  scheduleGiveaway, xpForLevel, levelFromXp, fetchGuildChannel, EVERYONE_HIDDEN,
  buildPageEmbed, buildPageRow,
  safeReply,
} from "../../utils.js";
import { BLOCKED_TERMS, BLOCKED_PATTERNS } from "../../wordlist.js";
import {
  blackteaGames, wordValidCache,
} from "../../state.js";
import { COLORS } from "../../colors.js";

GlobalFonts.registerFromPath(`${process.cwd()}/fonts/DejaVuSans.ttf`, "DejaVu Sans");
GlobalFonts.registerFromPath(`${process.cwd()}/fonts/DejaVuSans-Bold.ttf`, "DejaVu Sans Bold");
GlobalFonts.registerFromPath(`${process.cwd()}/fonts/DejaVuSerif.ttf`, "DejaVu Serif");
GlobalFonts.registerFromPath(`${process.cwd()}/fonts/DejaVuSerif-Bold.ttf`, "DejaVu Serif Bold");

function parseGiveawayReference(raw: string | undefined): { channelId?: string; messageId?: string } {
  if (!raw) return {};
  const linkMatch = raw.match(/\/channels\/(?:\d+|@me)\/(\d+)\/(\d+)/);
  if (linkMatch) return { channelId: linkMatch[1], messageId: linkMatch[2] };
  const ids = raw.match(/\d{17,20}/g);
  return { messageId: ids?.at(-1) };
}

function parseGiveawayFromMessage(refMsg: Message, guildId: string): GiveawayData | null {
  const embed = refMsg.embeds[0];
  const description = embed?.description ?? "";
  const prize = description.match(/\*\*(.+?)\*\*/)?.[1]?.trim();
  if (!prize) return null;
  const winnerCountMatch = description.match(/Winners:\s*\*\*(\d+)/i);
  const winnerMentions = description.match(/<@\d+>/g)?.length;
  const title = embed?.title?.toLowerCase() ?? "";
  return {
    messageId: refMsg.id,
    channelId: refMsg.channel.id,
    guildId,
    prize,
    winnerCount: Math.max(1, winnerCountMatch ? parseInt(winnerCountMatch[1]) : winnerMentions ?? 1),
    endsAt: embed?.timestamp ? Date.parse(embed.timestamp) || 0 : 0,
    hostTag: embed?.footer?.text?.replace(/^Hosted by\s*/i, "") || "Unknown",
    ended: title.includes("ended"),
  };
}

async function fetchGiveawayFromReference(message: Message, ref: { channelId?: string; messageId?: string }): Promise<GiveawayData | undefined> {
  if (!message.guild || !ref.messageId) return undefined;
  const ch = (ref.channelId
    ? await message.guild.channels.fetch(ref.channelId).catch(() => null)
    : message.channel) as TextChannel | null;
  const refMsg = ch?.isTextBased() ? await ch.messages.fetch(ref.messageId).catch(() => null) : null;
  return refMsg ? parseGiveawayFromMessage(refMsg, message.guild.id) ?? undefined : undefined;
}

async function findLatestGiveawayInChannel(message: Message): Promise<GiveawayData | undefined> {
  if (!message.guild || !message.channel.isTextBased()) return undefined;
  const messages = await message.channel.messages.fetch({ limit: 50 }).catch(() => null);
  const giveawayMessage = messages?.find((msg) => {
    const embed = msg.embeds[0];
    return embed?.title?.toLowerCase() === "giveaway" && !!embed.description?.includes("React with 🎉");
  });
  return giveawayMessage ? parseGiveawayFromMessage(giveawayMessage, message.guild.id) ?? undefined : undefined;
}

// ─── Anime roleplay GIF helpers ──────────────────────────────────────────────
async function getAnimeGif(action: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.waifu.pics/sfw/${action}`);
    if (!res.ok) return null;
    const data = await res.json() as { url: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

async function getNekosGif(action: string): Promise<string | null> {
  try {
    const res = await fetch(`https://nekos.best/api/v2/${action}`);
    if (!res.ok) return null;
    const data = await res.json() as { results: { url: string }[] };
    return data.results?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

async function getTenorGif(query: string): Promise<string | null> {
  try {
    const url = `https://api.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=20&contentfilter=medium`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as { results: { media: { gif: { url: string } }[] }[] };
    const results = data.results;
    if (!results?.length) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    return pick?.media?.[0]?.gif?.url ?? null;
  } catch {
    return null;
  }
}

// Commands → which GIF source to use
const RP_NEKOS = new Set(["tickle", "baka", "stare", "feed", "peck", "run"]);
const RP_TENOR: Record<string, string> = {
  fuck:    "anime couple lewd suggestive",
  spank:   "anime spank",
  nuzzle:  "anime nuzzle cuddle",
  grope:   "anime grope suggestive",
  seduce:  "anime seduce flirt",
  rape:    "anime tackle glomp force hug",
};

const RP_COLORS: Record<string, number> = {
  hug: 0xff69b4, kiss: 0xff1493, cuddle: 0xffb6c1, handhold: 0xffc0cb, wave: 0x57f287, highfive: 0x57f287,
  pat: 0xffd700, poke: 0xfee75c, lick: 0xf4a261, bite: 0xff7733,
  slap: 0xed4245, punch: 0xed4245, bonk: 0xed4245, kill: 0x2b2d31, yeet: 0x5865f2, kick: 0xed4245,
  glomp: 0xff69b4, nom: 0xf4a261, bully: 0xed4245, tickle: 0xffd700, smug: 0x5865f2,
  fuck: 0xff1493, spank: 0xed4245, nuzzle: 0xffb6c1, grope: 0xff6b6b, seduce: 0xff1493, rape: 0x2b2d31,
  cry: 0x5865f2, blush: 0xffb6c1, smile: 0x57f287, wink: 0xffd700, dance: 0x57f287, cringe: 0xed4245, awoo: 0xffd700,
  baka: 0xed4245, stare: 0x5865f2, feed: 0x57f287, peck: 0xff69b4, run: 0x5865f2,
};

const RP_MESSAGES: Record<string, string> = {
  hug:      "hugged",        kiss:     "kissed",         cuddle:   "cuddled with",   handhold: "held hands with",
  wave:     "waved at",      highfive: "high-fived",     pat:      "patted",          poke:     "poked",
  lick:     "licked",        bite:     "bit",            slap:     "slapped",         punch:    "punched",
  bonk:     "bonked",        kill:     "killed",         yeet:     "yeeted",          kick:     "kicked",
  glomp:    "glomped",       nom:      "nom'd",          bully:    "bullied",         tickle:   "tickled",
  smug:     "is being smug at",
  fuck:     "tried to fuck",  spank:   "spanked",        nuzzle:   "nuzzled",         grope:    "groped",
  seduce:   "tried to seduce", rape:  "forcefully hugged",
  cry:      "made cry",        blush:  "made blush",      smile:    "made smile",       wink:     "winked at",
  dance:    "danced with",     cringe: "cringed at",      awoo:     "awoo'd at",
  baka:     "called baka",     stare:  "stared at",       feed:     "fed",              peck:     "pecked",
  run:      "ran away from",
};

const RP_EMOJI: Record<string, string> = {
  hug: "🤗", kiss: "😘", cuddle: "🥰", handhold: "🤝", wave: "👋", highfive: "✋",
  pat: "🫶", poke: "👉", lick: "👅", bite: "😬", slap: "👋", punch: "👊",
  bonk: "🔨", kill: "💀", yeet: "🌪️", kick: "🦵",
  glomp: "🫂", nom: "😋", bully: "😈", tickle: "😂", smug: "😏",
  fuck: "🤭", spank: "🍑", nuzzle: "🥰", grope: "👀", seduce: "😈", rape: "🫂",
  cry: "😢", blush: "😳", smile: "😊", wink: "😉", dance: "💃", cringe: "😬", awoo: "🐺",
  baka: "🤦", stare: "👀", feed: "🍴", peck: "😗", run: "🏃",
};

const RP_NO_TARGET: Record<string, string> = {
  hug:     "You can't hug nobody.",            kiss:    "Who are you kissing exactly?",
  cuddle:  "You can't cuddle with nobody.",    handhold:"Nobody to hold hands with.",
  wave:    "You wave at nobody... lonely.",    highfive:"Who's gonna high-five you back?",
  pat:     "You can't pat nobody.",            poke:    "There's nobody to poke.",
  lick:    "You can't lick nobody.",           bite:    "There's nobody to bite.",
  slap:    "You can't slap nobody.",           punch:   "You're punching air.",
  bonk:    "Nobody to bonk.",                  kill:    "You can't kill nobody.",
  yeet:    "There's nobody to yeet.",          kick:    "Nobody to kick.",
  glomp:   "Nobody to glomp.",                 nom:     "There's nobody to nom.",
  bully:   "You can't bully nobody.",          tickle:  "Nobody to tickle.",
  smug:    "Nobody to be smug at.",
  fuck:    "Nah who you finna fuck lil bro.",  spank:   "Nobody to spank.",
  nuzzle:  "Nobody to nuzzle.",                grope:   "Hands to yourself then.",
  seduce:  "Nobody to seduce.",                rape:    "Hands to yourself.",
  cry:     "Nobody to make cry.",              blush:   "Nobody to make blush.",
  smile:   "Nobody to make smile.",            wink:    "Nobody to wink at.",
  dance:   "Nobody to dance with.",            cringe:  "Nothing to cringe at.",
  awoo:    "Nobody to awoo at.",               baka:    "Nobody to call baka.",
  stare:   "Nobody to stare at.",              feed:    "Nobody to feed.",
  peck:    "Nobody to peck.",                  run:     "Nobody to run away from.",
};

async function resolveRoleplayGif(cmd: string): Promise<string | null> {
  if (RP_NEKOS.has(cmd)) return getNekosGif(cmd);
  if (cmd in RP_TENOR) return getTenorGif(RP_TENOR[cmd]);
  return getAnimeGif(cmd);
}

async function handleRoleplay(cmd: string, args: string[], message: Message): Promise<boolean> {
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  if (!targetId || !/^\d+$/.test(targetId)) {
    await safeReply(message, re(RP_NO_TARGET[cmd] ?? "You need to mention someone."));
    return true;
  }
  const verb = RP_MESSAGES[cmd] ?? cmd;
  const emoji = RP_EMOJI[cmd] ?? "";
  const color = RP_COLORS[cmd] ?? 0x5865f2;
  const gifUrl = await resolveRoleplayGif(cmd);
  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(`**<@${message.author.id}>** ${verb} **<@${targetId}>**! ${emoji}`)
    .setFooter({ text: `Requested by ${message.author.tag}` });
  if (gifUrl) embed.setImage(gifUrl);
  await safeReply(message, { embeds: [embed] });
  return true;
}

export async function handleFunCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "giveaway": {
      // Usage: !giveaway <time> [winners] <prize>
      // e.g.   !giveaway 10m Free Nitro
      //        !giveaway 1d 3 Giveaway Prize
      if (args.length < 2) {
        await safeReply(message, re(`Usage: \`${p}giveaway <time> [winners] <prize>\`\nExamples: \`${p}giveaway 10m Free Nitro\` · \`${p}giveaway 1d 3 Gaming Chair\``));
        return true;
      }
      const timeStr = args[0];
      const timeMatch = timeStr.match(/^(\d+)(s|m|h|d)$/i);
      if (!timeMatch) {
        await safeReply(message, re("Invalid time format. Use `10s`, `5m`, `2h`, or `1d`."));
        return true;
      }
      const amount = parseInt(timeMatch[1]);
      const unit = timeMatch[2].toLowerCase();
      const ms =
        unit === "s" ? amount * 1_000
        : unit === "m" ? amount * 60_000
        : unit === "h" ? amount * 3_600_000
        : amount * 86_400_000;

      // Optional winner count
      let winnerCount = 1;
      let prizeStart = 1;
      if (args.length >= 3 && /^\d+$/.test(args[1])) {
        winnerCount = Math.max(1, Math.min(20, parseInt(args[1])));
        prizeStart = 2;
      }
      const prize = args.slice(prizeStart).join(" ").trim();
      if (!prize) {
        await safeReply(message, re("You need to specify a prize name."));
        return true;
      }

      const endsAt = Date.now() + ms;
      const endsAtSec = Math.floor(endsAt / 1000);
      const winnerLabel = winnerCount === 1 ? "1 winner" : `${winnerCount} winners`;

      const embed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle("Giveaway")
        .setDescription(
          `**${prize}**\n\nReact with 🎉 to enter!\nEnds: <t:${endsAtSec}:R>\nWinners: **${winnerLabel}**`,
        )
        .setFooter({ text: `Hosted by ${message.author.tag}` })
        .setTimestamp(endsAt);

      const gMsg = await message.channel.send({ embeds: [embed] });
      await gMsg.react("🎉");
      await message.delete().catch(() => {});

      const gw: GiveawayData = {
        messageId: gMsg.id,
        channelId: message.channel.id,
        guildId: message.guild!.id,
        prize,
        winnerCount,
        endsAt,
        hostTag: message.author.tag,
        ended: false,
      };
      gs.giveaways.set(gMsg.id, gw);
      saveState();
      scheduleGiveaway(gw);
      console.log(`[giveaway] Started: "${prize}" (${winnerLabel}) ends in ${ms / 1000}s`);
      return true;
    }
    case "gend": {
      let gw: GiveawayData | undefined;
      const ref = parseGiveawayReference(args[0]);
      if (ref.messageId) {
        gw = gs.giveaways.get(ref.messageId) ?? await fetchGiveawayFromReference(message, ref);
      } else {
        gw = [...gs.giveaways.values()].find((g) => !g.ended && g.channelId === message.channel.id)
          ?? [...gs.giveaways.values()].find((g) => !g.ended)
          ?? await findLatestGiveawayInChannel(message);
      }
      if (!gw) {
        await safeReply(message, re(`No active giveaway found. Use \`${p}gend <message link or ID>\`, or run it in the giveaway channel.`));
        return true;
      }
      if (gw.ended) {
        await safeReply(message, re("That giveaway already looks ended. Use reroll if you want to pick new winners."));
        return true;
      }
      // Cancel scheduled timer and resolve immediately
      const timer = activeGiveawayTimers.get(gw.messageId);
      if (timer) { clearTimeout(timer); activeGiveawayTimers.delete(gw.messageId); }
      const ended = await resolveGiveaway(gw);
      if (ended) await message.react("✅").catch(() => {});
      else await safeReply(message, re("Couldn't end that giveaway. I may not be able to access the giveaway message or reaction list."));
      return true;
    }
    case "greroll": {
      let gw: GiveawayData | undefined;
      const ref = parseGiveawayReference(args[0]);
      if (ref.messageId) {
        gw = gs.giveaways.get(ref.messageId);
        if (!gw) {
          gw = await fetchGiveawayFromReference(message, ref);
        }
      } else {
        await safeReply(message, re(`Usage: \`${p}greroll <giveawayMessageId>\``));
        return true;
      }
      if (!gw) {
        await safeReply(message, re("Could not find that giveaway message."));
        return true;
      }
      const rerolled = await resolveGiveaway(gw, true);
      if (rerolled) await message.react("✅").catch(() => {});
      else await safeReply(message, re("Couldn't reroll that giveaway. I may not be able to access the giveaway message or reaction list."));
      return true;
    }
    case "repping": {
      const guild = message.guild!;
      await guild.members.fetch({ withPresences: true }).catch(() => {});
      const gsRepping = getGS(guild.id);
      if (!gsRepping.repEnabled) {
        await safeReply(message, re("Repping is currently **disabled** on this server."));
        return true;
      }
      const repping = guild.members.cache.filter(
        (m) => !m.user.bot && isRepping(m.presence, gsRepping.repKeyword),
      );
      if (repping.size === 0) {
        await safeReply(message, re("Nobody is currently repping."));
        return true;
      }
      const STATUS_DOT: Record<string, string> = { online: "", idle: "", dnd: "" };
      const STATUS_ORDER: Record<string, number> = { online: 0, idle: 1, dnd: 2 };
      const sorted = [...repping.values()].sort((a, b) => {
        const ao = STATUS_ORDER[a.presence?.status ?? ""] ?? 3;
        const bo = STATUS_ORDER[b.presence?.status ?? ""] ?? 3;
        return ao - bo;
      });
      const onlineCount = sorted.filter(m => m.presence?.status === "online").length;
      const idleCount = sorted.filter(m => m.presence?.status === "idle").length;
      const dndCount = sorted.filter(m => m.presence?.status === "dnd").length;
      const statsParts: string[] = [];
      if (onlineCount) statsParts.push(` Online: **${onlineCount}**`);
      if (idleCount) statsParts.push(` Idle: **${idleCount}**`);
      if (dndCount) statsParts.push(` DND: **${dndCount}**`);
      const statsHeader = statsParts.join("  ·  ");
      const items = sorted.map((m, i) => {
        const dot = STATUS_DOT[m.presence?.status ?? ""] ?? "";
        const statusTxt = getStatusText(m.presence);
        return `\`${String(i + 1).padStart(2, " ")}.\` ${dot} **${m.displayName}** — *${statusTxt || "no status text"}*`;
      });
      await sendPaginated(message, ` Currently Repping (${repping.size})`, items, { perPage: 10, color: 0x57f287, header: statsHeader });
      return true;
    }
    case "togglerep": {
      gs.repEnabled = !gs.repEnabled;
      saveState();
      await safeReply(message, re(`Repping is now **${gs.repEnabled ? "enabled " : "disabled "}**. ${gs.repEnabled ? "The rep role will be assigned automatically again." : "No rep roles will be assigned or pinged until re-enabled."}`));
      if (gs.repEnabled && message.guild) syncRepRoles(message.guild).catch(() => {});
      return true;
    }
    case "poll": {
      const text = args.join(" ");
      const parts = text
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 2) {
        await safeReply(message, re(`Usage: \`${p}poll Question | Option A | Option B\``));
        return true;
      }
      const [question, ...options] = parts;
      const emojis = [
        "1⃣",
        "2⃣",
        "3⃣",
        "4⃣",
        "5⃣",
        "6⃣",
        "7⃣",
        "8⃣",
        "9⃣",
        "",
      ];
      if (options.length > emojis.length) {
        await safeReply(message, re("Max 10 options."));
        return true;
      }
      const desc = options.map((opt, i) => `${emojis[i]} ${opt}`).join("\n");
      const pollMsg = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle(`${question}`)
            .setDescription(desc)
            .setFooter({ text: `Poll by ${message.author.tag}` })
            .setTimestamp(),
        ],
      });
      for (let i = 0; i < options.length; i++) {
        await pollMsg.react(emojis[i]);
        if (i < options.length - 1) await new Promise(r => setTimeout(r, 300));
      }
      await message.delete().catch(() => {});
      return true;
    }
    case "blacktea": {
      // !blacktea start — open lobby
      if (args[0]?.toLowerCase() === "start") {
        if (blackteaGames.has(message.channelId)) {
          await safeReply(message, re("A blacktea game is already running in this channel!"));
          return true;
        }
        const game: BlackteaGame = {
          phase: "lobby",
          players: [],
          currentIdx: 0,
          letters: [],
          channelId: message.channelId,
          guildId: message.guild!.id,
          joiners: new Set([message.author.id]),
          lobbyMessageId: null,
          turnTimer: null,
          lobbyTimer: null,
          usedWords: new Set(),
          turnStartedAt: 0,
          solo: false,
          score: 0,
        };
        blackteaGames.set(message.channelId, game);

        const lobbyMsg = await message.channel.send({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.tea)
            .setTitle("Blacktea — Join Now!")
            .setDescription(
              `**${message.author.username}** is starting a blacktea word game!\n\n` +
              `React with  to join. Game starts in **30 seconds**.\n\n` +
              `**Rules:**\n` +
              `• Each player gets a **3-letter sequence** and **10 seconds** per turn\n` +
              `• Type a valid English word that **contains** the sequence\n` +
              `• Wrong word or timeout =  lost\n` +
              `• 2 lives each — last player standing wins!\n` +
              `• Can't join after the game starts`
            )
            .setFooter({ text: "Minimum 2 players needed to start" })],
        });
        await lobbyMsg.react(BT_JOIN_EMOJI).catch(() => {});
        game.lobbyMessageId = lobbyMsg.id;

        game.lobbyTimer = setTimeout(async () => {
          const g = blackteaGames.get(message.channelId);
          if (!g || g.phase !== "lobby") return;
          // Fetch actual reactors from the message
          try {
            const fetchedMsg = await lobbyMsg.fetch();
            const reaction = fetchedMsg.reactions.cache.get(BT_JOIN_EMOJI);
            if (reaction) {
              const users = await reaction.users.fetch();
              users.forEach((u: User) => { if (!u.bot) g.joiners.add(u.id); });
            }
          } catch {}
          if (g.joiners.size < 2) {
            blackteaGames.delete(message.channelId);
            await (message.channel as TextChannel).send(re("Not enough players joined. The tea went cold.")).catch(() => {});
            return;
          }
          // Build player list
          for (const uid of g.joiners) {
            const member = await fetchMember(message.guild!, uid).catch(() => null);
            if (member) g.players.push({ userId: uid, tag: member.user.tag, lives: 2 });
          }
          // Shuffle
          for (let i = g.players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [g.players[i], g.players[j]] = [g.players[j], g.players[i]];
          }
          await btBegin(g, message.channel as TextChannel);
        }, BT_LOBBY_MS);

        return true;
      }

      // !blacktea stop — force end
      if (args[0]?.toLowerCase() === "stop") {
        const game = blackteaGames.get(message.channelId);
        if (!game) { await safeReply(message, re("No blacktea game is running here.")); return true; }
        if (game.turnTimer) clearTimeout(game.turnTimer);
        if (game.lobbyTimer) clearTimeout(game.lobbyTimer);
        blackteaGames.delete(message.channelId);
        await message.channel.send(re("Blacktea game ended.")).catch(() => {});
        return true;
      }

      // !blacktea [@user] — serve tea
      const target = args[0] ? `<@${args[0].replace(/[<@!>]/g, "")}>` : null;
      const responses = [
        " steeping quietly in the corner.",
        " black tea, no milk, no sugar, no nonsense.",
        " hot, dark, and slightly bitter — just how we like it.",
        " your black tea is ready. nobody was invited.",
        " one cup of black tea, served with silence.",
        " no milk. no sugar. just vibes and tannins.",
        " black tea hours. do not disturb.",
      ];
      const btResponse = responses[Math.floor(Math.random() * responses.length)];
      await safeReply(message, {
        embeds: [new EmbedBuilder()
          .setColor(COLORS.tea)
          .setDescription(target ? `${target} ${btResponse}` : btResponse)],
      });
      return true;
    }
    case "8ball": {
      const question = args.join(" ");
      if (!question) {
        await safeReply(message, re(`Ask me something. Usage: \`${p}8ball will it rain tomorrow?\``));
        return true;
      }
      const answers = [
        " It is certain.",
        " It is decidedly so.",
        " Without a doubt.",
        " Yes, definitely.",
        " You may rely on it.",
        " As I see it, yes.",
        " Most likely.",
        " Outlook good.",
        " Yes.",
        " Signs point to yes.",
        " Reply hazy, try again.",
        " Ask again later.",
        " Better not tell you now.",
        " Cannot predict now.",
        " Concentrate and ask again.",
        " Don't count on it.",
        " My reply is no.",
        " My sources say no.",
        " Outlook not so good.",
        " Very doubtful.",
      ];
      const answer = answers[Math.floor(Math.random() * answers.length)];
      await safeReply(message, {
        embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Magic 8-Ball")
          .addFields(
            { name: "Question", value: question },
            { name: "Answer", value: answer },
          )],
      });
      return true;
    }
    case "flip": {
      const result = Math.random() < 0.5 ? " **Heads!**" : " **Tails!**";
      await safeReply(message, re(result));
      return true;
    }
    case "roll": {
      const sides = parseInt(args[0]) || 6;
      if (sides < 2 || sides > 1000) {
        await safeReply(message, re("Pick a number of sides between 2 and 1000."));
        return true;
      }
      const rolled = Math.floor(Math.random() * sides) + 1;
      await safeReply(message, re(`You rolled a **${rolled}** (d${sides})`));
      return true;
    }
    case "hug":
    case "kiss":
    case "cuddle":
    case "handhold":
    case "wave":
    case "highfive":
      return handleRoleplay(cmd, args, message);
    case "pat":
    case "poke":
    case "lick":
    case "bite":
    case "slap":
    case "punch":
    case "bonk":
    case "yeet":
    case "kill":
      return handleRoleplay(cmd, args, message);
    // ── extra waifu.pics roleplay ────────────────────────────────────────────
    case "glomp":
    case "nom":
    case "bully":
    case "smug":
    case "cry":
    case "blush":
    case "smile":
    case "wink":
    case "dance":
    case "cringe":
    case "awoo":
      return handleRoleplay(cmd, args, message);
    // ── nekos.best roleplay ──────────────────────────────────────────────────
    case "tickle":
    case "baka":
    case "stare":
    case "feed":
    case "peck":
    case "run":
      return handleRoleplay(cmd, args, message);
    // ── lewd / troll roleplay (tenor, medium filter) ─────────────────────────
    case "fuck":
    case "spank":
    case "nuzzle":
    case "grope":
    case "seduce":
      return handleRoleplay(cmd, args, message);
    case "rps": {
      const choices = ["rock", "paper", "scissors"] as const;
      type RPS = typeof choices[number];
      const userChoice = args[0]?.toLowerCase() as RPS | undefined;
      if (!userChoice || !choices.includes(userChoice)) {
        await safeReply(message, re(`Usage: \`${p}rps rock\`, \`${p}rps paper\`, or \`${p}rps scissors\``));
        return true;
      }
      const botChoice = choices[Math.floor(Math.random() * 3)];
      const emojis: Record<RPS, string> = { rock: "", paper: "", scissors: "" };
      let outcome: string;
      if (userChoice === botChoice) {
        outcome = "It's a **tie!**";
      } else if (
        (userChoice === "rock" && botChoice === "scissors") ||
        (userChoice === "paper" && botChoice === "rock") ||
        (userChoice === "scissors" && botChoice === "paper")
      ) {
        outcome = "You **win!** ";
      } else {
        outcome = "You **lose!** ";
      }
      await safeReply(message, {
        embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Rock Paper Scissors")
          .setDescription(`${emojis[userChoice]} vs ${emojis[botChoice]}\n\n${outcome}`)],
      });
      return true;
    }
    case "ship": {
      const id1 = args[0]?.replace(/[<@!>]/g, "") || message.author.id;
      const id2 = args[1]?.replace(/[<@!>]/g, "");
      if (!id2) {
        await safeReply(message, re(`Usage: \`${p}ship @user1 @user2\``));
        return true;
      }
      const seed = [...(id1 + id2)].reduce((a, c) => a + c.charCodeAt(0), 0);
      const pct = seed % 101;
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      let label: string;
      if (pct < 20) label = " Absolutely not.";
      else if (pct < 40) label = " Unlikely.";
      else if (pct < 60) label = " Maybe?";
      else if (pct < 80) label = " Looking good!";
      else label = "‍ Perfect match!";
      await safeReply(message, {
        embeds: [new EmbedBuilder()
          .setColor(COLORS.special)
          .setTitle("Ship-o-meter")
          .setDescription(`<@${id1}> + <@${id2}>\n\n\`[${bar}]\` **${pct}%**\n\n${label}`)],
      });
      return true;
    }
    case "pick": {
      const raw = args.join(" ");
      if (!raw) {
        await safeReply(message, re(`Usage: \`${p}choose pizza | tacos | sushi\``));
        return true;
      }
      const options = raw.split("|").map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) {
        await safeReply(message, re("Give me at least two options separated by \`|`"));
        return true;
      }
      const chosen = options[Math.floor(Math.random() * options.length)];
      await safeReply(message, re(`I choose: **${chosen}**`));
      return true;
    }
    case "pp": {
      const targetId = args[0]?.replace(/[<@!>]/g, "") || message.author.id;
      let pp: string;
      if (isOwner(targetId)) {
        pp = "8" + "=".repeat(30) + "D";
      } else {
        const seed = [...targetId].reduce((a, c) => a + c.charCodeAt(0), 0);
        const size = seed % 10;
        pp = "8" + "=".repeat(size) + "D";
      }
      await safeReply(message, re(`<@${targetId}>'s pp:\n\`${pp}\``));
      return true;
    }
    case "roast": {
      const targetId = args[0]?.replace(/[<@!>]/g, "");
      const target = targetId ? `<@${targetId}>` : `<@${message.author.id}>`;
      const roasts = [
        "has the personality of a wet sock.",
        "is the human equivalent of a participation trophy.",
        "brings everyone together — everyone who sees them immediately bonds over how bad their vibes are.",
        "is living proof that evolution can go in reverse.",
        "has an IQ lower than the number of friends they have.",
        "if they were any more useless, they'd need to be watered twice a week.",
        "is the reason we have instructions on shampoo bottles.",
        "could trip over a wireless internet connection.",
        "has a face that could make a train take a dirt road.",
        "is like a software update — whenever you see them, you immediately think 'not now'.",
      ];
      const roast = roasts[Math.floor(Math.random() * roasts.length)];
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(` ${target} ${roast}`)] });
      return true;
    }
    case "compliment": {
      const targetId = args[0]?.replace(/[<@!>]/g, "");
      const target = targetId ? `<@${targetId}>` : `<@${message.author.id}>`;
      const compliments = [
        "radiates main character energy.",
        "is genuinely one of the best people in this server.",
        "could make anyone's day better just by existing.",
        "has an impressive ability to make everything look effortless.",
        "is the human equivalent of a warm cup of tea on a rainy day.",
        "makes the server 100% more interesting just by being here.",
        "has big 'the one everyone lowkey looks up to' energy.",
        "is the real MVP and everyone knows it.",
        "has immaculate vibes, no notes.",
        "carries this entire server on their back and makes it look easy.",
      ];
      const compliment = compliments[Math.floor(Math.random() * compliments.length)];
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(` ${target} ${compliment}`)] });
      return true;
    }
    case "iq": {
      const targetId = args[0]?.replace(/[<@!>]/g, "") || message.author.id;
      let iq: number;
      if (isOwner(targetId)) {
        iq = 200;
      } else {
        const seed = [...targetId].reduce((a, c) => a + c.charCodeAt(0), 0);
        iq = 60 + (seed % 80);
      }
      let label: string;
      if (iq >= 200) label = " Off the charts. Scientists are baffled.";
      else if (iq >= 180) label = " Transcendent genius.";
      else if (iq >= 140) label = " Gifted.";
      else if (iq >= 120) label = " Above average.";
      else if (iq >= 100) label = " Average.";
      else if (iq >= 80)  label = " Below average.";
      else                label = " Concerningly low.";
      await safeReply(message, re(`<@${targetId}>'s IQ: **${iq}** — ${label}`));
      return true;
    }
    case "rizz": {
      const targetId = args[0]?.replace(/[<@!>]/g, "") || message.author.id;
      let pct: number;
      if (isOwner(targetId)) {
        pct = 97 + Math.floor(Math.random() * 3);
      } else {
        const seed = [...targetId].reduce((a, c) => a + c.charCodeAt(0), 0);
        pct = seed % 101;
      }
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      let label: string;
      if (pct >= 90)      label = " Unmatched. Certified rizzler.";
      else if (pct >= 70) label = " Solid rizz.";
      else if (pct >= 50) label = " Decent.";
      else if (pct >= 30) label = " Needs work.";
      else                label = " Negative rizz. It's bad.";
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setDescription(` <@${targetId}>'s rizz:\n\`[${bar}]\` **${pct}%**\n${label}`)] });
      return true;
    }
    case "sus": {
      const targetId = args[0]?.replace(/[<@!>]/g, "") || message.author.id;
      const seed = [...targetId].reduce((a, c) => a + c.charCodeAt(0), 0);
      const pct = seed % 101;
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      const label = pct >= 80 ? " Eject them NOW." : pct >= 60 ? " Pretty sus ngl." : pct >= 40 ? " Kinda sus." : " Probably innocent.";
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(` <@${targetId}>'s sus level:\n\`[${bar}]\` **${pct}%**\n${label}`)] });
      return true;
    }
    case "mock": {
      const text = args.join(" ");
      if (!text) { await safeReply(message, re(`Usage: \`${p}mock some text here\``)); return true; }
      const mocked = [...text].map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join("");
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription(` \`${mocked}\``)] });
      return true;
    }
    case "reverse": {
      const text = args.join(" ");
      if (!text) { await safeReply(message, re(`Usage: \`${p}reverse some text\``)); return true; }
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setDescription(` \`${[...text].reverse().join("")}\``)] });
      return true;
    }
    case "fact": {
      const facts = [
        "A group of flamingos is called a `flamboyance'.",
        "Honey never spoils. Archaeologists found 3000-year-old honey in Egyptian tombs.",
        "A day on Venus is longer than a year on Venus.",
        "Octopuses have three hearts, blue blood, and nine brains.",
        "The shortest war in history lasted 38–45 minutes (Anglo-Zanzibar War, 1896).",
        "Wombats produce cube-shaped poop. Scientists still aren't fully sure why.",
        "A shrimp's heart is in its head.",
        "The world's oldest known living tree is over 5,000 years old.",
        "Bananas are slightly radioactive.",
        "There are more possible iterations of a game of chess than there are atoms in the observable universe.",
        "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.",
        "The moon is slowly drifting away from Earth at about 3.8 cm per year.",
        "Crows can recognize human faces and hold grudges.",
        "A single bolt of lightning contains enough energy to toast 100,000 slices of bread.",
        "The average person walks about 100,000 miles in their lifetime.",
      ];
      const fact = facts[Math.floor(Math.random() * facts.length)];
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("Fun Fact").setDescription(fact)] });
      return true;
    }
    case "joke": {
      const jokes: [string, string][] = [
        ["Why don't scientists trust atoms?", "Because they make up everything."],
        ["What do you call a fake noodle?", "An impasta."],
        ["Why did the scarecrow win an award?", "He was outstanding in his field."],
        ["I told my wife she was drawing her eyebrows too high.", "She looked surprised."],
        ["Why can't you give Elsa a balloon?", "Because she'll let it go."],
        ["What's a vampire's favourite fruit?", "A blood orange."],
        ["I used to hate facial hair, but then it grew on me.", ""],
        ["Why did the bicycle fall over?", "It was two-tired."],
        ["What do you call cheese that isn't yours?", "Nacho cheese."],
        ["How does the ocean say hi?", "It waves."],
        ["Why do cows wear bells?", "Because their horns don't work."],
        ["I'm reading a book about anti-gravity.", "It's impossible to put down."],
      ];
      const [setup, punchline] = jokes[Math.floor(Math.random() * jokes.length)];
      const embed = new EmbedBuilder().setColor(COLORS.warning).setTitle("Joke").setDescription(punchline ? `${setup}\n\n||${punchline}||` : `||${setup}||`);
      await safeReply(message, { embeds: [embed] });
      return true;
    }
    case "ratio": {
      const targetId = args[0]?.replace(/[<@!>]/g, "");
      const target = targetId ? `<@${targetId}>` : null;
      if (!target) { await safeReply(message, re(`Usage: \`${p}ratio @user\``)); return true; }
      await safeReply(message, re(`ratio + L + no ${target}`));
      return true;
    }
    case "steal": {
      const targetId = args[0]?.replace(/[<@!>]/g, "");
      const target = targetId ? `<@${targetId}>` : "the void";
      await safeReply(message, re(`<@${message.author.id}> stole ${target}'s heart.`));
      return true;
    }
    case "would": {
      const thing = args.join(" ");
      if (!thing) { await safeReply(message, re(`Usage: \`${p}would eat a spider\``)); return true; }
      const result = Math.random() < 0.5 ? " **Would.**" : " **Would not.**";
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setDescription(`${result}\n\n*${thing}*`)] });
      return true;
    }

    case "birthday": {
      const sub = args[0]?.toLowerCase();
      if (sub === "set") {
        const raw = args[1];
        if (!raw || !/^\d{1,2}-\d{1,2}$/.test(raw)) {
          await safeReply(message, re(`Usage: \`${p}birthday set MM-DD\` — e.g. \`${p}birthday set 03-15\``));
          return true;
        }
        const [month, day] = raw.split("-").map(Number);
        if (month < 1 || month > 12 || day < 1 || day > 31) {
          await safeReply(message, re("Invalid date. Month must be 1–12, day must be 1–31."));
          return true;
        }
        const formatted = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        gs.birthdays.set(message.author.id, formatted);
        saveState();
        await safeReply(message, re(`Your birthday has been set to **${formatted}**!`));
        return true;
      }
      if (sub === "remove") {
        gs.birthdays.delete(message.author.id);
        saveState();
        await safeReply(message, re("Your birthday has been removed."));
        return true;
      }
      if (sub === "channel") {
        const channelId = args[1]?.replace(/[<#>]/g, "");
        if (args[1]?.toLowerCase() === "off") {
          gs.birthdayChannelId = null;
          saveState();
          await safeReply(message, re("Birthday announcements disabled."));
          return true;
        }
        if (!channelId) {
          await safeReply(message, re(`Birthday channel: ${gs.birthdayChannelId ? `<#${gs.birthdayChannelId}>` : "not set"}\nUse \`${p}birthday channel #ch\` to set, \`${p}birthday channel off\` to disable.`));
          return true;
        }
        gs.birthdayChannelId = channelId;
        saveState();
        await safeReply(message, re(`Birthday announcements will be sent to <#${channelId}>.`));
        return true;
      }
      if (sub === "today") {
        const now = new Date();
        const todayKey = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const todayBdays = [...gs.birthdays.entries()].filter(([, d]) => d === todayKey);
        if (todayBdays.length === 0) {
          await safeReply(message, re("No birthdays today."));
          return true;
        }
        await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle("Today's Birthdays!").setDescription(todayBdays.map(([id]) => `<@${id}>`).join("\n"))] });
        return true;
      }
      if (sub === "list") {
        if (gs.birthdays.size === 0) {
          await safeReply(message, re("No birthdays registered yet."));
          return true;
        }
        const sorted = [...gs.birthdays.entries()].sort(([, a], [, b]) => a.localeCompare(b));
        const items = sorted.map(([id, date]) => `**${date}** — <@${id}>`);
        await sendPaginated(message, ` Birthdays (${items.length})`, items, { perPage: 15, color: 0xff6b6b });
        return true;
      }
      const myBday = gs.birthdays.get(message.author.id);
      await safeReply(message, re(`**Birthday commands:**\n\`${p}birthday set MM-DD\` — set your birthday\n\`${p}birthday remove\` — remove your birthday\n\`${p}birthday today\` — see today's birthdays\n\`${p}birthday list\` — see all birthdays\n\`${p}birthday channel #ch\` — set announcement channel\n\n${myBday ? `Your birthday is set to **${myBday}**.` : `You haven't set your birthday yet.`}`));
      return true;
    }
    case "trivia": {
      const TRIVIA: { q: string; options: string[]; answer: number }[] = [
        { q: "What is the capital of France?", options: ["London", "Paris", "Berlin", "Madrid"], answer: 1 },
        { q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
        { q: "What element has the chemical symbol 'O'?", options: ["Gold", "Osmium", "Oxygen", "Oganesson"], answer: 2 },
        { q: "Which planet is closest to the Sun?", options: ["Venus", "Earth", "Mars", "Mercury"], answer: 3 },
        { q: "What is 7 × 8?", options: ["54", "56", "58", "64"], answer: 1 },
        { q: "Who wrote Romeo and Juliet?", options: ["Dickens", "Tolstoy", "Shakespeare", "Twain"], answer: 2 },
        { q: "What year did World War II end?", options: ["1943", "1944", "1945", "1946"], answer: 2 },
        { q: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
        { q: "How many colors are in a rainbow?", options: ["5", "6", "7", "8"], answer: 2 },
        { q: "What is the speed of light (approx.)?", options: ["300,000 km/s", "150,000 km/s", "500,000 km/s", "1,000,000 km/s"], answer: 0 },
        { q: "Which animal is the fastest on land?", options: ["Lion", "Horse", "Cheetah", "Greyhound"], answer: 2 },
        { q: "What is the smallest country in the world?", options: ["Monaco", "Liechtenstein", "Vatican City", "San Marino"], answer: 2 },
        { q: "What gas do plants absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: 2 },
        { q: "How many bones does an adult human body have?", options: ["196", "206", "216", "226"], answer: 1 },
        { q: "Which element has the atomic number 1?", options: ["Helium", "Lithium", "Hydrogen", "Carbon"], answer: 2 },
        { q: "What is the longest river in the world?", options: ["Amazon", "Yangtze", "Mississippi", "Nile"], answer: 3 },
        { q: "In what year did the Titanic sink?", options: ["1910", "1912", "1914", "1916"], answer: 1 },
        { q: "What programming language is Discord.js written in?", options: ["Python", "JavaScript", "Go", "Rust"], answer: 1 },
        { q: "What does 'HTTP' stand for?", options: ["HyperText Transfer Protocol", "High Text Transfer Protocol", "HyperText Transition Process", "Host Text Transfer Port"], answer: 0 },
        { q: "How many continents are there on Earth?", options: ["5", "6", "7", "8"], answer: 2 },
      ];
      const q = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
      const emojis = ["", "", "", ""];
      const desc = q.options.map((opt, i) => `${emojis[i]} **${opt}**`).join("\n");
      const embed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle("Trivia Time!")
        .setDescription(`**${q.q}**\n\n${desc}`)
        .setFooter({ text: "You have 15 seconds!" })
        .setTimestamp();
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        q.options.map((opt, i) =>
          new ButtonBuilder().setCustomId(`trivia_${i}`).setLabel(opt).setStyle(ButtonStyle.Primary)
        )
      );
      const sent = await (message.channel as TextChannel).send({ embeds: [embed], components: [row] });
      const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 15_000 });
      const answered = new Set<string>();
      collector.on("collect", async (i) => {
        if (answered.has(i.user.id)) {
          await i.reply({ ...re("You already answered!"), ephemeral: true });
          return;
        }
        answered.add(i.user.id);
        const chosen = parseInt(i.customId.split("_")[1]);
        const correct = chosen === q.answer;
        await i.reply({ ...(correct ? re(`Correct, <@${i.user.id}>! The answer is **${q.options[q.answer]}**.`) : re(`Wrong, <@${i.user.id}>! The correct answer is **${q.options[q.answer]}**.`)) });
      });
      collector.on("end", async () => {
        const finalEmbed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle("Trivia — Time's Up!")
          .setDescription(`**${q.q}**\n\n${q.options.map((o, i) => `${i === q.answer ? "" : ""} **${o}**`).join("\n")}\n\nCorrect: **${q.options[q.answer]}**`)
          .setTimestamp();
        await sent.edit({ embeds: [finalEmbed], components: [] }).catch(() => {});
      });
      return true;
    }
    case "wordle": {
      const WORDLE_WORDS = [
        "CRANE", "SLATE", "AUDIO", "STARE", "RAISE", "AROSE", "OUTRE", "PRIDE", "STORE",
        "SCORE", "STORM", "BRAVE", "TRACE", "GRACE", "PLACE", "PLANE", "PLATE", "GLOBE",
        "GLARE", "FLARE", "FLAME", "FRAME", "GRAPE", "GRAZE", "GRAVE", "GRIPE", "GRIME",
        "PRIME", "PRICE", "PRISE", "PROSE", "PROVE", "PRUDE", "PRUNE", "PULSE", "PURSE",
        "QUAKE", "QUEUE", "QUIRK", "QUITE", "QUOTE", "RABBI", "RADAR", "RADIO", "RAMEN",
        "RANCH", "RANGE", "RAPID", "RAVEN", "REACH", "REALM", "REBEL", "RELAX", "REMIX",
        "RIDER", "RIDGE", "RISKY", "RIVAL", "RIVER", "ROBIN", "ROCKY", "ROUGE", "ROUGH",
        "ROUND", "ROYAL", "RUGBY", "RULER", "RUSTY", "SABER", "SADLY", "SAINT", "SALAD",
        "SAUCE", "SCALE", "SCENE", "SCOUT", "SCREW", "SENSE", "SERVE", "SHADE", "SHAKE",
        "SHALL", "SHAME", "SHAPE", "SHARE", "SHARK", "SHARP", "SHINE", "SHIRT", "SHOCK",
        "SHORE", "SHORT", "SHOUT", "SKILL", "SKULL", "SKUNK", "SLANT", "SLAVE", "SLEEK",
        "SLEEP", "SLICE", "SLIDE", "SLOPE", "SLOTH", "SMALL", "SMASH", "SMELL", "SMILE",
        "SMIRK", "SMOKE", "SNACK", "SNAKE", "SNARE", "SNEAK", "SOLAR", "SOLID", "SOLVE",
        "SONIC", "SOUTH", "SPACE", "SPARE", "SPARK", "SPEAK", "SPEAR", "SPICE", "SPIKE",
        "SPINE", "SPITE", "SPLIT", "SPOKE", "SPOOK", "SPOON", "SPORT", "SPOUT", "SQUAD",
        "SQUAT", "SQUID", "STAFF", "STAGE", "STAIN", "STALE", "STALK", "STAMP", "STAND",
        "STANK", "STARK", "START", "STATE", "STAYS", "STEAK", "STEAM", "STEEL", "STEEP",
        "STERN", "STICK", "STING", "STINK", "STOMP", "STONE", "STOOL", "STOOP", "STRAP",
        "STRAY", "STRIP", "STUCK", "STUDY", "STUFF", "STUMP", "STUNG", "STUNK", "STUNT",
        "SWAMP", "SWEAR", "SWEAT", "SWEEP", "SWEET", "SWEPT", "SWIFT", "SWIPE", "SWIRL",
        "TABLE", "TALON", "TANGO", "TAPIR", "TAUNT", "TENSE", "TERMS", "THANE", "THANK",
        "THEME", "THICK", "THING", "THINK", "THORN", "THOSE", "THREE", "THREW", "THROW",
        "THUMB", "TIGER", "TIGHT", "TIMED", "TIMER", "TIRED", "TOAST", "TODAY", "TOKEN",
        "TONIC", "TORSO", "TOTAL", "TOUCH", "TOUGH", "TOWEL", "TOWER", "TOXIC", "TRACK",
        "TRADE", "TRAIL", "TRAIN", "TRAIT", "TRAMP", "TRASH", "TREAD", "TREAT", "TREND",
        "TRICK", "TRIED", "TROOP", "TROUT", "TRUCK", "TRULY", "TRUNK", "TRUST", "TRUTH",
        "TULIP", "TUMOR", "TUNER", "TUNIC", "TWIST", "TYPED", "ULCER", "ULTRA", "UNCLE",
        "UNIFY", "UNION", "UNITE", "UNITY", "UNTIL", "UPPER", "UPSET", "URBAN", "USUAL",
        "USURP", "UTTER", "VALID", "VALUE", "VALVE", "VAPOR", "VAULT", "VENOM", "VERSE",
        "VIBES", "VIDEO", "VIGOR", "VIOLA", "VIPER", "VIRAL", "VISIT", "VISTA", "VITAL",
        "VIVID", "VOCAL", "VOICE", "VOTED", "VOWEL", "VULVA", "WAGER", "WALTZ", "WASTE",
        "WATCH", "WATER", "WEARY", "WEDGE", "WEIRD", "WHALE", "WHEAT", "WHEEL", "WHERE",
        "WHICH", "WHILE", "WHITE", "WHOLE", "WHOSE", "WIDER", "WITCH", "WOMAN", "WORLD",
        "WORRY", "WORSE", "WORST", "WORTH", "WOULD", "WRATH", "WRIST", "WROTE", "YACHT",
        "YEARN", "YIELD", "YOUNG", "YOUTH", "ZESTY", "ZILCH", "ZONAL", "ZONED",
      ];
      if (wordleGames.has(message.channelId)) {
        const g = wordleGames.get(message.channelId)!;
        await safeReply(message, re(`A Wordle game is already running in this channel! Word has **${g.word.length}** letters. Type a 5-letter guess.`));
        return true;
      }
      const word = WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)];
      const game: WordleGame = { word, guesses: [], channelId: message.channelId, guildId: guild.id, startedBy: message.author.id, maxGuesses: 6, messageId: null };
      wordleGames.set(message.channelId, game);
      const buildWordleEmbed = (g: typeof game) => {
        const EMPTY = "";
        const rows: string[] = [];
        for (let i = 0; i < g.maxGuesses; i++) {
          if (i < g.guesses.length) {
            const guess = g.guesses[i].toUpperCase();
            let row = "";
            const remaining = [...g.word];
            const result: string[] = Array(5).fill("");
            for (let j = 0; j < 5; j++) {
              if (guess[j] === g.word[j]) { result[j] = ""; remaining[j] = ""; }
            }
            for (let j = 0; j < 5; j++) {
              if (result[j] !== "") {
                const idx = remaining.indexOf(guess[j]);
                if (idx !== -1) { result[j] = ""; remaining[idx] = ""; }
              }
            }
            row = result.join("") + "  `" + guess + "`";
            rows.push(row);
          } else {
            rows.push("");
          }
        }
        const won = g.guesses.length > 0 && g.guesses[g.guesses.length - 1].toUpperCase() === g.word;
        const lost = !won && g.guesses.length >= g.maxGuesses;
        return new EmbedBuilder()
          .setColor(won ? 0x57f287 : lost ? 0xed4245 : 0x5865f2)
          .setTitle("Wordle")
          .setDescription(rows.join("\n") + (won ? `\n\n **<@${g.startedBy}> got it in ${g.guesses.length}!**` : lost ? `\n\n **The word was \`${g.word}\`**` : `\n\nGuess ${g.guesses.length + 1} of ${g.maxGuesses} — type a 5-letter word!`)  )
          .setFooter({ text: `Started by ${message.author.tag}` })
          .setTimestamp();
      };
      const sent = await (message.channel as TextChannel).send({ embeds: [buildWordleEmbed(game)] });
      game.messageId = sent.id;
      const collector = (message.channel as TextChannel).createMessageCollector({
        filter: (m) => !m.author.bot && /^[a-zA-Z]{5}$/.test(m.content.trim()),
        time: 5 * 60 * 1000,
      });
      collector.on("collect", async (m) => {
        const g = wordleGames.get(message.channelId);
        if (!g) { collector.stop(); return; }
        const guess = m.content.trim().toUpperCase();
        if (!WORDLE_WORDS.includes(guess)) {
          await m.react("❌").catch(() => {});
          return;
        }
        g.guesses.push(guess);
        const won = guess === g.word;
        const lost = !won && g.guesses.length >= g.maxGuesses;
        const embed = buildWordleEmbed(g);
        if (g.messageId) {
          const ref = await (message.channel as TextChannel).messages.fetch(g.messageId).catch(() => null);
          if (ref) await ref.edit({ embeds: [embed] }).catch(() => {});
        }
        if (won || lost) {
          wordleGames.delete(message.channelId);
          collector.stop();
        }
      });
      collector.on("end", () => { wordleGames.delete(message.channelId); });
      return true;
    }
    case "truth": {
      const truths = [
        "What's the most embarrassing thing you've done in public?",
        "What's the biggest lie you've told your parents?",
        "What's a secret you've never told anyone?",
        "What's the most childish thing you still do?",
        "What's the last thing you lied about?",
        "Have you ever blamed someone else for something you did?",
        "What's your most embarrassing childhood memory?",
        "What's the pettiest reason you've unfriended someone?",
        "What's the weirdest thing you've searched for online?",
        "Have you ever ghosted someone? Who and why?",
        "What's the biggest mistake you've made in a relationship?",
        "What's something you pretend to like but actually hate?",
        "What's the longest you've gone without a shower?",
        "What's the most cringe thing in your camera roll right now?",
        "Have you ever pretended to be sick to avoid something? What was it?",
      ];
      const truth = truths[Math.floor(Math.random() * truths.length)];
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("Truth").setDescription(truth)] });
      return true;
    }
    case "dare": {
      const dares = [
        "Send a voice message saying something embarrassing.",
        "Change your nickname to something chosen by the last person who messaged.",
        "Write a haiku about the last thing you ate.",
        "Send the last photo in your camera roll (nothing NSFW!).",
        "DM someone you haven't talked to in a while with just ''.",
        "Type a message using only emoji for the next 3 messages.",
        "Write a dramatic one-sentence story using everyone's names in the chat.",
        "Roast the person above you in the chat.",
        "Compliment every person currently online in the server.",
        "Send a voice message singing the first line of a song.",
        "Change your avatar to something suggested by the chat for 10 minutes.",
        "Write a fake Wikipedia intro about yourself.",
        "Send the most recent meme you have saved.",
        "List three facts about yourself, two true and one false.",
        "React to the last 5 messages in the chat with random emoji.",
      ];
      const dare = dares[Math.floor(Math.random() * dares.length)];
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle("Dare").setDescription(dare)] });
      return true;
    }
    case "dog": {
      try {
        const url = await new Promise<string>((resolve, reject) => {
          https.get("https://dog.ceo/api/breeds/image/random", (res) => {
            let data = "";
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => {
              try { resolve(JSON.parse(data).message); } catch { reject(new Error("parse")); }
            });
          }).on("error", reject);
        });
        await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle("Random Dog!").setImage(url).setTimestamp()] });
      } catch {
        await safeReply(message, re("Couldn't fetch a dog right now. Try again!"));
      }
      return true;
    }
    case "cat": {
      try {
        const url = await new Promise<string>((resolve, reject) => {
          https.get("https://api.thecatapi.com/v1/images/search", (res) => {
            let data = "";
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => {
              try { resolve(JSON.parse(data)[0].url); } catch { reject(new Error("parse")); }
            });
          }).on("error", reject);
        });
        await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.special).setTitle("Random Cat!").setImage(url).setTimestamp()] });
      } catch {
        await safeReply(message, re("Couldn't fetch a cat right now. Try again!"));
      }
      return true;
    }
    case "translate": {
      // Detect whether the first arg is a language code (2-5 letter/hyphen tag)
      const langCodeRx = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;
      const firstIsLang = args.length > 0 && langCodeRx.test(args[0]);

      let targetLang = "en";
      let text = "";

      if (firstIsLang) {
        targetLang = args[0].toLowerCase();
        text = args.slice(1).join(" ").trim();
      } else {
        text = args.join(" ").trim();
      }

      // If no text was typed, try the replied-to message
      if (!text && message.reference?.messageId) {
        const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        if (refMsg) text = refMsg.content.trim();
      }

      if (!text) {
        await safeReply(message, re(`Usage:\n\`${p}translate <text>\` — auto-translate to English\n\`${p}translate <lang> <text>\` — translate to a specific language\nReply to any message with \`${p}translate\` to translate it to English.\nCommon codes: \`es\` Spanish · \`fr\` French · \`de\` German · \`ja\` Japanese · \`pt\` Portuguese · \`zh\` Chinese · \`it\` Italian · \`ko\` Korean · \`ru\` Russian`));
        return true;
      }

      try {
        const result = await new Promise<string>((resolve, reject) => {
          https.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`, (res) => {
            let data = "";
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => {
              try {
                const parsed = JSON.parse(data);
                if (parsed.responseStatus === 200) {
                  resolve(parsed.responseData.translatedText);
                } else {
                  reject(new Error(parsed.responseMessage ?? "API error"));
                }
              } catch { reject(new Error("parse")); }
            });
          }).on("error", reject);
        });
        await safeReply(message, { embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Translation")
          .addFields(
            { name: "Original", value: text.slice(0, 1024), inline: false },
            { name: `Translated (${targetLang})`, value: result.slice(0, 1024), inline: false },
          )
          .setTimestamp()] });
      } catch (err: any) {
        await safeReply(message, re(`Translation failed: ${err?.message ?? "unknown error"}. Check the language code and try again.`));
      }
      return true;
    }

    case "ttt": {
      const TTT_X = "❌";
      const TTT_O = "⭕";
      const TTT_BLANK = "⬜";
      const buildTTTRows = (board: (string | null)[], gameId: string, disabled: boolean) => {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        for (let r = 0; r < 3; r++) {
          const row = new ActionRowBuilder<ButtonBuilder>();
          for (let c = 0; c < 3; c++) {
            const idx = r * 3 + c;
            const cell = board[idx];
            const btn = new ButtonBuilder()
              .setCustomId(`ttt:${gameId}:${idx}`)
              .setLabel(cell === "X" ? TTT_X : cell === "O" ? TTT_O : TTT_BLANK)
              .setStyle(cell === "X" ? ButtonStyle.Danger : cell === "O" ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(disabled || cell !== null);
            row.addComponents(btn);
          }
          rows.push(row);
        }
        return rows;
      };
      const checkTTTWin = (board: (string | null)[]): string | null => {
        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        for (const [a,b,c] of wins) {
          if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]!;
        }
        return null;
      };
      const target = message.mentions.users.first();
      if (!target || target.bot || target.id === message.author.id) {
        await safeReply(message, re("Mention a valid user to challenge to tic-tac-toe."));
        return true;
      }
      const existingForChannel = [...tttGames.values()].find(g => g.channelId === message.channelId);
      if (existingForChannel) {
        await safeReply(message, re("There's already a tic-tac-toe game running in this channel."));
        return true;
      }
      const gameId = `${message.channelId}-${Date.now()}`;
      const game: import("../../types.js").TicTacToeGame = {
        board: Array(9).fill(null),
        playerX: message.author.id,
        playerO: target.id,
        turn: message.author.id,
        messageId: null,
        channelId: message.channelId,
        guildId: message.guildId!,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle("Tic-Tac-Toe")
        .setDescription(`${TTT_X} <@${game.playerX}> vs ${TTT_O} <@${game.playerO}>\n\n**Turn:** <@${game.turn}>`)
        .setFooter({ text: "Game expires in 5 minutes" });
      const sent = await (message.channel as TextChannel).send({ embeds: [embed], components: buildTTTRows(game.board, gameId, false) });
      game.messageId = sent.id;
      tttGames.set(gameId, game);
      return true;
    }

    case "google": {
      const query = args.join(" ").trim();
      if (!query) {
        await safeReply(message, re(`Provide a search query. Usage: \`${p}google <query>\``));
        return true;
      }
      try {
        const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=octoberdiscordbot`);
        const ddg = await ddgRes.json() as any;
        const embed = new EmbedBuilder().setColor(COLORS.google).setTitle(`Search: ${query.slice(0, 200)}`).setURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
        const lines: string[] = [];
        if (ddg.AbstractText) lines.push(`**${ddg.Heading || query}**\n${ddg.AbstractText.slice(0, 500)}`);
        const topics: { Text: string; FirstURL: string }[] = (ddg.RelatedTopics ?? []).filter((t: any) => t.Text && t.FirstURL).slice(0, 5);
        if (topics.length) {
          lines.push("\n**Results:**");
          for (const t of topics) lines.push(`• [${t.Text.slice(0, 100)}](${t.FirstURL})`);
        }
        if (!lines.length) {
          lines.push(`No instant results found. [Search on Google](https://www.google.com/search?q=${encodeURIComponent(query)})`);
        }
        embed.setDescription(lines.join("\n").slice(0, 4000));
        if (ddg.Image) embed.setThumbnail(`https://duckduckgo.com${ddg.Image}`);
        await safeReply(message, { embeds: [embed] });
      } catch {
        await safeReply(message, re("Search failed. Try again later."));
      }
      return true;
    }

    case "roblox": {
      // ─── subcommand: roblox rap <username> ───────────────────────────────
      if (args[0]?.toLowerCase() === "rap") {
        const rapUsername = args[1];
        if (!rapUsername) {
          await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(`<@${message.author.id}>: Please provide a Roblox username\nUse: \`${p}roblox rap (username)\``)] });
          return true;
        }
        try {
          const srRes = await fetch(`https://users.roblox.com/v1/usernames/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames: [rapUsername], excludeBannedUsers: false }),
          });
          const srData = await srRes.json() as { data: { id: number; name: string; displayName: string }[] };
          if (!srData.data?.length) {
            await safeReply(message, re(`No Roblox user found with the username **${rapUsername}**.`));
            return true;
          }
          const { id: rapUserId, name: rapExactName, displayName: rapDisplayName } = srData.data[0];

          // fetch collectibles + rolimons in parallel
          const [collectiblesRes, rolimonsRes, rapAvatarRes] = await Promise.allSettled([
            fetch(`https://inventory.roblox.com/v1/users/${rapUserId}/assets/collectibles?limit=100&sortOrder=Asc`),
            fetch(`https://api.rolimons.com/players/v1/playerinfo/${rapUserId}`),
            fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${rapUserId}&size=420x420&format=Png`),
          ]);

          type Collectible = { name: string; recentAveragePrice: number | null; serialNumber: number | null; assetId: number };
          const collectiblesData = collectiblesRes.status === "fulfilled" ? await collectiblesRes.value.json() as { data: Collectible[] } : { data: [] };
          const rolimonsData = rolimonsRes.status === "fulfilled" ? await rolimonsRes.value.json() as any : null;
          const rapAvatarData = rapAvatarRes.status === "fulfilled" ? await rapAvatarRes.value.json() as any : { data: [] };

          const items: Collectible[] = collectiblesData.data ?? [];
          const totalRap = items.reduce((sum, i) => sum + (i.recentAveragePrice ?? 0), 0);
          const rolimonsValue: number | null = rolimonsData?.success ? (rolimonsData.value ?? null) : null;
          const rapAvatarUrl: string | null = rapAvatarData.data?.[0]?.imageUrl ?? null;

          const ITEMS_PER_PAGE = 10;
          const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));

          const buildRapEmbed = (page: number) => {
            const start = page * ITEMS_PER_PAGE;
            const pageItems = items.slice(start, start + ITEMS_PER_PAGE);
            const itemList = pageItems.length > 0
              ? pageItems.map(i => `${i.serialNumber != null ? `#${i.serialNumber} ` : ""}**${i.name}**${i.recentAveragePrice != null ? ` — R$ ${i.recentAveragePrice.toLocaleString()}` : ""}`).join("\n")
              : "No limiteds found (inventory may be private)";

            const embed = new EmbedBuilder()
              .setColor(COLORS.primary)
              .setTitle(`${rapDisplayName} (@${rapExactName})`)
              .setURL(`https://www.roblox.com/users/${rapUserId}/profile`);

            const statsLines = [
              `**RAP** R$ ${totalRap.toLocaleString()}`,
              rolimonsValue != null ? `**Value** R$ ${rolimonsValue.toLocaleString()}` : null,
              `**Limiteds** ${items.length}`,
            ].filter(Boolean).join("\n");

            embed.setDescription(statsLines);
            if (items.length > 0) embed.addFields({ name: "Items", value: itemList.slice(0, 1024), inline: false });
            if (rapAvatarUrl) embed.setThumbnail(rapAvatarUrl);
            embed.setFooter({ text: `Page ${page + 1}/${totalPages}  •  Roblox ID: ${rapUserId}` });
            return embed;
          };

          if (totalPages <= 1) {
            await safeReply(message, { embeds: [buildRapEmbed(0)] });
            return true;
          }

          let rapPage = 0;
          const rapMsg = await safeReply(message, { embeds: [buildRapEmbed(0)], components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId("rap_prev").setLabel("← Prev").setStyle(ButtonStyle.Secondary).setDisabled(true),
              new ButtonBuilder().setCustomId("rap_page").setLabel(`1 / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
              new ButtonBuilder().setCustomId("rap_next").setLabel("Next →").setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1),
            ),
          ]});

          const rapCollector = rapMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });
          rapCollector.on("collect", async (i) => {
            if (i.user.id !== message.author.id) { await i.reply({ content: "These buttons aren't for you.", ephemeral: true }); return; }
            if (i.customId === "rap_prev") rapPage = Math.max(0, rapPage - 1);
            else if (i.customId === "rap_next") rapPage = Math.min(totalPages - 1, rapPage + 1);
            await i.update({ embeds: [buildRapEmbed(rapPage)], components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId("rap_prev").setLabel("← Prev").setStyle(ButtonStyle.Secondary).setDisabled(rapPage === 0),
                new ButtonBuilder().setCustomId("rap_page").setLabel(`${rapPage + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId("rap_next").setLabel("Next →").setStyle(ButtonStyle.Secondary).setDisabled(rapPage === totalPages - 1),
              ),
            ]});
          });
          rapCollector.on("end", () => rapMsg.edit({ components: [] }).catch(() => {}));
        } catch (err) {
          await safeReply(message, re("Failed to fetch RAP data. Try again later."));
          console.error("[roblox rap] error:", err);
        }
        return true;
      }

      // ─── default: roblox <username> ──────────────────────────────────────
      const username = args[0];
      if (!username) {
        await safeReply(message, {
          embeds: [new EmbedBuilder()
            .setColor(COLORS.error)
            .setDescription(`<@${message.author.id}>: Please provide a Roblox username\nUse: roblox (username)`)],
        });
        return true;
      }
      try {
        // Step 1: resolve username → userId
        const searchRes = await fetch("https://users.roblox.com/v1/usernames/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
        });
        const searchData = await searchRes.json() as { data: { id: number; name: string; displayName: string }[] };
        if (!searchData.data?.length) {
          await safeReply(message, re(`No Roblox user found with the username **${username}**.`));
          return true;
        }
        const { id: userId, name: exactName, displayName } = searchData.data[0];

        // Step 2: fetch all data in parallel
        const [userRes, friendsRes, followingRes, followersRes, historyRes, groupsRes, avatarRes] = await Promise.allSettled([
          fetch(`https://users.roblox.com/v1/users/${userId}`),
          fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
          fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`),
          fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
          fetch(`https://users.roblox.com/v1/users/${userId}/username-history?limit=10&sortOrder=Asc`),
          fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`),
          fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png`),
        ]);

        const userInfo = userRes.status === "fulfilled" ? await userRes.value.json() as any : {};
        const friendCount = friendsRes.status === "fulfilled" ? ((await friendsRes.value.json() as any).count ?? "?") : "?";
        const followingCount = followingRes.status === "fulfilled" ? ((await followingRes.value.json() as any).count ?? "?") : "?";
        const followersCount = followersRes.status === "fulfilled" ? ((await followersRes.value.json() as any).count ?? "?") : "?";
        const historyData = historyRes.status === "fulfilled" ? await historyRes.value.json() as any : { data: [] };
        const groupsData = groupsRes.status === "fulfilled" ? await groupsRes.value.json() as any : { data: [] };
        const avatarData = avatarRes.status === "fulfilled" ? await avatarRes.value.json() as any : { data: [] };

        const avatarUrl: string | null = avatarData.data?.[0]?.imageUrl ?? null;
        const created = userInfo.created ? new Date(userInfo.created) : null;
        const createdStr = created
          ? `${created.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} (${Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 365))} years ago)`
          : "Unknown";
        const bio: string = (userInfo.description ?? "").trim();
        const status = bio || "Unknown";

        const pastNames: string[] = (historyData.data ?? []).map((e: any) => e.name);
        const groups: string[] = (groupsData.data ?? []).map((e: any) => e.group?.name).filter(Boolean);
        const maxGroups = 5;
        const groupDisplay = groups.length === 0
          ? "None"
          : groups.slice(0, maxGroups).join(", ") + (groups.length > maxGroups ? ` ...+${groups.length - maxGroups} more` : "");

        const embed = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`${displayName} (@${exactName})`)
          .setURL(`https://www.roblox.com/users/${userId}/profile`)
          .addFields(
            { name: "Created", value: createdStr, inline: false },
            { name: "About", value: `\`Status:\` ${status.slice(0, 200)}`, inline: false },
            { name: "Social", value: `\`Friends:\` ${friendCount}\n\`Following:\` ${followingCount}\n\`Followers:\` ${followersCount}`, inline: false },
          );

        if (pastNames.length > 0) {
          embed.addFields({ name: `Past Usernames (${pastNames.length})`, value: pastNames.join(", ").slice(0, 1024), inline: false });
        }
        embed.addFields({ name: `Groups (${groups.length})`, value: groupDisplay.slice(0, 1024), inline: false });

        if (avatarUrl) embed.setThumbnail(avatarUrl);
        embed.setFooter({ text: `Roblox ID: ${userId}` });

        await safeReply(message, { embeds: [embed] });
      } catch (err) {
        await safeReply(message, re("Failed to look up that Roblox user. Try again later."));
        console.error("[roblox] error:", err);
      }
      return true;
    }
    case "quote": {
      const ref = message.reference;
      if (!ref?.messageId) {
        await safeReply(message, re("Reply to a message with `.quote\` to quote it."));
        return true;
      }
      const quoted = await message.channel.messages.fetch(ref.messageId).catch(() => null);
      if (!quoted) {
        await safeReply(message, re("Couldn't fetch that message."));
        return true;
      }
      const quoteText = quoted.content.trim();
      if (!quoteText) {
        await safeReply(message, re("That message has no text to quote."));
        return true;
      }

      const W = 900;
      const H = 380;
      const AVATAR_W = 260;
      const DIVIDER = AVATAR_W + 20;
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext("2d");

      // Full background
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#0d0d0d");
      grad.addColorStop(1, "#1a1a2e");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Avatar panel on the left
      try {
        const avatarURL = quoted.author.displayAvatarURL({ extension: "png", size: 512 });
        const avatar = await loadImage(avatarURL);
        ctx.save();
        ctx.drawImage(avatar, 0, 0, AVATAR_W, H);
        // Dark overlay on avatar so it looks intentional
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, AVATAR_W, H);
        ctx.restore();
      } catch {
        // No avatar — fill the panel with a dark block
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, AVATAR_W, H);
      }

      // Divider accent bar
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(DIVIDER, 40, 4, H - 80);

      // Text area starts after divider
      const textX = DIVIDER + 28;
      const textMaxW = W - textX - 30;

      // Large decorative quote mark
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.font = "bold 140px DejaVu Serif";
      ctx.fillText("\u201C", textX - 10, 130);

      // Quote text with word wrap
      const fontSize = quoteText.length > 140 ? 24 : quoteText.length > 70 ? 30 : 36;
      ctx.fillStyle = "#ffffff";
      ctx.font = `${fontSize}px DejaVu Sans`;

      const words = quoteText.split(" ");
      const lines: string[] = [];
      let cur = "";
      for (const word of words) {
        const test = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(test).width > textMaxW) {
          lines.push(cur);
          cur = word;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      const maxLines = 7;
      const displayLines = lines.slice(0, maxLines);
      if (lines.length > maxLines) displayLines[maxLines - 1] += "…";

      const lineH = fontSize * 1.55;
      const textBlockH = displayLines.length * lineH;
      let ty = (H - textBlockH) / 2 + fontSize;
      for (const line of displayLines) {
        ctx.fillText(line, textX, ty);
        ty += lineH;
      }

      // Author name bottom-left of text area
      const authorName = quoted.member?.displayName ?? quoted.author.username;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "17px DejaVu Sans";
      ctx.fillText(`— @${authorName}`, textX, H - 40);

      // Bot watermark bottom-right
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.font = "13px DejaVu Sans";
      const watermark = message.client.user?.username ?? "october";
      const wm = ctx.measureText(watermark);
      ctx.fillText(watermark, W - wm.width - 20, H - 20);

      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buffer, { name: "quote.png" });
      await message.channel.send({ files: [attachment] });
      await message.delete().catch(() => {});
      return true;
    }

    default:
      return false;
  }
}
