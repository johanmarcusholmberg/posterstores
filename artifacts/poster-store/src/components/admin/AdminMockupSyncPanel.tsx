import React, { useState, useCallback, useEffect } from "react";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminListAllMockupTemplates,
  adminRunMockupSync,
  type MockupTemplate,
  type SyncScope,
  type SyncResult,
} from "@/lib/mockupApi";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  SkipForward,
  Loader2,
  Info,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminMockupSyncPanelProps {
  storeKey: string;
}

type SyncStatus = "idle" | "running" | "done" | "error";

export function AdminMockupSyncPanel({ storeKey }: AdminMockupSyncPanelProps) {
  const { toast } = useToast();
  useAdminToken();

  const [templates, setTemplates] = useState<MockupTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [scope, setScope] = useState<SyncScope>("missing");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  const [status, setStatus] = useState<SyncStatus>("idle");
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [summary, setSummary] = useState<{ generated: number; skipped: number; failed: number } | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const syncableTemplates = templates.filter(
    (t) =>
      t.active &&
      t.backgroundImageUrl &&
      t.posterX != null &&
      t.posterY != null &&
      t.posterWidth != null &&
      t.posterHeight != null
  );

  useEffect(() => {
    setLoadingTemplates(true);
    adminListAllMockupTemplates(storeKey)
      .then(setTemplates)
      .catch((e) =>
        toast({ title: "Failed to load templates", description: e?.message, variant: "destructive" })
      )
      .finally(() => setLoadingTemplates(false));
  }, [storeKey]);

  const toggleTemplate = (id: number) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleRunSync = useCallback(async () => {
    setShowConfirm(false);
    setStatus("running");
    setResults(null);
    setSummary(null);
    setSyncNote(null);

    const templateIds =
      selectedTemplateIds.length > 0 ? selectedTemplateIds : undefined;

    try {
      const resp = await adminRunMockupSync({
        storeKey,
        scope,
        templateIds,
        overwrite,
        dryRun,
      });

      setSummary({ generated: resp.generated, skipped: resp.skipped, failed: resp.failed });
      setResults(resp.results);
      setSyncNote(resp.note ?? null);
      setStatus("done");

      if (resp.failed > 0) {
        toast({
          title: `Sync finished with ${resp.failed} failure${resp.failed !== 1 ? "s" : ""}`,
          description: `Generated: ${resp.generated}, Skipped: ${resp.skipped}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: dryRun ? "Dry run complete" : "Sync complete",
          description: `Generated: ${resp.generated}, Skipped: ${resp.skipped}`,
        });
      }
    } catch (e: any) {
      setStatus("error");
      toast({ title: "Sync failed", description: e?.message, variant: "destructive" });
    }
  }, [storeKey, scope, selectedTemplateIds, overwrite, dryRun]);

  const needsConfirm = scope === "all" && !dryRun;

  const actionLabel = dryRun
    ? "Preview (dry run)"
    : scope === "all"
    ? "Sync all posters"
    : scope === "missing"
    ? "Sync missing only"
    : "Sync selected";

  return (
    <div className="space-y-6" data-testid="mockup-sync-panel">
      <div className="rounded-md bg-muted/60 border px-4 py-3 flex gap-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground mb-0.5">About mockup sync</p>
          <p>
            Sync composites poster artwork directly into template background images on the server
            and stores the resulting JPEGs in object storage. Only active templates with a background
            image and placement coordinates are eligible. Templates marked{" "}
            <strong>inactive</strong> or without placement data are skipped automatically.
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Scope */}
        <div className="space-y-2">
          <Label>Scope</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as SyncScope)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="missing">Only posters missing mockups</SelectItem>
              <SelectItem value="all">All published posters</SelectItem>
              <SelectItem value="selected">Selected posters (all published)</SelectItem>
            </SelectContent>
          </Select>
          {scope === "selected" && (
            <p className="text-xs text-muted-foreground">
              "Selected" scope applies to all published posters when no specific poster filter is active. Use the Poster editor to sync individual posters.
            </p>
          )}
        </div>

        {/* Options */}
        <div className="space-y-3">
          <Label>Options</Label>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch
                id="overwrite"
                checked={overwrite}
                onCheckedChange={setOverwrite}
              />
              <Label htmlFor="overwrite" className="font-normal cursor-pointer">
                Overwrite existing mockups
                <span className="block text-xs text-muted-foreground font-normal">
                  Regenerate even if a mockup already exists
                </span>
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="dryRun"
                checked={dryRun}
                onCheckedChange={setDryRun}
              />
              <Label htmlFor="dryRun" className="font-normal cursor-pointer">
                Dry run (preview only)
                <span className="block text-xs text-muted-foreground font-normal">
                  Count what would be generated without running
                </span>
              </Label>
            </div>
          </div>
        </div>
      </div>

      {/* Template filter */}
      <div className="space-y-2">
        <Label>
          Templates to sync
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            (leave all unselected to use all eligible active templates)
          </span>
        </Label>
        {loadingTemplates ? (
          <div className="text-sm text-muted-foreground">Loading templates…</div>
        ) : syncableTemplates.length === 0 ? (
          <div className="rounded border border-dashed px-4 py-3 text-sm text-muted-foreground">
            No active templates with placement data and background image found. Add placement coordinates to a template first.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {syncableTemplates.map((t) => {
              const selected = selectedTemplateIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTemplate(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 bg-background"
                  )}
                >
                  {t.name}
                  {t.category && (
                    <span className={cn("opacity-70", selected && "opacity-80")}>
                      · {t.category}
                    </span>
                  )}
                  <span className="flex gap-0.5 ml-0.5">
                    {t.canBePrimary && <span title="Can be primary" className="text-[9px]">P</span>}
                    {t.canBeHover && <span title="Can be hover" className="text-[9px]">H</span>}
                    {t.canBeGallery && <span title="Can be gallery" className="text-[9px]">G</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {selectedTemplateIds.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedTemplateIds([])}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear selection
          </button>
        )}
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => (needsConfirm ? setShowConfirm(true) : handleRunSync())}
          disabled={status === "running" || syncableTemplates.length === 0}
          className="gap-2"
          data-testid="run-sync-btn"
        >
          {status === "running" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Syncing…
            </>
          ) : dryRun ? (
            <>
              <Wand2 className="w-4 h-4" />
              {actionLabel}
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              {actionLabel}
            </>
          )}
        </Button>
        {status === "done" && summary && (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              {summary.generated} generated
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{summary.skipped} skipped</span>
            {summary.failed > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="flex items-center gap-1 text-destructive font-medium">
                  <XCircle className="w-4 h-4" />
                  {summary.failed} failed
                </span>
              </>
            )}
            {dryRun && <Badge variant="outline" className="text-xs">Dry run</Badge>}
          </div>
        )}
        {status === "error" && (
          <span className="text-sm text-destructive flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            Sync failed — see toast for details
          </span>
        )}
      </div>

      {syncNote && (
        <div className="text-sm text-muted-foreground bg-muted/60 rounded px-3 py-2">
          {syncNote}
        </div>
      )}

      {/* Results table */}
      {results && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Results</p>
          <div className="rounded-md border overflow-hidden text-sm">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Poster</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Template</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Result</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((r, i) => (
                    <tr key={i} className={cn(
                      r.action === "failed" && "bg-destructive/5",
                      r.action === "generated" && dryRun && "bg-muted/30"
                    )}>
                      <td className="px-3 py-2 text-xs">{r.posterTitle}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.templateName}</td>
                      <td className="px-3 py-2">
                        {r.action === "generated" ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {dryRun ? "Would generate" : "Generated"}
                          </span>
                        ) : r.action === "skipped" ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <SkipForward className="w-3.5 h-3.5" />
                            Skipped
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                            <XCircle className="w-3.5 h-3.5" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate">
                        {r.reason ?? (r.imageUrl ? "Stored" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog for "sync all" */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync all published posters?</AlertDialogTitle>
            <AlertDialogDescription>
              This will composite mockup images for <strong>all published posters</strong>{" "}
              {overwrite ? "and overwrite any existing mockups" : "that are missing mockups"}.{" "}
              This may take a while and cannot be easily undone for generated images.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRunSync}>
              Run sync
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
