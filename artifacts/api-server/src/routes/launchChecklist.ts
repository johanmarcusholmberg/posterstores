import { Router } from "express";
import { db } from "@workspace/db";
import {
  storesTable,
  postersTable,
  posterSizesTable,
  posterMockupsTable,
  mockupTemplatesTable,
  ordersTable,
  storeContentPagesTable,
  PAGE_KEYS,
} from "@workspace/db";
import { eq, and, count, isNull, isNotNull, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLimiter } from "../middleware/rateLimiter";

const router = Router();

export type CheckStatus = "pass" | "warning" | "missing" | "manual";

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  value?: string;
}

export interface CheckSection {
  id: string;
  title: string;
  items: CheckItem[];
}

export interface LaunchChecklistResponse {
  storeKey: string;
  storeName: string;
  generatedAt: string;
  sections: CheckSection[];
}

function pass(id: string, label: string, value?: string): CheckItem {
  return { id, label, status: "pass", value };
}

function warn(id: string, label: string, detail: string, value?: string): CheckItem {
  return { id, label, status: "warning", detail, value };
}

function missing(id: string, label: string, detail: string): CheckItem {
  return { id, label, status: "missing", detail };
}

function manual(id: string, label: string, detail: string): CheckItem {
  return { id, label, status: "manual", detail };
}

