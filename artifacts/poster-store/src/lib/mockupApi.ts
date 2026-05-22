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
  fitMode: string | null;
  shadowEnabled: boolean | null;
  shadowOpacity: number | null;
  shadowBlur: number | null;
  shadowOffsetX: number | null;
  shadowOffsetY: number | null;
  innerShadowEnabled: boolean | null;
  innerShadowOpacity: number | null;
  brightness: number | null;
  contrast: number | null;
  saturation: number | null;
  compositeBlur: number | null;
  detectionConfidence: number | null;
  detectionDescription: string | null;
  detectionSource: string | null;
  detectionModel: string | null;
  detectedAt: string | null;
  placementWasManuallyAdjusted: boolean | null;
  sourceImageWidth: number | null;
  sourceImageHeight: number | null;
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
  fitMode: string | null;
  shadowEnabled: boolean | null;
  shadowOpacity: number | null;
  shadowBlur: number | null;
  shadowOffsetX: number | null;
  shadowOffsetY: number | null;
  innerShadowEnabled: boolean | null;
  innerShadowOpacity: number | null;
  brightness: number | null;
  contrast: number | null;
  saturation: number | null;
  compositeBlur: number | null;
}

export interface PosterMockup {
  id: number;
  posterId: number;
  mockupTemplateId: number | null;
  mockupImageUrl: string | null;
  sortOrder: number;
  isPrimary: boolean;
  isHoverMockup: boolean;
  createdAt: string;
  template: PosterMockupTemplate | null;
}

export interface BatchMockupItem {
  mockupTemplateId?: number | null;
  mockupImageUrl?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
  isHoverMockup?: boolean;
}

function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

async function handleError(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({ error: res.statusText }));
  const msg =
    typeof body?.error === "string" ? body.error : JSON.stringify(body);
  throw new Error(msg);
}

// ─── Format compatibility (client-side mirror of the server helper) ──────────

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
  storeKey?: string
): Promise<MockupTemplate[]> {
  const qs = storeKey ? `?storeKey=${encodeURIComponent(storeKey)}` : "";
  const res = await fetch(`${BASE}/mockup-templates/all${qs}`, {
    credentials: "include",
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminGetMockupTemplate(
  id: number
): Promise<MockupTemplate> {
  const res = await fetch(`${BASE}/mockup-templates/${id}`, {
    credentials: "include",
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminCreateMockupTemplate(
  data: Partial<MockupTemplate>
): Promise<MockupTemplate> {
  const res = await fetch(`${BASE}/mockup-templates`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminUpdateMockupTemplate(
  id: number,
  data: Partial<MockupTemplate>
): Promise<MockupTemplate> {
  const res = await fetch(`${BASE}/mockup-templates/${id}`, {
    method: "PUT",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminDeleteMockupTemplate(
  id: number
): Promise<void> {
  const res = await fetch(`${BASE}/mockup-templates/${id}`, {
    method: "DELETE",
    credentials: "include",
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
  posterId: number,
  storeKey: string,
  mockups: BatchMockupItem[]
): Promise<PosterMockup[]> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/batch?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "PUT",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ mockups }),
    }
  );
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminSetPrimaryMockup(
  posterId: number,
  mockupId: number,
  storeKey: string
): Promise<PosterMockup> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/${mockupId}/primary?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "PATCH",
      headers: jsonHeaders(),
      credentials: "include",
    }
  );
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminSetHoverMockup(
  posterId: number,
  mockupId: number,
  storeKey: string
): Promise<PosterMockup> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/${mockupId}/hover?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "PATCH",
      headers: jsonHeaders(),
      credentials: "include",
    }
  );
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminClearHoverMockup(
  posterId: number,
  storeKey: string
): Promise<void> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/0/hover/clear?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "PATCH",
      headers: jsonHeaders(),
      credentials: "include",
    }
  );
  if (!res.ok) await handleError(res);
}

export async function adminClearPrimaryMockup(
  posterId: number,
  storeKey: string
): Promise<void> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/primary/clear?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "PATCH",
      headers: jsonHeaders(),
      credentials: "include",
    }
  );
  if (!res.ok) await handleError(res);
}

export async function adminDeletePosterMockup(
  posterId: number,
  mockupId: number,
  storeKey: string
): Promise<void> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/${mockupId}?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "DELETE",
      credentials: "include",
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
  imageUrl: string
): Promise<PlacementAnalysis> {
  const res = await fetch(`${BASE}/mockup-templates/analyze-placement`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify({ imageUrl }),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function requestMockupImageUploadUrl(
  file: { name: string; size: number; contentType: string }
): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch(`${BASE}/storage/uploads/request-url`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
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

  // Only use a mockup image when one is explicitly marked primary.
  // If no mockup is primary, fall back to the poster's own image.
  const primaryMockup = activeMockups.find((m) => m.isPrimary);
  if (!primaryMockup) return fallbackImageUrl;

  // Featured primary takes precedence over plain primary.
  const pick =
    activeMockups.find((m) => m.isPrimary && m.template?.isFeatured) ??
    primaryMockup;

  if (pick.mockupImageUrl) return pick.mockupImageUrl;
  if (pick.template?.previewThumbnailUrl) return pick.template.previewThumbnailUrl;
  if (pick.template?.backgroundImageUrl) return pick.template.backgroundImageUrl;
  return fallbackImageUrl;
}
