import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commandStatusEnum = pgEnum("command_status", ["success", "failure"]);

export const commandLogsTable = pgTable("command_logs", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  userId: text("user_id").notNull(),
  serverName: text("server_name").notNull(),
  serverId: text("server_id").notNull(),
  command: text("command").notNull(),
  status: commandStatusEnum("status").notNull(),
  errorMessage: text("error_message"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertCommandLogSchema = createInsertSchema(commandLogsTable).omit({ id: true });
export type InsertCommandLog = z.infer<typeof insertCommandLogSchema>;
export type CommandLogRow = typeof commandLogsTable.$inferSelect;