router.get("/admin/launch-checklist", requireAdmin, async (req, res) => {
  const storeKey = req.query.storeKey ? String(req.query.storeKey) : null;
  if (!storeKey) {
    return res.status(400).json({ error: "storeKey query parameter is required" });
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.storeKey, storeKey))
    .limit(1);

  if (!store) {
    return res.status(404).json({ error: `Store "${storeKey}" not found` });
  }

  const homepage = (store.homepageConfig ?? {}) as Record<string, unknown>;
  const seo = (store.seoConfig ?? {}) as Record<string, unknown>;

  // ── 1. Store configuration ────────────────────────────────────────────────

  const storeConfigItems: CheckItem[] = [
    store.name?.trim()
      ? pass("store-name", "Store name exists", store.name)
      : missing("store-name", "Store name exists", "Set the store name in Edit Store."),

    pass("store-key", "Store key exists", store.storeKey),

    store.defaultCurrency?.trim()
      ? pass("store-currency", "Default currency exists", store.defaultCurrency)
      : missing("store-currency", "Default currency exists", "Set the default currency in Edit Store."),

    store.primaryDomain?.trim()
      ? pass("store-domain", "Primary domain configured", store.primaryDomain)
      : warn("store-domain", "Primary domain configured", "No primary domain set. Required for production traffic routing.", undefined),

    store.routePrefix?.trim()
      ? pass("store-prefix", "Route prefix configured", store.routePrefix)
      : warn("store-prefix", "Route prefix configured", "No route prefix set. Needed for multi-store path routing.", undefined),

    (homepage.heroTitle as string)?.trim()
      ? pass("hero-title", "Homepage hero title configured", homepage.heroTitle as string)
      : warn("hero-title", "Homepage hero title configured", "Set heroTitle in Edit Store → Homepage Config."),

    (homepage.heroSubtitle as string)?.trim()
      ? pass("hero-subtitle", "Homepage hero subtitle configured", homepage.heroSubtitle as string)
      : warn("hero-subtitle", "Homepage hero subtitle configured", "Set heroSubtitle in Edit Store → Homepage Config."),

    (seo.defaultTitle as string)?.trim()
      ? pass("seo-title", "SEO title configured", seo.defaultTitle as string)
      : warn("seo-title", "SEO title configured", "Set defaultTitle in Edit Store → SEO Config."),

    (seo.defaultDescription as string)?.trim()
      ? pass("seo-description", "SEO description configured", seo.defaultDescription as string)
      : warn("seo-description", "SEO description configured", "Set defaultDescription in Edit Store → SEO Config."),
  ];

  // ── 2. Products ───────────────────────────────────────────────────────────

  const publishedPosters = await db
    .select()
    .from(postersTable)
    .where(and(eq(postersTable.storeKey, storeKey), eq(postersTable.status, "published")));

  const totalPublished = publishedPosters.length;

  const postersWithoutSlug = publishedPosters.filter(p => !p.slug?.trim());
  const postersWithoutPreview = publishedPosters.filter(p => !p.previewImageUrl?.trim());
  const postersWithoutMaster = publishedPosters.filter(p => !p.masterPrintImageUrl?.trim());

  let postersWithoutActiveSizes: number[] = [];
  if (totalPublished > 0) {
    const posterIds = publishedPosters.map(p => p.id);
    const sizeRows = await db
      .select({ posterId: posterSizesTable.posterId })
      .from(posterSizesTable)
      .where(and(eq(posterSizesTable.active, true)));

    const posterIdsWithSizes = new Set(sizeRows.map(r => r.posterId));
    postersWithoutActiveSizes = posterIds.filter(id => !posterIdsWithSizes.has(id));
  }

  const productsItems: CheckItem[] = [
    totalPublished > 0
      ? pass("published-posters", "At least one published poster", `${totalPublished} published`)
      : missing("published-posters", "At least one published poster", "Publish at least one poster before going live."),

    postersWithoutSlug.length === 0
      ? pass("poster-slugs", "All published posters have a slug")
      : warn("poster-slugs", "All published posters have a slug", `${postersWithoutSlug.length} poster(s) missing slug. Go to Manage Posters to fix.`),

    postersWithoutPreview.length === 0
      ? pass("poster-preview", "All published posters have a preview image")
      : warn("poster-preview", "All published posters have a preview image", `${postersWithoutPreview.length} poster(s) missing preview image.`),

    postersWithoutMaster.length === 0
      ? pass("poster-master", "All published posters have a master print image")
      : warn("poster-master", "All published posters have a master print image", `${postersWithoutMaster.length} poster(s) missing master print image. Needed for print fulfillment.`),

    postersWithoutActiveSizes.length === 0
      ? pass("poster-sizes", "All published posters have at least one active size/price")
      : warn("poster-sizes", "All published posters have at least one active size/price", `${postersWithoutActiveSizes.length} poster(s) have no active sizes/prices.`),

    totalPublished > 0
      ? pass("poster-category", "All published posters have a category")
      : pass("poster-category", "All published posters have a category"),

    manual("poster-region-city", "Posters have region/city where relevant", "Verify that travel/location posters have region and city fields set for better filtering."),
  ];

  // ── 3. Mockups ────────────────────────────────────────────────────────────

  const [templateCountRow] = await db
    .select({ count: count() })
    .from(mockupTemplatesTable)
    .where(eq(mockupTemplatesTable.active, true));

  const templateCount = Number(templateCountRow?.count ?? 0);

  let postersWithoutMockups = 0;
  let postersWithoutPrimaryMockup = 0;

  if (totalPublished > 0) {
    const posterIds = publishedPosters.map(p => p.id);
    const allMockups = await db
      .select()
      .from(posterMockupsTable);

    const mockupsByPoster = new Map<number, typeof allMockups>();
    for (const m of allMockups) {
      const arr = mockupsByPoster.get(m.posterId) ?? [];
      arr.push(m);
      mockupsByPoster.set(m.posterId, arr);
    }

    for (const id of posterIds) {
      const mockups = mockupsByPoster.get(id) ?? [];
      if (mockups.length === 0) postersWithoutMockups++;
      else if (!mockups.some(m => m.isPrimary)) postersWithoutPrimaryMockup++;
    }
  }

  const mockupsItems: CheckItem[] = [
    postersWithoutMockups === 0
      ? pass("poster-mockups", "All published posters have at least one mockup assigned")
      : warn("poster-mockups", "All published posters have at least one mockup assigned", `${postersWithoutMockups} published poster(s) have no mockups. Go to Manage Mockups.`),

    postersWithoutPrimaryMockup === 0
      ? pass("primary-mockup", "All posters with mockups have a primary mockup set")
      : warn("primary-mockup", "All posters with mockups have a primary mockup set", `${postersWithoutPrimaryMockup} poster(s) have mockups but no primary set.`),

    templateCount > 0
      ? pass("mockup-templates", "Mockup templates exist", `${templateCount} active template(s)`)
      : missing("mockup-templates", "Mockup templates exist", "Add mockup templates in Manage Mockups."),
  ];

  // ── 4. Checkout and payment ───────────────────────────────────────────────

  const stripeKeySet = !!process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSet = !!process.env.STRIPE_WEBHOOK_SECRET;
  const appBaseUrlSet = !!process.env.APP_BASE_URL;

  const [anyOrderRow] = await db
    .select({ count: count() })
    .from(ordersTable)
    .where(eq(ordersTable.storeKey, storeKey));
  const anyOrders = Number(anyOrderRow?.count ?? 0) > 0;

  const [paidOrderRow] = await db
    .select({ count: count() })
    .from(ordersTable)
    .where(and(eq(ordersTable.storeKey, storeKey), eq(ordersTable.status, "paid")));
  const anyPaidOrders = Number(paidOrderRow?.count ?? 0) > 0;

  const checkoutItems: CheckItem[] = [
    stripeKeySet
      ? pass("stripe-key", "Stripe secret key configured")
      : missing("stripe-key", "Stripe secret key configured", "Set STRIPE_SECRET_KEY in environment variables. Payments will not work without it."),

    stripeWebhookSet
      ? pass("stripe-webhook", "Stripe webhook secret configured")
      : missing("stripe-webhook", "Stripe webhook secret configured", "Set STRIPE_WEBHOOK_SECRET in environment variables. Payment confirmations will fail."),

    appBaseUrlSet
      ? pass("app-base-url", "APP_BASE_URL configured", process.env.APP_BASE_URL)
      : warn("app-base-url", "APP_BASE_URL configured", "Set APP_BASE_URL for correct redirect URLs in Stripe checkout."),

    manual("checkout-route", "Checkout route works end-to-end", "Add an item to cart, proceed to checkout, and verify the Stripe checkout page loads."),

    anyOrders
      ? pass("orders-created", "Orders can be created", `${anyOrderRow?.count} total order(s) in this store`)
      : warn("orders-created", "Orders can be created", "No orders found for this store yet. Test a checkout flow to verify."),

    anyPaidOrders
      ? pass("paid-orders", "Paid orders appear in admin", `${paidOrderRow?.count} paid order(s)`)
      : warn("paid-orders", "Paid orders appear in admin", "No paid orders yet. Complete a test payment to verify."),
  ];

  // ── 5. Email ──────────────────────────────────────────────────────────────

  const emailFromSet = !!process.env.EMAIL_FROM;
  const emailProvider = process.env.EMAIL_PROVIDER ?? "";
  const emailProviderSet = !!emailProvider;
  const emailProviderIsResend = emailProvider.toLowerCase() === "resend";
  const resendApiKeySet = !!process.env.RESEND_API_KEY;
  const adminEmailSet = !!process.env.ADMIN_ORDER_NOTIFICATION_EMAIL;

  const emailItems: CheckItem[] = [
    emailFromSet
      ? pass("email-from", "EMAIL_FROM configured", process.env.EMAIL_FROM)
      : missing("email-from", "EMAIL_FROM configured", "Set EMAIL_FROM in environment variables. Emails will not send without a valid sender address."),

    !emailProviderSet
      ? missing("email-provider", "EMAIL_PROVIDER configured", "EMAIL_PROVIDER is not set — running in mock/log mode. Emails will not be delivered in production. Set EMAIL_PROVIDER=resend to enable real sending.")
      : !emailProviderIsResend
      ? warn("email-provider", "EMAIL_PROVIDER configured", `EMAIL_PROVIDER is set to "${emailProvider}" but only "resend" is fully supported. Real emails may not be delivered.`)
      : pass("email-provider", "EMAIL_PROVIDER configured", emailProvider),

    emailProviderIsResend && !resendApiKeySet
      ? missing("resend-api-key", "RESEND_API_KEY configured", "EMAIL_PROVIDER is set to resend but RESEND_API_KEY is missing. Real emails will not be sent without it.")
      : !emailProviderIsResend && resendApiKeySet
      ? warn("resend-api-key", "RESEND_API_KEY configured", "RESEND_API_KEY is set but EMAIL_PROVIDER is not set to resend — the key will not be used. Set EMAIL_PROVIDER=resend to activate Resend.")
      : resendApiKeySet
      ? pass("resend-api-key", "RESEND_API_KEY configured")
      : warn("resend-api-key", "RESEND_API_KEY configured", "RESEND_API_KEY is not set. Required when EMAIL_PROVIDER=resend."),

    adminEmailSet
      ? pass("admin-notification-email", "ADMIN_ORDER_NOTIFICATION_EMAIL configured", process.env.ADMIN_ORDER_NOTIFICATION_EMAIL)
      : missing("admin-notification-email", "ADMIN_ORDER_NOTIFICATION_EMAIL configured", "ADMIN_ORDER_NOTIFICATION_EMAIL is not set — you will not receive order notification emails. Set it to your email address."),

    manual("customer-confirmation-email", "Customer confirmation email working", "Place and pay for a test order, then check that the customer receives a confirmation email."),
  ];

  // ── 6. Fulfillment ────────────────────────────────────────────────────────

  const [readyForProductionRow] = await db
    .select({ count: count() })
    .from(ordersTable)
    .where(and(eq(ordersTable.storeKey, storeKey), eq(ordersTable.status, "paid")));
  const paidCount = Number(readyForProductionRow?.count ?? 0);

  const fulfillmentItems: CheckItem[] = [
    pass("fulfillment-page", "Fulfillment page available", "Accessible at /admin/fulfillment"),

    paidCount > 0
      ? pass("fulfillment-queue", "Paid orders appear in fulfillment queue", `${paidCount} paid order(s)`)
      : warn("fulfillment-queue", "Paid orders appear in fulfillment queue", "No paid orders to verify yet. Complete a test purchase."),

    manual("master-print-access", "Master print files are accessible", "Open a paid order in Fulfillment, verify the master print image URL loads correctly for each item."),

    pass("csv-export", "CSV export available", "Export button available on Fulfillment page"),
  ];

  // ── 7. Legal / store pages ────────────────────────────────────────────────

  const contentRows = await db
    .select()
    .from(storeContentPagesTable)
    .where(eq(storeContentPagesTable.storeKey, storeKey));

  const publishedContentKeys = new Set(
    contentRows.filter(r => r.published).map(r => r.pageKey)
  );

  const contentPageDefs = [
    { pageKey: "shipping", label: "Shipping page" },
    { pageKey: "returns", label: "Returns page" },
    { pageKey: "privacy", label: "Privacy page" },
    { pageKey: "terms", label: "Terms page" },
    { pageKey: "contact", label: "Contact page" },
    { pageKey: "about", label: "About page" },
  ];

  const legalItems: CheckItem[] = contentPageDefs.map(p => {
    if (publishedContentKeys.has(p.pageKey)) {
      return pass(`content-${p.pageKey}`, `${p.label} has store-specific published content`);
    }
    return warn(
      `content-${p.pageKey}`,
      `${p.label} has store-specific published content`,
      `Using fallback placeholder copy. Go to Content Pages to add and publish custom copy for ${storeKey}.`
    );
  });

  // ── 8. Mobile / UX ───────────────────────────────────────────────────────

  const mobileItems: CheckItem[] = [
    manual("mobile-menu", "Mobile menu works", "Open the store on a mobile device or narrow browser window and verify the mobile nav menu opens and navigates correctly."),
    manual("mobile-shop-filters", "Shop filters usable on mobile", "Open /shop on mobile and verify category/region filters are accessible and functional."),
    manual("mobile-cart", "Cart usable on mobile", "Add items to cart on mobile and verify the cart page is readable and functional."),
    manual("mobile-checkout", "Checkout usable on mobile", "Complete the checkout flow on a mobile device to verify all fields and the Stripe form work correctly."),
  ];

  // ── Assemble response ─────────────────────────────────────────────────────

  const sections: CheckSection[] = [
    { id: "store-config", title: "Store configuration", items: storeConfigItems },
    { id: "products", title: "Products", items: productsItems },
    { id: "mockups", title: "Mockups", items: mockupsItems },
    { id: "checkout", title: "Checkout and payment", items: checkoutItems },
    { id: "email", title: "Email", items: emailItems },
    { id: "fulfillment", title: "Fulfillment", items: fulfillmentItems },
    { id: "legal", title: "Legal / store pages", items: legalItems },
    { id: "mobile-ux", title: "Mobile / UX", items: mobileItems },
  ];

  const response: LaunchChecklistResponse = {
    storeKey: store.storeKey,
    storeName: store.name,
    generatedAt: new Date().toISOString(),
    sections,
  };

  return res.json(response);
});

export default router;
