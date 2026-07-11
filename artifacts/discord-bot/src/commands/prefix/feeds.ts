import { EmbedBuilder, TextChannel, WebhookClient } from "discord.js";
import type { Message } from "discord.js";
import { getGS, saveState } from "../../state.js";
import client from "../../client.js";
import { re, gch, sendPaginated, safeReply } from "../../utils.js";
import https from "https";
import { COLORS } from "../../colors.js";

export interface FeedEntry {
  platform: "reddit" | "twitch";
  handle: string;
  channelId: string;
  lastSeen: string;
  addedBy: string;
}

export const guildFeeds = new Map<string, FeedEntry[]>();
const feedPollers = new Map<string, ReturnType<typeof setInterval>>();

let _twitchToken: string | null = null;
let _twitchTokenExpiry = 0;

async function getTwitchToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (_twitchToken && Date.now() < _twitchTokenExpiry) return _twitchToken;
  try {
    const tokenData = await httpsGet(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
    );
    if (!tokenData.access_token) return null;
    _twitchToken = tokenData.access_token;
    _twitchTokenExpiry = Date.now() + (tokenData.expires_in ?? 3600) * 1000 - 60_000;
    return _twitchToken;
  } catch {
    return null;
  }
}

function httpsGet(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "october-discord-bot/1.0", ...headers } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("parse error")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function checkRedditFeed(guildId: string, feed: FeedEntry): Promise<void> {
  try {
    const data = await httpsGet(`https://www.reddit.com/r/${feed.handle}/new.json?limit=5`);
    const posts: any[] = data?.data?.children ?? [];
    const newPosts = posts.filter((p: any) => p.data.name > feed.lastSeen && !p.data.stickied);
    if (!newPosts.length) return;

    feed.lastSeen = posts[0]?.data?.name ?? feed.lastSeen;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const ch = gch(guild, feed.channelId) as TextChannel | null;
    if (!ch) return;

    for (const post of newPosts.reverse().slice(0, 3)) {
      const d = post.data;
      const embed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle(d.title?.slice(0, 256) ?? "New Post")
        .setURL(`https://reddit.com${d.permalink}`)
        .setAuthor({ name: `r/${d.subreddit}`, url: `https://reddit.com/r/${d.subreddit}`, iconURL: "https://www.redditstatic.com/desktop2x/img/favicon/favicon-32x32.png" })
        .setFooter({ text: `Posted by u/${d.author} · ${d.ups} upvotes` })
        .setTimestamp(d.created_utc * 1000);
      if (d.selftext) embed.setDescription(d.selftext.slice(0, 400) + (d.selftext.length > 400 ? "..." : ""));
      if (d.url && (d.url.endsWith(".jpg") || d.url.endsWith(".png") || d.url.endsWith(".gif") || d.url.endsWith(".webp"))) {
        embed.setImage(d.url);
      }
      await ch.send({ embeds: [embed] }).catch(() => {});
    }
  } catch {
    // silent
  }
}

async function checkTwitchFeed(guildId: string, feed: FeedEntry): Promise<void> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return;

  try {
    const token = await getTwitchToken(clientId, clientSecret);
    if (!token) return;

    const streamData = await httpsGet(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(feed.handle)}`,
      { "Client-ID": clientId, Authorization: `Bearer ${token}` }
    );

    const stream = streamData?.data?.[0];
    const isLive = !!stream;
    const liveKey = `${feed.handle}:live`;
    const wasLive = feed.lastSeen === liveKey;

    if (isLive && !wasLive) {
      feed.lastSeen = liveKey;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;
      const ch = gch(guild, feed.channelId) as TextChannel | null;
      if (!ch) return;

      const userResp = await httpsGet(
        `https://api.twitch.tv/helix/users?login=${encodeURIComponent(feed.handle)}`,
        { "Client-ID": clientId, Authorization: `Bearer ${token}` }
      );
      const user = userResp?.data?.[0];

      const embed = new EmbedBuilder()
        .setColor(COLORS.twitch)
        .setTitle(`${stream.user_name} is now LIVE on Twitch!`)
        .setURL(`https://twitch.tv/${feed.handle}`)
        .setDescription(stream.title ?? "")
        .addFields(
          { name: "Game", value: stream.game_name || "Unknown", inline: true },
          { name: "Viewers", value: `${stream.viewer_count}`, inline: true },
        )
        .setThumbnail(user?.profile_image_url ?? null)
        .setImage(stream.thumbnail_url?.replace("{width}", "1280").replace("{height}", "720") ?? null)
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    } else if (!isLive && wasLive) {
      feed.lastSeen = "offline";
    }
  } catch {
    // silent
  }
}

