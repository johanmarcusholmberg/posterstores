import React, { useEffect, useState, useCallback } from "react";
import { useAdminToken } from "@/context/AdminTokenContext";
import { storefronts, StorefrontConfig } from "@/config/storefronts";
import { fetchPublicStores, type AdminStore } from "@/lib/adminApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store } from "lucide-react";
import { useLocation } from "wouter";

interface StoreOption {
  storeKey: string;
  storeName: string;
  fromDb: boolean;
}

function staticStoreOptions(): StoreOption[] {
  return Object.values(storefronts).map((s: StorefrontConfig) => ({
    storeKey: s.storeKey,
    storeName: s.storeName,
    fromDb: false,
  }));
}

export const AdminStoreSelector = () => {
  const { adminStoreKey, setAdminStoreKey } = useAdminToken();
  const [, navigate] = useLocation();
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>(staticStoreOptions());

  const loadStores = useCallback(async () => {
    try {
      const dbStores = await fetchPublicStores();
      if (dbStores.length === 0) {
        setStoreOptions(staticStoreOptions());
        return;
      }

      const staticKeys = new Set(Object.keys(storefronts));
      const dbKeys = new Set(dbStores.map((s: AdminStore) => s.storeKey));

      const merged: StoreOption[] = [
        ...dbStores.map((s: AdminStore) => ({
          storeKey: s.storeKey,
          storeName: s.name,
          fromDb: true,
        })),
        ...staticStoreOptions().filter((s) => !dbKeys.has(s.storeKey)),
      ];

      setStoreOptions(merged);

      // If current adminStoreKey is not in the merged list, reset to first
      const allKeys = new Set([...dbKeys, ...staticKeys]);
      if (!allKeys.has(adminStoreKey) && merged.length > 0) {
        setAdminStoreKey(merged[0].storeKey);
      }
    } catch {
      // fall back to static config on error
      setStoreOptions(staticStoreOptions());
    }
  }, [adminStoreKey, setAdminStoreKey]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const handleChange = (newKey: string) => {
    setAdminStoreKey(newKey);
    navigate("/admin");
  };

  return (
    <div className="flex items-center gap-2">
      <Store className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select value={adminStoreKey} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-48 text-sm" data-testid="admin-store-selector">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {storeOptions.map((store) => (
            <SelectItem key={store.storeKey} value={store.storeKey}>
              {store.storeName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
