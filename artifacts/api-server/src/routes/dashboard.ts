import { Router } from "express";
import { db } from "@workspace/db";
import { commandLogsTable, blacklistedUsersTable, blacklistedServersTable, botUsersTable, serversTable, botStatusTable } from "@workspace/db/schema";
import { desc, gte, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const [
    [{ total: totalServers }],
    [{ total: totalUsers }],
    [{ total: commandsToday }],
    [{ total: commandsThisWeek }],
    [{ total: blacklistedUsers }],
    [{ total: blacklistedServers }],
    latestStatus,
  ] = await Promise.all([
    db.select({ total: count() }).from(serversTable),
    db.select({ total: count() }).from(botUsersTable),
    db.select({ total: count() }).from(commandLogsTable).where(gte(commandLogsTable.timestamp, todayStart)),
    db.select({ total: count() }).from(commandLogsTable).where(gte(commandLogsTable.timestamp, weekStart)),
    db.select({ total: count() }).from(blacklistedUsersTable),
    db.select({ total: count() }).from(blacklistedServersTable),
    db.select().from(botStatusTable).orderBy(desc(botStatusTable.updatedAt)).limit(1),
  ]);

  res.json({
    totalServers: Number(totalServers),
    totalUsers: Number(totalUsers),
    commandsToday: Number(commandsToday),
    commandsThisWeek: Number(commandsThisWeek),
    blacklistedUsers: Number(blacklistedUsers),
    blacklistedServers: Number(blacklistedServers),
    uptime: latestStatus[0]?.uptime ?? 0,
    latency: latestStatus[0]?.latency ?? 0,
  });
});

router.get("/dashboard/feed", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const logs = await db
    .select()
    .from(commandLogsTable)
    .orderBy(desc(commandLogsTable.timestamp))
    .limit(limit);
  res.json(logs);
});

export default router;
