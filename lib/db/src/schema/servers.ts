import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serversTable = pgTable("servers", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  name: text("name").notNull(),
  memberCount: integer("member_count").notNull().default(0),
  iconUrl: text("icon_url"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
});

export const insertServerSchema = createInsertSchema(serversTable).omit({ id: true });
export type InsertServer = z.infer<typeof insertServerSchema>;
export type ServerRow = typeof serversTable.$inferSelect;
