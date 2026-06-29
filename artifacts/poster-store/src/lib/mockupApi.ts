const BASE = "/api";

export interface DetectedPlacementConfig {
  surfaceType: "poster" | "frame" | "paper" | "unknown";
  confidence: number;
  coordinateSystem: "normalized";
  corners: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  };
  boundingBox: { x: number; y: number; width: number; height: number };
  rotation: number;
  recommendedFitMode: "cover" | "contain" | "stretch";
  recommendedRender: {
    shadowOpacity: number;
    shadowBlur: number;
    highlightOpacity: number;
    overlayOpacity: number;
    borderRadius: number;
  };
  warnings: string[];
  /**
   * @deprecated Use `placementConfig` (separate column) for manual surfaces.
   * Only "ai" is valid going forward; "manual_surface" is legacy from old saves.
   */
  source?: "ai" | "manual_surface";
}

/**
 * Admin-defined manual poster surface stored in the `placement_config` column.
 * Separate from `detectedPlacementConfig` which holds AI candidate data only.
 */
export interface ManualSurfaceConfig {
  mode: "corners" | "bounding_box";
  coordinateSystem: "normalized";
  source: "manual";
  corners?: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  };
  boundingBox?: { x: number; y: number; width: number; height: number };
  fitMode?: string;
}

export type PlacementMode = "manual" | "auto_detected" | "auto_detected_needs_review";
export type DetectedPlacementStatus = "not_analyzed" | "detected" | "needs_review" | "failed";

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
  // Intended use flags
  canBePrimary: boolean;
  canBeHover: boolean;
  canBeGallery: boolean;
  // Placement
  posterX: number | null;
  posterY: number | null;
  posterWidth: number | null;
  posterHeight: number | null;
  rotation: number | null;
  borderRadius: number | null;
  shadowStrength: number | null;
  fitMode: string | null;
  // Compositing
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
  // AI detection (legacy per-session)
  detectionConfidence: number | null;
  detectionDescription: string | null;
  detectionSource: string | null;
  detectionModel: string | null;
  detectedAt: string | null;
  placementWasManuallyAdjusted: boolean | null;
  sourceImageWidth: number | null;
  sourceImageHeight: number | null;
  // Smart placement
  placementMode: PlacementMode | null;
  detectedPlacementConfig: DetectedPlacementConfig | null;
  /** Admin-defined manual surface. Separate from AI detection. */
  placementConfig: ManualSurfaceConfig | null;
  detectedPlacementStatus: DetectedPlacementStatus | null;
  detectedPlacementError: string | null;
  analyzedAt: string | null;
  // AI render mode
  renderMode: "deterministic" | "ai_rendered";
  aiRenderPrompt: string | null;
  aiRenderRequiresReview: boolean;
  // Layered image fields
  lightingOverlayUrl: string | null;
  foregroundImageUrl: string | null;
  defaultLightingBlendMode: string | null;
  defaultLightingOpacity: number | null;
  defaultForegroundOpacity: number | null;
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
  canBePrimary: boolean | null;
  canBeHover: boolean | null;
  canBeGallery: boolean | null;
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
  // Layered image fields
  lightingOverlayUrl?: string | null;
  foregroundImageUrl?: string | null;
  defaultLightingBlendMode?: string | null;
  defaultLightingOpacity?: number | null;
  defaultForegroundOpacity?: number | null;
}

export interface PosterMockup {
  id: number;
  posterId: number;
  mockupTemplateId: number | null;
  mockupImageUrl: string | null;
  sortOrder: number;
  isPrimary: boolean;
  isHoverMockup: boolean;
  isGallery: boolean;
  status: string;
  generatedAt: string | null;
  errorMessage: string | null;
  // AI render mode tracking
  renderMode: "deterministic" | "ai_rendered";
  needsReview: boolean;
  aiRenderWarning: string | null;
  sourcePosterImageUrl: string | null;
  sourceTemplateImageUrl: string | null;
  approvedForPublic: boolean;
  // Layer toggles per-assignment
  useBase: boolean;
  useLightingOverlay: boolean;
  useForeground: boolean;
  lightingOpacityOverride: number | null;
  foregroundOpacityOverride: number | null;
  createdAt: string;
  template: PosterMockupTemplate | null;
}

