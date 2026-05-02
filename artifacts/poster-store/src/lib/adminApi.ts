const BASE = "/api";

export type PosterStatus = "draft" | "published" | "archived";

export interface AdminPoster {
  id: number;
  storeKey: string;
  title: string;
  description?: string | null;
  imageUrl: string;
  region?: string | null;
  city?: string | null;
  category: string;
  tags?: string[] | null;
  price: number;
  currency: string;
  sizes?: string[] | null;
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

export type CreatePosterPayload = Omit<AdminPoster, "id" | "createdAt">;
export type UpdatePosterPayload = Partial<Omit<AdminPoster, "id" | "createdAt" | "storeKey">>;

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
