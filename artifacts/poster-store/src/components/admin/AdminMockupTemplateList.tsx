import React, { useEffect, useState, useCallback } from "react";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminListAllMockupTemplates,
  adminUpdateMockupTemplate,
  adminDeleteMockupTemplate,
  adminReorderMockupTemplates,
  type MockupTemplate,
} from "@/lib/mockupApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MockupTemplateForm } from "./MockupTemplateForm";
import {
  LayoutTemplate,
  Globe,
  Store,
  Plus,
  Pencil,
  Trash2,
  Star,
  Search,
  ImageIcon,
  Sparkles,
  Hand,
  Shuffle,
  CheckCircle2,
  AlertCircle,
  PenLine,
  ArrowUp,
  ArrowDown,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminMockupTemplateListProps {
  storeKey: string;
}

const CATEGORIES = ["All", "Wall", "Interior", "Café/Table", "Frame", "Lifestyle", "Minimal", "Decorative"];

function DetectionBadge({ source, confidence, manuallyAdjusted }: {
  source: string | null | undefined;
  confidence: number | null | undefined;
  manuallyAdjusted: boolean | null | undefined;
}) {
  if (!source) return null;

  const pct = confidence != null ? Math.round(confidence * 100) : null;

  let icon: React.ReactNode;
  let label: string;
  let className: string;

  if (source === "ai") {
    icon = <Sparkles className="w-2.5 h-2.5" />;
    label = pct != null ? `AI ${pct}%` : "AI";
    className =
      pct != null && pct >= 80
        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
        : pct != null && pct >= 50
        ? "bg-yellow-100 text-yellow-800 border-yellow-300"
        : "bg-orange-100 text-orange-800 border-orange-300";
  } else if (source === "fallback") {
    icon = <Shuffle className="w-2.5 h-2.5" />;
    label = "Fallback";
    className = "bg-muted text-muted-foreground border-border";
  } else {
    icon = <Hand className="w-2.5 h-2.5" />;
    label = "Manual";
    className = "bg-blue-100 text-blue-800 border-blue-300";
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
          className
        )}
      >
        {icon}
        {label}
      </span>
      {manuallyAdjusted && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-violet-100 text-violet-800 border-violet-300">
          <PenLine className="w-2.5 h-2.5" />
          Adjusted
        </span>
      )}
    </div>
  );
}

