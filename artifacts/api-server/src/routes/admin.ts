import { Router } from "express";
import { db } from "@workspace/db";
import { adminUsersTable, apiKeysTable, auditLogsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { signToken, comparePassword, generateApiKey, hashApiKey } from "../lib/auth.js";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { AdminLoginBody, CreateApiKeyBody, DeleteApiKeyParams } from "@workspace/api-zod";

const router = Router();

router.post("/admin/login", async (req, res) => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { username, password } = parsed.data;
  const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username)).limit(1);
  if (!admin) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const valid = await comparePassword(password, admin.passwordHash);
  if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const token = signToken({ id: admin.id, username: admin.username, role: admin.role });
  res.json({ token, admin: { id: admin.id, username: admin.username, role: admin.role } });
});

router.get("/admin/me", requireAuth, async (req: AuthRequest, res) => {
  const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, req.admin!.id)).limit(1);
  if (!admin) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: admin.id, username: admin.username, role: admin.role });
});

router.get("/admin/api-keys", requireAuth, async (_req, res) => {
  const keys = await db.select({
    id: apiKeysTable.id,
    name: apiKeysTable.name,
    prefix: apiKeysTable.prefix,
    createdAt: apiKeysTable.createdAt,
    lastUsedAt: apiKeysTable.lastUsedAt,
  }).from(apiKeysTable).orderBy(desc(apiKeysTable.createdAt));
  res.json(keys);
});

router.post("/admin/api-keys", requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateApiKeyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { key, prefix, keyHash } = generateApiKey();
  const [row] = await db.insert(apiKeysTable).values({
    name: parsed.data.name,
    prefix,
    keyHash,
  }).returning();

  await db.insert(auditLogsTable).values({
    adminId: req.admin!.id,
    adminUsername: req.admin!.username,
    action: "create_api_key",
    target: parsed.data.name,
  });

  res.status(201).json({ id: row.id, name: row.name, prefix: row.prefix, key, createdAt: row.createdAt });
});

router.delete("/admin/api-keys/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id));
  await db.insert(auditLogsTable).values({
    adminId: req.admin!.id,
    adminUsername: req.admin!.username,
    action: "delete_api_key",
    target: String(id),
  });
  res.status(204).end();
});

export default router;
