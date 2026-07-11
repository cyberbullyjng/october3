import { EmbedBuilder, TextChannel } from "discord.js";
import type { BlackteaGame, BtPlayer } from "./types.js";
import { isOwner } from "./constants.js";
import { getGS, blackteaGames, wordValidCache } from "./state.js";
import { saveState } from "./state.js";
import client from "./client.js";
import { COLORS } from "./colors.js";

export const BT_TURN_MS  = 10_000;
export const BT_LOBBY_MS = 30_000;
export const BT_JOIN_EMOJI = "🍵";

const BT_SEQUENCES = [
  "ing", "ent", "ion", "ant", "est", "ous", "ful", "ess", "ish", "ive",
  "age", "ure", "ary", "ory", "ity", "ify", "ize", "ism", "ist", "ness",
  "ment", "tion", "sion", "ance", "ence", "able", "ible",
  "ate", "ite", "ute", "ote", "ete", "ake", "ike", "oke",
  "ale", "ile", "ole", "ule", "ame", "ime", "ome",
  "ane", "ine", "one", "une", "ade", "ide", "ode",
  "are", "ire", "ore", "ose", "ise", "ave", "ove",
  "ack", "eck", "ick", "ock", "uck",
  "all", "ell", "ill", "oll", "ull",
  "ang", "ing", "ong", "ung",
  "ank", "ink", "onk", "unk",
  "ash", "esh", "ish", "ush",
  "ast", "est", "ist", "ost", "ust",
  "atch", "etch", "itch",
  "and", "end", "ind", "ond", "und",
  "ard", "ord", "urt",
  "art", "ort", "irt",
  "air", "ear", "oor", "our",
  "old", "ild", "eld",
  "oom", "oon", "oop", "oot",
  "out", "own", "awn",
  "pre", "per", "pro", "con", "com", "sub", "ter", "par", "nar", "war",
  "str", "spr", "scr", "thr", "shr",
  "tion", "nder", "nter", "ster", "ther", "ther", "ight", "ound", "ount",
  "ower", "ower", "iver", "over", "ever", "iver",
];

const BT_EASY_SETS = [
  ["i","n","g"], ["e","n","t"], ["i","o","n"], ["a","t","e"],
  ["a","n","t"], ["e","s","t"], ["o","u","t"], ["a","n","d"],
  ["o","l","d"], ["a","r","e"],
];

export function generateBlackteaLetters(): string[] {
  const seq = BT_SEQUENCES[Math.floor(Math.random() * BT_SEQUENCES.length)];
  return seq.split("");
}

export function canMakeWord(word: string, letters: string[]): boolean {
  if (word.length < 3) return false;
  const seq = letters.join("").toLowerCase();
  return word.toLowerCase().includes(seq);
}

const _wordInFlight = new Map<string, Promise<boolean>>();

export async function isRealWord(word: string): Promise<boolean> {
  const key = word.toLowerCase();
  if (wordValidCache.has(key)) return wordValidCache.get(key)!;
  if (_wordInFlight.has(key)) return _wordInFlight.get(key)!;
  const req = fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`)
    .then((res) => { const valid = res.ok; wordValidCache.set(key, valid); return valid; })
    .catch(() => false)
    .finally(() => _wordInFlight.delete(key));
  _wordInFlight.set(key, req);
  return req;
}

export function btHearts(lives: number) { return "".repeat(lives) + "".repeat(2 - lives); }

export async function btStartTurn(game: BlackteaGame, channel: TextChannel) {
  if (game.turnTimer) { clearTimeout(game.turnTimer); game.turnTimer = null; }
  const player = game.players[game.currentIdx];
  if (isOwner(player.userId)) {
    const set = BT_EASY_SETS[Math.floor(Math.random() * BT_EASY_SETS.length)];
    game.letters = [...set];
  } else {
    game.letters = generateBlackteaLetters();
  }
  game.turnStartedAt = Date.now();
  const footer = game.solo
    ? `Score: ${game.score}  •  Lives: ${btHearts(player.lives)}`
    : `Lives: ${btHearts(player.lives)}  •  ${game.players.length} player${game.players.length !== 1 ? "s" : ""} left`;
  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(COLORS.tea)
      .setTitle(game.solo ? " Blacktea — Solo" : " Blacktea")
      .setDescription(
        `<@${player.userId}> — your turn!\n\n` +
        `Sequence: **\`${game.letters.join("")}\`**\n\n` +
        `Type a valid word that contains **${game.letters.join("")}**. **10 seconds!**`
      )
      .setFooter({ text: footer })],
  }).catch(() => {});
  game.turnTimer = setTimeout(() => { btHandleTimeout(game.channelId, game.guildId).catch(() => {}); }, BT_TURN_MS);
}

export async function btHandleTimeout(channelId: string, guildId: string) {
  const game = blackteaGames.get(channelId);
  if (!game || game.phase !== "active") return;
  if (game.turnTimer) { clearTimeout(game.turnTimer); game.turnTimer = null; }
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel) return;
  const player = game.players[game.currentIdx];
  player.lives--;
  await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(` <@${player.userId}> ran out of time! ${btHearts(player.lives)}`)] }).catch(() => {});
  if (player.lives <= 0) { await btEliminate(game, channel); }
  else { game.currentIdx = (game.currentIdx + 1) % game.players.length; await btStartTurn(game, channel); }
}

export async function btEliminate(game: BlackteaGame, channel: TextChannel) {
  const gs = getGS(game.guildId);
  if (game.solo) {
    const player = game.players[0];
    blackteaGames.delete(game.channelId);
    await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setTitle("Blacktea — Solo Over!").setDescription(`<@${player.userId}> finished with a score of **${game.score}** word${game.score !== 1 ? "s" : ""}! `)] }).catch(() => {});
    return;
  }
  const player = game.players[game.currentIdx];
  await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(` <@${player.userId}> has been **eliminated!**`)] }).catch(() => {});
  game.players.splice(game.currentIdx, 1);
  if (game.players.length <= 1) {
    const winner = game.players[0] ?? null;
    blackteaGames.delete(game.channelId);
    if (winner) {
      gs.blackteaWins.set(winner.userId, (gs.blackteaWins.get(winner.userId) ?? 0) + 1);
      saveState();
    }
    await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setTitle("Blacktea — Game Over!").setDescription(winner ? ` <@${winner.userId}> wins the blacktea game! (${gs.blackteaWins.get(winner.userId)} total win${(gs.blackteaWins.get(winner.userId) ?? 1) !== 1 ? "s" : ""})` : "Everyone got eliminated. The tea went cold. ")] }).catch(() => {});
    return;
  }
  if (game.currentIdx >= game.players.length) game.currentIdx = 0;
  await btStartTurn(game, channel);
}

export async function btBegin(game: BlackteaGame, channel: TextChannel) {
  game.phase = "active";
  game.currentIdx = 0;
  const list = game.players.map((p: BtPlayer) => `• <@${p.userId}> ${btHearts(p.lives)}`).join("\n");
  await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.tea).setTitle("Blacktea — Game Starting!").setDescription(`**${game.players.length} players joined:**\n${list}\n\nEach player gets a letter sequence and **10 seconds** to type a word containing it.\nLose all 2 lives and you're out!`)] }).catch(() => {});
  await btStartTurn(game, channel);
}