export const AdminMockupTemplateList = ({
  storeKey,
}: AdminMockupTemplateListProps) => {
  useAdminToken();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MockupTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<MockupTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MockupTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminListAllMockupTemplates(storeKey)
      .then(setTemplates)
      .catch((e) =>
        toast({
          title: "Failed to load templates",
          description: e?.message,
          variant: "destructive",
        })
      )
      .finally(() => setLoading(false));
  }, [storeKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMove = useCallback(async (templateId: number, direction: "up" | "down") => {
    const prev = templates;
    const idx = prev.findIndex((t) => t.id === templateId);
    if (idx < 0) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === prev.length - 1) return;

    const newList = [...prev];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    setTemplates(newList);

    setReordering(true);
    try {
      await adminReorderMockupTemplates(newList.map((t) => t.id), storeKey || null);
      load();
    } catch (e: any) {
      setTemplates(prev);
      toast({ title: "Failed to reorder", description: e?.message, variant: "destructive" });
    } finally {
      setReordering(false);
    }
  }, [templates, storeKey, load, toast]);

  const handleNormalize = useCallback(async () => {
    setReordering(true);
    try {
      await adminReorderMockupTemplates(templates.map((t) => t.id), storeKey || null);
      load();
      toast({ title: "Sort order normalized" });
    } catch (e: any) {
      toast({ title: "Failed to normalize order", description: e?.message, variant: "destructive" });
    } finally {
      setReordering(false);
    }
  }, [templates, storeKey, load, toast]);

  const toggleActive = async (template: MockupTemplate) => {
    setToggling(template.id);
    try {
      const updated = await adminUpdateMockupTemplate(template.id, {
        active: !template.active,
      });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e: any) {
      toast({
        title: "Failed to update template",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminDeleteMockupTemplate(deleteTarget.id);
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast({ title: `"${deleteTarget.name}" deleted` });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e?.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleSaved = (saved: MockupTemplate) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setCreateOpen(false);
    setEditTemplate(null);
  };

  const filtered = templates.filter((t) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "All" && t.category !== categoryFilter) return false;
    if (activeFilter === "active" && !t.active) return false;
    if (activeFilter === "inactive" && t.active) return false;
    return true;
  });

  const globalTemplates = filtered.filter((t) => t.storeKey === null);
  const storeTemplates = filtered.filter((t) => t.storeKey !== null);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-1 max-w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="pl-8 h-9"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "active", "inactive"] as const).map((f) => (
                <Button
                  key={f}
                  variant={activeFilter === f ? "default" : "outline"}
                  size="sm"
                  className="h-9 text-xs capitalize"
                  onClick={() => setActiveFilter(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNormalize}
              disabled={reordering || templates.length === 0}
              className="gap-1.5 h-9"
              title="Rewrite all sort_order values to clean 1, 2, 3… based on current order"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              Normalize order
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              className="gap-1.5"
              data-testid="add-mockup-template-btn"
            >
              <Plus className="w-4 h-4" />
              Add mockup
            </Button>
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoryFilter(c)}
              className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                categoryFilter === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <LayoutTemplate className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {templates.length === 0
                ? "No mockup templates yet."
                : "No templates match your filters."}
            </p>
            {templates.length === 0 && (
              <p className="text-sm mt-1 text-muted-foreground/70">
                Upload your first interior or background mockup.
              </p>
            )}
          </div>
        ) : (
            <div className="space-y-6">
            <p className="text-xs text-muted-foreground">
              Order controls where this template appears in admin lists and mockup selection. Product gallery order is managed per poster.
            </p>
            {renderGroup(globalTemplates, "Global templates", templates, toggleActive, toggling, setEditTemplate, setDeleteTarget, handleMove, reordering)}
            {renderGroup(storeTemplates, `Templates for ${storeKey}`, templates, toggleActive, toggling, setEditTemplate, setDeleteTarget, handleMove, reordering)}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add mockup template</DialogTitle>
            <DialogDescription>
              Upload a background image and define the poster placement area.
            </DialogDescription>
          </DialogHeader>
          <MockupTemplateForm
            storeKey={storeKey}
            onSaved={handleSaved}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTemplate} onOpenChange={(open) => { if (!open) setEditTemplate(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit mockup template</DialogTitle>
            <DialogDescription>
              Update the template details, image, and placement area.
            </DialogDescription>
          </DialogHeader>
          {editTemplate && (
            <MockupTemplateForm
              storeKey={storeKey}
              template={editTemplate}
              onSaved={handleSaved}
              onCancel={() => setEditTemplate(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this mockup template?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing poster images will not be deleted, but{" "}
              <strong>"{deleteTarget?.name}"</strong> will no longer be
              available for previews. Any posters that used this template will
              lose the composited preview, but the original poster images remain
              untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removing…" : "Remove template"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

function renderGroup(
  list: MockupTemplate[],
  label: string,
  fullList: MockupTemplate[],
  toggleActive: (t: MockupTemplate) => void,
  toggling: number | null,
  onEdit: (t: MockupTemplate) => void,
  onDelete: (t: MockupTemplate) => void,
  onMove: (id: number, dir: "up" | "down") => void,
  reordering: boolean
) {
  if (list.length === 0) return null;
  return (
    <div className="space-y-2" key={label}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
        {label}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((template) => {
          const fullIdx = fullList.findIndex((t) => t.id === template.id);
          return (
            <TemplateCard
              key={template.id}
              template={template}
              toggling={toggling}
              onToggle={toggleActive}
              onEdit={onEdit}
              onDelete={onDelete}
              position={fullIdx + 1}
              isFirst={fullIdx === 0}
              isLast={fullIdx === fullList.length - 1}
              onMoveUp={() => onMove(template.id, "up")}
              onMoveDown={() => onMove(template.id, "down")}
              reordering={reordering}
            />
          );
        })}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  toggling,
  onToggle,
  onEdit,
  onDelete,
  position,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  reordering,
}: {
  template: MockupTemplate;
  toggling: number | null;
  onToggle: (t: MockupTemplate) => void;
  onEdit: (t: MockupTemplate) => void;
  onDelete: (t: MockupTemplate) => void;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reordering: boolean;
}) {
  const thumbUrl = template.backgroundImageUrl || template.previewThumbnailUrl;

  return (
    <div
      className={`rounded-lg border bg-card overflow-hidden group transition-shadow hover:shadow-md ${
        !template.active ? "opacity-60" : ""
      }`}
      data-testid={`template-card-${template.id}`}
    >
      <div className="relative aspect-[3/2] bg-muted overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={template.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
          {template.storeKey === null ? (
            <Badge variant="secondary" className="text-[10px] gap-1 bg-background/90">
              <Globe className="w-2.5 h-2.5" />
              Global
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1 bg-background/90">
              <Store className="w-2.5 h-2.5" />
              {template.storeKey}
            </Badge>
          )}
          {template.isFeatured && (
            <Badge className="text-[10px] gap-1 bg-amber-500 text-white">
              <Star className="w-2.5 h-2.5" />
              Featured
            </Badge>
          )}
          {!template.active && (
            <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
          )}
        </div>
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="secondary"
            className="h-7 w-7 bg-background/90"
            onClick={() => onEdit(template)}
            title="Edit template"
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-7 w-7 bg-background/90 hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => onDelete(template)}
            title="Remove template"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{template.name}</p>
            {template.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{template.description}</p>
            )}
          </div>
          <Switch
            checked={template.active}
            onCheckedChange={() => onToggle(template)}
            disabled={toggling === template.id}
            aria-label={`Toggle ${template.name}`}
            className="shrink-0"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {template.category && (
            <Badge variant="outline" className="text-[10px]">{template.category}</Badge>
          )}
          {template.frameType && template.frameType !== "none" && (
            <Badge variant="outline" className="text-[10px]">{template.frameType}</Badge>
          )}
          {template.orientation && (
            <Badge variant="outline" className="text-[10px]">{template.orientation}</Badge>
          )}
        </div>

        {template.supportedFormats && template.supportedFormats.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.supportedFormats.map((f) => (
              <span key={f} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                {f}
              </span>
            ))}
          </div>
        )}

        {(template.posterX != null || template.posterWidth != null) && (
          <p className="text-[10px] text-muted-foreground font-mono">
            {template.posterX ?? "?"}% {template.posterY ?? "?"}% &nbsp;
            {template.posterWidth ?? "?"}×{template.posterHeight ?? "?"}%
          </p>
        )}

        <DetectionBadge
          source={template.detectionSource}
          confidence={template.detectionConfidence}
          manuallyAdjusted={template.placementWasManuallyAdjusted}
        />

        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
            #{position}
          </span>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onMoveUp}
              disabled={isFirst || reordering}
              title="Move up"
            >
              <ArrowUp className="w-3 h-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onMoveDown}
              disabled={isLast || reordering}
              title="Move down"
            >
              <ArrowDown className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
