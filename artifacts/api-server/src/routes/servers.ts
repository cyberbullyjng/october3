import { Router } from "express";
import { db } from "@workspace/db";
import { serversTable } from "@workspace/db/schema";
import { desc, asc, ilike, eq, count, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

const SORT_COLS = { name: serversTable.name, memberCount: serversTable.memberCount, joinedAt: serversTable.joinedAt } as const;

router.get("/servers", requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const search = req.query.search ? String(req.query.search) : null;
  const sortBy = (req.query.sortBy as keyof typeof SORT_COLS) in SORT_COLS
    ? (req.query.sortBy as keyof typeof SORT_COLS) : "joinedAt";
  const order = req.query.order === "asc" ? "asc" : "desc";
  const col = SORT_COLS[sortBy];
  const where = search ? ilike(serversTable.name, `%${search}%`) : isNull(serversTable.leftAt);

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(serversTable).where(where)
      .orderBy(order === "asc" ? asc(col) : desc(col))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(serversTable).where(where),
  ]);
  res.json({ data: rows, total: Number(total), page, limit });
});

router.get("/servers/:serverId", requireAuth, async (req, res) => {
  const [row] = await db.select().from(serversTable).where(eq(serversTable.discordId, req.params.serverId)).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
