import { EmbedBuilder, TextChannel, Message, PermissionFlagsBits } from "discord.js";
import { BLOCKED_TERMS, BLOCKED_PATTERNS } from "./wordlist.js";
import { MASS_MENTION_THRESHOLD, FILTER_DM_COOLDOWN_MS, SIGHTENGINE_USER, SIGHTENGINE_SECRET } from "./constants.js";
import { getGS, filterDmCooldown } from "./state.js";
import { gch } from "./utils.js";
import { COLORS } from "./colors.js";

// ─── Character substitution map (Cyrillic, Greek, leet) — built once ─────────
const _CHAR_MAP: Record<string, string> = {
  'а':'a','А':'a','е':'e','Е':'e','о':'o','О':'o',
  'р':'p','Р':'p','с':'c','С':'c','х':'x','Х':'x',
  'і':'i','І':'i','у':'u','У':'u','т':'t','Т':'t',
  'к':'k','К':'k','м':'m','М':'m','н':'n','Н':'n',
  'в':'b','В':'b','Ь':'b',
  'α':'a','Α':'a','ε':'e','Ε':'e','ο':'o','Ο':'o',
  'ν':'n','Ν':'n','η':'n','Η':'n','ρ':'p','Ρ':'p',
  'τ':'t','Τ':'t','κ':'k','Κ':'k','χ':'x','Χ':'x',
  'ι':'i','Ι':'i','υ':'u','Υ':'u','μ':'m','Μ':'m',
  'σ':'s','Σ':'s',
  '@':'a','4':'a','3':'e','!':'i','1':'i','|':'i',
  '0':'o','(':'o',')':'o','5':'s','$':'s','7':'t',
  '+':'t','8':'b','6':'g','9':'g','2':'z','ʷ':'w',
};
// Single pre-compiled regex matching every key in _CHAR_MAP — avoids ~38
// separate .replace() calls that would otherwise run on every message.
const _CHAR_MAP_RE = /[аАеЕоОрРсСхХіІуУтТкКмМнНвВЬαΑεΕοΟνΝηΗρΡτΤκΚχΧιΙυΥμΜσΣ@43!1|0()5$7+86920ʷ]/g;

