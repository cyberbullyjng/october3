import { REST, Routes } from "discord.js";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import client from "../../client.js";
import { TOKEN } from "../../constants.js";
import { MOD_SLASH_COMMANDS } from "./definitions.js";

const BOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const HASH_FILE = join(BOT_DIR, "slash_hash.json");

function getCommandsHash(): string {
  const json = JSON.stringify(MOD_SLASH_COMMANDS);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

function loadHashes(): Record<string, string> {
  try {
    if (existsSync(HASH_FILE)) return JSON.parse(readFileSync(HASH_FILE, "utf8"));
  } catch {}
  return {};
}

function saveHashes(hashes: Record<string, string>): void {
  try { writeFileSync(HASH_FILE, JSON.stringify(hashes, null, 2)); } catch {}
}

/**
 * Register slash commands globally (all guilds, ~1h first-time propagation).
 * Pass force=true to skip the hash check and always push.
 */
export async function registerSlashCommandsGlobal(force = false): Promise<void> {
  const currentHash = getCommandsHash();
  const hashes = loadHashes();

  if (!force && hashes["__global__"] === currentHash) {
    console.log(`[slash] Global commands unchanged — skipping registration.`);
    return;
  }

  console.log(`[slash] Registering ${MOD_SLASH_COMMANDS.length} commands globally...`);

  const rest = new REST({ rejectOnRateLimit: () => true }).setToken(TOKEN!);

  try {
    await rest.put(Routes.applicationCommands(client.user!.id), {
      body: MOD_SLASH_COMMANDS,
    });
    hashes["__global__"] = currentHash;
    saveHashes(hashes);
    console.log(`[slash] ✓ Registered ${MOD_SLASH_COMMANDS.length} global commands.`);
  } catch (err: any) {
    const code = err?.rawError?.code ?? err?.code ?? "unknown";
    const discordMsg = err?.rawError?.message ?? err?.message ?? String(err);
    console.error(`[slash] ✗ Global registration failed (code ${code}): ${discordMsg}`);
    throw new Error(`${discordMsg} (code ${code})`);
  }
}

/**
 * Register slash commands for a single guild (instant, no propagation delay).
 * Used by !reloadslash for a quick per-server refresh.
 */
export async function registerSlashCommands(guildId: string, force = false): Promise<void> {
  const currentHash = getCommandsHash();
  const hashes = loadHashes();

  if (!force && hashes[guildId] === currentHash) {
    console.log(`[slash] Commands unchanged for guild ${guildId} — skipping.`);
    return;
  }

  console.log(`[slash] Registering ${MOD_SLASH_COMMANDS.length} commands in guild ${guildId}...`);

  const rest = new REST({ rejectOnRateLimit: () => true }).setToken(TOKEN!);

  try {
    await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), {
      body: MOD_SLASH_COMMANDS,
    });
    hashes[guildId] = currentHash;
    saveHashes(hashes);
    console.log(`[slash] ✓ Registered ${MOD_SLASH_COMMANDS.length} commands in guild ${guildId}`);
  } catch (err: any) {
    const code = err?.rawError?.code ?? err?.code ?? "unknown";
    const retryAfterSec = err?.rawError?.retry_after ?? err?.retryAfter ?? null;
    const discordMsg = err?.rawError?.message ?? err?.message ?? String(err);

    if (code === 30034) {
      console.error(
        `[slash] ✗ Guild ${guildId} — daily command create limit (30034). ` +
        (retryAfterSec ? `Resets in ~${Math.ceil(retryAfterSec)}s. ` : "") +
        `Use !reloadslash once the limit clears.`
      );
      throw new Error(`Daily command create limit hit (error 30034). ${retryAfterSec ? `Retry in ~${Math.ceil(retryAfterSec)}s.` : "Try again tomorrow."}`);
    }

    if (err?.constructor?.name === "RateLimitError" || err?.status === 429) {
      const wait = retryAfterSec ?? err?.timeToReset ?? "unknown";
      console.error(`[slash] ✗ Guild ${guildId} — rate limited (retry_after ${wait}s). Use !reloadslash later.`);
      throw new Error(`Rate limited — retry in ${typeof wait === "number" ? Math.ceil(wait) + "s" : wait}.`);
    }

    console.error(`[slash] ✗ Failed to register commands in guild ${guildId} (code ${code}): ${discordMsg}`);
    throw new Error(`${discordMsg} (code ${code})`);
  }
}
