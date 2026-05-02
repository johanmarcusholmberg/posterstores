import React, { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { AdminPosterForm } from "@/components/admin/AdminPosterForm";
import { useAdminToken } from "@/context/AdminTokenContext";
import { adminGetPoster, type AdminPoster } from "@/lib/adminApi";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { LayoutTemplate } from "lucide-react";

export default function AdminPosterEdit() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { token, adminStoreKey } = useAdminToken();

  const [poster, setPoster] = useState<AdminPoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    adminGetPoster(token, id, adminStoreKey)
      .then(setPoster)
      .catch(e => setError(e?.message ?? "Failed to load poster"))
      .finally(() => setLoading(false));
  }, [token, id, adminStoreKey]);

  if (loading) {
    return (
      <AdminDashboardLayout
        title="Edit Poster"
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Posters", href: "/admin/posters" },
          { label: "Edit" },
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
        title="Edit Poster"
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Posters", href: "/admin/posters" },
          { label: "Error" },
        ]}
      >
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 space-y-3">
          <p className="text-sm text-destructive">{error || "Poster not found"}</p>
          <Link href="/admin/posters">
            <Button variant="outline" size="sm">Back to posters</Button>
          </Link>
        </div>
      </AdminDashboardLayout>
    );
  }

  return (
    <AdminDashboardLayout
      title={poster.title}
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Posters", href: "/admin/posters" },
        { label: poster.title },
      ]}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Link href={`/admin/posters/${poster.id}/mockups`}>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              data-testid="manage-mockups-btn"
            >
              <LayoutTemplate className="w-4 h-4" />
              Manage mockups
            </Button>
          </Link>
        </div>
        <AdminPosterForm existing={poster} />
      </div>
    </AdminDashboardLayout>
  );
}