// ─── Text normalization ───────────────────────────────────────────────────────
export function normalizeText(text: string): string {
  let s = text.replace(/\|\||(\*\*)|__|~~|`/g, "");
  s = s.replace(/[\u200B-\u200D\u2060\u2028\u2029\uFEFF\u00AD\u00A0]/g, "");
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(_CHAR_MAP_RE, c => _CHAR_MAP[c] ?? c);
  s = s.replace(/ph/gi, "f");
  return s.toLowerCase();
}

// ─── Pre-compiled blocked-term table (built once at startup) ──────────────────
type CompiledTerm = {
  label: string;
  boundary: RegExp;
  collapsedBoundary: RegExp | null;
};

function compileTerm(term: string): CompiledTerm {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i");
  const collapsed = normalizeText(term).replace(/[^a-z]/g, "");
  const collapsedBoundary = collapsed.length >= 5
    ? new RegExp(`(^|[^a-z])${collapsed}([^a-z]|$)`, "i")
    : null;
  return { label: term, boundary, collapsedBoundary };
}

const _compiledBlockedTerms: CompiledTerm[] = BLOCKED_TERMS.map(compileTerm);

// Cache of compiled custom-word sets — keyed by the Set object itself so we
// avoid spreading + sorting the entire set on every message. We invalidate
// whenever the set's size changes (covers add / delete / clear).
const _customWordCache = new WeakMap<Set<string>, { size: number; compiled: CompiledTerm[] }>();
function getCompiledCustomWords(words: Set<string>): CompiledTerm[] {
  if (words.size === 0) return [];
  const entry = _customWordCache.get(words);
  if (entry && entry.size === words.size) return entry.compiled;
  const compiled = [...words].map(compileTerm);
  _customWordCache.set(words, { size: words.size, compiled });
  return compiled;
}

export function containsBlockedContent(text: string, extraWords?: Set<string>): string | null {
  const normalized = normalizeText(text);
  const original = text.toLowerCase();
  const collapsed = normalized.replace(/[^a-z]/g, "");

  for (const { label, boundary, collapsedBoundary } of _compiledBlockedTerms) {
    if (boundary.test(normalized) || boundary.test(original)) return label;
    if (collapsedBoundary?.test(collapsed)) return label;
  }

  for (const { regex, label } of BLOCKED_PATTERNS) {
    if (regex.test(normalized) || regex.test(original) || regex.test(collapsed)) return label;
  }

  if (extraWords && extraWords.size > 0) {
    for (const { label, boundary, collapsedBoundary } of getCompiledCustomWords(extraWords)) {
      if (boundary.test(normalized) || boundary.test(original)) return label;
      if (collapsedBoundary?.test(collapsed)) return label;
    }
  }

  return null;
}

// ─── Invite code cache — avoids a fetchInvite network call for recently-seen codes ─
// Entries: inviteCode → { guildId: string | null; ts: number }
const _inviteCache = new Map<string, { guildId: string | null; ts: number }>();
const _INVITE_CACHE_TTL = 5 * 60 * 1_000; // 5 minutes

// ─── Automod ──────────────────────────────────────────────────────────────────
export async function handleAutomod(message: Message): Promise<boolean> {
  const content = message.content;
  if (!content) return false;
  const gsAM = getGS(message.guild!.id);
  const automodLogChannel = gch(message.guild!, gsAM.automodLogChannelId);

  if (gsAM.filterBypassUsers.has(message.author.id)) return false;

  // ── Invite link filter ────────────────────────────────────────────────────
  if (
    gsAM.inviteFilterEnabled &&
    !gsAM.antinukeWhitelist.has(message.author.id) &&
    !gsAM.linkFilterBypass.has(message.author.id) &&
    !message.member?.permissions.has(PermissionFlagsBits.ManageMessages)
  ) {
    const invitePattern = /discord(?:\.gg|(?:app)?\.com\/invite)\/([\w-]+)/i;
    // Test against both raw and normalized content to catch lookalike-character evasion
    const rawMatch = invitePattern.exec(content);
    const normalizedMatch = !rawMatch ? invitePattern.exec(normalizeText(content)) : null;
    const inviteCode = (rawMatch ?? normalizedMatch)?.[1];

    if (inviteCode) {
      // Don't block invites that lead back to this same server.
      // Cache results for 5 min to avoid a network round-trip on every message.
      let isOwnServer = false;
      const now = Date.now();
      const cached = _inviteCache.get(inviteCode);
      if (cached && now - cached.ts < _INVITE_CACHE_TTL) {
        isOwnServer = cached.guildId === message.guild!.id;
      } else {
        let resolvedGuildId: string | null = null;
        try {
          const invite = await message.client.fetchInvite(inviteCode);
          resolvedGuildId = invite.guild?.id ?? null;
        } catch {}
        _inviteCache.set(inviteCode, { guildId: resolvedGuildId, ts: now });
        if (_inviteCache.size > 500) {
          const oldest = _inviteCache.keys().next().value;
          if (oldest) _inviteCache.delete(oldest);
        }
        isOwnServer = resolvedGuildId === message.guild!.id;
      }

      if (!isOwnServer) {
        const deleted = await message.delete().then(() => true).catch(() => false);
        // DM user and log in parallel — neither depends on the other
        await Promise.allSettled([
          message.author.send(
            ` Posting Discord invite links in **${message.guild?.name}** is not allowed.\n` +
            `Repeated violations may result in a kick or ban.`
          ).catch(() => {}),
          automodLogChannel ? automodLogChannel.send({ embeds: [
            new EmbedBuilder().setColor(COLORS.orange).setTitle("Invite Link Blocked")
              .addFields(
                { name: "Author", value: `${message.author} (${message.author.tag})`, inline: true },
                { name: "Channel", value: `${message.channel}`, inline: true },
                { name: "Invite", value: `discord.gg/${inviteCode}`, inline: true },
                { name: "Message", value: content.slice(0, 1024) }
              )
              .setFooter({ text: `User ID: ${message.author.id}${deleted ? "" : " • (message could not be deleted)"}` })
              .setTimestamp()
          ]}).catch(() => {}) : Promise.resolve(),
        ]);
        console.log(`[automod] Blocked invite link from ${message.author.tag} (code: ${inviteCode})`);
        return true;
      }
    }
  }

  // ── Mass mention spam ─────────────────────────────────────────────────────
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= MASS_MENTION_THRESHOLD) {
    try { await message.delete(); } catch { return false; }
    // DM user and log in parallel
    await Promise.allSettled([
      message.author.send(
        ` Your message in **${message.guild?.name}** was removed for mass-mentioning ${mentionCount} users/roles.\n` +
        `This is against Discord's Terms of Service.`
      ).catch(() => {}),
      automodLogChannel ? automodLogChannel.send({ embeds: [
        new EmbedBuilder().setColor(COLORS.error).setTitle("Mass Mention Blocked")
          .addFields(
            { name: "Author", value: `${message.author} (${message.author.tag})`, inline: true },
            { name: "Channel", value: `${message.channel}`, inline: true },
            { name: "Mentions", value: `${mentionCount}`, inline: true },
            { name: "Message", value: content.slice(0, 1024) }
          ).setFooter({ text: `User ID: ${message.author.id}` }).setTimestamp()
      ]}).catch(() => {}) : Promise.resolve(),
    ]);
    console.log(`[automod] Blocked mass mention (${mentionCount}) from ${message.author.tag}`);
    return true;
  }

  // ── Newline flood ─────────────────────────────────────────────────────────
  const newlineCount = (content.match(/\n/g) ?? []).length;
  if (newlineCount >= 15) {
    try { await message.delete(); } catch { return false; }
    if (automodLogChannel) {
      await automodLogChannel.send({ embeds: [
        new EmbedBuilder().setColor(COLORS.orange).setTitle("Newline Flood Blocked")
          .addFields(
            { name: "Author", value: `${message.author} (${message.author.tag})`, inline: true },
            { name: "Channel", value: `${message.channel}`, inline: true },
            { name: "Lines", value: `${newlineCount + 1}`, inline: true },
            { name: "Message", value: content.slice(0, 1024) }
          ).setFooter({ text: `User ID: ${message.author.id}` }).setTimestamp()
      ]}).catch(() => {});
    }
    console.log(`[automod] Newline flood from ${message.author.tag} (${newlineCount} newlines)`);
    return true;
  }

  // ── Character repeat flood ─────────────────────────────────────────────────
  if (content.length >= 30) {
    const singleCharFlood = /(.)\1{19,}/.test(content);
    const shortPatternFlood = /(.{2,6})\1{6,}/.test(content);
    const stripped = content.replace(/\s/g, "");
    let charRepeatFlood = false;
    if (stripped.length >= 20) {
      const freq: Record<string, number> = {};
      for (const c of stripped) freq[c] = (freq[c] ?? 0) + 1;
      let maxFreq = 0;
      for (const v of Object.values(freq)) if (v > maxFreq) maxFreq = v;
      charRepeatFlood = maxFreq / stripped.length >= 0.75;
    }
    if (singleCharFlood || shortPatternFlood || charRepeatFlood) {
      try { await message.delete(); } catch { return false; }
      if (automodLogChannel) {
        await automodLogChannel.send({ embeds: [
          new EmbedBuilder().setColor(COLORS.orange).setTitle("Character Repeat Flood Blocked")
            .addFields(
              { name: "Author", value: `${message.author} (${message.author.tag})`, inline: true },
              { name: "Channel", value: `${message.channel}`, inline: true },
              { name: "Message", value: content.slice(0, 1024) }
            ).setFooter({ text: `User ID: ${message.author.id}` }).setTimestamp()
        ]}).catch(() => {});
      }
      console.log(`[automod] Character repeat flood from ${message.author.tag}`);
      return true;
    }
  }

  // ── Copy-paste flood ──────────────────────────────────────────────────────
  if (content.length >= 50) {
    const words = content.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    if (words.length >= 8) {
      const wordFreq: Record<string, number> = {};
      for (const w of words) wordFreq[w] = (wordFreq[w] ?? 0) + 1;
      let maxWordFreq = 0;
      for (const v of Object.values(wordFreq)) if (v > maxWordFreq) maxWordFreq = v;
      if (maxWordFreq / words.length >= 0.55) {
        try { await message.delete(); } catch { return false; }
        if (automodLogChannel) {
          await automodLogChannel.send({ embeds: [
            new EmbedBuilder().setColor(COLORS.orange).setTitle("Copy-Paste Flood Blocked")
              .addFields(
                { name: "Author", value: `${message.author} (${message.author.tag})`, inline: true },
                { name: "Channel", value: `${message.channel}`, inline: true },
                { name: "Message", value: content.slice(0, 1024) }
              ).setFooter({ text: `User ID: ${message.author.id}` }).setTimestamp()
          ]}).catch(() => {});
        }
        console.log(`[automod] Copy-paste flood from ${message.author.tag}`);
        return true;
      }
    }
  }

  const matched = containsBlockedContent(content, gsAM.customFilterWords);
  if (!matched) return false;

  try { await message.delete(); } catch { return false; }

  // DM user and log in parallel — neither depends on the other
  const shouldDm = Date.now() - (filterDmCooldown.get(message.author.id) ?? 0) > FILTER_DM_COOLDOWN_MS;
  if (shouldDm) filterDmCooldown.set(message.author.id, Date.now());

  await Promise.allSettled([
    shouldDm ? message.author.send(
      ` Your message in **${(message.guild as any)?.name}** was removed.\n` +
      `Flagged term: \`${matched}\`\n` +
      `Continued violations may result in a mute or ban.`,
    ).catch(() => {}) : Promise.resolve(),
    automodLogChannel ? automodLogChannel.send({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle("AutoMod — Message Removed")
        .addFields(
          { name: "Author", value: `${message.author} (${message.author.tag})`, inline: true },
          { name: "Channel", value: `${message.channel}`, inline: true },
          { name: "Matched", value: `\`${matched}\``, inline: true },
          { name: "Message", value: content.slice(0, 1024) || "*empty*" },
        )
        .setFooter({ text: `User ID: ${message.author.id}` })
        .setTimestamp()
    ]}).catch(() => {}) : Promise.resolve(),
  ]);

  console.log(`[automod] Removed message from ${message.author.tag} in #${(message.channel as TextChannel).name} — matched: "${matched}"`);
  return true;
}

