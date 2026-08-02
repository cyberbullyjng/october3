/**
 * Seed script — run once to create the default admin user and sample data.
 * Usage: npx tsx src/seed.ts
 */
import { db } from "@workspace/db";
import {
  adminUsersTable, commandLogsTable, blacklistedUsersTable,
  blacklistedServersTable, serversTable, botUsersTable, botStatusTable,
} from "@workspace/db/schema";
import { hashPassword } from "./lib/auth.js";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  // Admin user
  const existing = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, "admin")).limit(1);
  if (existing.length === 0) {
    const passwordHash = await hashPassword("admin1234");
    await db.insert(adminUsersTable).values({ username: "admin", passwordHash, role: "superadmin" });
    console.log("Created admin user: admin / admin1234");
  }

  // Sample bot status
  await db.insert(botStatusTable).values({ uptime: 86400, latency: 42, guildCount: 3, userCount: 15 }).onConflictDoNothing();

  // Sample servers
  const sampleServers = [
    { discordId: "1001001001001001001", name: "october's Testing Server", memberCount: 12, joinedAt: new Date("2025-01-01") },
    { discordId: "1002002002002002002", name: "Community Hub", memberCount: 847, joinedAt: new Date("2025-03-15") },
    { discordId: "1003003003003003003", name: "Dev Den", memberCount: 234, joinedAt: new Date("2025-05-20") },
  ];
  for (const s of sampleServers) {
    await db.insert(serversTable).values(s).onConflictDoNothing();
  }

  // Sample bot users
  const sampleUsers = [
    { discordId: "2001001001001001001", username: "cyberbullyjng", commandsUsed: 142, lastSeen: new Date() },
    { discordId: "2002002002002002002", username: "Korvyn", commandsUsed: 78, lastSeen: new Date(Date.now() - 3600_000) },
    { discordId: "2003003003003003003", username: "Axiom", commandsUsed: 33, lastSeen: new Date(Date.now() - 86400_000) },
  ];
  for (const u of sampleUsers) {
    await db.insert(botUsersTable).values(u).onConflictDoNothing();
  }

  // Sample command logs
  const commands = ["ban", "kick", "mute", "warn", "lock", "jail", "serverinfo", "userinfo", "avatar", "help"];
  const statuses = ["success", "failure"] as const;
  for (let i = 0; i < 30; i++) {
    const user = sampleUsers[i % sampleUsers.length];
    const server = sampleServers[i % sampleServers.length];
    await db.insert(commandLogsTable).values({
      username: user.username,
      userId: user.discordId,
      serverName: server.name,
      serverId: server.discordId,
      command: commands[i % commands.length],
      status: statuses[i % 5 === 0 ? 1 : 0],
      timestamp: new Date(Date.now() - i * 600_000),
    }).onConflictDoNothing();
  }

  // Sample blacklisted user
  await db.insert(blacklistedUsersTable).values({
    discordId: "9001001001001001001",
    username: "spammer123",
    reason: "Repeated spam across multiple servers",
    addedBy: "admin",
  }).onConflictDoNothing();

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
