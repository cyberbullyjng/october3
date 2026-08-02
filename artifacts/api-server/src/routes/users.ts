import { Router } from "express";
import { db } from "@workspace/db";
import { botUsersTable, commandLogsTable } from "@workspace/db/schema";
import { desc, ilike, eq, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/users", requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const search = req.query.search ? String(req.query.search) : null;

  const where = search ? ilike(botUsersTable.username, `%${search}%`) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(botUsersTable).where(where).orderBy(desc(botUsersTable.lastSeen)).limit(limit).offset(offset),
    db.select({ total: count() }).from(botUsersTable).where(where),
  ]);
  res.json({ data: rows, total: Number(total), page, limit });
});

router.get("/users/:userId", requireAuth, async (req, res) => {
  const [user] = await db.select().from(botUsersTable).where(eq(botUsersTable.discordId, req.params.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  const recentActivity = await db.select().from(commandLogsTable)
    .where(eq(commandLogsTable.userId, req.params.userId))
    .orderBy(desc(commandLogsTable.timestamp))
    .limit(20);

  res.json({ user, recentActivity });
});

export default router;
