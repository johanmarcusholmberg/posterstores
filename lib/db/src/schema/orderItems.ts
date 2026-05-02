import { pgTable, text, serial, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  posterId: integer("poster_id").notNull(),
  posterSizeId: integer("poster_size_id"),
  posterTitleSnapshot: text("poster_title_snapshot").notNull(),
  sizeLabelSnapshot: text("size_label_snapshot"),
  widthCmSnapshot: numeric("width_cm_snapshot", { precision: 8, scale: 2 }),
  heightCmSnapshot: numeric("height_cm_snapshot", { precision: 8, scale: 2 }),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  quantity: integer("quantity").notNull().default(1),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  masterPrintImageUrlSnapshot: text("master_print_image_url_snapshot"),
  previewImageUrlSnapshot: text("preview_image_url_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true, createdAt: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
