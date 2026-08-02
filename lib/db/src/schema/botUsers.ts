import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botUsersTable = pgTable("bot_users", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  commandsUsed: integer("commands_used").notNull().default(0),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
  avatarUrl: text("avatar_url"),
});

export const insertBotUserSchema = createInsertSchema(botUsersTable).omit({ id: true });
export type InsertBotUser = z.infer<typeof insertBotUserSchema>;
export type BotUserRow = typeof botUsersTable.$inferSelect;
