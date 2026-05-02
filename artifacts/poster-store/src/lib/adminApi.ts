const BASE = "/api";

export type PosterStatus = "draft" | "published" | "archived";
export type OrderStatus = "draft" | "pending_payment" | "paid" | "processing" | "shipped" | "cancelled";

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending_payment", label: "Pending Payment" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
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
  title: string;
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
};
export type UpdatePosterPayload = Partial<Omit<AdminPoster, "id" | "createdAt" | "storeKey" | "posterSizes" | "lowestActivePrice">> & {
  posterSizes?: PosterSizePayload[];
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

function headers(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Admin-Token": token,
  };
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
  token: string,
  storeKey: string,
  params: { status?: string; search?: string; limit?: number; offset?: number } = {}
): Promise<AdminPosterListResponse> {
  const qs = new URLSearchParams({ storeKey });
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));

  const res = await fetch(`${BASE}/posters?${qs}`, { headers: headers(token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminGetPoster(token: string, id: number, storeKey: string): Promise<AdminPoster> {
  const res = await fetch(`${BASE}/posters/${id}?storeKey=${encodeURIComponent(storeKey)}`, {
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminCreatePoster(token: string, payload: CreatePosterPayload): Promise<AdminPoster> {
  const res = await fetch(`${BASE}/posters`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminUpdatePoster(
  token: string,
  id: number,
  storeKey: string,
  payload: UpdatePosterPayload
): Promise<AdminPoster> {
  const res = await fetch(`${BASE}/posters/${id}?storeKey=${encodeURIComponent(storeKey)}`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminDeletePoster(token: string, id: number, storeKey: string): Promise<void> {
  const res = await fetch(`${BASE}/posters/${id}?storeKey=${encodeURIComponent(storeKey)}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
}

export async function adminGetStats(token: string, storeKey: string) {
  const res = await fetch(`${BASE}/stats/store?storeKey=${encodeURIComponent(storeKey)}`, {
    headers: headers(token),
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
  token: string,
  storeKey: string,
  params: { status?: string; limit?: number; offset?: number } = {}
): Promise<AdminOrderListResponse> {
  const qs = new URLSearchParams();
  if (storeKey) qs.set("storeKey", storeKey);
  if (params.status) qs.set("status", params.status);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));

  const res = await fetch(`${BASE}/admin/orders?${qs}`, { headers: headers(token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminGetOrder(token: string, id: number): Promise<AdminOrder> {
  const res = await fetch(`${BASE}/admin/orders/${id}`, { headers: headers(token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}

export async function adminUpdateOrderStatus(token: string, id: number, status: string): Promise<AdminOrder> {
  const res = await fetch(`${BASE}/admin/orders/${id}/status`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(extractErrorMessage(body));
  }
  return res.json();
}
