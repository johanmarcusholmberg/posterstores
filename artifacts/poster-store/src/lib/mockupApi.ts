const BASE = "/api";

export interface MockupTemplate {
  id: number;
  storeKey: string | null;
  name: string;
  description: string | null;
  templateKey: string;
  backgroundImageUrl: string | null;
  storagePath: string | null;
  frameType: string;
  category: string | null;
  orientation: string | null;
  supportedFormats: string[] | null;
  supportedOrientation: string | null;
  supportedAspectRatio: string | null;
  previewThumbnailUrl: string | null;
  isFeatured: boolean;
  active: boolean;
  sortOrder: number;
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number | null;
  borderRadius: number | null;
  shadowStrength: number | null;
  detectionConfidence: number | null;
  detectionDescription: string | null;
  detectionSource: string | null;
  detectionModel: string | null;
  detectedAt: string | null;
  placementWasManuallyAdjusted: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface PosterMockupTemplate {
  id: number | null;
  name: string | null;
  templateKey: string | null;
  frameType: string | null;
  category: string | null;
  orientation: string | null;
  previewThumbnailUrl: string | null;
  backgroundImageUrl: string | null;
  storagePath: string | null;
  storeKey: string | null;
  active: boolean | null;
  isFeatured: boolean | null;
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number | null;
  borderRadius: number | null;
  shadowStrength: number | null;
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

// ─── Format compatibility (client-side mirror of the server helper) ──────────

/**
 * Infer a poster's orientation from its size label, e.g. "50x70" → portrait.
 */
export function getPosterOrientation(
  sizeLabel: string
): "portrait" | "landscape" | "square" {
  if (/^A\d+$/i.test(sizeLabel)) return "portrait";
  const match = sizeLabel.match(/^(\d+)[xX×](\d+)$/);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    if (w === h) return "square";
    return w > h ? "landscape" : "portrait";
  }
  return "portrait";
}

/**
 * Returns true when a template is compatible with the given poster format label.
 */
export function isFormatCompatible(
  templateFormats: string[] | null | undefined,
  templateOrientation: string | null | undefined,
  posterFormat: string
): boolean {
  if (!templateFormats || templateFormats.length === 0) return true;
  if (templateFormats.includes(posterFormat)) return true;
  const posterOrientation = getPosterOrientation(posterFormat);
  const tmplOrient = templateOrientation ?? "any";
  if (tmplOrient === "any") return true;
  if (tmplOrient === posterOrientation) return true;
  return false;
}

/**
 * Filter and sort templates by compatibility with a poster format.
 * Order: exact match first, then orientation-compatible, then unrestricted.
 */
export function filterTemplatesByFormat(
  templates: MockupTemplate[],
  posterFormat: string | null | undefined
): MockupTemplate[] {
  if (!posterFormat) return templates;
  return templates.filter((t) =>
    isFormatCompatible(t.supportedFormats, t.orientation, posterFormat)
  );
}

// ─── API calls ───────────────────────────────────────────────────────────────

export async function listMockupTemplates(
  storeKey?: string,
  options?: {
    activeOnly?: boolean;
    category?: string;
    orientation?: string;
    format?: string;
  }
): Promise<MockupTemplate[]> {
  const params = new URLSearchParams();
  if (storeKey) params.set("storeKey", storeKey);
  if (options?.activeOnly === false) params.set("activeOnly", "false");
  if (options?.category) params.set("category", options.category);
  if (options?.orientation) params.set("orientation", options.orientation);
  if (options?.format) params.set("format", options.format);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${BASE}/mockup-templates${qs}`);
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminListAllMockupTemplates(
  token: string,
  storeKey?: string
): Promise<MockupTemplate[]> {
  const qs = storeKey ? `?storeKey=${encodeURIComponent(storeKey)}` : "";
  const res = await fetch(`${BASE}/mockup-templates/all${qs}`, {
    headers: { "X-Admin-Token": token },
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminGetMockupTemplate(
  token: string,
  id: number
): Promise<MockupTemplate> {
  const res = await fetch(`${BASE}/mockup-templates/${id}`, {
    headers: { "X-Admin-Token": token },
  });
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

export interface PlacementAnalysis {
  detected: boolean;
  confidence: number;
  description: string;
  model: string;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  rotation: number;
}

export async function analyzeMockupPlacement(
  token: string,
  imageUrl: string
): Promise<PlacementAnalysis> {
  const res = await fetch(`${BASE}/mockup-templates/analyze-placement`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ imageUrl }),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function requestMockupImageUploadUrl(
  token: string,
  file: { name: string; size: number; contentType: string }
): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch(`${BASE}/storage/uploads/request-url`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(file),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function uploadMockupImageFile(
  uploadURL: string,
  file: File
): Promise<void> {
  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("Upload to storage failed");
}

export function getStorageUrl(objectPath: string): string {
  return `/api/storage${objectPath}`;
}

export function resolvePosterDisplayImage(
  mockups: PosterMockup[] | null | undefined,
  fallbackImageUrl: string
): string {
  if (!mockups || mockups.length === 0) return fallbackImageUrl;

  // Filter to only active mockups that have a displayable image
  const activeMockups = mockups.filter((m) => {
    // Custom image URLs with no template are always active
    if (!m.mockupTemplateId) return !!m.mockupImageUrl;
    // If template is present, it must be active
    if (m.template && m.template.active === false) return false;
    // Must have some displayable URL
    return !!(
      m.mockupImageUrl ||
      m.template?.previewThumbnailUrl ||
      m.template?.backgroundImageUrl
    );
  });

  if (activeMockups.length === 0) return fallbackImageUrl;

  // Priority: featured+primary > featured > primary > first active
  const pick =
    activeMockups.find((m) => m.isPrimary && m.template?.isFeatured) ??
    activeMockups.find((m) => m.template?.isFeatured) ??
    activeMockups.find((m) => m.isPrimary) ??
    activeMockups[0];

  if (pick.mockupImageUrl) return pick.mockupImageUrl;
  if (pick.template?.previewThumbnailUrl) return pick.template.previewThumbnailUrl;
  if (pick.template?.backgroundImageUrl) return pick.template.backgroundImageUrl;
  return fallbackImageUrl;
}
