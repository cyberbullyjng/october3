import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const blacklistedServersTable = pgTable("blacklisted_servers", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  serverName: text("server_name").notNull(),
  reason: text("reason").notNull(),
  addedBy: text("added_by").notNull().default("system"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const insertBlacklistedServerSchema = createInsertSchema(blacklistedServersTable).omit({ id: true, addedAt: true });
export type InsertBlacklistedServer = z.infer<typeof insertBlacklistedServerSchema>;
export type BlacklistedServerRow = typeof blacklistedServersTable.$inferSelect;