export interface BatchMockupItem {
  mockupTemplateId?: number | null;
  mockupImageUrl?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
  isHoverMockup?: boolean;
  isGallery?: boolean;
  // Layer toggles
  useBase?: boolean;
  useLightingOverlay?: boolean;
  useForeground?: boolean;
  lightingOpacityOverride?: number | null;
  foregroundOpacityOverride?: number | null;
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

export async function adminUpdatePosterMockupLayers(
  posterId: number,
  mockupId: number,
  storeKey: string,
  data: {
    useBase?: boolean;
    useLightingOverlay?: boolean;
    useForeground?: boolean;
    lightingOpacityOverride?: number | null;
    foregroundOpacityOverride?: number | null;
  }
): Promise<unknown> {
  const res = await fetch(
    `${BASE}/posters/${posterId}/mockups/${mockupId}/layers?storeKey=${encodeURIComponent(storeKey)}`,
    {
      method: "PATCH",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function adminReorderMockupTemplates(
  orderedTemplateIds: number[],
  storeKey?: string | null
): Promise<{ updated: number; templates: MockupTemplate[] }> {
  const res = await fetch(`${BASE}/mockup-templates/reorder`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify({ orderedTemplateIds, storeKey: storeKey ?? null }),
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

  const activeMockups = mockups.filter((m) => {
    if (!m.mockupTemplateId) return !!m.mockupImageUrl;
    if (m.template && m.template.active === false) return false;
    return !!(
      m.mockupImageUrl ||
      m.template?.previewThumbnailUrl ||
      m.template?.backgroundImageUrl
    );
  });

  if (activeMockups.length === 0) return fallbackImageUrl;

  const primaryMockup = activeMockups.find((m) => m.isPrimary);
  if (!primaryMockup) return fallbackImageUrl;

  const pick =
    activeMockups.find((m) => m.isPrimary && m.template?.isFeatured) ??
    primaryMockup;

  if (pick.mockupImageUrl) return pick.mockupImageUrl;
  if (pick.template?.previewThumbnailUrl) return pick.template.previewThumbnailUrl;
  if (pick.template?.backgroundImageUrl) return pick.template.backgroundImageUrl;
  return fallbackImageUrl;
}

// ─── Sync API ─────────────────────────────────────────────────────────────────

export type SyncScope = "all" | "missing" | "selected";

export interface SyncResult {
  posterId: number;
  posterTitle: string;
  templateId: number;
  templateName: string;
  action: "generated" | "skipped" | "failed";
  reason?: string;
  mockupId?: number;
  imageUrl?: string;
  placementSource?: "auto_detected" | "manual";
  placementWarnings?: string[];
  surfaceSource?: "auto_detected_corners" | "auto_detected_bbox" | "manual_corners" | "manual_bbox" | "fallback";
  surfaceWarning?: string;
  renderMode?: "deterministic" | "ai_rendered";
  needsReview?: boolean;
  aiRenderWarning?: string;
  /** Human-readable cost label, e.g. "Paid AI render". Present for AI-rendered combinations. */
  estimatedCostLabel?: string;
}

export interface SyncResponse {
  generated: number;
  skipped: number;
  failed: number;
  plannedCount?: number;
  /** Combinations destined for the deterministic Sharp compositor. */
  deterministicPlannedCount?: number;
  /** Combinations destined for the paid AI renderer. */
  aiRenderedPlannedCount?: number;
  dryRun: boolean;
  needsReviewCount?: number;
  results: SyncResult[];
  note?: string;
  /** Set when server blocked the request due to AI render limit. */
  aiRenderLimit?: number;
}

export async function adminRunMockupSync(params: {
  storeKey: string;
  scope: SyncScope;
  posterIds?: number[];
  templateIds?: number[];
  overwrite?: boolean;
  dryRun?: boolean;
}): Promise<SyncResponse> {
  const res = await fetch(`${BASE}/admin/mockup-sync`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

// ─── AI Template Generation API ───────────────────────────────────────────────

export interface GenerateTemplateResponse {
  template: MockupTemplate;
  note: string;
  placementAnalysis?: {
    status: string;
    confidence: number;
    warnings: string[];
    error?: string;
  };
}

export async function adminGenerateMockupTemplate(params: {
  prompt: string;
  name?: string;
  category?: string;
  storeKey?: string | null;
  size?: "1024x1024" | "512x512" | "256x256";
}): Promise<GenerateTemplateResponse> {
  const res = await fetch(`${BASE}/mockup-templates/generate`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

// ─── Smart Placement API ──────────────────────────────────────────────────────

export interface SmartPlacementAnalysisResponse {
  templateId: number;
  detectedConfig: DetectedPlacementConfig | null;
  confidence: number;
  status: "detected" | "needs_review" | "failed";
  warnings: string[];
  error?: string;
  template: MockupTemplate;
}

/**
 * Run server-side smart placement analysis for an existing template.
 * Saves the result to the DB and returns the updated template.
 */
export async function adminAnalyzeMockupTemplatePlacement(
  templateId: number
): Promise<SmartPlacementAnalysisResponse> {
  const res = await fetch(`${BASE}/admin/mockup-templates/${templateId}/analyze-placement`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
  });
  if (!res.ok) await handleError(res);
  return res.json();
}
