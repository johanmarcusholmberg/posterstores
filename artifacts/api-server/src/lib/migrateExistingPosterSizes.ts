import { db } from "@workspace/db";
import { postersTable, posterSizesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

const KNOWN_SIZE_DIMENSIONS: Record<string, { widthCm: number; heightCm: number }> = {
  "A4": { widthCm: 21, heightCm: 29.7 },
  "A3": { widthCm: 29.7, heightCm: 42 },
  "A2": { widthCm: 42, heightCm: 59.4 },
  "30x40": { widthCm: 30, heightCm: 40 },
  "30x40 cm": { widthCm: 30, heightCm: 40 },
  "50x70": { widthCm: 50, heightCm: 70 },
  "50x70 cm": { widthCm: 50, heightCm: 70 },
  "50×70": { widthCm: 50, heightCm: 70 },
  "50×70 cm": { widthCm: 50, heightCm: 70 },
};

const DEFAULT_SIZES = [
  { sizeLabel: "A4", widthCm: 21, heightCm: 29.7 },
  { sizeLabel: "A3", widthCm: 29.7, heightCm: 42 },
  { sizeLabel: "50x70", widthCm: 50, heightCm: 70 },
];

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

      const price = Number(poster.price);
      const currency = poster.currency ?? "EUR";

      if (poster.sizes && poster.sizes.length > 0) {
        const sizeRows = poster.sizes.map((label, idx) => {
          const dims = KNOWN_SIZE_DIMENSIONS[label] ?? null;
          return {
            posterId: poster.id,
            sizeLabel: label,
            widthCm: dims ? String(dims.widthCm) : null,
            heightCm: dims ? String(dims.heightCm) : null,
            price: String(price),
            currency,
            active: true,
            sortOrder: idx,
          };
        });
        await db.insert(posterSizesTable).values(sizeRows);
      } else {
        const sizeRows = DEFAULT_SIZES.map((s, idx) => ({
          posterId: poster.id,
          sizeLabel: s.sizeLabel,
          widthCm: String(s.widthCm),
          heightCm: String(s.heightCm),
          price: String(price),
          currency,
          active: true,
          sortOrder: idx,
        }));
        await db.insert(posterSizesTable).values(sizeRows);
      }
      migrated++;
    }

    if (migrated > 0) {
      logger.info({ migrated }, "Migrated existing poster sizes");
    }
  } catch (err) {
    logger.error(err, "Failed to migrate existing poster sizes");
  }
}
