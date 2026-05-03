import { pgTable, text, serial, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shippingMethodsTable = pgTable("shipping_methods", {
  id: serial("id").primaryKey(),
  storeKey: text("store_key").notNull().default("postsofspain"),
  name: text("name").notNull(),
  description: text("description"),
  courierName: text("courier_name"),
  deliveryEstimate: text("delivery_estimate"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("EUR"),
  supportedCountries: text("supported_countries").array(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertShippingMethodSchema = createInsertSchema(shippingMethodsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShippingMethod = z.infer<typeof insertShippingMethodSchema>;
export type ShippingMethod = typeof shippingMethodsTable.$inferSelect;
