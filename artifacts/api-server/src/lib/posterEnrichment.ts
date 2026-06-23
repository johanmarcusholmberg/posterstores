import { db } from "@workspace/db";
import { posterSizesTable, posterMockupsTable, mockupTemplatesTable } from "@workspace/db";
import { eq, and, inArray, asc } from "drizzle-orm";

export function serializePosterSize(s: typeof posterSizesTable.$inferSelect) {
  return {
    ...s,
    price: Number(s.price),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/**
 * Public image selection rule (enforced here and in MockupGallery.isVisible):
 *   Public cards/hover may only use a rendered mockupImageUrl — never a template
 *   background image, preview thumbnail, or live CSS composite.
 *
 * A mockup row is public-eligible for display URLs only when:
 *   • mockupImageUrl is present (the flat generated render exists)
 *   • status is not "failed"
 *   • if renderMode is "ai_rendered", approvedForPublic must be true
 *   • the template is active (or the row has no template)
 *
 * If none of these conditions are met, return null so callers fall back to
 * poster.imageUrl.
 */
export async function attachPrimaryDisplayImages(
  posters: { id: number; imageUrl: string }[]
): Promise<Map<number, string | null>> {
  const imageMap = new Map<number, string | null>();
  if (posters.length === 0) return imageMap;

  const ids = posters.map((p) => p.id);

  const primaryMockups = await db
    .select({
      posterId: posterMockupsTable.posterId,
      mockupImageUrl: posterMockupsTable.mockupImageUrl,
      status: posterMockupsTable.status,
      renderMode: posterMockupsTable.renderMode,
      approvedForPublic: posterMockupsTable.approvedForPublic,
      templateId: posterMockupsTable.mockupTemplateId,
      templateActive: mockupTemplatesTable.active,
    })
    .from(posterMockupsTable)
    .leftJoin(
      mockupTemplatesTable,
      eq(posterMockupsTable.mockupTemplateId, mockupTemplatesTable.id)
    )
    .where(
      and(
        inArray(posterMockupsTable.posterId, ids),
        eq(posterMockupsTable.isPrimary, true)
      )
    );

  for (const m of primaryMockups) {
    // Rule 1: template must be active
    if (m.templateId !== null && m.templateActive === false) continue;
    // Rule 2: must have a generated flat image — never fall through to template backgrounds
    if (!m.mockupImageUrl) continue;
    // Rule 3: failed renders are not customer-ready
    if (m.status === "failed") continue;
    // Rule 4: AI-rendered mockups require explicit approval
    if (m.renderMode === "ai_rendered" && !m.approvedForPublic) continue;
    imageMap.set(m.posterId, m.mockupImageUrl);
  }

  return imageMap;
}

export async function attachHoverDisplayImages(
  posters: { id: number }[]
): Promise<Map<number, string | null>> {
  const imageMap = new Map<number, string | null>();
  if (posters.length === 0) return imageMap;

  const ids = posters.map((p) => p.id);

  const hoverMockups = await db
    .select({
      posterId: posterMockupsTable.posterId,
      mockupImageUrl: posterMockupsTable.mockupImageUrl,
      status: posterMockupsTable.status,
      renderMode: posterMockupsTable.renderMode,
      approvedForPublic: posterMockupsTable.approvedForPublic,
      templateId: posterMockupsTable.mockupTemplateId,
      templateActive: mockupTemplatesTable.active,
    })
    .from(posterMockupsTable)
    .leftJoin(
      mockupTemplatesTable,
      eq(posterMockupsTable.mockupTemplateId, mockupTemplatesTable.id)
    )
    .where(
      and(
        inArray(posterMockupsTable.posterId, ids),
        eq(posterMockupsTable.isHoverMockup, true)
      )
    );

  for (const m of hoverMockups) {
    // Rule 1: template must be active
    if (m.templateId !== null && m.templateActive === false) continue;
    // Rule 2: must have a generated flat image — never fall through to template backgrounds
    if (!m.mockupImageUrl) continue;
    // Rule 3: failed renders are not customer-ready
    if (m.status === "failed") continue;
    // Rule 4: AI-rendered mockups require explicit approval
    if (m.renderMode === "ai_rendered" && !m.approvedForPublic) continue;
    imageMap.set(m.posterId, m.mockupImageUrl);
  }

  return imageMap;
}

export async function attachSizesToPosters<
  T extends { id: number; imageUrl: string; price: number | string; createdAt: Date }
>(posters: T[], adminRequest: boolean) {
  if (posters.length === 0) return [];

  const ids = posters.map((p) => p.id);
  const allSizes =
    ids.length > 0
      ? await db
          .select()
          .from(posterSizesTable)
          .where(inArray(posterSizesTable.posterId, ids))
          .orderBy(asc(posterSizesTable.sortOrder))
      : [];

  const sizeMap = new Map<number, (typeof allSizes)[0][]>();
  for (const s of allSizes) {
    const arr = sizeMap.get(s.posterId) ?? [];
    arr.push(s);
    sizeMap.set(s.posterId, arr);
  }

  return posters.map((p) => {
    const rawSizes = sizeMap.get(p.id) ?? [];
    const posterSizes = adminRequest ? rawSizes : rawSizes.filter((s) => s.active);
    const activePrices = rawSizes.filter((s) => s.active).map((s) => Number(s.price));
    const lowestActivePrice = activePrices.length > 0 ? Math.min(...activePrices) : null;

    return {
      ...p,
      price: Number(p.price),
      createdAt: p.createdAt.toISOString(),
      posterSizes: posterSizes.map(serializePosterSize),
      lowestActivePrice,
    };
  });
}

export async function enrichPosters<
  T extends { id: number; imageUrl: string; price: number | string; createdAt: Date }
>(posters: T[], adminRequest: boolean) {
  const withSizes = await attachSizesToPosters(posters, adminRequest);
  const [displayImageMap, hoverImageMap] = await Promise.all([
    attachPrimaryDisplayImages(withSizes),
    attachHoverDisplayImages(withSizes),
  ]);

  return withSizes.map((p) => ({
    ...p,
    primaryDisplayImageUrl: displayImageMap.get(p.id) ?? null,
    hoverDisplayImageUrl: hoverImageMap.get(p.id) ?? null,
  }));
}
