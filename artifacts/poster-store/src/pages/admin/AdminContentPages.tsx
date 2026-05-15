import React, { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminListContentPages,
  type AdminContentPageSummary,
} from "@/lib/adminApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ArrowRight, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

const PAGE_LABELS: Record<string, string> = {
  about: "About",
  shipping: "Shipping",
  returns: "Returns",
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  contact: "Contact",
};

export default function AdminContentPages() {
  const { adminStoreKey } = useAdminToken();
  const [pages, setPages] = useState<AdminContentPageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    adminListContentPages(adminStoreKey)
      .then(setPages)
      .catch(e => setError(e?.message ?? "Failed to load content pages"))
      .finally(() => setLoading(false));
  }, [adminStoreKey]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminDashboardLayout
      title="Content Pages"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Content Pages" },
      ]}
    >
      <div className="space-y-5 max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Edit the copy for public pages on{" "}
            <span className="font-semibold text-foreground">{adminStoreKey}</span>. Published
            content replaces the default placeholder text on the live store.
          </p>
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

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && pages.length === 0 && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!loading && pages.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No pages found.</p>
        )}

        {pages.length > 0 && (
          <div className="space-y-2">
            {pages.map(page => (
              <Card key={page.pageKey} data-testid={`content-page-row-${page.pageKey}`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg p-2 bg-muted shrink-0">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {PAGE_LABELS[page.pageKey] ?? page.pageKey}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {page.hasFallback ? (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="w-3 h-3" />
                          Using fallback copy
                        </span>
                      ) : page.published ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="w-3 h-3" />
                          Published
                        </span>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-200 font-medium text-[10px] px-1.5 py-0">
                          Draft
                        </Badge>
                      )}
                      {page.updatedAt && (
                        <span className="text-xs text-muted-foreground">
                          · Updated {new Date(page.updatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link href={`/admin/content/${page.pageKey}`}>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1.5" data-testid={`edit-content-${page.pageKey}`}>
                      Edit
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminDashboardLayout>
  );
}
