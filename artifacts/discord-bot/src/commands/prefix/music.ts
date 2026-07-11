import {
  EmbedBuilder, TextChannel, ChannelType, VoiceChannel,
} from "discord.js";
import type { Message } from "discord.js";
import {
  createAudioPlayer, createAudioResource, joinVoiceChannel, getVoiceConnection,
  AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior, StreamType,
  AudioResource, AudioPlayer, VoiceConnection,
} from "@discordjs/voice";
import * as playdl from "play-dl";
import { spawn } from "child_process";
import { existsSync, mkdirSync, chmodSync, createWriteStream } from "fs";
import pathMod from "path";
import https from "https";
import { re, gch, safeReply } from "../../utils.js";
import { getGS } from "../../state.js";
import client from "../../client.js";
import { COLORS } from "../../colors.js";

export interface MusicTrack {
  title: string;
  url: string;
  duration: string;
  durationMs: number;
  thumbnail: string | null;
  requestedBy: string;
}

interface GuildMusicState {
  connection: VoiceConnection;
  player: AudioPlayer;
  queue: MusicTrack[];
  currentTrack: MusicTrack | null;
  loop: boolean;
  loopQueue: boolean;
  volume: number;
  is247: boolean;
  textChannelId: string;
  startedAt: number;
  seekOffset: number;
}

export const musicStates = new Map<string, GuildMusicState>();

function fmtDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function progressBar(current: number, total: number, len = 16): string {
  if (!total) return `[${"─".repeat(len)}]`;
  const filled = Math.round((current / total) * len);
  return `[${"▬".repeat(filled)}🔘${"─".repeat(Math.max(0, len - filled - 1))}]`;
}

const BIN_PATH = pathMod.resolve("./bin/yt-dlp");
let ytDlpReady = false;

function ytDlpDownloadUrl(): string {
  const { arch, platform } = process;
  if (platform === "linux") {
    if (arch === "arm64")  return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64";
    if (arch === "arm")    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_armv7l";
    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
  }
  if (platform === "darwin") return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
  return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_win.exe";
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (u: string) => {
      https.get(u, { headers: { "User-Agent": "october3-bot" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const ws = createWriteStream(dest);
        res.pipe(ws);
        ws.on("finish", resolve);
        ws.on("error", reject);
      }).on("error", reject);
    };
    follow(url);
  });
}

function isBinaryValid(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(BIN_PATH, ["--version"], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => {
      if (stderr.toLowerCase().includes("python")) resolve(false);
      else resolve(code === 0);
    });
  });
}

export async function ensureYtDlp(): Promise<void> {
  if (ytDlpReady) return;
  if (!existsSync("./bin")) mkdirSync("./bin", { recursive: true });
  const needsDownload = !existsSync(BIN_PATH) || !(await isBinaryValid());
  if (needsDownload) {
    const url = ytDlpDownloadUrl();
    console.log(`[music] Downloading yt-dlp standalone binary (${process.platform}/${process.arch}) …`);
    await downloadFile(url, BIN_PATH);
    chmodSync(BIN_PATH, 0o755);
    console.log("[music] yt-dlp binary ready.");
  }
  ytDlpReady = true;
}

async function resolveAudioUrl(pageUrl: string): Promise<string> {
  const { default: YTDlpWrap } = await import("yt-dlp-wrap");
  const Cls = (YTDlpWrap as any).default ?? YTDlpWrap;
  const ytDlp = new Cls(BIN_PATH);
  const out: string = await ytDlp.execPromise([
    pageUrl,
    "-f", "bestaudio[ext=webm]/bestaudio/best",
    "--get-url", "--no-playlist", "--no-warnings",
    "--extractor-args", "youtube:player_client=android,web",
  ]);
  const url = out.trim().split("\n")[0];
  if (!url) throw new Error("yt-dlp returned no URL");
  return url;
}

