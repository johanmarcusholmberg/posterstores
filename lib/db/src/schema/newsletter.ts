import { pgTable, text, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const newsletterTable = pgTable("newsletter_subscriptions", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  storeKey: text("store_key").notNull().default("postsofspain"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.email, t.storeKey)]);

export const insertNewsletterSchema = createInsertSchema(newsletterTable).omit({ id: true, createdAt: true });
export type InsertNewsletter = z.infer<typeof insertNewsletterSchema>;
export type NewsletterSubscription = typeof newsletterTable.$inferSelect;