export async function scanImageUrl(url: string): Promise<{ flagged: boolean; reason: string } | null> {
  if (!SIGHTENGINE_USER || !SIGHTENGINE_SECRET) return null;
  try {
    const params = new URLSearchParams({
      url,
      models: "nudity-2.0,gore",
      api_user: SIGHTENGINE_USER,
      api_secret: SIGHTENGINE_SECRET,
    });
    const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`);
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data.status !== "success") return null;

    const nudityUnsafe =
      (data.nudity?.sexual_activity ?? 0) +
      (data.nudity?.sexual_display ?? 0) +
      (data.nudity?.erotica ?? 0);
    const goreProbability = data.gore?.prob ?? 0;

    if (nudityUnsafe > 0.5)    return { flagged: true, reason: "NSFW / explicit content" };
    if (goreProbability > 0.75) return { flagged: true, reason: "gore / graphic violence" };
    return { flagged: false, reason: "" };
  } catch {
    return null;
  }
}

export async function handleMediaAutomod(message: Message): Promise<boolean> {
  if (!SIGHTENGINE_USER || !SIGHTENGINE_SECRET) return false;
  if (!message.guild) return false;
  const gs = getGS(message.guild.id);
  if (gs.filterBypassUsers.has(message.author.id)) return false;

  const imageAttachments = message.attachments.filter((a) => {
    const ct = a.contentType ?? "";
    return ct.startsWith("image/");
  });

  for (const [, attachment] of imageAttachments) {
    const result = await scanImageUrl(attachment.url);
    if (!result || !result.flagged) continue;

    try { await message.delete(); } catch { return false; }

    try {
      await message.author.send(
        ` Your image in **${message.guild.name}** was removed because it was detected as **${result.reason}**.\n` +
        `Please follow Discord's Terms of Service and community rules.\n` +
        `Repeated violations may result in a kick or ban.`
      );
    } catch {}

    const logChannel = gch(message.guild, gs.automodLogChannelId);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle("AutoMod — Image Removed")
        .addFields(
          { name: "Author",  value: `${message.author} (${message.author.tag})`, inline: true },
          { name: "Channel", value: `${message.channel}`, inline: true },
          { name: "Reason",  value: result.reason, inline: true },
          { name: "File",    value: attachment.name ?? "unknown", inline: false },
        )
        .setFooter({ text: `User ID: ${message.author.id}` })
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    }

    console.log(`[automod] Removed image from ${message.author.tag} in #${(message.channel as TextChannel).name} — reason: ${result.reason}`);
    return true;
  }

  return false;
}
