import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import { adminListStores, type AdminStore } from "@/lib/adminApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Globe } from "lucide-react";

export default function AdminStores() {
  useAdminToken();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    adminListStores()
      .then(setStores)
      .catch((e) => setError(e?.message ?? "Failed to load stores"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminDashboardLayout
      title="Stores"
      breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Stores" }]}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Manage all webstores powered by this platform.
          </p>
          <Link href="/admin/stores/new">
            <Button size="sm" className="gap-2" data-testid="new-store-btn">
              <Plus className="w-4 h-4" />
              New store
            </Button>
          </Link>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : stores.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <Globe className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No stores in the database yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              PostersofSpain and other stores configured in code are available as fallback.
              Create a store here to manage it from the admin panel.
            </p>
            <Link href="/admin/stores/new">
              <Button size="sm" className="mt-4 gap-2">
                <Plus className="w-4 h-4" />
                Create first store
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3" data-testid="stores-list">
            {stores.map((store) => (
              <Card key={store.storeKey} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  {store.themeConfig && (
                    <div
                      className="w-5 h-5 rounded-full border shrink-0"
                      style={{ backgroundColor: store.themeConfig.primary }}
                      title="Primary color"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{store.name}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {store.storeKey}
                      </Badge>
                      {store.active ? (
                        <Badge variant="default" className="text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{store.countryFocus}</span>
                      <span>{store.defaultCurrency}</span>
                      <span>{store.defaultLanguage}</span>
                      <span>{store.posterCount} posters</span>
                      <span>{store.orderCount} orders</span>
                    </div>
                  </div>
                  <Link href={`/admin/stores/${store.storeKey}`}>
                    <Button variant="ghost" size="sm" className="gap-1.5 shrink-0">
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
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
