const BASE = "/api";

export interface MockupTemplate {
  id: number;
  storeKey: string | null;
  name: string;
  description: string | null;
  templateKey: string;
  backgroundImageUrl: string | null;
  frameType: string;
  supportedOrientation: string | null;
  supportedAspectRatio: string | null;
  previewThumbnailUrl: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PosterMockupTemplate {
  id: number | null;
  name: string | null;
  templateKey: string | null;
  frameType: string | null;
  previewThumbnailUrl: string | null;
  storeKey: string | null;
}

export interface PosterMockup {
  id: number;
  posterId: number;
  mockupTemplateId: number | null;
  mockupImageUrl: string | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  template: PosterMockupTemplate | null;
}

export interface BatchMockupItem {
  mockupTemplateId?: number | null;
  mockupImageUrl?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
}

function headers(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Admin-Token": token,
  };
}

async function handleError(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({ error: res.statusText }));
  const msg =
    typeof body?.error === "string" ? body.error : JSON.stringify(body);
  throw new Error(msg);
}

export async function listMockupTemplates(
  storeKey?: string
): Promise<MockupTemplate[]> {
  const qs = storeKey ? `?storeKey=${encodeURIComponent(storeKey)}` : "";
  const res = await fetch(`${BASE}/mockup-templates${qs}`);
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminCreateMockupTemplate(
  token: string,
  data: Partial<MockupTemplate>
): Promise<MockupTemplate> {
  const res = await fetch(`${BASE}/mockup-templates`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminUpdateMockupTemplate(
  token: string,
  id: number,
  data: Partial<MockupTemplate>
): Promise<MockupTemplate> {
  const res = await fetch(`${BASE}/mockup-templates/${id}`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminDeleteMockupTemplate(
  token: string,
  id: number
): Promise<void> {
  const res = await fetch(`${BASE}/mockup-templates/${id}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) await handleError(res);
}

export async function getPosterMockups(
  posterId: number,
  storeKey: string
): Promise<PosterMockup[]> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups?storeKey=${encodeURIComponent(storeKey)}`
  );
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminSavePosterMockupsBatch(
  token: string,
  posterId: number,
  storeKey: string,
  mockups: BatchMockupItem[]
): Promise<PosterMockup[]> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/batch?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify({ mockups }),
    }
  );
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminSetPrimaryMockup(
  token: string,
  posterId: number,
  mockupId: number,
  storeKey: string
): Promise<PosterMockup> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/${mockupId}/primary?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "PATCH",
      headers: headers(token),
    }
  );
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminDeletePosterMockup(
  token: string,
  posterId: number,
  mockupId: number,
  storeKey: string
): Promise<void> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/${mockupId}?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "DELETE",
      headers: headers(token),
    }
  );
  if (!res.ok) await handleError(res);
}

export function resolvePosterDisplayImage(
  mockups: PosterMockup[] | null | undefined,
  fallbackImageUrl: string
): string {
  if (!mockups || mockups.length === 0) return fallbackImageUrl;
  const validMockups = mockups.filter(
    (m) => m.mockupImageUrl || m.template?.previewThumbnailUrl
  );
  if (validMockups.length === 0) return fallbackImageUrl;
  const primary = validMockups.find((m) => m.isPrimary) ?? validMockups[0];
  if (primary.mockupImageUrl) return primary.mockupImageUrl;
  if (primary.template?.previewThumbnailUrl)
    return primary.template.previewThumbnailUrl;
  return fallbackImageUrl;
}
