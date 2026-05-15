import React, { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { AdminPosterMockupManager } from "@/components/admin/AdminPosterMockupManager";
import { useAdminToken } from "@/context/AdminTokenContext";
import { adminGetPoster, type AdminPoster } from "@/lib/adminApi";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertCircle } from "lucide-react";

export default function AdminPosterMockups() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { adminStoreKey } = useAdminToken();

  const [poster, setPoster] = useState<AdminPoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    adminGetPoster(id, adminStoreKey)
      .then(setPoster)
      .catch((e) => setError(e?.message ?? "Failed to load poster"))
      .finally(() => setLoading(false));
  }, [id, adminStoreKey]);

  if (loading) {
    return (
      <AdminDashboardLayout
        title="Manage mockups"
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Posters", href: "/admin/posters" },
          { label: "Mockups" },
        ]}
      >
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </AdminDashboardLayout>
    );
  }

  if (error || !poster) {
    return (
      <AdminDashboardLayout
        title="Manage mockups"
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Posters", href: "/admin/posters" },
          { label: "Error" },
        ]}
      >
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <p className="text-sm">{error || "Poster not found"}</p>
          </div>
          <Link href="/admin/posters">
            <Button variant="outline" size="sm">
              Back to posters
            </Button>
          </Link>
        </div>
      </AdminDashboardLayout>
    );
  }

  return (
    <AdminDashboardLayout
      title="Manage mockups"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Posters", href: "/admin/posters" },
        { label: poster.title, href: `/admin/posters/${poster.id}` },
        { label: "Mockups" },
      ]}
    >
      <div className="space-y-6" data-testid="poster-mockups-page">
        <div className="flex items-start justify-between gap-4">
          <Link href={`/admin/posters/${poster.id}`}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
              Back to poster edit
            </Button>
          </Link>
        </div>

        <div className="flex items-start gap-4 p-4 rounded-md border bg-muted/20">
          <div className="w-16 h-20 shrink-0 rounded overflow-hidden bg-muted">
            <img
              src={poster.imageUrl}
              alt={poster.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg">{poster.title}</h2>
            <p className="text-sm text-muted-foreground">{poster.category}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {adminStoreKey}
              </Badge>
              <Badge
                variant={
                  poster.status === "published"
                    ? "default"
                    : poster.status === "draft"
                    ? "secondary"
                    : "destructive"
                }
                className="text-xs"
              >
                {poster.status}
              </Badge>
            </div>
          </div>
        </div>

        <AdminPosterMockupManager poster={poster} storeKey={adminStoreKey} />
      </div>
    </AdminDashboardLayout>
  );
}
