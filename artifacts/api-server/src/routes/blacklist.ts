import { Router } from "express";
import { db } from "@workspace/db";
import { blacklistedUsersTable, blacklistedServersTable, auditLogsTable } from "@workspace/db/schema";
import { desc, ilike, eq, or, count } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  BlacklistUserBody, BlacklistServerBody, UpdateBlacklistedUserBody, UpdateBlacklistedServerBody,
  UpdateBlacklistedUserParams, UpdateBlacklistedServerParams, UnblacklistUserParams, UnblacklistServerParams,
} from "@workspace/api-zod";

const router = Router();

// ─── Users ─────────────────────────────────────────────────────────────────────
router.get("/blacklist/users", requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const search = req.query.search ? String(req.query.search) : null;

  const where = search
    ? or(ilike(blacklistedUsersTable.username, `%${search}%`), ilike(blacklistedUsersTable.discordId, `%${search}%`))
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(blacklistedUsersTable).where(where).orderBy(desc(blacklistedUsersTable.addedAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(blacklistedUsersTable).where(where),
  ]);
  res.json({ data: rows, total: Number(total), page, limit });
});

router.post("/blacklist/users", requireAuth, async (req: AuthRequest, res) => {
  const parsed = BlacklistUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [row] = await db.insert(blacklistedUsersTable).values({
    ...parsed.data, addedBy: req.admin?.username ?? "admin",
  }).returning();
  await db.insert(auditLogsTable).values({
    adminId: req.admin!.id, adminUsername: req.admin!.username,
    action: "blacklist_user", target: parsed.data.discordId, detail: parsed.data.reason,
  });
  res.status(201).json(row);
});

router.patch("/blacklist/users/:id", requireAuth, async (req: AuthRequest, res) => {
  const { id } = UpdateBlacklistedUserParams.parse(req.params);
  const parsed = UpdateBlacklistedUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [row] = await db.update(blacklistedUsersTable).set(parsed.data).where(eq(blacklistedUsersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await db.insert(auditLogsTable).values({
    adminId: req.admin!.id, adminUsername: req.admin!.username,
    action: "update_blacklisted_user", target: String(id), detail: parsed.data.reason,
  });
  res.json(row);
});

router.delete("/blacklist/users/:id", requireAuth, async (req: AuthRequest, res) => {
  const { id } = UnblacklistUserParams.parse(req.params);
  await db.delete(blacklistedUsersTable).where(eq(blacklistedUsersTable.id, id));
  await db.insert(auditLogsTable).values({
    adminId: req.admin!.id, adminUsername: req.admin!.username,
    action: "unblacklist_user", target: String(id),
  });
  res.status(204).end();
});

// ─── Servers ────────────────────────────────────────────────────────────────────
router.get("/blacklist/servers", requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const search = req.query.search ? String(req.query.search) : null;

  const where = search
    ? or(ilike(blacklistedServersTable.serverName, `%${search}%`), ilike(blacklistedServersTable.discordId, `%${search}%`))
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(blacklistedServersTable).where(where).orderBy(desc(blacklistedServersTable.addedAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(blacklistedServersTable).where(where),
  ]);
  res.json({ data: rows, total: Number(total), page, limit });
});

router.post("/blacklist/servers", requireAuth, async (req: AuthRequest, res) => {
  const parsed = BlacklistServerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [row] = await db.insert(blacklistedServersTable).values({
    ...parsed.data, addedBy: req.admin?.username ?? "admin",
  }).returning();
  await db.insert(auditLogsTable).values({
    adminId: req.admin!.id, adminUsername: req.admin!.username,
    action: "blacklist_server", target: parsed.data.discordId, detail: parsed.data.reason,
  });
  res.status(201).json(row);
});

router.patch("/blacklist/servers/:id", requireAuth, async (req: AuthRequest, res) => {
  const { id } = UpdateBlacklistedServerParams.parse(req.params);
  const parsed = UpdateBlacklistedServerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [row] = await db.update(blacklistedServersTable).set(parsed.data).where(eq(blacklistedServersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/blacklist/servers/:id", requireAuth, async (req: AuthRequest, res) => {
  const { id } = UnblacklistServerParams.parse(req.params);
  await db.delete(blacklistedServersTable).where(eq(blacklistedServersTable.id, id));
  await db.insert(auditLogsTable).values({
    adminId: req.admin!.id, adminUsername: req.admin!.username,
    action: "unblacklist_server", target: String(id),
  });
  res.status(204).end();
});

export default router;
