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
import { Checkbox } from "@/components/ui/checkbox";
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
  DollarSign,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Server-side AI_RENDER_HARD_LIMIT — must be kept in sync with mockupSync.ts */
const AI_RENDER_HARD_LIMIT = 5;

interface AdminMockupSyncPanelProps {
  storeKey: string;
}

type SyncStatus = "idle" | "running" | "done" | "error";

interface SyncSummary {
  generated: number;
  skipped: number;
  failed: number;
  plannedCount?: number;
  deterministicPlannedCount?: number;
  aiRenderedPlannedCount?: number;
  needsReviewCount?: number;
}

export function AdminMockupSyncPanel({ storeKey }: AdminMockupSyncPanelProps) {
  const { toast } = useToast();
  useAdminToken();

  const [templates, setTemplates] = useState<MockupTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [scope, setScope] = useState<SyncScope>("missing");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [paidAiConfirmed, setPaidAiConfirmed] = useState(false);

  const [status, setStatus] = useState<SyncStatus>("idle");
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Template filtering ────────────────────────────────────────────────────
  const syncableTemplates = templates.filter((t) => {
    if (!t.active || !t.backgroundImageUrl) return false;
    if (t.renderMode === "ai_rendered") return true;
    return t.posterX != null && t.posterY != null && t.posterWidth != null && t.posterHeight != null;
  });

  const deterministicTemplates = syncableTemplates.filter((t) => t.renderMode !== "ai_rendered");
  const aiTemplates = syncableTemplates.filter((t) => t.renderMode === "ai_rendered");

  // Which templates will actually be used in the next sync (none selected = all syncable)
  const effectiveTemplates =
    selectedTemplateIds.length > 0
      ? syncableTemplates.filter((t) => selectedTemplateIds.includes(t.id))
      : syncableTemplates;

  const effectiveAiTemplates = effectiveTemplates.filter((t) => t.renderMode === "ai_rendered");
  const hasAiTemplatesInScope = effectiveAiTemplates.length > 0;

  // Estimated AI combinations (upper bound — server may skip existing ones)
  // We don't know poster count here, so we show the per-template warning
  const aiRendersBulkRisk = scope === "all" && hasAiTemplatesInScope;

  useEffect(() => {
    setLoadingTemplates(true);
    adminListAllMockupTemplates(storeKey)
      .then(setTemplates)
      .catch((e) =>
        toast({ title: "Failed to load templates", description: e?.message, variant: "destructive" })
      )
      .finally(() => setLoadingTemplates(false));
  }, [storeKey]);

  // Reset paidAiConfirmed when the AI scope changes
  useEffect(() => {
    setPaidAiConfirmed(false);
  }, [hasAiTemplatesInScope, scope, selectedTemplateIds.join(",")]);

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
    setSyncError(null);

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

      setSummary({
        generated: resp.generated,
        skipped: resp.skipped,
        failed: resp.failed,
        plannedCount: resp.plannedCount,
        deterministicPlannedCount: resp.deterministicPlannedCount,
        aiRenderedPlannedCount: resp.aiRenderedPlannedCount,
        needsReviewCount: resp.needsReviewCount,
      });
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
      setSyncError(e?.message ?? "Sync failed");
      toast({ title: "Sync failed", description: e?.message, variant: "destructive" });
    }
  }, [storeKey, scope, selectedTemplateIds, overwrite, dryRun]);

  const needsConfirm = scope === "all" && !dryRun && !hasAiTemplatesInScope;
  const requiresAiConfirm = hasAiTemplatesInScope && !dryRun;

  // Run button is disabled when:
  // - sync is already running
  // - no syncable templates
  // - AI templates are in scope AND not dryRun AND admin hasn't checked the paid-AI checkbox
  // - "all posters + AI" scope (strong risk) AND not dryRun AND hasn't confirmed
  const runDisabled =
    status === "running" ||
    syncableTemplates.length === 0 ||
    (requiresAiConfirm && !paidAiConfirmed);

  const actionLabel = dryRun
    ? "Preview (dry run)"
    : scope === "all"
    ? "Sync all posters"
    : scope === "missing"
    ? "Sync missing only"
    : "Sync selected";

  function handleRunOrConfirm() {
    if (needsConfirm) {
      setShowConfirm(true);
    } else {
      handleRunSync();
    }
  }

  return (
    <div className="space-y-6" data-testid="mockup-sync-panel">
      {/* About panel */}
      <div className="rounded-md bg-muted/60 border px-4 py-3 flex gap-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground mb-0.5">About mockup sync</p>
          <p>
            Composites poster artwork into template backgrounds and stores the result in object
            storage. <strong>Deterministic</strong> (Sharp) rendering is free and fast.{" "}
            <strong>AI-rendered</strong> templates use paid image generation via gpt-image-1 — use
            sparingly for lifestyle/marketing images only.
          </p>
        </div>
      </div>

      {/* AI cost warning — shown whenever any AI templates are in effective scope */}
      {hasAiTemplatesInScope && (
        <div className={cn(
          "rounded-md border px-4 py-3 flex gap-3 text-sm",
          aiRendersBulkRisk
            ? "border-red-300 bg-red-50/80 text-red-900 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300"
            : "border-amber-300 bg-amber-50/80 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        )}>
          {aiRendersBulkRisk ? (
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <DollarSign className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            {aiRendersBulkRisk ? (
              <>
                <p className="font-semibold">Bulk AI sync — high cost risk</p>
                <p>
                  "All posters" scope with AI-rendered templates will generate a paid AI render for
                  every published poster. The server will block requests over {AI_RENDER_HARD_LIMIT} AI
                  renders. Use <strong>dry run</strong> first to see the planned count, then switch to{" "}
                  <strong>Selected posters</strong> scope to process a few at a time.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">AI-rendered mockups use paid image generation</p>
                <p>
                  {effectiveAiTemplates.length} AI-rendered template{effectiveAiTemplates.length !== 1 ? "s" : ""} selected (
                  {effectiveAiTemplates.map((t) => t.name).join(", ")}). Each poster × AI template
                  combination is a paid call. Maximum {AI_RENDER_HARD_LIMIT} AI renders per request.
                  Use only for selected posters/templates, not bulk production runs.
                </p>
              </>
            )}
          </div>
        </div>
      )}

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
                  Count what would be generated without running or spending credits
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
          <div className="space-y-2">
            {/* Deterministic templates */}
            {deterministicTemplates.length > 0 && (
              <div className="space-y-1">
                {aiTemplates.length > 0 && (
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Deterministic (free)
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {deterministicTemplates.map((t) => {
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
              </div>
            )}

            {/* AI-rendered templates */}
            {aiTemplates.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  AI-rendered (paid per render)
                </p>
                <div className="flex flex-wrap gap-2">
                  {aiTemplates.map((t) => {
                    const selected = selectedTemplateIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTemplate(t.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
                          selected
                            ? "bg-violet-600 text-white border-violet-600"
                            : "border-violet-300 text-violet-700 hover:border-violet-500 bg-violet-50/60 dark:text-violet-400 dark:border-violet-700 dark:bg-violet-950/20"
                        )}
                      >
                        <Wand2 className="w-3 h-3" />
                        {t.name}
                        {t.category && (
                          <span className={cn("opacity-70", selected && "opacity-80")}>
                            · {t.category}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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

      {/* Paid AI confirmation — required for live sync with any AI templates */}
      {hasAiTemplatesInScope && !dryRun && (
        <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20 px-4 py-3 space-y-2">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
            Confirm paid AI generation
          </p>
          <div className="flex items-start gap-3">
            <Checkbox
              id="paidAiConfirmed"
              checked={paidAiConfirmed}
              onCheckedChange={(v) => setPaidAiConfirmed(!!v)}
              className="mt-0.5 border-amber-500 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
              data-testid="paid-ai-confirm-checkbox"
            />
            <Label
              htmlFor="paidAiConfirmed"
              className="text-sm font-normal cursor-pointer text-amber-800 dark:text-amber-300"
            >
              I understand AI-rendered mockups use paid image generation. I have reviewed the
              selected templates and poster count, and I'm ready to proceed.
            </Label>
          </div>
        </div>
      )}

      {/* Run button */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleRunOrConfirm}
          disabled={runDisabled}
          className={cn(
            "gap-2",
            hasAiTemplatesInScope && !dryRun && paidAiConfirmed
              ? "bg-amber-600 hover:bg-amber-700 text-white"
              : ""
          )}
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

        {requiresAiConfirm && !paidAiConfirmed && (
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Check the confirmation box above to enable
          </p>
        )}

        {status === "done" && summary && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {/* Split planned counts */}
            {summary.plannedCount != null && (
              <>
                <span className="text-muted-foreground">{summary.plannedCount} planned</span>
                {(summary.deterministicPlannedCount != null || summary.aiRenderedPlannedCount != null) && (
                  <span className="text-muted-foreground text-xs">
                    ({summary.deterministicPlannedCount ?? 0} Sharp
                    {(summary.aiRenderedPlannedCount ?? 0) > 0 && (
                      <span className="text-amber-600 ml-1">+ {summary.aiRenderedPlannedCount} AI paid</span>
                    )}
                    )
                  </span>
                )}
                <span className="text-muted-foreground">·</span>
              </>
            )}
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
            {(summary.needsReviewCount ?? 0) > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  {summary.needsReviewCount} need review
                </span>
              </>
            )}
            {dryRun && <Badge variant="outline" className="text-xs">Dry run</Badge>}
          </div>
        )}
        {status === "error" && (
          <span className="text-sm text-destructive flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            Sync failed — see below for details
          </span>
        )}
      </div>

      {syncError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 flex gap-3 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-0.5">Sync blocked</p>
            <p>{syncError}</p>
            {syncError.includes("AI render limit") && (
              <p className="mt-1 text-xs opacity-80">
                Tip: reduce the number of AI-rendered templates selected, switch to "selected" scope
                to target fewer posters, or use dry run to preview counts first.
              </p>
            )}
          </div>
        </div>
      )}

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
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Renderer</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((r, i) => (
                    <tr key={i} className={cn(
                      r.action === "failed" && "bg-destructive/5",
                      r.needsReview && r.action === "generated" && "bg-amber-50/60 dark:bg-amber-950/20",
                      r.action === "generated" && !r.needsReview && dryRun && "bg-muted/30"
                    )}>
                      <td className="px-3 py-2 text-xs">{r.posterTitle}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.templateName}</td>
                      <td className="px-3 py-2">
                        {r.action === "generated" ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {dryRun ? "Would generate" : "Generated"}
                            </span>
                            {r.needsReview && !dryRun && (
                              <span className="flex items-center gap-1 text-[10px] text-amber-600">
                                <AlertTriangle className="w-3 h-3" />
                                Needs review
                              </span>
                            )}
                          </div>
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
                      <td className="px-3 py-2">
                        {r.renderMode === "ai_rendered" ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400">
                              <Wand2 className="w-2.5 h-2.5" />
                              AI
                            </span>
                            {r.estimatedCostLabel && (
                              <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                                <DollarSign className="w-2.5 h-2.5" />
                                {r.estimatedCostLabel}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Sharp</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate">
                        {r.aiRenderWarning ?? r.reason ?? (r.imageUrl ? "Stored" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog for "sync all" (deterministic-only path) */}
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
