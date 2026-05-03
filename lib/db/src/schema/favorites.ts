import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { postersTable } from "./posters";
import { usersTable } from "./users";

export const favoritesTable = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  posterId: integer("poster_id").notNull().references(() => postersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.userId, t.posterId)]);

export type Favorite = typeof favoritesTable.$inferSelect;
export type InsertFavorite = typeof favoritesTable.$inferInsert;
