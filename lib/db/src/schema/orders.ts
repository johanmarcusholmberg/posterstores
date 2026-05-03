import { pgTable, text, serial, numeric, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  storeKey: text("store_key").notNull().default("postsofspain"),
  userId: integer("user_id"),
  customerEmail: text("customer_email").notNull(),
  status: text("status").notNull().default("pending_payment"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  shippingCost: numeric("shipping_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  shippingName: text("shipping_name").notNull(),
  shippingAddressLine1: text("shipping_address_line1").notNull(),
  shippingAddressLine2: text("shipping_address_line2"),
  shippingPostalCode: text("shipping_postal_code").notNull(),
  shippingCity: text("shipping_city").notNull(),
  shippingRegion: text("shipping_region"),
  shippingCountry: text("shipping_country").notNull(),
  customerNotes: text("customer_notes"),
  newsletterOptIn: boolean("newsletter_opt_in").notNull().default(false),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paymentStatus: text("payment_status"),
  paidAt: timestamp("paid_at"),
  cancelledAt: timestamp("cancelled_at"),
  customerConfirmationSentAt: timestamp("customer_confirmation_sent_at"),
  adminNotificationSentAt: timestamp("admin_notification_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
