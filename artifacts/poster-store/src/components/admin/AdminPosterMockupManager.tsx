import React, { useEffect, useState, useCallback } from "react";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  listMockupTemplates,
  getPosterMockups,
  adminSavePosterMockupsBatch,
  type MockupTemplate,
  type PosterMockup,
  type BatchMockupItem,
} from "@/lib/mockupApi";
import { type AdminPoster } from "@/lib/adminApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { PrimaryMockupBadge } from "./PrimaryMockupBadge";
import {
  Star,
  Trash2,
  GripVertical,
  Plus,
  Save,
  Loader2,
  Globe,
  Store,
  ImagePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminPosterMockupManagerProps {
  poster: AdminPoster;
  storeKey: string;
}

interface DraftMockup {
  key: string;
  mockupTemplateId: number | null;
  mockupImageUrl: string | null;
  isPrimary: boolean;
  sortOrder: number;
  templateName?: string;
  templateFrameType?: string;
  previewUrl?: string | null;
}

let keyCounter = 0;
const nextKey = () => `draft-${++keyCounter}`;

export const AdminPosterMockupManager = ({
  poster,
  storeKey,
}: AdminPosterMockupManagerProps) => {
  useAdminToken();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<MockupTemplate[]>([]);
  const [drafts, setDrafts] = useState<DraftMockup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tmpl, mockups] = await Promise.all([
        listMockupTemplates(storeKey),
        getPosterMockups(poster.id, storeKey),
      ]);
      setTemplates(tmpl);

      const loaded: DraftMockup[] = mockups.map((m: PosterMockup) => ({
        key: nextKey(),
        mockupTemplateId: m.mockupTemplateId,
        mockupImageUrl: m.mockupImageUrl,
        isPrimary: m.isPrimary,
        sortOrder: m.sortOrder,
        templateName: m.template?.name ?? undefined,
        templateFrameType: m.template?.frameType ?? undefined,
        previewUrl: m.mockupImageUrl ?? m.template?.previewThumbnailUrl ?? null,
      }));
      setDrafts(loaded);
    } catch (e: any) {
      toast({
        title: "Failed to load mockup data",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [poster.id, storeKey]);

  useEffect(() => {
    load();
  }, [load]);

  const isSelected = (templateId: number) =>
    drafts.some((d) => d.mockupTemplateId === templateId);

  const addTemplate = (template: MockupTemplate) => {
    if (isSelected(template.id)) return;
    const newDraft: DraftMockup = {
      key: nextKey(),
      mockupTemplateId: template.id,
      mockupImageUrl: null,
      isPrimary: drafts.length === 0,
      sortOrder: drafts.length,
      templateName: template.name,
      templateFrameType: template.frameType,
      previewUrl: template.previewThumbnailUrl,
    };
    setDrafts((prev) => [...prev, newDraft]);
  };

  const removeTemplate = (templateId: number) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.mockupTemplateId !== templateId);
      if (next.length > 0 && !next.some((d) => d.isPrimary)) {
        next[0].isPrimary = true;
      }
      return next.map((d, i) => ({ ...d, sortOrder: i }));
    });
  };

  const removeDraft = (key: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.key !== key);
      if (next.length > 0 && !next.some((d) => d.isPrimary)) {
        next[0].isPrimary = true;
      }
      return next.map((d, i) => ({ ...d, sortOrder: i }));
    });
  };

  const setPrimary = (key: string) => {
    setDrafts((prev) =>
      prev.map((d) => ({ ...d, isPrimary: d.key === key }))
    );
  };

  const addCustomUrl = () => {
    const url = customUrl.trim();
    if (!url) return;
    const newDraft: DraftMockup = {
      key: nextKey(),
      mockupTemplateId: null,
      mockupImageUrl: url,
      isPrimary: drafts.length === 0,
      sortOrder: drafts.length,
      templateName: "Custom image",
      previewUrl: url,
    };
    setDrafts((prev) => [...prev, newDraft]);
    setCustomUrl("");
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setDrafts((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next.map((d, i) => ({ ...d, sortOrder: i }));
    });
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const save = async () => {
    setSaving(true);
    try {
      const items: BatchMockupItem[] = drafts.map((d) => ({
        mockupTemplateId: d.mockupTemplateId,
        mockupImageUrl: d.mockupImageUrl,
        sortOrder: d.sortOrder,
        isPrimary: d.isPrimary,
      }));
      await adminSavePosterMockupsBatch(poster.id, storeKey, items);
      toast({ title: "Mockups saved" });
      await load();
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const globalTemplates = templates.filter((t) => t.storeKey === null && t.active);
  const storeTemplates = templates.filter(
    (t) => t.storeKey === storeKey && t.active
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Available templates</h2>
            <p className="text-xs text-muted-foreground">
              Click a template to add it to this poster.
            </p>
          </div>

          {globalTemplates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Global
              </p>
              <div className="grid gap-2">
                {globalTemplates.map((t) => {
                  const selected = isSelected(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => (selected ? removeTemplate(t.id) : addTemplate(t))}
                      data-testid={`template-select-${t.id}`}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 font-medium">{t.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {t.frameType}
                      </Badge>
                      {selected && (
                        <Badge className="text-[10px] shrink-0 bg-primary">
                          Added
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {storeTemplates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {storeKey}
              </p>
              <div className="grid gap-2">
                {storeTemplates.map((t) => {
                  const selected = isSelected(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => (selected ? removeTemplate(t.id) : addTemplate(t))}
                      data-testid={`template-select-${t.id}`}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <Store className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 font-medium">{t.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {t.frameType}
                      </Badge>
                      {selected && (
                        <Badge className="text-[10px] shrink-0 bg-primary">
                          Added
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Custom image URL
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com/mockup.jpg"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomUrl();
                  }
                }}
                data-testid="custom-mockup-url-input"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addCustomUrl}
                disabled={!customUrl.trim()}
              >
                <ImagePlus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                Selected mockups ({drafts.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Drag to reorder. Star = primary display image.
              </p>
            </div>
            <Button
              type="button"
              onClick={save}
              disabled={saving}
              data-testid="save-mockups-btn"
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </Button>
          </div>

          {drafts.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
              <Plus className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No mockups selected. Click templates on the left to add them.
            </div>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft, idx) => (
                <Card
                  key={draft.key}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "cursor-grab active:cursor-grabbing transition-all",
                    draft.isPrimary && "ring-2 ring-primary",
                    dragIdx === idx && "opacity-50"
                  )}
                  data-testid={`draft-mockup-${idx}`}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />

                    <div className="w-12 h-12 shrink-0 rounded overflow-hidden bg-muted">
                      {draft.previewUrl ? (
                        <img
                          src={draft.previewUrl}
                          alt={draft.templateName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <LayoutTemplate className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {draft.templateName ?? "Custom image"}
                      </p>
                      {draft.templateFrameType && (
                        <p className="text-xs text-muted-foreground">
                          Frame: {draft.templateFrameType}
                        </p>
                      )}
                      {draft.isPrimary && <PrimaryMockupBadge />}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant={draft.isPrimary ? "default" : "ghost"}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPrimary(draft.key)}
                        title="Set as primary"
                        data-testid={`set-primary-${idx}`}
                      >
                        <Star
                          className={cn(
                            "w-3.5 h-3.5",
                            draft.isPrimary && "fill-white"
                          )}
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeDraft(draft.key)}
                        title="Remove mockup"
                        data-testid={`remove-mockup-${idx}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button
          type="button"
          onClick={save}
          disabled={saving}
          data-testid="save-mockups-btn-bottom"
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save mockups
        </Button>
      </div>
    </div>
  );
};

function LayoutTemplate(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <line x1="3" x2="21" y1="9" y2="9" />
      <line x1="9" x2="9" y1="21" y2="9" />
    </svg>
  );
}
