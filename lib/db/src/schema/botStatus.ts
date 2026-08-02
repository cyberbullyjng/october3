import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botStatusTable = pgTable("bot_status", {
  id: serial("id").primaryKey(),
  uptime: integer("uptime").notNull().default(0),
  latency: integer("latency").notNull().default(0),
  guildCount: integer("guild_count").notNull().default(0),
  userCount: integer("user_count").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBotStatusSchema = createInsertSchema(botStatusTable).omit({ id: true });
export type InsertBotStatus = z.infer<typeof insertBotStatusSchema>;
export type BotStatusRow = typeof botStatusTable.$inferSelect;
