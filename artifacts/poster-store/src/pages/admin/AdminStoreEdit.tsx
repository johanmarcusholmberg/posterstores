import React, { useEffect, useState } from "react";
import { useParams } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { AdminStoreForm } from "@/components/admin/AdminStoreForm";
import { useAdminToken } from "@/context/AdminTokenContext";
import { adminGetStore, type AdminStore } from "@/lib/adminApi";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminStoreEdit() {
  const { storeKey } = useParams<{ storeKey: string }>();
  const { token } = useAdminToken();
  const [store, setStore] = useState<AdminStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !storeKey) return;
    setLoading(true);
    adminGetStore(token, storeKey)
      .then(setStore)
      .catch((e) => setError(e?.message ?? "Failed to load store"))
      .finally(() => setLoading(false));
  }, [token, storeKey]);

  return (
    <AdminDashboardLayout
      title={store ? `Edit ${store.name}` : "Edit store"}
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Stores", href: "/admin/stores" },
        { label: store?.name ?? storeKey ?? "Edit" },
      ]}
    >
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}
      {loading ? (
        <div className="space-y-4 max-w-3xl">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : store ? (
        <AdminStoreForm existing={store} />
      ) : !error ? (
        <p className="text-sm text-muted-foreground">Store not found.</p>
      ) : null}
    </AdminDashboardLayout>
  );
}
