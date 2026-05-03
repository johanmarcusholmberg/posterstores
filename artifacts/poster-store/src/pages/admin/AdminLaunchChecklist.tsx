import React, { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminGetLaunchChecklist,
  type LaunchChecklistResponse,
  type CheckItem,
  type CheckSection,
  type CheckStatus,
} from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ClipboardCheck,
  RefreshCw,
  ArrowRight,
  Images,
  ShoppingBag,
  LayoutTemplate,
  Package,
  Globe,
  Info,
} from "lucide-react";

// ── Status helpers ────────────────────────────────────────────────────────────

function statusIcon(status: CheckStatus) {
  switch (status) {
    case "pass":
      return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
    case "missing":
      return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
    case "manual":
      return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
  }
}

function statusBadge(status: CheckStatus) {
  switch (status) {
    case "pass":
      return <Badge className="bg-green-100 text-green-700 border-green-200 font-medium text-[10px] px-1.5 py-0">Pass</Badge>;
    case "warning":
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-medium text-[10px] px-1.5 py-0">Warning</Badge>;
    case "missing":
      return <Badge className="bg-red-100 text-red-700 border-red-200 font-medium text-[10px] px-1.5 py-0">Missing</Badge>;
    case "manual":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 font-medium text-[10px] px-1.5 py-0">Manual check</Badge>;
  }
}

function sectionSummary(items: CheckItem[]) {
  const counts = { pass: 0, warning: 0, missing: 0, manual: 0 };
  for (const item of items) counts[item.status]++;
  return counts;
}

function sectionBorderColor(items: CheckItem[]): string {
  const { missing, warning } = sectionSummary(items);
  if (missing > 0) return "border-l-4 border-l-red-400";
  if (warning > 0) return "border-l-4 border-l-amber-400";
  return "border-l-4 border-l-green-400";
}

// ── Quick links ───────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { href: "/admin/stores", label: "Edit store", icon: Globe },
  { href: "/admin/posters", label: "Manage posters", icon: Images },
  { href: "/admin/mockups", label: "Manage mockups", icon: LayoutTemplate },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/fulfillment", label: "Fulfillment", icon: Package },
];

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ sections }: { sections: CheckSection[] }) {
  const totals = { pass: 0, warning: 0, missing: 0, manual: 0 };
  for (const s of sections) {
    const c = sectionSummary(s.items);
    totals.pass += c.pass;
    totals.warning += c.warning;
    totals.missing += c.missing;
    totals.manual += c.manual;
  }

  const isReady = totals.missing === 0 && totals.warning === 0;

  return (
    <div className={`rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${isReady ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
      <div className="flex items-center gap-2">
        {isReady
          ? <CheckCircle2 className="w-6 h-6 text-green-600" />
          : <AlertTriangle className="w-6 h-6 text-amber-600" />
        }
        <span className="font-semibold text-sm">
          {isReady ? "Store looks ready to launch!" : "Action required before launch"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 sm:ml-auto">
        <span className="inline-flex items-center gap-1 text-xs text-green-700">
          <CheckCircle2 className="w-3.5 h-3.5" /> {totals.pass} pass
        </span>
        {totals.warning > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" /> {totals.warning} warning
          </span>
        )}
        {totals.missing > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-red-700">
            <XCircle className="w-3.5 h-3.5" /> {totals.missing} missing
          </span>
        )}
        {totals.manual > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-700">
            <Info className="w-3.5 h-3.5" /> {totals.manual} manual
          </span>
        )}
      </div>
    </div>
  );
}

// ── Check item row ────────────────────────────────────────────────────────────

function CheckItemRow({ item }: { item: CheckItem }) {
  return (
    <div className={`flex items-start gap-3 py-2.5 border-b last:border-b-0 ${item.status === "missing" ? "bg-red-50/40" : ""}`}>
      <div className="mt-0.5">{statusIcon(item.status)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{item.label}</span>
          {statusBadge(item.status)}
        </div>
        {item.value && item.status === "pass" && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.value}</p>
        )}
        {item.detail && item.status !== "pass" && (
          <p className={`text-xs mt-0.5 ${item.status === "missing" ? "text-red-600" : item.status === "warning" ? "text-amber-700" : "text-blue-600"}`}>
            {item.detail}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ section }: { section: CheckSection }) {
  const summary = sectionSummary(section.items);
  return (
    <Card className={`${sectionBorderColor(section.items)}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{section.title}</CardTitle>
          <div className="flex gap-1.5">
            {summary.missing > 0 && (
              <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{summary.missing} missing</span>
            )}
            {summary.warning > 0 && (
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{summary.warning} warning</span>
            )}
            {summary.manual > 0 && (
              <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{summary.manual} manual</span>
            )}
            {summary.missing === 0 && summary.warning === 0 && summary.manual === 0 && (
              <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">All clear</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="divide-y divide-border/60">
          {section.items.map(item => (
            <CheckItemRow key={item.id} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminLaunchChecklist() {
  const { token, adminStoreKey } = useAdminToken();
  const [data, setData] = useState<LaunchChecklistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    adminGetLaunchChecklist(token, adminStoreKey)
      .then(setData)
      .catch(e => setError(e?.message ?? "Failed to load checklist"))
      .finally(() => setLoading(false));
  }, [token, adminStoreKey]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminDashboardLayout
      title="Launch Checklist"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Launch Checklist" },
      ]}
    >
      <div className="space-y-6 max-w-4xl">

        {/* Header description */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              Verify your store <span className="font-semibold text-foreground">{adminStoreKey}</span> is ready to go live.
              Checks are store-scoped. Environment variables are shown as configured/not — secrets are never exposed.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="shrink-0 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Quick links */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick links</h2>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map(link => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}>
                  <div className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                    {link.label}
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm">
            {error.toLowerCase().includes("not found") ? (
              <div className="space-y-2">
                <p className="font-semibold text-destructive">Store not found in database</p>
                <p className="text-muted-foreground">
                  The store <span className="font-mono font-semibold">{adminStoreKey}</span> exists in the local config but hasn't been created in the database yet.
                  Create it in Manage Stores first, then return here to run the checklist.
                </p>
                <Link href="/admin/stores">
                  <div className="inline-flex items-center gap-1.5 mt-1 rounded-md border px-3 py-1.5 text-xs font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                    <Globe className="w-3.5 h-3.5 text-primary" />
                    Go to Manage Stores
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                </Link>
              </div>
            ) : (
              <span className="text-destructive">{error}</span>
            )}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && !data && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-8 w-full" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Summary + sections */}
        {data && (
          <>
            <SummaryBar sections={data.sections} />

            <div className="space-y-4">
              {data.sections.map(section => (
                <SectionCard key={section.id} section={section} />
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-right">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </AdminDashboardLayout>
  );
}