function createFfmpegResource(audioUrl: string, volume: number, seekSecs = 0): AudioResource {
  const ffmpegPath: string = (
    (globalThis as any).__ffmpegPath ??
    (() => { throw new Error("ffmpeg path not initialised"); })()
  );
  const ffmpegArgs: string[] = [
    ...(seekSecs > 0 ? ["-ss", String(seekSecs)] : []),
    "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
    "-i", audioUrl,
    "-vn",
    "-f", "opus",
    "-b:a", "128k",
    "pipe:1",
  ];
  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ["ignore", "pipe", "ignore"] });
  ffmpeg.on("error", (err) => console.error("[music] ffmpeg error:", err.message));
  const resource = createAudioResource(ffmpeg.stdout!, {
    inputType: StreamType.OggOpus,
    inlineVolume: true,
  });
  resource.volume?.setVolume(volume / 100);
  return resource;
}

async function createYtdlResource(url: string, volume: number, seekSecs = 0): Promise<AudioResource> {
  await ensureYtDlp();
  const audioUrl = await resolveAudioUrl(url);
  return createFfmpegResource(audioUrl, volume, seekSecs);
}

async function playNext(guildId: string, _depth = 0): Promise<void> {
  if (_depth >= 20) {
    console.error(`[music] playNext hit depth limit in guild ${guildId} — clearing queue to stop loop.`);
    const ms2 = musicStates.get(guildId);
    if (ms2) { ms2.queue = []; ms2.currentTrack = null; }
    return;
  }
  const ms = musicStates.get(guildId);
  if (!ms) return;

  if (ms.loop && ms.currentTrack) {
    ms.queue.unshift(ms.currentTrack);
  } else if (ms.loopQueue && ms.currentTrack) {
    ms.queue.push(ms.currentTrack);
  }

  const next = ms.queue.shift();
  if (!next) {
    ms.currentTrack = null;
    if (!ms.is247) {
      setTimeout(() => {
        const cur = musicStates.get(guildId);
        if (cur && !cur.currentTrack && !cur.is247) {
          cur.connection.destroy();
          musicStates.delete(guildId);
        }
      }, 30_000);
    }
    return;
  }

  ms.currentTrack = next;
  ms.startedAt = Date.now();
  ms.seekOffset = 0;

  try {
    const resource = await createYtdlResource(next.url, ms.volume);
    ms.player.play(resource);

    const textCh = gch(client.guilds.cache.get(guildId)!, ms.textChannelId);
    if (textCh) {
      await (textCh as TextChannel).send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle("Now Playing")
            .setDescription(`**[${next.title}](${next.url})**`)
            .addFields(
              { name: "Duration", value: next.duration, inline: true },
              { name: "Requested by", value: `<@${next.requestedBy}>`, inline: true },
              { name: "Loop", value: ms.loop ? "Track" : ms.loopQueue ? "Queue" : "Off", inline: true },
            )
            .setThumbnail(next.thumbnail)
            .setFooter({ text: `${ms.queue.length} track${ms.queue.length !== 1 ? "s" : ""} remaining in queue` }),
        ],
      }).catch(() => {});
    }
  } catch (err: any) {
    const errMsg: string = err?.stderr ?? err?.message ?? String(err);
    console.error(`[music] playNext error for "${next.title}":`, errMsg);
    const textCh = gch(client.guilds.cache.get(guildId)!, ms.textChannelId);
    if (textCh) {
      await (textCh as TextChannel).send(re(`Failed to play **${next.title}**: \`${errMsg.replace(/\n/g, " ").slice(0, 200)}\``)).catch(() => {});
    }
    ms.currentTrack = null;
    await playNext(guildId, _depth + 1);
  }
}

function ensureMusicState(guildId: string, connection: VoiceConnection, textChannelId: string): GuildMusicState {
  if (musicStates.has(guildId)) return musicStates.get(guildId)!;

  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  connection.subscribe(player);

  const ms: GuildMusicState = {
    connection, player, queue: [], currentTrack: null,
    loop: false, loopQueue: false, volume: 100,
    is247: false, textChannelId, startedAt: 0, seekOffset: 0,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    const cur = musicStates.get(guildId);
    if (cur) playNext(guildId);
  });

  player.on("error", (err) => {
    console.error(`[music] Player error in ${guildId}:`, err.message);
    const cur = musicStates.get(guildId);
    // Stop the player — this transitions it to Idle which triggers the
    // Idle event above (which already calls playNext). Calling playNext
    // directly here as well would cause a double-play bug.
    if (cur) cur.player.stop(true);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    const cur = musicStates.get(guildId);
    if (cur) {
      cur.player.stop(true);
      musicStates.delete(guildId);
    }
  });

  musicStates.set(guildId, ms);
  return ms;
}

