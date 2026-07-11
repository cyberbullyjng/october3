import * as fs from "fs";
import * as path from "path";
import "./healthcheck.js";
import client from "./client.js";
import { TOKEN } from "./constants.js";
import { loadState, flushState, cleanupCaches } from "./state.js";

// ─── Single-instance PID lock ─────────────────────────────────────────────────
{
  const LOCK_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "bot.pid");
  const myPid = process.pid;

  const getProcessCwd = (pid: number): string | null => {
    try {
      return fs.realpathSync(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  };

  const oldPid = (() => {
    try { return parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10); } catch { return null; }
  })();

  if (oldPid && oldPid !== myPid) {
    let running = false;
    try { process.kill(oldPid, 0); running = true; } catch { running = false; }
    if (running) {
      const oldCwd = getProcessCwd(oldPid);
      const currentCwd = fs.realpathSync(process.cwd());
      if (oldCwd === currentCwd) {
        console.log(`[lock] Previous bot process (PID ${oldPid}) is still running; asking it to stop before starting this instance.`);
        try { process.kill(oldPid, "SIGTERM"); } catch {}
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          try {
            process.kill(oldPid, 0);
            await new Promise((r) => setTimeout(r, 250));
          } catch {
            break;
          }
        }
        try {
          process.kill(oldPid, 0);
          console.error(`[lock] Previous bot process (PID ${oldPid}) did not stop; aborting this startup to avoid duplicate Discord sessions.`);
          process.exit(1);
        } catch {}
      } else {
        console.log(`[lock] Ignoring stale PID file for unrelated process ${oldPid}.`);
      }
    }
  }

  fs.writeFileSync(LOCK_FILE, String(myPid), "utf8");

  const cleanup = () => {
    try {
      if (fs.readFileSync(LOCK_FILE, "utf8").trim() === String(myPid)) {
        fs.unlinkSync(LOCK_FILE);
      }
    } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGTERM", () => { flushState(); cleanup(); process.exit(0); });
  process.on("SIGINT",  () => { flushState(); cleanup(); process.exit(0); });
}

// ─── Register all event handlers (side-effect imports) ───────────────────────
import "./events/message-create.js";
import "./events/presence-update.js";
import "./events/member-add.js";
import "./events/member-remove.js";
import "./events/message-delete.js";
import "./events/message-update.js";
import "./events/voice-state.js";
import "./events/member-update.js";
import "./events/interactions.js";
import "./events/channel-events.js";
import "./events/antinuke-events.js";
import "./events/ready.js";

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadState();

setInterval(cleanupCaches, 5 * 60 * 1000).unref();

client.rest.on("rateLimited", (info) => {
  console.warn(
    `[rate-limit] ${info.method.toUpperCase()} ${info.route}` +
    ` — retry in ${info.timeToReset}ms` +
    `${info.global ? " (GLOBAL)" : ""}`
  );
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

client.login(TOKEN).catch((err) => {
  console.error("[bot] Failed to login to Discord:", err?.message ?? err);
  console.warn("[bot] Running in web-only mode — HTTP server remains active.");
});
