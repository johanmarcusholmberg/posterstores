import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { postersTable } from "./posters";

export const cartItemsTable = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  storeKey: text("store_key").notNull().default("postsofspain"),
  sessionId: text("session_id").notNull(),
  posterId: integer("poster_id").notNull().references(() => postersTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  size: text("size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCartItemSchema = createInsertSchema(cartItemsTable).omit({ id: true, createdAt: true });
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItemsTable.$inferSelect;