async function fetchLyrics(title: string): Promise<string | null> {
  try {
    const clean = title.replace(/\(.*?\)|\[.*?\]|feat\..*|ft\..*/gi, "").trim();
    const parts = clean.split(/[-–|]/);
    const artist = parts.length > 1 ? parts[0].trim() : "";
    const song = parts.length > 1 ? parts.slice(1).join(" ").trim() : clean;
    const url = artist
      ? `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`
      : `https://api.lyrics.ovh/suggest/${encodeURIComponent(clean)}`;
    const data = await new Promise<any>((resolve, reject) => {
      https.get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(); } });
      }).on("error", reject);
    });
    if (data.lyrics) return data.lyrics;
    if (data.data?.[0]) {
      const t = data.data[0];
      return fetchLyrics(`${t.artist.name} - ${t.title}`);
    }
    return null;
  } catch {
    return null;
  }
}

export async function handleMusicCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;

  switch (cmd) {
    case "play":
    case "p": {
      const query = args.join(" ").trim();
      if (!query) {
        const ms = musicStates.get(guild.id);
        if (ms && ms.player.state.status === AudioPlayerStatus.Paused) {
          ms.player.unpause();
          await message.react("▶️");
          return true;
        }
        await safeReply(message, re(`Usage: \`${p}play <song name or URL>\``));
        return true;
      }

      const memberVc = message.member?.voice.channel as VoiceChannel | null;
      if (!memberVc) {
        await safeReply(message, re("You need to be in a voice channel first."));
        return true;
      }

      let connection = getVoiceConnection(guild.id);
      const existing = musicStates.get(guild.id);
      if (connection && existing && existing.connection.joinConfig.channelId !== memberVc.id) {
        await safeReply(message, re("I'm already playing in a different voice channel."));
        return true;
      }

      if (!connection) {
        connection = joinVoiceChannel({
          channelId: memberVc.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: true,
        });
      }

      const ms = ensureMusicState(guild.id, connection, message.channel.id);
      ms.textChannelId = message.channel.id;

      const loading = await safeReply(message, re("🔍 Searching..."));

      try {
        let track: MusicTrack | null = null;

        if (playdl.yt_validate(query) === "video") {
          const info = await playdl.video_info(query);
          const v = info.video_details;
          track = {
            title: v.title ?? "Unknown",
            url: v.url,
            duration: fmtDuration((v.durationInSec ?? 0) * 1000),
            durationMs: (v.durationInSec ?? 0) * 1000,
            thumbnail: v.thumbnails?.[0]?.url ?? null,
            requestedBy: message.author.id,
          };
        } else if (playdl.yt_validate(query) === "playlist") {
          const playlist = await playdl.playlist_info(query, { incomplete: true });
          const videos = await playlist.all_videos();
          for (const v of videos.slice(0, 50)) {
            ms.queue.push({
              title: v.title ?? "Unknown",
              url: v.url,
              duration: fmtDuration((v.durationInSec ?? 0) * 1000),
              durationMs: (v.durationInSec ?? 0) * 1000,
              thumbnail: v.thumbnails?.[0]?.url ?? null,
              requestedBy: message.author.id,
            });
          }
          await loading.edit({
            embeds: [new EmbedBuilder().setColor(COLORS.success)
              .setDescription(` Added **${Math.min(videos.length, 50)}** tracks from playlist **${playlist.title ?? "Unknown"}** to the queue.`)],
          });
          if (!ms.currentTrack) await playNext(guild.id);
          return true;
        } else {
          const results = await playdl.search(query, { source: { youtube: "video" }, limit: 1 });
          if (!results.length) {
            await loading.edit(re("No results found."));
            return true;
          }
          const v = results[0];
          track = {
            title: v.title ?? "Unknown",
            url: v.url,
            duration: fmtDuration((v.durationInSec ?? 0) * 1000),
            durationMs: (v.durationInSec ?? 0) * 1000,
            thumbnail: v.thumbnails?.[0]?.url ?? null,
            requestedBy: message.author.id,
          };
        }

        if (!track) { await loading.edit(re("Could not find that track.")); return true; }

        ms.queue.push(track);

        if (!ms.currentTrack) {
          await loading.edit(re("🎵 Starting playback..."));
          await playNext(guild.id);
        } else {
          await loading.edit({
            embeds: [new EmbedBuilder().setColor(COLORS.primary)
              .setTitle("Added to Queue")
              .setDescription(`**[${track.title}](${track.url})**`)
              .addFields(
                { name: "Duration", value: track.duration, inline: true },
                { name: "Position", value: `#${ms.queue.length}`, inline: true },
              )
              .setThumbnail(track.thumbnail)],
          });
        }
      } catch (err: any) {
        await loading.edit(re(`Failed to play that track: ${err?.message ?? "unknown error"}`));
      }
      return true;
    }

    case "pause": {
      const ms = musicStates.get(guild.id);
      if (!ms || ms.player.state.status !== AudioPlayerStatus.Playing) {
        await safeReply(message, re("Nothing is currently playing."));
        return true;
      }
      ms.player.pause();
      await message.react("⏸️");
      return true;
    }

    case "resume": {
      const ms = musicStates.get(guild.id);
      if (!ms || ms.player.state.status !== AudioPlayerStatus.Paused) {
        await safeReply(message, re("Playback is not paused."));
        return true;
      }
      ms.player.unpause();
      await message.react("▶️");
      return true;
    }

    case "skip":
    case "s": {
      const ms = musicStates.get(guild.id);
      if (!ms || !ms.currentTrack) {
        await safeReply(message, re("Nothing is currently playing."));
        return true;
      }
      const skipped = ms.currentTrack.title;
      ms.loop = false;
      ms.player.stop();
      await safeReply(message, re(`⏭️ Skipped **${skipped}**.`));
      return true;
    }

    case "stop": {
      const ms = musicStates.get(guild.id);
      if (!ms) {
        await safeReply(message, re("I'm not playing anything."));
        return true;
      }
      ms.queue = [];
      ms.loop = false;
      ms.loopQueue = false;
      ms.is247 = false;
      ms.player.stop(true);
      ms.connection.destroy();
      musicStates.delete(guild.id);
      await message.react("⏹️");
      return true;
    }

    case "queue":
    case "q": {
      const ms = musicStates.get(guild.id);
      if (!ms || (!ms.currentTrack && !ms.queue.length)) {
        await safeReply(message, re("The queue is empty."));
        return true;
      }
      const lines: string[] = [];
      if (ms.currentTrack) {
        const elapsed = Math.floor((Date.now() - ms.startedAt) / 1000);
        const total = Math.floor(ms.currentTrack.durationMs / 1000);
        lines.push(`**Now Playing:**\n▶️ **[${ms.currentTrack.title}](${ms.currentTrack.url})** — \`${fmtDuration(elapsed * 1000)} / ${ms.currentTrack.duration}\`\n${progressBar(elapsed, total)}`);
      }
      if (ms.queue.length) {
        lines.push(`\n**Up Next:**`);
        ms.queue.slice(0, 25).forEach((t, i) => {
          lines.push(`\`${i + 1}.\` [${t.title}](${t.url}) — \`${t.duration}\``);
        });
        if (ms.queue.length > 25) lines.push(`*...and ${ms.queue.length - 25} more*`);
      }
      const totalDuration = ms.queue.reduce((a, t) => a + t.durationMs, 0);
      await safeReply(message, {
        embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`Queue — ${guild.name}`)
          .setDescription(lines.join("\n").slice(0, 4096))
          .setFooter({ text: `${ms.queue.length} track${ms.queue.length !== 1 ? "s" : ""} in queue · Total: ${fmtDuration(totalDuration)} · Loop: ${ms.loop ? "Track" : ms.loopQueue ? "Queue" : "Off"}` })],
      });
      return true;
    }

    case "nowplaying":
    case "np": {
      const ms = musicStates.get(guild.id);
      if (!ms || !ms.currentTrack) {
        await safeReply(message, re("Nothing is currently playing."));
        return true;
      }
      const elapsed = Date.now() - ms.startedAt + ms.seekOffset;
      const total = ms.currentTrack.durationMs;
      await safeReply(message, {
        embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Now Playing")
          .setDescription(`**[${ms.currentTrack.title}](${ms.currentTrack.url})**\n\n${progressBar(elapsed, total)} \`${fmtDuration(elapsed)} / ${ms.currentTrack.duration}\``)
          .addFields(
            { name: "Requested by", value: `<@${ms.currentTrack.requestedBy}>`, inline: true },
            { name: "Volume", value: `${ms.volume}%`, inline: true },
            { name: "Loop", value: ms.loop ? "Track" : ms.loopQueue ? "Queue" : "Off", inline: true },
          )
          .setThumbnail(ms.currentTrack.thumbnail)],
      });
      return true;
    }

    case "volume":
    case "vol": {
      const ms = musicStates.get(guild.id);
      if (!ms) { await safeReply(message, re("Nothing is playing.")); return true; }
      const vol = parseInt(args[0]);
      if (isNaN(vol) || vol < 0 || vol > 200) {
        await safeReply(message, re(`Current volume: **${ms.volume}%**\nUsage: \`${p}volume <0-200>\``));
        return true;
      }
      ms.volume = vol;
      const cur = ms.player.state;
      if (cur.status === AudioPlayerStatus.Playing || cur.status === AudioPlayerStatus.Paused) {
        (cur.resource as AudioResource).volume?.setVolume(vol / 100);
      }
      await safeReply(message, re(`🔊 Volume set to **${vol}%**.`));
      return true;
    }

    case "loop": {
      const ms = musicStates.get(guild.id);
      if (!ms) { await safeReply(message, re("Nothing is playing.")); return true; }
      const sub = args[0]?.toLowerCase();
      if (sub === "queue" || sub === "q") {
        ms.loopQueue = !ms.loopQueue;
        ms.loop = false;
        await safeReply(message, re(`🔁 Queue loop **${ms.loopQueue ? "enabled" : "disabled"}**.`));
      } else {
        ms.loop = !ms.loop;
        ms.loopQueue = false;
        await safeReply(message, re(`🔂 Track loop **${ms.loop ? "enabled" : "disabled"}**.`));
      }
      return true;
    }

    case "shuffle": {
      const ms = musicStates.get(guild.id);
      if (!ms || !ms.queue.length) { await safeReply(message, re("The queue is empty.")); return true; }
      for (let i = ms.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ms.queue[i], ms.queue[j]] = [ms.queue[j], ms.queue[i]];
      }
      await safeReply(message, re(`🔀 Shuffled **${ms.queue.length}** tracks.`));
      return true;
    }

    case "remove": {
      const ms = musicStates.get(guild.id);
      if (!ms || !ms.queue.length) { await safeReply(message, re("The queue is empty.")); return true; }
      const idx = parseInt(args[0]) - 1;
      if (isNaN(idx) || idx < 0 || idx >= ms.queue.length) {
        await safeReply(message, re(`Invalid position. Queue has **${ms.queue.length}** track(s). Usage: \`${p}remove <position>\``));
        return true;
      }
      const removed = ms.queue.splice(idx, 1)[0];
      await safeReply(message, re(`🗑️ Removed **${removed.title}** from the queue.`));
      return true;
    }

    case "seek": {
      const ms = musicStates.get(guild.id);
      if (!ms || !ms.currentTrack) { await safeReply(message, re("Nothing is playing.")); return true; }
      const raw = args[0];
      if (!raw) { await safeReply(message, re(`Usage: \`${p}seek <time>\` — e.g. \`${p}seek 1:30\` or \`${p}seek 90\``)); return true; }
      let secs = 0;
      if (raw.includes(":")) {
        const parts = raw.split(":").map(Number);
        if (parts.length === 2) secs = (parts[0] || 0) * 60 + (parts[1] || 0);
        else if (parts.length === 3) secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
      } else {
        secs = parseInt(raw);
      }
      if (isNaN(secs) || secs < 0) { await safeReply(message, re("Invalid time format.")); return true; }
      try {
        const resource = await createYtdlResource(ms.currentTrack.url, ms.volume, secs);
        ms.player.play(resource);
        ms.startedAt = Date.now() - secs * 1000;
        ms.seekOffset = secs * 1000;
        await safeReply(message, re(`⏩ Seeked to **${fmtDuration(secs * 1000)}**.`));
      } catch {
        await safeReply(message, re("Failed to seek to that position."));
      }
      return true;
    }

    case "lyrics": {
      const ms = musicStates.get(guild.id);
      const query = args.join(" ").trim() || ms?.currentTrack?.title;
      if (!query) { await safeReply(message, re(`Usage: \`${p}lyrics <song name>\` or use it while a track is playing.`)); return true; }
      const loading = await safeReply(message, re("🔍 Searching for lyrics..."));
      const lyrics = await fetchLyrics(query);
      if (!lyrics) {
        await loading.edit(re("Couldn't find lyrics for that song."));
        return true;
      }
      const chunks = lyrics.match(/[\s\S]{1,4000}/g) ?? [];
      await loading.edit({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`Lyrics: ${query.slice(0, 200)}`)
          .setDescription(chunks[0] ?? lyrics.slice(0, 4096))
          .setFooter({ text: chunks.length > 1 ? `Page 1/${chunks.length}` : "Powered by lyrics.ovh" })],
      });
      return true;
    }

    case "247": {
      const ms = musicStates.get(guild.id);
      if (!ms) { await safeReply(message, re("Nothing is playing — use `play` first.")); return true; }
      ms.is247 = !ms.is247;
      await safeReply(message, re(`🕐 24/7 mode **${ms.is247 ? "enabled" : "disabled"}**. ${ms.is247 ? "I'll stay in the VC even when the queue is empty." : "I'll leave after the queue ends."}`));
      return true;
    }

    case "disconnect":
    case "dc":
    case "leave": {
      const ms = musicStates.get(guild.id);
      if (!ms) {
        const conn = getVoiceConnection(guild.id);
        if (conn) { conn.destroy(); await message.react("👋"); return true; }
        await safeReply(message, re("I'm not in a voice channel."));
        return true;
      }
      ms.queue = [];
      ms.player.stop(true);
      ms.connection.destroy();
      musicStates.delete(guild.id);
      await message.react("👋");
      return true;
    }

    case "tts": {
      const text = args.join(" ").trim();
      if (!text) {
        await safeReply(message, re(`Usage: \`${p}tts <text>\` — speak text in your voice channel.\nOptional voice: \`${p}tts voice:<Brian|Amy|Joey> text\``));
        return true;
      }
      const memberVc = message.member?.voice.channel as VoiceChannel | null;
      if (!memberVc) {
        await safeReply(message, re("You need to be in a voice channel first."));
        return true;
      }

      let voice = "Brian";
      let ttsText = text;
      const voiceMatch = text.match(/^voice:(\w+)\s+([\s\S]+)$/i);
      if (voiceMatch) { voice = voiceMatch[1]; ttsText = voiceMatch[2]; }

      if (ttsText.length > 500) {
        await safeReply(message, re("TTS text must be 500 characters or fewer."));
        return true;
      }

      let connection = getVoiceConnection(guild.id);
      const existing = musicStates.get(guild.id);
      if (connection && existing && existing.connection.joinConfig.channelId !== memberVc.id) {
        await safeReply(message, re("I'm playing music in a different VC. Use `stop` first."));
        return true;
      }

      if (!connection) {
        connection = joinVoiceChannel({
          channelId: memberVc.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: false,
        });
      }

      const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(ttsText)}`;

      try {
        const { Readable } = await import("stream");
        const audioData = await new Promise<Buffer>((resolve, reject) => {
          https.get(ttsUrl, (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
            res.on("error", reject);
          }).on("error", reject);
        });

        const stream = Readable.from(audioData);
        const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });

        const player = existing?.player ?? createAudioPlayer();
        connection.subscribe(player);
        player.play(resource);

        await message.react("🔊");
      } catch {
        await safeReply(message, re("Failed to generate TTS audio."));
      }
      return true;
    }

    default:
      return false;
  }
}
