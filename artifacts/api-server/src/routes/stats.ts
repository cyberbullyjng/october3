import { Router } from "express";
import { db } from "@workspace/db";
import { commandLogsTable, serversTable, botUsersTable } from "@workspace/db/schema";
import { sql, desc, gte, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

function periodStart(period: string): Date {
  const now = new Date();
  if (period === "weekly") { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
  if (period === "monthly") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  // daily
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

router.get("/stats/commands", requireAuth, async (req, res) => {
  const period = String(req.query.period || "daily");
  const since = periodStart(period);

  const [topCommands, chartRows] = await Promise.all([
    db.select({
      command: commandLogsTable.command,
      count: count(),
    }).from(commandLogsTable)
      .where(gte(commandLogsTable.timestamp, since))
      .groupBy(commandLogsTable.command)
      .orderBy(desc(count()))
      .limit(10),

    // Daily chart — last 30 buckets depending on period
    db.execute(sql`
      SELECT
        to_char(date_trunc(${period === "monthly" ? "month" : period === "weekly" ? "week" : "day"}, timestamp), 'YYYY-MM-DD') AS label,
        COUNT(*)::int AS value
      FROM command_logs
      WHERE timestamp >= ${since}
      GROUP BY 1
      ORDER BY 1
    `),
  ]);

  const sorted = [...topCommands].sort((a, b) => Number(a.count) - Number(b.count));

  res.json({
    topCommands: topCommands.map(r => ({ command: r.command, count: Number(r.count) })),
    leastUsedCommands: sorted.slice(0, 10).map(r => ({ command: r.command, count: Number(r.count) })),
    chartData: (chartRows.rows as { label: string; value: number }[]).map(r => ({ label: r.label, value: Number(r.value) })),
  });
});

router.get("/stats/growth", requireAuth, async (req, res) => {
  const period = String(req.query.period || "daily");
  const bucket = period === "monthly" ? "month" : period === "weekly" ? "week" : "day";
  const since = periodStart(period);

  const [serverRows, userRows] = await Promise.all([
    db.execute(sql`
      SELECT to_char(date_trunc(${bucket}, joined_at), 'YYYY-MM-DD') AS label, COUNT(*)::int AS value
      FROM servers WHERE joined_at >= ${since} GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT to_char(date_trunc(${bucket}, last_seen), 'YYYY-MM-DD') AS label, COUNT(*)::int AS value
      FROM bot_users WHERE last_seen >= ${since} GROUP BY 1 ORDER BY 1
    `),
  ]);

  res.json({
    serverGrowth: (serverRows.rows as { label: string; value: number }[]).map(r => ({ label: r.label, value: Number(r.value) })),
    userGrowth: (userRows.rows as { label: string; value: number }[]).map(r => ({ label: r.label, value: Number(r.value) })),
  });
});

export default router;
