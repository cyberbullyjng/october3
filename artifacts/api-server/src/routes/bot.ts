import { Router } from "express";
import { db } from "@workspace/db";
import { botStatusTable, serversTable } from "@workspace/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { PostBotStatusBody, PostServerEventBody } from "@workspace/api-zod";

const router = Router();

router.post("/bot/status", async (req, res) => {
  const parsed = PostBotStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  await db.insert(botStatusTable).values({ ...parsed.data, updatedAt: new Date() });
  res.json({ ok: true });
});

router.get("/bot/status", async (_req, res) => {
  const [row] = await db.select().from(botStatusTable).orderBy(desc(botStatusTable.updatedAt)).limit(1);
  if (!row) { res.json({ id: 0, uptime: 0, latency: 0, guildCount: 0, userCount: 0, updatedAt: new Date() }); return; }
  res.json(row);
});

router.post("/bot/server-event", async (req, res) => {
  const parsed = PostServerEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { type, discordId, name, memberCount, iconUrl } = parsed.data;

  if (type === "join") {
    await db.execute(
      sql`INSERT INTO servers (discord_id, name, member_count, icon_url, joined_at)
          VALUES (${discordId}, ${name}, ${memberCount}, ${iconUrl ?? null}, NOW())
          ON CONFLICT (discord_id) DO UPDATE
            SET name = EXCLUDED.name, member_count = EXCLUDED.member_count,
                icon_url = EXCLUDED.icon_url, left_at = NULL`,
    );
  } else {
    await db.execute(sql`UPDATE servers SET left_at = NOW() WHERE discord_id = ${discordId}`);
  }
  res.json({ ok: true });
});

export default router;
