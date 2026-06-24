const BASE = "/api";

export type PosterStatus = "draft" | "published" | "archived";
export type OrderStatus = "draft" | "pending_payment" | "paid" | "processing" | "shipped" | "cancelled";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "cancelled" | "refunded";
export type FulfillmentStatus = "not_started" | "ready_for_production" | "in_production" | "shipped" | "cancelled";

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending_payment", label: "Pending Payment" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "cancelled", label: "Cancelled" },
];

export const FULFILLMENT_STATUSES: { value: FulfillmentStatus; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "ready_for_production", label: "Ready for Production" },
  { value: "in_production", label: "In Production" },
  { value: "shipped", label: "Shipped" },
  { value: "cancelled", label: "Cancelled" },
];

export interface AdminPosterSize {
  id: number;
  posterId: number;
  sizeLabel: string;
  price: number;
  currency: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPoster {
  id: number;
  storeKey: string;
  slug?: string | null;
  title: string;
  displayTitle?: string | null;
  description?: string | null;
  imageUrl: string;
  masterPrintImageUrl?: string | null;
  previewImageUrl?: string | null;
  region?: string | null;
  city?: string | null;
  category: string;
  tags?: string[] | null;
  price: number;
  currency: string;
  sizes?: string[] | null;
  posterSizes?: AdminPosterSize[] | null;
  lowestActivePrice?: number | null;
  isFeatured?: boolean | null;
  isNew?: boolean | null;
  isCollectionBanner?: boolean | null;
  status: PosterStatus;
  createdAt: string;
}

export interface AdminPosterListResponse {
  posters: AdminPoster[];
  total: number;
  offset: number;
  limit: number;
}

export interface PosterSizePayload {
  sizeLabel: string;
  price: number;
  currency: string;
  active?: boolean;
  sortOrder?: number;
}

export type CreatePosterPayload = Omit<AdminPoster, "id" | "createdAt" | "posterSizes" | "lowestActivePrice"> & {
  posterSizes?: PosterSizePayload[];
  slug?: string;
};
export type UpdatePosterPayload = Partial<Omit<AdminPoster, "id" | "createdAt" | "storeKey" | "posterSizes" | "lowestActivePrice">> & {
  posterSizes?: PosterSizePayload[];
  slug?: string;
};

export interface AdminOrderItem {
  id: number;
  orderId: number;
  posterId: number;
  posterSizeId?: number | null;
  posterTitleSnapshot: string;
  sizeLabelSnapshot?: string | null;
  widthCmSnapshot?: number | null;
  heightCmSnapshot?: number | null;
  unitPrice: number;
  currency: string;
  quantity: number;
  totalPrice: number;
  masterPrintImageUrlSnapshot?: string | null;
  previewImageUrlSnapshot?: string | null;
  createdAt: string;
}

export interface AdminOrder {
  id: number;
  storeKey: string;
  customerEmail: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus | null;
  subtotal: number;
  shippingCost: number;
  total: number;
  currency: string;
  shippingName: string;
  shippingAddressLine1: string;
  shippingAddressLine2?: string | null;
  shippingPostalCode: string;
  shippingCity: string;
  shippingRegion?: string | null;
  shippingCountry: string;
  customerNotes?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  paidAt?: string | null;
  cancelledAt?: string | null;
  customerConfirmationSentAt?: string | null;
  adminNotificationSentAt?: string | null;
  fulfillmentStatus?: FulfillmentStatus | null;
  fulfillmentNotes?: string | null;
  shippedAt?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  productionStartedAt?: string | null;
  items: AdminOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrderListResponse {
  orders: AdminOrder[];
  total: number;
  offset: number;
  limit: number;
}

export interface UpdateFulfillmentPayload {
  fulfillmentStatus?: FulfillmentStatus;
  fulfillmentNotes?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  markShipped?: boolean;
  markInProduction?: boolean;
}

function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

function extractErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return String(body ?? "Unknown error");
  const b = body as Record<string, unknown>;
  if (typeof b.error === "string") return b.error;
  if (b.error && typeof b.error === "object") {
    const flat = b.error as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    const parts: string[] = [];
    if (flat.formErrors?.length) parts.push(...flat.formErrors);
    if (flat.fieldErrors) {
      for (const [field, msgs] of Object.entries(flat.fieldErrors)) {
        parts.push(`${field}: ${(msgs as string[]).join(", ")}`);
      }
    }
    return parts.length ? parts.join("; ") : JSON.stringify(b.error);
  }
  return JSON.stringify(b);
}

export async function adminListPosters(
  storeKey: string,
  params: { status?: string; search?: string; category?: string; region?: string; limit?: number; offset?: number } = {}
): Promise<AdminPosterListResponse> {
  const qs = new URLSearchParams({ storeKey });
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.category) qs.set("category", params.category);
  if (params.region) qs.set("region", params.region);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));

  const res = await fetch(`${BASE}/posters?${qs}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminGetPosterMeta(
  storeKey: string
): Promise<{ categories: string[]; regions: string[] }> {
  const qs = new URLSearchParams({ storeKey });
  const res = await fetch(`${BASE}/admin/poster-meta?${qs}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminGetPoster(id: number, storeKey: string): Promise<AdminPoster> {
  const res = await fetch(`${BASE}/posters/${id}?storeKey=${encodeURIComponent(storeKey)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminCreatePoster(payload: CreatePosterPayload): Promise<AdminPoster> {
  const res = await fetch(`${BASE}/posters`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminUpdatePoster(
  id: number,
  storeKey: string,
  payload: UpdatePosterPayload
): Promise<AdminPoster> {
  const res = await fetch(`${BASE}/posters/${id}?storeKey=${encodeURIComponent(storeKey)}`, {
    method: "PUT",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminDeletePoster(id: number, storeKey: string): Promise<void> {
  const res = await fetch(`${BASE}/posters/${id}?storeKey=${encodeURIComponent(storeKey)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
}

export async function adminGetStats(storeKey: string) {
  const res = await fetch(`${BASE}/stats/store?storeKey=${encodeURIComponent(storeKey)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json() as Promise<{
    totalPosters: number;
    totalOrders: number;
    topCategories: { category: string; count: number }[];
    featuredCount: number;
    newArrivalsCount: number;
  }>;
}

export async function adminListOrders(
  storeKey: string,
  params: { status?: string; fulfillmentStatus?: string; limit?: number; offset?: number } = {}
): Promise<AdminOrderListResponse> {
  const qs = new URLSearchParams();
  if (storeKey) qs.set("storeKey", storeKey);
  if (params.status) qs.set("status", params.status);
  if (params.fulfillmentStatus) qs.set("fulfillmentStatus", params.fulfillmentStatus);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));

  const res = await fetch(`${BASE}/admin/orders?${qs}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminGetOrder(id: number): Promise<AdminOrder> {
  const res = await fetch(`${BASE}/admin/orders/${id}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminUpdateOrderStatus(id: number, status: string): Promise<AdminOrder> {
  const res = await fetch(`${BASE}/admin/orders/${id}/status`, {
    method: "PATCH",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminUpdateFulfillment(
  id: number,
  payload: UpdateFulfillmentPayload
): Promise<AdminOrder> {
  const res = await fetch(`${BASE}/admin/orders/${id}/fulfillment`, {
    method: "PATCH",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminListFulfillment(
  storeKey: string,
  params: { fulfillmentStatus?: string; orderStatus?: string; limit?: number; offset?: number } = {}
): Promise<AdminOrderListResponse> {
  const qs = new URLSearchParams();
  if (storeKey) qs.set("storeKey", storeKey);
  if (params.fulfillmentStatus) qs.set("fulfillmentStatus", params.fulfillmentStatus);
  if (params.orderStatus) qs.set("orderStatus", params.orderStatus);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));

  const res = await fetch(`${BASE}/admin/fulfillment?${qs}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

// ─── Store management ─────────────────────────────────────────────────────────

export interface AdminStoreThemeConfig {
  background: string;
  surface: string;
  sand: string;
  primary: string;
  secondary: string;
  text: string;
  muted: string;
  border: string;
}

export type HeroTextMode = "dark" | "light" | "custom";
export type HeroOverlayMode = "none" | "light" | "dark" | "custom";

export interface AdminStoreTypographyConfig {
  logoFont?: string;
  headingFont?: string;
  bodyFont?: string;
  headingColor?: string;
  linkColor?: string;
  buttonTextColor?: string;
  heroTextMode?: HeroTextMode;
  heroEyebrowColor?: string;
  heroHeadingColor?: string;
  heroSubtitleColor?: string;
  heroBulletColor?: string;
  heroOverlayMode?: HeroOverlayMode;
  heroOverlayOpacity?: number;
}

export interface AdminStoreHomepageConfig {
  heroTitle?: string;
  heroSubtitle?: string;
  primaryCta?: string;
  secondaryCta?: string;
  newsletterTitle?: string;
  newsletterSubtitle?: string;
  regions?: string[];
  cities?: string[];
  categories?: string[];
  tags?: string[];
}

export interface AdminStoreSeoConfig {
  defaultTitle?: string;
  defaultDescription?: string;
}

export interface AdminStore {
  id: number;
  storeKey: string;
  name: string;
  countryFocus: string;
  defaultCurrency: string;
  defaultLanguage: string;
  active: boolean;
  themeConfig: AdminStoreThemeConfig | null;
  typographyConfig: AdminStoreTypographyConfig | null;
  homepageConfig: AdminStoreHomepageConfig | null;
  seoConfig: AdminStoreSeoConfig | null;
  navigationConfig: null;
  primaryDomain: string | null;
  domainAliases: string[] | null;
  routePrefix: string | null;
  logoUrl: string | null;
  logoStoragePath: string | null;
  logoAltText: string | null;
  posterCount: number;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateStorePayload = {
  storeKey: string;
  name: string;
  countryFocus: string;
  defaultCurrency: string;
  defaultLanguage: string;
  active: boolean;
  themeConfig?: AdminStoreThemeConfig | null;
  typographyConfig?: AdminStoreTypographyConfig | null;
  homepageConfig?: AdminStoreHomepageConfig | null;
  seoConfig?: AdminStoreSeoConfig | null;
  primaryDomain?: string | null;
  domainAliases?: string[] | null;
  routePrefix?: string | null;
};

export type UpdateStorePayload = Partial<Omit<CreateStorePayload, "storeKey">> & {
  logoAltText?: string | null;
};

export async function adminListStores(): Promise<AdminStore[]> {
  const res = await fetch(`${BASE}/admin/stores`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminGetStore(storeKey: string): Promise<AdminStore> {
  const res = await fetch(`${BASE}/admin/stores/${encodeURIComponent(storeKey)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminCreateStore(
  payload: CreateStorePayload
): Promise<AdminStore> {
  const res = await fetch(`${BASE}/admin/stores`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminUpdateStore(
  storeKey: string,
  payload: UpdateStorePayload
): Promise<AdminStore> {
  const res = await fetch(`${BASE}/admin/stores/${encodeURIComponent(storeKey)}`, {
    method: "PUT",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

// ─── Content pages ─────────────────────────────────────────────────────────

export interface AdminContentPageSummary {
  id: number | null;
  storeKey: string;
  pageKey: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  published: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  hasFallback: boolean;
}

export interface AdminContentPage extends AdminContentPageSummary {
  exists: boolean;
}

export interface UpsertContentPagePayload {
  title: string;
  subtitle?: string | null;
  content: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  published?: boolean;
}

export async function adminListContentPages(
  storeKey: string
): Promise<AdminContentPageSummary[]> {
  const res = await fetch(`${BASE}/admin/content?storeKey=${encodeURIComponent(storeKey)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminGetContentPage(
  storeKey: string,
  pageKey: string
): Promise<AdminContentPage> {
  const res = await fetch(
    `${BASE}/admin/content/${encodeURIComponent(pageKey)}?storeKey=${encodeURIComponent(storeKey)}`,
    { credentials: "include" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminUpsertContentPage(
  storeKey: string,
  pageKey: string,
  payload: UpsertContentPagePayload
): Promise<AdminContentPage> {
  const res = await fetch(
    `${BASE}/admin/content/${encodeURIComponent(pageKey)}?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "PUT",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function fetchPublicContentPage(
  storeKey: string,
  pageKey: string
): Promise<AdminContentPage | null> {
  const res = await fetch(
    `${BASE}/content/${encodeURIComponent(pageKey)}?storeKey=${encodeURIComponent(storeKey)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.exists ? data : null;
}

// ─── Launch checklist ──────────────────────────────────────────────────────

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

export async function adminGetLaunchChecklist(
  storeKey: string
): Promise<LaunchChecklistResponse> {
  const res = await fetch(`${BASE}/admin/launch-checklist?storeKey=${encodeURIComponent(storeKey)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminUploadStoreLogo(
  storeKey: string,
  file: File,
  logoAltText?: string
): Promise<{ logoUrl: string; logoStoragePath: string; logoAltText: string | null }> {
  const form = new FormData();
  form.append("logo", file);
  if (logoAltText !== undefined) form.append("logoAltText", logoAltText);

  const res = await fetch(`${BASE}/admin/stores/${encodeURIComponent(storeKey)}/logo`, {
    method: "POST",
    credentials: "include",
    body: form,
    // Do NOT set Content-Type — browser sets it with the multipart boundary automatically
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminDeleteStoreLogo(storeKey: string): Promise<AdminStore> {
  const res = await fetch(`${BASE}/admin/stores/${encodeURIComponent(storeKey)}/logo`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminDeactivateStore(storeKey: string): Promise<AdminStore> {
  const res = await fetch(`${BASE}/admin/stores/${encodeURIComponent(storeKey)}/deactivate`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function fetchPublicStores(): Promise<AdminStore[]> {
  const res = await fetch(`${BASE}/stores`);
  if (!res.ok) return [];
  return res.json();
}

// ─── Homepage visual config ────────────────────────────────────────────────

export interface HeroButtonConfig {
  id: string;
  label: string;
  link: string;
  variant?: "filled" | "outline";
  visible?: boolean;
}

export interface HeroVisualConfig {
  backgroundImageUrl?: string | null;
  backgroundStoragePath?: string | null;
  backgroundOverlayOpacity?: number;
  primaryButtonText?: string | null;
  primaryButtonVariant?: "filled" | "outline";
  primaryButtonLink?: string | null;
  secondaryButtonText?: string | null;
  secondaryButtonVariant?: "filled" | "outline";
  secondaryButtonLink?: string | null;
  /**
   * Optional extra hero buttons shown after the primary/secondary buttons.
   * Existing primary/secondary fields remain the main backwards-compatible buttons.
   */
  extraButtons?: HeroButtonConfig[];
}

export interface SectionFontOverrides {
  headingFont?: string | null;
  bodyFont?: string | null;
}

export interface SectionColorOverrides {
  eyebrowColor?: string | null;
  headingColor?: string | null;
  textColor?: string | null;
  linkColor?: string | null;
  buttonTextColor?: string | null;
  backgroundColor?: string | null;
  overlayColor?: string | null;
  overlayOpacity?: number | null;
}

export interface CollectionBannerVisualConfig {
  id?: string;
  visible?: boolean;
  backgroundImageUrl?: string | null;
  backgroundStoragePath?: string | null;
  backgroundOverlayOpacity?: number;
  eyebrow?: string | null;
  title?: string | null;
  text?: string | null;
  ctaText?: string | null;
  ctaLink?: string | null;
  imageFit?: "cover" | "contain";
  focalPointX?: "left" | "center" | "right";
  focalPointY?: "top" | "center" | "bottom";
  showPosterCards?: boolean;
  fontOverrides?: SectionFontOverrides | null;
  colorOverrides?: SectionColorOverrides | null;
}

export type HomepageSectionType =
  | "hero"
  | "featuredPosters"
  | "collectionBanner"
  | "exploreLinks"
  | "newArrivals"
  | "brandStory"
  | "valueProps";

export interface HomepageSectionConfig {
  id: string;
  type: HomepageSectionType;
  visible: boolean;
  sortOrder: number;
  titleOverride?: string | null;
  bannerId?: string | null;
  fontOverrides?: SectionFontOverrides | null;
  colorOverrides?: SectionColorOverrides | null;
}

export interface HomepageVisualConfig {
  hero?: HeroVisualConfig;
  sections?: HomepageSectionConfig[];
  collectionBanners?: CollectionBannerVisualConfig[];
  /** @deprecated Legacy single-banner field — kept as backwards-compatible fallback. */
  collectionBanner?: CollectionBannerVisualConfig;
}

export async function adminGetHomepageVisual(storeKey: string): Promise<HomepageVisualConfig> {
  const res = await fetch(
    `${BASE}/admin/stores/${encodeURIComponent(storeKey)}/homepage-visual`,
    { credentials: "include" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminUpdateHomepageVisual(
  storeKey: string,
  config: HomepageVisualConfig
): Promise<HomepageVisualConfig> {
  const res = await fetch(
    `${BASE}/admin/stores/${encodeURIComponent(storeKey)}/homepage-visual`,
    {
      method: "PUT",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify(config),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function requestStorageUploadUrl(
  name: string,
  size: number,
  contentType: string
): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch(`${BASE}/storage/uploads/request-url`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify({ name, size, contentType }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}