export function startFeedPollers(): void {
  const POLL_INTERVAL = 3 * 60 * 1000;
  const FEED_STAGGER_MS = 1500;

  const interval = setInterval(async () => {
    const tasks: [string, FeedEntry][] = [];
    for (const [guildId, feeds] of guildFeeds) {
      for (const feed of feeds) tasks.push([guildId, feed]);
    }
    // Stagger each feed check by FEED_STAGGER_MS to avoid simultaneously
    // flooding Reddit / Twitch APIs and triggering IP-level rate limits.
    for (let i = 0; i < tasks.length; i++) {
      const [guildId, feed] = tasks[i];
      if (feed.platform === "reddit") await checkRedditFeed(guildId, feed).catch(() => {});
      else if (feed.platform === "twitch") await checkTwitchFeed(guildId, feed).catch(() => {});
      if (i < tasks.length - 1) await new Promise(r => setTimeout(r, FEED_STAGGER_MS));
    }
  }, POLL_INTERVAL);

  feedPollers.set("__global__", interval);
}

export async function handleFeedsCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  if (!["reddit", "twitch", "instagram", "twitter", "tiktok", "pinterest"].includes(cmd)) return false;

  const platform = cmd as FeedEntry["platform"] | "instagram" | "twitter" | "tiktok" | "pinterest";

  if (["instagram", "twitter", "tiktok", "pinterest"].includes(cmd)) {
    await safeReply(message, re(`**${cmd.charAt(0).toUpperCase() + cmd.slice(1)} feeds** require API access that isn't configured. Only **Reddit** and **Twitch** feeds are available.`));
    return true;
  }

  const sub = args[0]?.toLowerCase();
  const handle = args[1]?.toLowerCase().replace(/^r\//i, "").replace(/\//g, "");
  const channelMention = args[2];
  const channelId = channelMention?.replace(/[<#>]/g, "") ?? message.channel.id;

  if (!guildFeeds.has(guild.id)) guildFeeds.set(guild.id, []);
  const feeds = guildFeeds.get(guild.id)!;

  if (sub === "add") {
    if (!handle) {
      await safeReply(message, re(`Usage: \`${p}${cmd} add <handle> [#channel]\`\nExample: \`${p}${cmd} add ${cmd === "reddit" ? "r/gaming" : "xqc"} #${cmd}-feed\``));
      return true;
    }
    if (!message.member?.permissions.has(0x20n)) {
      await safeReply(message, re("You need **Manage Guild** to manage feeds."));
      return true;
    }

    if (feeds.filter(f => f.platform === platform).length >= 10) {
      await safeReply(message, re(`You can only have up to **10** ${cmd} feeds per server.`));
      return true;
    }

    const existing = feeds.find(f => f.platform === platform && f.handle === handle);
    if (existing) {
      await safeReply(message, re(`Already tracking **${handle}** on ${cmd}.`));
      return true;
    }

    let initialSeen = "";
    if (cmd === "reddit") {
      try {
        const data = await httpsGet(`https://www.reddit.com/r/${handle}/new.json?limit=1`);
        initialSeen = data?.data?.children?.[0]?.data?.name ?? "";
      } catch {}
    }

    feeds.push({ platform: platform as FeedEntry["platform"], handle, channelId, lastSeen: initialSeen, addedBy: message.author.id });

    await safeReply(message, {
      embeds: [new EmbedBuilder().setColor(COLORS.success)
        .setDescription(` Now tracking **${cmd === "reddit" ? `r/${handle}` : handle}** on **${cmd}** — new posts will be sent to <#${channelId}>.`)],
    });
    return true;
  }

  if (sub === "remove") {
    if (!handle) {
      await safeReply(message, re(`Usage: \`${p}${cmd} remove <handle>\``));
      return true;
    }
    const idx = feeds.findIndex(f => f.platform === platform && f.handle === handle);
    if (idx === -1) {
      await safeReply(message, re(`No ${cmd} feed found for **${handle}**.`));
      return true;
    }
    feeds.splice(idx, 1);
    await safeReply(message, re(` Stopped tracking **${handle}** on ${cmd}.`));
    return true;
  }

  if (sub === "list") {
    const platformFeeds = feeds.filter(f => f.platform === platform);
    if (!platformFeeds.length) {
      await safeReply(message, re(`No ${cmd} feeds configured. Use \`${p}${cmd} add <handle>\` to add one.`));
      return true;
    }
    const lines = platformFeeds.map(f => `**${cmd === "reddit" ? `r/${f.handle}` : f.handle}** → <#${f.channelId}>`);
    await safeReply(message, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(`${cmd.charAt(0).toUpperCase() + cmd.slice(1)} Feeds (${lines.length})`).setDescription(lines.join("\n"))] });
    return true;
  }

  await safeReply(message, re(`**${cmd} Feed Commands:**\n\`${p}${cmd} add <handle> [#channel]\` — start tracking\n\`${p}${cmd} remove <handle>\` — stop tracking\n\`${p}${cmd} list\` — view all feeds`));
  return true;
}
