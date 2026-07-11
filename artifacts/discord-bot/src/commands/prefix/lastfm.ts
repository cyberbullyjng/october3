import { EmbedBuilder } from "discord.js";
import type { Message } from "discord.js";
import { getGS } from "../../state.js";
import { lastfmAccounts } from "../../state.js";
import { saveState } from "../../state.js";
import { re, safeReply } from "../../utils.js";
import { COLORS } from "../../colors.js";

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

async function lfm(params: Record<string, string>): Promise<any> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return null;
  const url = new URL(LASTFM_BASE);
  url.searchParams.set("api_key", key);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) { console.error("[lastfm] HTTP", res.status, res.statusText); return null; }
    return await res.json();
  } catch (err) {
    console.error("[lastfm] fetch error:", err);
    return null;
  }
}

export async function handleLastfmCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (cmd !== "lastfm" && cmd !== "fm") return false;
  if (!message.guild) return false;
  const gs = getGS(message.guild.id);
  const p = gs.prefix;

  if (!process.env.LASTFM_API_KEY) {
    await safeReply(message, re("Last.fm is not configured. Ask the bot owner to set a `LASTFM_API_KEY` environment variable."));
    return true;
  }

  try {

  const sub = args[0]?.toLowerCase() ?? "np";

  // ── set ─────────────────────────────────────────────────────────────────────
  if (sub === "set") {
    const username = args[1];
    if (!username) {
      await safeReply(message, re(`Usage: \`${p}lastfm set <username>\``));
      return true;
    }
    const data = await lfm({ method: "user.getInfo", user: username });
    if (!data || data.error) {
      await safeReply(message, re(`Last.fm user \`${username}\` not found.`));
      return true;
    }
    lastfmAccounts.set(message.author.id, username);
    saveState();
    await safeReply(message, re(`Linked your account to Last.fm user **${data.user?.name ?? username}**. Use \`${p}lastfm\` to show your now playing.`));
    return true;
  }

  // ── unset ────────────────────────────────────────────────────────────────────
  if (sub === "unset") {
    lastfmAccounts.delete(message.author.id);
    saveState();
    await safeReply(message, re("Your Last.fm account has been unlinked."));
    return true;
  }

  // ── artist ───────────────────────────────────────────────────────────────────
  if (sub === "artist") {
    const name = args.slice(1).join(" ");
    if (!name) {
      await safeReply(message, re(`Usage: \`${p}lastfm artist <name>\``));
      return true;
    }
    const data = await lfm({ method: "artist.getInfo", artist: name });
    if (!data || data.error || !data.artist) {
      await safeReply(message, re(`Artist \`${name}\` not found on Last.fm.`));
      return true;
    }
    const a = data.artist;
    const bio = (a.bio?.summary ?? "").replace(/<a [^>]+>.*?<\/a>/g, "").replace(/<[^>]+>/g, "").trim().slice(0, 300);
    const listeners = parseInt(a.stats?.listeners ?? "0").toLocaleString();
    const plays = parseInt(a.stats?.playcount ?? "0").toLocaleString();
    const tags = (a.tags?.tag ?? []).slice(0, 5).map((t: any) => t.name).join(", ") || "—";
    const embed = new EmbedBuilder()
      .setColor(COLORS.lastfm)
      .setAuthor({ name: "Last.fm", iconURL: "https://www.last.fm/static/images/lastfm_avatar_twitter.png" })
      .setTitle(a.name)
      .setURL(a.url)
      .setDescription(bio || "*No biography available.*")
      .addFields(
        { name: "Listeners", value: listeners, inline: true },
        { name: "Scrobbles", value: plays, inline: true },
        { name: "Tags", value: tags, inline: false },
      )
      .setThumbnail(a.image?.[2]?.["#text"] || null);
    await safeReply(message, { embeds: [embed] });
    return true;
  }

  // ── lb (leaderboard) ─────────────────────────────────────────────────────────
  if (sub === "lb" || sub === "leaderboard") {
    const linked = [...lastfmAccounts.entries()].filter(([uid]) => message.guild!.members.cache.has(uid));
    if (linked.length === 0) {
      await safeReply(message, re(`No members in this server have linked their Last.fm. Use \`${p}lastfm set <username>\` to link yours.`));
      return true;
    }
    const results: { tag: string; username: string; plays: number }[] = [];
    for (const [uid, username] of linked) {
      const data = await lfm({ method: "user.getInfo", user: username });
      if (!data || data.error) { await new Promise(r => setTimeout(r, 200)); continue; }
      const member = message.guild!.members.cache.get(uid);
      results.push({ tag: member?.user.tag ?? uid, username, plays: parseInt(data.user?.playcount ?? "0") });
      await new Promise(r => setTimeout(r, 200));
    }
    results.sort((a, b) => b.plays - a.plays);
    const lines = results.slice(0, 15).map((r, i) => `${i + 1}. **${r.tag}** — [${r.username}](https://www.last.fm/user/${encodeURIComponent(r.username)}) • ${r.plays.toLocaleString()} scrobbles`);
    const embed = new EmbedBuilder()
      .setColor(COLORS.lastfm)
      .setAuthor({ name: "Last.fm", iconURL: "https://www.last.fm/static/images/lastfm_avatar_twitter.png" })
      .setTitle(`Last.fm Leaderboard — ${message.guild!.name}`)
      .setDescription(lines.join("\n"));
    await safeReply(message, { embeds: [embed] });
    return true;
  }

  // ── recent ────────────────────────────────────────────────────────────────────
  if (sub === "recent") {
    const targetUser = args[1] ? args[1].replace(/[<@!>]/g, "") : null;
    let username = targetUser
      ? lastfmAccounts.get(targetUser) ?? args[1]
      : lastfmAccounts.get(message.author.id);
    if (!username) {
      await safeReply(message, re(`No Last.fm account linked. Use \`${p}lastfm set <username>\` to link yours.`));
      return true;
    }
    const data = await lfm({ method: "user.getRecentTracks", user: username, limit: "5" });
    if (!data || data.error || !data.recenttracks) {
      await safeReply(message, re(`Couldn't fetch recent tracks for **${username}**.`));
      return true;
    }
    const tracks: any[] = Array.isArray(data.recenttracks.track) ? data.recenttracks.track : [data.recenttracks.track];
    const lines = tracks.slice(0, 5).map((t: any, i: number) => {
      const np = t["@attr"]?.nowplaying === "true";
      return `${np ? "▶️" : `${i + 1}.`} **${t.name}** by ${t.artist["#text"]} — *${t.album["#text"] || "Unknown Album"}*`;
    });
    const embed = new EmbedBuilder()
      .setColor(COLORS.lastfm)
      .setAuthor({ name: `${username} — Recent Tracks`, iconURL: "https://www.last.fm/static/images/lastfm_avatar_twitter.png", url: `https://www.last.fm/user/${encodeURIComponent(username)}` })
      .setDescription(lines.join("\n"))
      .setThumbnail(tracks[0]?.image?.[2]?.["#text"] || null);
    await safeReply(message, { embeds: [embed] });
    return true;
  }

  // ── np / default ─────────────────────────────────────────────────────────────
  {
    const targetArg = args[0] && args[0] !== "np" ? args[0] : null;
    const targetId = targetArg?.replace(/[<@!>]/g, "");
    const resolvedUserId = targetId ?? message.author.id;
    let username = targetId
      ? lastfmAccounts.get(targetId) ?? targetArg ?? null
      : lastfmAccounts.get(message.author.id) ?? null;
    const discordMember = message.guild!.members.cache.get(resolvedUserId);
    const displayName = discordMember?.displayName ?? message.author.displayName ?? username ?? "Unknown";

    if (!username) {
      await safeReply(message, re(`No Last.fm account linked. Use \`${p}lastfm set <username>\` to link yours.`));
      return true;
    }

    const data = await lfm({ method: "user.getRecentTracks", user: username, limit: "1" });
    if (!data || data.error || !data.recenttracks) {
      await safeReply(message, re(`Couldn't fetch data for **${username}** — make sure the username is correct.`));
      return true;
    }

    const tracks: any[] = Array.isArray(data.recenttracks.track) ? data.recenttracks.track : [data.recenttracks.track];
    const track = tracks[0];
    if (!track) {
      await safeReply(message, re(`**${username}** hasn't scrobbled anything yet.`));
      return true;
    }

    const np = track["@attr"]?.nowplaying === "true";
    const artistName = track.artist["#text"];
    const albumArt = track.image?.[3]?.["#text"] || track.image?.[2]?.["#text"] || null;

    const artistData = await lfm({ method: "artist.getInfo", artist: artistName, username });
    const userPlays = artistData?.artist?.stats?.userplaycount ?? null;

    const embed = new EmbedBuilder()
      .setColor(COLORS.lastfm)
      .setAuthor({
        name: `${displayName} — ${np ? "Now Playing" : "Last Played"}`,
        iconURL: discordMember?.user.displayAvatarURL() ?? message.author.displayAvatarURL(),
        url: `https://www.last.fm/user/${encodeURIComponent(username)}`,
      })
      .setTitle(`${track.name}`)
      .setURL(track.url)
      .addFields(
        { name: "Artist", value: artistName, inline: true },
        { name: "Album", value: track.album["#text"] || "—", inline: true },
      );

    if (userPlays !== null) embed.addFields({ name: "Your plays (artist)", value: parseInt(userPlays).toLocaleString(), inline: true });
    if (albumArt) embed.setThumbnail(albumArt);

    await safeReply(message, { embeds: [embed] });
    return true;
  }

  } catch (err) {
    console.error("[lastfm] unhandled error:", err);
    await safeReply(message, re("Something went wrong talking to Last.fm — try again in a moment.")).catch(() => {});
    return true;
  }
}
