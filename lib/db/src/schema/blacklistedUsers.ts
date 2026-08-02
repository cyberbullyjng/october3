import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const blacklistedUsersTable = pgTable("blacklisted_users", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  reason: text("reason").notNull(),
  addedBy: text("added_by").notNull().default("system"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const insertBlacklistedUserSchema = createInsertSchema(blacklistedUsersTable).omit({ id: true, addedAt: true });
export type InsertBlacklistedUser = z.infer<typeof insertBlacklistedUserSchema>;
export type BlacklistedUserRow = typeof blacklistedUsersTable.$inferSelect;
