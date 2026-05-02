import { db } from "@workspace/db";
import { postersTable, posterSizesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_SIZES = ["A4", "A3", "50x70"];

export async function migrateExistingPosterSizes(): Promise<void> {
  try {
    const posters = await db.select().from(postersTable);

    let migrated = 0;
    for (const poster of posters) {
      const existingSizes = await db
        .select({ count: sql<number>`count(*)` })
        .from(posterSizesTable)
        .where(eq(posterSizesTable.posterId, poster.id));

      const count = Number(existingSizes[0]?.count ?? 0);
      if (count > 0) continue;

      const price = String(Number(poster.price));
      const currency = poster.currency ?? "EUR";

      const labels = poster.sizes && poster.sizes.length > 0 ? poster.sizes : DEFAULT_SIZES;

      await db.insert(posterSizesTable).values(
        labels.map((sizeLabel, idx) => ({
          posterId: poster.id,
          sizeLabel,
          price,
          currency,
          active: true,
          sortOrder: idx,
        }))
      );
      migrated++;
    }

    if (migrated > 0) {
      logger.info({ migrated }, "Migrated existing poster sizes");
    }
  } catch (err) {
    logger.error(err, "Failed to migrate existing poster sizes");
  }
}
