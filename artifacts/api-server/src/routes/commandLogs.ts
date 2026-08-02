import { Router } from "express";
import { db } from "@workspace/db";
import { commandLogsTable } from "@workspace/db/schema";
import { desc, eq, ilike, and, gte, lte, sql, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { CreateCommandLogBody } from "@workspace/api-zod";

const router = Router();

router.get("/command-logs", requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (req.query.userId) conditions.push(eq(commandLogsTable.userId, String(req.query.userId)));
  if (req.query.serverId) conditions.push(eq(commandLogsTable.serverId, String(req.query.serverId)));
  if (req.query.command) conditions.push(ilike(commandLogsTable.command, `%${req.query.command}%`));
  if (req.query.status) conditions.push(eq(commandLogsTable.status, req.query.status as "success" | "failure"));
  if (req.query.from) conditions.push(gte(commandLogsTable.timestamp, new Date(String(req.query.from))));
  if (req.query.to) conditions.push(lte(commandLogsTable.timestamp, new Date(String(req.query.to))));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(commandLogsTable).where(where).orderBy(desc(commandLogsTable.timestamp)).limit(limit).offset(offset),
    db.select({ total: db.$count(commandLogsTable, where) }).from(commandLogsTable).where(where),
  ]);

  res.json({ data: rows, total: Number(total), page, limit });
});

router.post("/command-logs", async (req, res) => {
  const parsed = CreateCommandLogBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { username, userId, serverName, serverId, command, status, errorMessage, timestamp } = parsed.data;
  const [row] = await db.insert(commandLogsTable).values({
    username, userId, serverName, serverId, command,
    status: status as "success" | "failure",
    errorMessage: errorMessage ?? null,
    timestamp: timestamp ? new Date(timestamp as unknown as string) : new Date(),
  }).returning();

  // Upsert bot user
  await db.execute(
    sql`INSERT INTO bot_users (discord_id, username, commands_used, last_seen)
        VALUES (${userId}, ${username}, 1, NOW())
        ON CONFLICT (discord_id) DO UPDATE
          SET username = EXCLUDED.username, commands_used = bot_users.commands_used + 1, last_seen = NOW()`,
  );

  res.status(201).json(row);
});

router.get("/command-logs/export", requireAuth, async (req, res) => {
  const conditions: SQL[] = [];
  if (req.query.userId) conditions.push(eq(commandLogsTable.userId, String(req.query.userId)));
  if (req.query.serverId) conditions.push(eq(commandLogsTable.serverId, String(req.query.serverId)));
  if (req.query.command) conditions.push(ilike(commandLogsTable.command, `%${req.query.command}%`));
  if (req.query.from) conditions.push(gte(commandLogsTable.timestamp, new Date(String(req.query.from))));
  if (req.query.to) conditions.push(lte(commandLogsTable.timestamp, new Date(String(req.query.to))));

  const rows = await db.select().from(commandLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(commandLogsTable.timestamp))
    .limit(10000);

  const header = "id,username,userId,serverName,serverId,command,status,timestamp,errorMessage\n";
  const csv = rows.map(r =>
    `${r.id},"${r.username}","${r.userId}","${r.serverName}","${r.serverId}","${r.command}","${r.status}","${r.timestamp.toISOString()}","${r.errorMessage ?? ""}"`
  ).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=command-logs.csv");
  res.send(header + csv);
});

export default router;
